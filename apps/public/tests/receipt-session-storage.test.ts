import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saveReceiptToSession,
  getReceiptsFromSession,
  getReceiptFromSession,
  clearReceiptFromSession,
  clearAllReceiptsFromSession,
  purgeLegacyLocalStorageTokens,
  hasReceiptInSession,
  RECEIPT_SESSION_KEY,
  LEGACY_LOCAL_STORAGE_KEY,
  type StoredReceiptSessionItem,
} from '../src/services/receiptSessionStorage.js';

// Setup Mock Web Storage for Node environment
class MockStorage implements Storage {
  private store: Map<string, string> = new Map();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

test('DEF-02: Receipt Session Storage & Credential Scoping Suite', async (t) => {
  const mockSession = new MockStorage();
  const mockLocal = new MockStorage();

  const originalGlobalSession = (globalThis as unknown as { sessionStorage?: Storage }).sessionStorage;
  const originalGlobalLocal = (globalThis as unknown as { localStorage?: Storage }).localStorage;

  t.beforeEach(() => {
    mockSession.clear();
    mockLocal.clear();
    (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = mockSession;
    (globalThis as unknown as { localStorage: Storage }).localStorage = mockLocal;
  });

  t.after(() => {
    (globalThis as unknown as { sessionStorage?: Storage }).sessionStorage = originalGlobalSession;
    (globalThis as unknown as { localStorage?: Storage }).localStorage = originalGlobalLocal;
  });

  await t.test('1. Saves receipt credentials into sessionStorage', () => {
    const item: StoredReceiptSessionItem = {
      receipt_id: 'rec_1001',
      receipt_token: 'tok_secret_alpha_123',
      short_ref: '#REF-10010001',
      received_at: '2026-11-17T10:00:00Z',
    };

    const saved = saveReceiptToSession(item);
    assert.equal(saved, true);

    const storedRaw = mockSession.getItem(RECEIPT_SESSION_KEY);
    assert.ok(storedRaw, 'Receipt session key must be present in sessionStorage');
    const parsed = JSON.parse(storedRaw);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].receipt_id, 'rec_1001');
    assert.equal(parsed[0].receipt_token, 'tok_secret_alpha_123');
    assert.equal(parsed[0].short_ref, '#REF-10010001');
  });

  await t.test('2. NEVER writes bearer tokens to localStorage', () => {
    const item: StoredReceiptSessionItem = {
      receipt_id: 'rec_1002',
      receipt_token: 'tok_super_secret_token_never_in_localstorage',
      short_ref: '#REF-10020002',
      received_at: '2026-11-17T10:05:00Z',
    };

    saveReceiptToSession(item);

    // Assert localStorage has NO tokens and NO saved reports key
    assert.equal(mockLocal.getItem(LEGACY_LOCAL_STORAGE_KEY), null);
    assert.equal(mockLocal.getItem(RECEIPT_SESSION_KEY), null);
    assert.equal(mockLocal.length, 0, 'localStorage must remain completely empty');
  });

  await t.test('3. Purges legacy localStorage plaintext tokens proactively', () => {
    // Seed legacy plaintext entry in localStorage
    mockLocal.setItem(
      LEGACY_LOCAL_STORAGE_KEY,
      JSON.stringify([{ receipt_id: 'old_rec', receipt_token: 'old_leaked_token' }]),
    );
    assert.ok(mockLocal.getItem(LEGACY_LOCAL_STORAGE_KEY));

    // Call purge
    purgeLegacyLocalStorageTokens();
    assert.equal(mockLocal.getItem(LEGACY_LOCAL_STORAGE_KEY), null, 'Legacy key must be purged');

    // Also verify saveReceiptToSession automatically purges legacy storage
    mockLocal.setItem(LEGACY_LOCAL_STORAGE_KEY, 'leaked');
    saveReceiptToSession({
      receipt_id: 'rec_1003',
      receipt_token: 'tok_1003',
      short_ref: '#REF-10030003',
      received_at: '2026-11-17T10:10:00Z',
    });
    assert.equal(mockLocal.getItem(LEGACY_LOCAL_STORAGE_KEY), null);
  });

  await t.test('4. Lookup and membership helpers retrieve credentials correctly', () => {
    const item1 = { receipt_id: 'rec_A', receipt_token: 'tok_A', short_ref: '#REF-AAAA', received_at: '2026-11-17T10:00:00Z' };
    const item2 = { receipt_id: 'rec_B', receipt_token: 'tok_B', short_ref: '#REF-BBBB', received_at: '2026-11-17T10:01:00Z' };

    saveReceiptToSession(item1);
    saveReceiptToSession(item2);

    assert.equal(hasReceiptInSession('rec_A'), true);
    assert.equal(hasReceiptInSession('rec_B'), true);
    assert.equal(hasReceiptInSession('rec_NONEXISTENT'), false);

    const found = getReceiptFromSession('rec_A');
    assert.ok(found);
    assert.equal(found?.receipt_token, 'tok_A');
    assert.equal(found?.short_ref, '#REF-AAAA');
  });

  await t.test('5. Clears specific receipt from session when user requests removal', () => {
    const item1 = { receipt_id: 'rec_keep', receipt_token: 'tok_keep', short_ref: '#REF-KEEP', received_at: '2026-11-17T10:00:00Z' };
    const item2 = { receipt_id: 'rec_remove', receipt_token: 'tok_remove', short_ref: '#REF-REM', received_at: '2026-11-17T10:01:00Z' };

    saveReceiptToSession(item1);
    saveReceiptToSession(item2);

    clearReceiptFromSession('rec_remove');

    assert.equal(hasReceiptInSession('rec_remove'), false);
    assert.equal(hasReceiptInSession('rec_keep'), true);

    // Clear last item removes the key entirely
    clearReceiptFromSession('rec_keep');
    assert.equal(mockSession.getItem(RECEIPT_SESSION_KEY), null);
  });

  await t.test('6. Gracefully handles corrupted JSON or storage errors', () => {
    mockSession.setItem(RECEIPT_SESSION_KEY, 'corrupted{invalid:json');

    // Should not throw, should return empty array
    const items = getReceiptsFromSession();
    assert.deepEqual(items, []);

    // Saving overwrites corrupted state cleanly
    const saved = saveReceiptToSession({
      receipt_id: 'rec_fresh',
      receipt_token: 'tok_fresh',
      short_ref: '#REF-FRESH',
      received_at: '2026-11-17T10:20:00Z',
    });
    assert.equal(saved, true);
    assert.equal(hasReceiptInSession('rec_fresh'), true);
  });

  await t.test('7. Caps maximum session-stored reports at 10 items', () => {
    for (let i = 1; i <= 15; i++) {
      saveReceiptToSession({
        receipt_id: `rec_${i}`,
        receipt_token: `tok_${i}`,
        short_ref: `#REF-${i}`,
        received_at: new Date().toISOString(),
      });
    }

    const items = getReceiptsFromSession();
    assert.equal(items.length, 10);
    // Most recent is rec_15 at the front
    assert.equal(items[0].receipt_id, 'rec_15');
    // Oldest preserved is rec_6
    assert.equal(items[9].receipt_id, 'rec_6');
  });
});
