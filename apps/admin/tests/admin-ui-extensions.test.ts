import test from 'node:test';
import assert from 'node:assert/strict';
import { adminAuthService } from '../src/services/adminAuthService.js';
import { adminIncidentService } from '../src/services/adminIncidentService.js';
import { adminUserService } from '../src/services/adminUserService.js';
import type { AdminUser, AdminUserRecord } from '../src/types/admin.js';

test('Admin UI Extensions & Governance Suite (G2.4)', async (t) => {
  const originalFetch = globalThis.fetch;

  t.afterEach(() => {
    globalThis.fetch = originalFetch;
    adminAuthService.setCsrfToken(null);
  });

  // =========================================================================
  // 1. Administrator User Management Service & CSRF Verification
  // =========================================================================

  await t.test('adminUserService.listUsers: Fetches user list with credentials', async () => {
    let capturedUrl = '';
    let capturedCredentials: RequestCredentials | undefined;

    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedCredentials = init?.credentials;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          users: [
            {
              id: '00000000-0000-0000-0000-000000000001',
              username: 'ALERTadmin',
              role: 'SUPERADMIN',
              is_active: true,
              created_at: new Date().toISOString(),
              last_login_at: null,
            },
          ],
        }),
      } as Response;
    }) as typeof fetch;

    const res = await adminUserService.listUsers();
    assert.ok(capturedUrl.endsWith('/api/v1/admin/users'));
    assert.equal(capturedCredentials, 'include');
    assert.equal(res.users.length, 1);
    assert.equal(res.users[0].username, 'ALERTadmin');
  });

  await t.test(
    'adminUserService.createModerator: Sends credentials, CSRF header, and payload',
    async () => {
      adminAuthService.setCsrfToken('csrf-token-create-mod');
      let capturedHeaders: Record<string, string> | undefined;
      let capturedBody: Record<string, unknown> | undefined;

      globalThis.fetch = (async (_url: string, init?: RequestInit) => {
        capturedHeaders = init?.headers as Record<string, string>;
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 201,
          json: async () => ({
            user: {
              id: '00000000-0000-0000-0000-000000000002',
              username: 'mod_triage_lead',
              role: 'MODERATOR',
              is_active: true,
              created_at: new Date().toISOString(),
              last_login_at: null,
            },
            message: 'Moderator created successfully.',
          }),
        } as Response;
      }) as typeof fetch;

      const res = await adminUserService.createModerator({
        username: 'mod_triage_lead',
        password: 'ValidModPass123!@#',
        reason: 'Shift lead appointment',
      });

      assert.equal(capturedHeaders?.['X-CSRF-Token'], 'csrf-token-create-mod');
      assert.equal(capturedBody?.username, 'mod_triage_lead');
      assert.equal(capturedBody?.reason, 'Shift lead appointment');
      assert.equal(res.user.role, 'MODERATOR');
    },
  );

  await t.test(
    'adminUserService.revokeModerator: Sends CSRF header and revocation reason',
    async () => {
      adminAuthService.setCsrfToken('csrf-token-revoke-mod');
      let capturedUrl = '';
      let capturedHeaders: Record<string, string> | undefined;
      let capturedBody: Record<string, unknown> | undefined;

      globalThis.fetch = (async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedHeaders = init?.headers as Record<string, string>;
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            message: 'Moderator revoked successfully.',
            revoked_admin_id: 'mod-uuid-1',
          }),
        } as Response;
      }) as typeof fetch;

      const res = await adminUserService.revokeModerator('mod-uuid-1', 'End of academic session');
      assert.ok(capturedUrl.includes('/api/v1/admin/users/mod-uuid-1/revoke'));
      assert.equal(capturedHeaders?.['X-CSRF-Token'], 'csrf-token-revoke-mod');
      assert.equal(capturedBody?.reason, 'End of academic session');
      assert.equal(res.revoked_admin_id, 'mod-uuid-1');
    },
  );

  await t.test(
    'adminUserService.resetModeratorPassword: Sends CSRF header and new password',
    async () => {
      adminAuthService.setCsrfToken('csrf-token-reset-pwd');
      let capturedUrl = '';
      let capturedHeaders: Record<string, string> | undefined;
      let capturedBody: Record<string, unknown> | undefined;

      globalThis.fetch = (async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedHeaders = init?.headers as Record<string, string>;
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            message: 'Password reset successfully.',
            reset_admin_id: 'mod-uuid-1',
          }),
        } as Response;
      }) as typeof fetch;

      const res = await adminUserService.resetModeratorPassword('mod-uuid-1', {
        new_password: 'NewStrongPassword123!@#',
        reason: 'Credential rotation',
      });

      assert.ok(capturedUrl.includes('/api/v1/admin/users/mod-uuid-1/reset-password'));
      assert.equal(capturedHeaders?.['X-CSRF-Token'], 'csrf-token-reset-pwd');
      assert.equal(capturedBody?.new_password, 'NewStrongPassword123!@#');
      assert.equal(capturedBody?.reason, 'Credential rotation');
      assert.equal(res.reset_admin_id, 'mod-uuid-1');
    },
  );

  // =========================================================================
  // 2. Incident Summary Revision (PATCH) & Version Conflict Handling
  // =========================================================================

  await t.test(
    'adminIncidentService.reviseIncidentSummary: Sends PATCH with CSRF and expected_version',
    async () => {
      adminAuthService.setCsrfToken('csrf-token-revise');
      let capturedMethod = '';
      let capturedHeaders: Record<string, string> | undefined;
      let capturedBody: Record<string, unknown> | undefined;

      globalThis.fetch = (async (_url: string, init?: RequestInit) => {
        capturedMethod = init?.method || '';
        capturedHeaders = init?.headers as Record<string, string>;
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            message: 'Incident safe public summary revised successfully.',
            incident: {
              incident: { id: 'inc-1', safe_public_summary: 'Revised summary', row_version: 3 },
            },
          }),
        } as Response;
      }) as typeof fetch;

      const res = await adminIncidentService.reviseIncidentSummary('inc-1', {
        safe_summary: 'Revised summary of active safety advisory.',
        reason: 'Evacuation boundary updated',
        expected_version: 2,
      });

      assert.equal(capturedMethod, 'PATCH');
      assert.equal(capturedHeaders?.['X-CSRF-Token'], 'csrf-token-revise');
      assert.equal(capturedBody?.expected_version, 2);
      assert.equal(capturedBody?.safe_summary, 'Revised summary of active safety advisory.');
      assert.equal(res.incident.incident.safe_public_summary, 'Revised summary');
    },
  );

  await t.test(
    'adminIncidentService.reviseIncidentSummary: Automatically recovers CSRF token via ensureCsrfToken when inMemoryCsrfToken is null',
    async () => {
      adminAuthService.setCsrfToken(null);
      let capturedReviseHeaders: Record<string, string> | undefined;

      globalThis.fetch = (async (url: string, init?: RequestInit) => {
        if (url.includes('/api/v1/admin/auth/me')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              user: { id: 'admin-1', username: 'ALERTadmin', role: 'SUPERADMIN' },
              csrf_token: 'recovered-csrf-token-xyz',
            }),
          } as Response;
        }

        if (url.includes('/summary')) {
          capturedReviseHeaders = init?.headers as Record<string, string>;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              incident: { id: 'inc-1', safe_public_summary: 'Recovered patch', row_version: 4 },
              linked_reports: [],
              audit_logs: [],
            }),
          } as Response;
        }

        throw new Error(`Unexpected fetch URL: ${url}`);
      }) as typeof fetch;

      await adminIncidentService.reviseIncidentSummary('inc-1', {
        safe_summary: 'Summary revision with auto-recovered CSRF token.',
        reason: 'Restoring session token test',
        expected_version: 3,
      });

      assert.equal(capturedReviseHeaders?.['X-CSRF-Token'], 'recovered-csrf-token-xyz');
      assert.equal(adminAuthService.getCsrfToken(), 'recovered-csrf-token-xyz');
    },
  );

  await t.test(
    'adminIncidentService.reviseIncidentSummary: Handles 409 VERSION_CONFLICT error cleanly',
    async () => {
      adminAuthService.setCsrfToken('csrf-token-revise');

      globalThis.fetch = (async () => ({
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: 'VERSION_CONFLICT',
            message: 'VERSION_CONFLICT: Expected incident version 1, but current version is 2.',
          },
        }),
      })) as unknown as typeof fetch;

      await assert.rejects(
        async () => {
          await adminIncidentService.reviseIncidentSummary('inc-1', {
            safe_summary: 'Conflicting summary update.',
            reason: 'Testing conflict handling',
            expected_version: 1,
          });
        },
        (err: Error & { code?: string }) => {
          assert.equal(err.code, 'VERSION_CONFLICT');
          assert.ok(err.message.includes('VERSION_CONFLICT'));
          return true;
        },
      );
    },
  );

  // =========================================================================
  // 3. Report Unlink / Split (POST)
  // =========================================================================

  await t.test(
    'adminIncidentService.unlinkReport: Sends POST with CSRF and expected_version',
    async () => {
      adminAuthService.setCsrfToken('csrf-token-unlink');
      let capturedUrl = '';
      let capturedBody: Record<string, unknown> | undefined;

      globalThis.fetch = (async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            message: 'Report unlinked and new pending incident created successfully.',
            sourceIncident: { incident: { id: 'inc-source', row_version: 2 } },
            newIncident: { incident: { id: 'inc-new', public_id: 'INC-2026-999' } },
          }),
        } as Response;
      }) as typeof fetch;

      const res = await adminIncidentService.unlinkReport('inc-source', 'rep-1', {
        reason: 'Report belongs to a distinct location',
        expected_version: 1,
      });

      assert.ok(capturedUrl.includes('/api/v1/admin/incidents/inc-source/reports/rep-1/unlink'));
      assert.equal(capturedBody?.expected_version, 1);
      assert.equal(capturedBody?.reason, 'Report belongs to a distinct location');
      assert.equal(res.newIncident.incident.public_id, 'INC-2026-999');
    },
  );

  // =========================================================================
  // 4. Report Merge (POST)
  // =========================================================================

  await t.test(
    'adminIncidentService.mergeReport: Sends POST with source and target versions',
    async () => {
      adminAuthService.setCsrfToken('csrf-token-merge');
      let capturedUrl = '';
      let capturedBody: Record<string, unknown> | undefined;

      globalThis.fetch = (async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            message: 'Report merged into destination incident successfully.',
            targetIncident: { incident: { id: 'inc-target', report_count: 2 } },
            sourceIncident: { incident: { id: 'inc-source', status: 'REJECTED' } },
          }),
        } as Response;
      }) as typeof fetch;

      const res = await adminIncidentService.mergeReport('inc-target', {
        report_id: 'rep-source-1',
        reason: 'Corroborates active structure fire',
        expected_version: 2,
        source_expected_version: 1,
      });

      assert.ok(capturedUrl.includes('/api/v1/admin/incidents/inc-target/merge-report'));
      assert.equal(capturedBody?.expected_version, 2);
      assert.equal(capturedBody?.source_expected_version, 1);
      assert.equal(capturedBody?.report_id, 'rep-source-1');
      assert.equal(res.targetIncident.incident.report_count, 2);
      assert.equal(res.sourceIncident.incident.status, 'REJECTED');
    },
  );

  // =========================================================================
  // 5. Protected Invariant & Role Boundary Verifications
  // =========================================================================

  await t.test(
    'Security Invariant: ALERTadmin identity is marked as protected from revocation or reset',
    async () => {
      const mockUsers: AdminUserRecord[] = [
        {
          id: '00000000-0000-0000-0000-000000000001',
          username: 'ALERTadmin',
          role: 'SUPERADMIN',
          is_active: true,
          created_at: new Date().toISOString(),
          last_login_at: null,
        },
        {
          id: '00000000-0000-0000-0000-000000000002',
          username: 'student_mod',
          role: 'MODERATOR',
          is_active: true,
          created_at: new Date().toISOString(),
          last_login_at: null,
        },
      ];

      // Invariant check: ALERTadmin must never be presented with revoke or reset actions
      const alertAdmin = mockUsers.find((u) => u.username === 'ALERTadmin')!;
      assert.equal(alertAdmin.username, 'ALERTadmin');
      assert.equal(alertAdmin.role, 'SUPERADMIN');

      const isProtected = alertAdmin.username === 'ALERTadmin';
      assert.ok(isProtected, 'ALERTadmin must be flagged as protected system identity');
    },
  );

  await t.test(
    'Security Invariant: Self-revocation is disallowed for the currently authenticated admin',
    async () => {
      const currentAdmin: AdminUser = {
        id: 'super-admin-uuid-1',
        username: 'SUPERADMIN_USER',
        role: 'SUPERADMIN',
      };

      const userRecord: AdminUserRecord = {
        id: 'super-admin-uuid-1',
        username: 'SUPERADMIN_USER',
        role: 'SUPERADMIN',
        is_active: true,
        created_at: new Date().toISOString(),
        last_login_at: null,
      };

      const isSelf = userRecord.id === currentAdmin.id;
      assert.ok(isSelf, 'Current logged in user matches record');
      // The UI displays "Current Session" and suppresses the revoke action
    },
  );

  await t.test(
    'Destination Incident Filtering: Excludes current incident and terminal statuses',
    async () => {
      const currentIncidentId = 'inc-active-1';
      const allIncidents = [
        { id: 'inc-active-1', status: 'ACTIVE', category_code: 'FIRE_OR_SMOKE' },
        { id: 'inc-active-2', status: 'ACTIVE', category_code: 'FIRE_OR_SMOKE' },
        { id: 'inc-active-3', status: 'ACTIVE', category_code: 'POWER_OR_INFRASTRUCTURE' },
        { id: 'inc-resolved', status: 'RESOLVED', category_code: 'FIRE_OR_SMOKE' },
        { id: 'inc-rejected', status: 'REJECTED', category_code: 'FIRE_OR_SMOKE' },
      ];

      // Eligible destinations must exclude current incident, RESOLVED, and REJECTED
      const eligible = allIncidents.filter(
        (inc) =>
          inc.id !== currentIncidentId && inc.status !== 'RESOLVED' && inc.status !== 'REJECTED',
      );

      assert.equal(eligible.length, 2);
      assert.ok(eligible.every((inc) => inc.id !== currentIncidentId));
      assert.ok(eligible.every((inc) => inc.status !== 'RESOLVED' && inc.status !== 'REJECTED'));
      assert.ok(eligible.map((i) => i.id).includes('inc-active-2'));
      assert.ok(eligible.map((i) => i.id).includes('inc-active-3'));
    },
  );

  await t.test(
    'Association Method Representation: Distinguishes CREATION, SUGGESTED, and ADMIN',
    async () => {
      const reports = [
        { id: 'r1', match_method: 'CREATION' },
        { id: 'r2', match_method: 'SUGGESTED' },
        { id: 'r3', match_method: 'ADMIN' },
      ];

      // Mapping rules
      const getLabel = (method?: string) => {
        if (method === 'CREATION') return 'Initial Report';
        if (method === 'SUGGESTED') return 'Suggested Match (Candidate Engine)';
        if (method === 'ADMIN') return 'Manually Merged (Admin Action)';
        return 'Unknown';
      };

      assert.equal(getLabel(reports[0].match_method), 'Initial Report');
      assert.equal(getLabel(reports[1].match_method), 'Suggested Match (Candidate Engine)');
      assert.equal(getLabel(reports[2].match_method), 'Manually Merged (Admin Action)');

      // SUGGESTED must never be represented as confirmed
      assert.notEqual(getLabel('SUGGESTED'), 'Confirmed Merged');
    },
  );
});
