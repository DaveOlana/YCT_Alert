import test from 'node:test';
import assert from 'node:assert/strict';
import { adminAuthService } from '../src/services/adminAuthService.js';
import { adminIncidentService } from '../src/services/adminIncidentService.js';

test('Admin Frontend Services & CSRF Management Suite', async (t) => {
  const originalFetch = globalThis.fetch;

  t.afterEach(() => {
    globalThis.fetch = originalFetch;
    adminAuthService.setCsrfToken(null);
  });

  await t.test('adminAuthService.login: Stores CSRF token in memory and returns user', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    let capturedCredentials: RequestCredentials | undefined;

    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      capturedCredentials = init?.credentials;

      return {
        ok: true,
        status: 200,
        json: async () => ({
          user: { id: 'admin-1', username: 'ALERTadmin', role: 'SUPERADMIN' },
          csrf_token: 'test-csrf-token-12345',
        }),
      } as Response;
    }) as typeof fetch;

    const res = await adminAuthService.login('ALERTadmin', 'SuperPass123!');
    assert.equal(capturedBody?.username, 'ALERTadmin');
    assert.equal(capturedCredentials, 'include');
    assert.equal(res.user.username, 'ALERTadmin');
    assert.equal(res.csrfToken, 'test-csrf-token-12345');
    assert.equal(adminAuthService.getCsrfToken(), 'test-csrf-token-12345');
  });

  await t.test(
    'adminAuthService.getProfile: Populates in-memory CSRF token from /api/v1/admin/auth/me response',
    async () => {
      adminAuthService.setCsrfToken(null);
      let capturedCredentials: RequestCredentials | undefined;

      globalThis.fetch = (async (_url: string, init?: RequestInit) => {
        capturedCredentials = init?.credentials;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            user: { id: 'admin-1', username: 'ALERTadmin', role: 'SUPERADMIN' },
            csrf_token: 'profile-csrf-token-67890',
          }),
        } as Response;
      }) as typeof fetch;

      const user = await adminAuthService.getProfile();
      assert.equal(capturedCredentials, 'include');
      assert.equal(user?.username, 'ALERTadmin');
      assert.equal(adminAuthService.getCsrfToken(), 'profile-csrf-token-67890');
    },
  );

  await t.test(
    'adminAuthService.ensureCsrfToken: Automatically fetches profile if in-memory CSRF token is null',
    async () => {
      adminAuthService.setCsrfToken(null);

      globalThis.fetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          user: { id: 'admin-1', username: 'ALERTadmin', role: 'SUPERADMIN' },
          csrf_token: 'ensured-csrf-token-abcde',
        }),
      })) as unknown as typeof fetch;

      const token = await adminAuthService.ensureCsrfToken();
      assert.equal(token, 'ensured-csrf-token-abcde');
      assert.equal(adminAuthService.getCsrfToken(), 'ensured-csrf-token-abcde');
    },
  );

  await t.test(
    'adminAuthService.logout: Sends X-CSRF-Token and clears in-memory token',
    async () => {
      adminAuthService.setCsrfToken('active-csrf-token');
      let capturedHeaders: Record<string, string> | undefined;

      globalThis.fetch = (async (_url: string, init?: RequestInit) => {
        capturedHeaders = init?.headers as Record<string, string>;
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        } as Response;
      }) as typeof fetch;

      await adminAuthService.logout();
      assert.equal(capturedHeaders?.['X-CSRF-Token'], 'active-csrf-token');
      assert.equal(adminAuthService.getCsrfToken(), null);
    },
  );

  await t.test('adminIncidentService.getQueue: Formats query parameters correctly', async () => {
    let capturedUrl: string = '';

    globalThis.fetch = (async (url: string) => {
      capturedUrl = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [],
          total: 0,
          page: 1,
          limit: 25,
          counts: {
            all: 0,
            pending: 0,
            under_review: 0,
            active: 0,
            resolved: 0,
            rejected: 0,
          },
        }),
      } as Response;
    }) as typeof fetch;

    await adminIncidentService.getQueue({
      status: 'PENDING',
      category: 'FIRE_OR_SMOKE',
      page: 2,
      limit: 10,
    });

    assert.ok(capturedUrl.includes('status=PENDING'));
    assert.ok(capturedUrl.includes('category=FIRE_OR_SMOKE'));
    assert.ok(capturedUrl.includes('page=2'));
    assert.ok(capturedUrl.includes('limit=10'));
  });

  await t.test(
    'adminIncidentService state-changing actions: Send credentials and X-CSRF-Token header',
    async () => {
      adminAuthService.setCsrfToken('csrf-token-state-change');
      let capturedHeaders: Record<string, string> | undefined;
      let capturedBody: Record<string, unknown> | undefined;

      globalThis.fetch = (async (_url: string, init?: RequestInit) => {
        capturedHeaders = init?.headers as Record<string, string>;
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({ incident: {}, reports: [], auditLogs: [] }),
        } as Response;
      }) as typeof fetch;

      // Test Claim
      await adminIncidentService.claimIncident('inc-uuid-1', 'Taking ownership of triage');
      assert.equal(capturedHeaders['X-CSRF-Token'], 'csrf-token-state-change');
      assert.equal(capturedBody.reason, 'Taking ownership of triage');

      // Test Activate
      await adminIncidentService.activateIncident('inc-uuid-1', {
        safe_summary: 'Dense smoke near Science Complex. Stay clear.',
        reason: 'Verified by safety desk',
      });

      assert.equal(capturedHeaders['X-CSRF-Token'], 'csrf-token-state-change');
      assert.equal(capturedBody.safe_summary, 'Dense smoke near Science Complex. Stay clear.');

      // Test Resolve
      await adminIncidentService.resolveIncident('inc-uuid-1', 'Panel isolated; area safe.');
      assert.equal(capturedHeaders['X-CSRF-Token'], 'csrf-token-state-change');
      assert.equal(capturedBody.resolution_reason, 'Panel isolated; area safe.');

      // Test Reject
      await adminIncidentService.rejectIncident('inc-uuid-1', 'False alarm; cooking smoke.');
      assert.equal(capturedHeaders['X-CSRF-Token'], 'csrf-token-state-change');
      assert.equal(capturedBody.rejection_reason, 'False alarm; cooking smoke.');

      // Test Retention Hold
      await adminIncidentService.setRetentionHold(
        'inc-uuid-1',
        true,
        'Preserve for investigation.',
      );
      assert.equal(capturedHeaders['X-CSRF-Token'], 'csrf-token-state-change');
      assert.equal(capturedBody.retention_hold, true);
      assert.equal(capturedBody.reason, 'Preserve for investigation.');
    },
  );
});
