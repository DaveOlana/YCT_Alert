/**
 * Session-scoped receipt credential storage service.
 *
 * Requirements (DEF-02):
 * 1. Bearer tokens (receipt_token) must NEVER be stored in persistent localStorage.
 * 2. Store credentials in session-scoped storage (sessionStorage), bounded to the active tab lifecycle.
 * 3. Proactively purge any legacy localStorage tokens from earlier application sessions.
 * 4. Transparently handle missing, disabled, or failing browser Web Storage.
 * 5. Do NOT claim sessionStorage is encrypted (it is plaintext memory scoped to the tab/session).
 */

export const RECEIPT_SESSION_KEY = 'yct_session_reports';
export const LEGACY_LOCAL_STORAGE_KEY = 'yct_saved_reports';
const MAX_SESSION_REPORTS = 10;

export interface StoredReceiptSessionItem {
  receipt_id: string;
  receipt_token: string;
  short_ref: string;
  received_at: string;
}

function getSafeSessionStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage;
    }
    if (typeof globalThis !== 'undefined' && (globalThis as unknown as { sessionStorage?: Storage }).sessionStorage) {
      return (globalThis as unknown as { sessionStorage: Storage }).sessionStorage;
    }
  } catch {
    // Storage access may be blocked by browser privacy policies
  }
  return null;
}

function getSafeLocalStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== 'undefined' && (globalThis as unknown as { localStorage?: Storage }).localStorage) {
      return (globalThis as unknown as { localStorage: Storage }).localStorage;
    }
  } catch {
    // Storage access blocked
  }
  return null;
}

/**
 * Removes legacy plaintext bearer tokens stored in localStorage from earlier versions.
 */
export function purgeLegacyLocalStorageTokens(): void {
  try {
    const storage = getSafeLocalStorage();
    if (storage) {
      storage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restrictions
  }
}

/**
 * Persists report receipt credentials for the duration of the current browser session.
 */
export function saveReceiptToSession(item: StoredReceiptSessionItem): boolean {
  // Purge any legacy localStorage tokens first
  purgeLegacyLocalStorageTokens();

  const storage = getSafeSessionStorage();
  if (!storage) {
    return false;
  }

  try {
    const raw = storage.getItem(RECEIPT_SESSION_KEY);
    let existing: StoredReceiptSessionItem[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          existing = parsed;
        }
      } catch {
        existing = [];
      }
    }
    const filtered = existing.filter((r) => r.receipt_id !== item.receipt_id);
    const updated = [item, ...filtered].slice(0, MAX_SESSION_REPORTS);
    storage.setItem(RECEIPT_SESSION_KEY, JSON.stringify(updated));
    return true;
  } catch {
    return false;
  }
}

/**
 * Retrieves all stored receipt items from the active browser session.
 */
export function getReceiptsFromSession(): StoredReceiptSessionItem[] {
  const storage = getSafeSessionStorage();
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(RECEIPT_SESSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Looks up a specific receipt credential by receipt_id from the active session.
 */
export function getReceiptFromSession(receiptId: string): StoredReceiptSessionItem | null {
  const items = getReceiptsFromSession();
  return items.find((r) => r.receipt_id === receiptId) ?? null;
}

/**
 * Checks whether a receipt credential is saved in the active session.
 */
export function hasReceiptInSession(receiptId: string): boolean {
  return getReceiptFromSession(receiptId) !== null;
}

/**
 * Removes a specific receipt credential from session storage.
 */
export function clearReceiptFromSession(receiptId: string): void {
  const storage = getSafeSessionStorage();
  if (!storage) return;

  try {
    const existing = getReceiptsFromSession();
    const filtered = existing.filter((r) => r.receipt_id !== receiptId);
    if (filtered.length > 0) {
      storage.setItem(RECEIPT_SESSION_KEY, JSON.stringify(filtered));
    } else {
      storage.removeItem(RECEIPT_SESSION_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Clears all receipt session credentials from the active browser session.
 */
export function clearAllReceiptsFromSession(): void {
  const storage = getSafeSessionStorage();
  if (!storage) return;

  try {
    storage.removeItem(RECEIPT_SESSION_KEY);
  } catch {
    // Ignore
  }
}
