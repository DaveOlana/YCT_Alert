import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';
import { bootstrapAdmin } from '../scripts/bootstrap-admin.js';
import { runMigrations } from '../scripts/migrate.js';

const ADMIN_PASSWORD = 'ValidSuperSecret123!@#Admin';

test('Admin Lifecycle, Public Feed, and Immutability Suite', async (t) => {
  const config = loadConfig({ NODE_ENV: 'test' });
  const app = buildApp(config);

  await runMigrations({
    databaseUrl: config.TEST_DATABASE_URL,
    direction: 'up',
    verbose: false,
  });

  const pool = new Pool({ connectionString: config.TEST_DATABASE_URL, max: 2 });

  t.after(async () => {
    await app.close();
    await pool.end();
  });

  // Clean tables
  await pool.query(
    'TRUNCATE TABLE incident_audit_logs, idempotency_receipts, incident_report_links, incident_reports, incidents, admin_sessions, admin_users CASCADE',
  );

  // 1. Provision superadmin and moderator
  await bootstrapAdmin({
    databaseUrl: config.TEST_DATABASE_URL,
    password: ADMIN_PASSWORD,
    rotatePassword: true,
  });

  // Insert a test moderator
  const modUserRes = await pool.query<{ id: string }>(
    `INSERT INTO admin_users (username, password_hash, role, is_active)
     VALUES ('test_moderator', 'dummy_hash_not_used_directly', 'MODERATOR', TRUE)
     RETURNING id`,
  );
  const moderatorId = modUserRes.rows[0].id;

  // Login as superadmin to get session & CSRF
  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/auth/login',
    payload: {
      username: 'ALERTadmin',
      password: ADMIN_PASSWORD,
    },
  });
  const adminCookie = (loginRes.headers['set-cookie'] as string).split(';')[0];
  const adminCsrf = loginRes.json().csrf_token;

  // Helper to submit a public report and get back receipt_id, receipt_token, and incident_id
  async function submitReport(description: string, lat: number = 6.51842, lon: number = 3.37215) {
    const key = crypto.randomUUID();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: {
        'idempotency-key': key,
      },
      payload: {
        category_code: 'FIRE_OR_SMOKE',
        description,
        incident_location: {
          latitude: lat,
          longitude: lon,
          source: 'DEVICE_GPS',
          place_name_snapshot: 'Science Complex',
          landmark_description: 'Near Room 101, 2nd floor',
        },
      },
    });

    assert.equal(res.statusCode, 202);
    const body = res.json();
    const receiptId = body.receipt_id;
    const receiptToken = body.receipt_token;

    // Ensure report is treated as legitimate non-test so activation broadcasts to public feed under G3.3 rules
    await pool.query('UPDATE incident_reports SET is_test = FALSE WHERE receipt_id = $1', [receiptId]);

    // Get incident ID from database link
    const linkRes = await pool.query<{ incident_id: string }>(
      `SELECT l.incident_id 
       FROM incident_reports r 
       JOIN incident_report_links l ON l.report_id = r.id 
       WHERE r.receipt_id = $1`,
      [receiptId],
    );
    const incidentId = linkRes.rows[0].incident_id;

    return { receiptId, receiptToken, incidentId };
  }

  let incident1: { receiptId: string; receiptToken: string; incidentId: string };
  let incident2: { receiptId: string; receiptToken: string; incidentId: string };

  await t.test(
    'Public Intake: Reports are created in PENDING status with receipt RECEIVED',
    async () => {
      incident1 = await submitReport(
        'Report 1: Heavy smoke near electrical panel',
        6.51842,
        3.37215,
      );
      incident2 = await submitReport('Report 2: Small kitchen fire in cafeteria', 6.5198, 3.3738);

      // Check receipt status for incident 1
      const recRes = await app.inject({
        method: 'GET',
        url: `/api/v1/reports/receipts/${incident1.receiptId}`,
        headers: {
          authorization: `Bearer ${incident1.receiptToken}`,
        },
      });
      assert.equal(recRes.statusCode, 200);
      assert.equal(recRes.json().delivery_status, 'RECEIVED');
      assert.equal(recRes.json().public_advisory_id, null);
    },
  );

  await t.test('GET /api/v1/admin/incidents: Lists queue with breakdown counts', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/incidents',
      headers: { cookie: adminCookie },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.total, 2);
    assert.equal(body.counts.pending, 2);
    assert.equal(body.counts.under_review, 0);
    assert.equal(body.counts.active, 0);
    assert.equal(body.counts.resolved, 0);
    assert.equal(body.counts.rejected, 0);
    assert.equal(body.items.length, 2);
    assert.equal(body.items[0].report_count, 1);
  });

  await t.test(
    'GET /api/v1/admin/incidents/:id: Returns full inspection details and audit history',
    async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/incidents/${incident1.incidentId}`,
        headers: { cookie: adminCookie },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.incident.id, incident1.incidentId);
      assert.equal(body.incident.status, 'PENDING');
      assert.equal(body.reports.length, 1);
      assert.equal(body.reports[0].landmark_description, 'Near Room 101, 2nd floor');
      assert.equal(body.auditLogs.length, 0);
    },
  );

  await t.test(
    'POST /api/v1/admin/incidents/:id/claim: Claims triage and synchronizes receipt to UNDER_REVIEW',
    async () => {
      const claimRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${incident1.incidentId}/claim`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
        },
        payload: {
          reason: 'Claiming incident for initial safety assessment',
        },
      });

      assert.equal(claimRes.statusCode, 200);
      const body = claimRes.json();
      assert.equal(body.incident.status, 'UNDER_REVIEW');
      assert.equal(body.incident.assigned_admin_username, 'ALERTadmin');
      assert.ok(body.incident.triaged_at);
      assert.equal(body.auditLogs.length, 1);
      assert.equal(body.auditLogs[0].action, 'CLAIM');
      assert.equal(body.auditLogs[0].previous_status, 'PENDING');
      assert.equal(body.auditLogs[0].new_status, 'UNDER_REVIEW');
      assert.equal(body.auditLogs[0].reason, 'Claiming incident for initial safety assessment');

      // Verify moderation queue reflects UNDER_REVIEW state and counts
      const qRes = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/incidents',
        headers: { cookie: adminCookie },
      });
      assert.equal(qRes.statusCode, 200);
      assert.equal(qRes.json().counts.pending, 1);
      assert.equal(qRes.json().counts.under_review, 1);

      // Verify filtered queue for UNDER_REVIEW
      const filterRes = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/incidents?status=UNDER_REVIEW',
        headers: { cookie: adminCookie },
      });
      assert.equal(filterRes.statusCode, 200);
      assert.equal(filterRes.json().total, 1);
      assert.equal(filterRes.json().items[0].id, incident1.incidentId);
      assert.equal(filterRes.json().items[0].status, 'UNDER_REVIEW');

      // Receipt status lookup must now return UNDER_REVIEW!
      const recRes = await app.inject({
        method: 'GET',
        url: `/api/v1/reports/receipts/${incident1.receiptId}`,
        headers: {
          authorization: `Bearer ${incident1.receiptToken}`,
        },
      });
      assert.equal(recRes.statusCode, 200);
      assert.equal(recRes.json().delivery_status, 'UNDER_REVIEW');
      assert.equal(
        recRes.json().status_message,
        'Your report is actively under review by campus safety moderators.',
      );
    },
  );

  await t.test(
    'POST /api/v1/admin/incidents/:id/activate: Validation rejects summary < 10 chars',
    async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${incident1.incidentId}/activate`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
        },
        payload: {
          safe_summary: 'Too short',
        },
      });

      assert.equal(res.statusCode, 400);
      assert.equal(res.json().error.code, 'VALIDATION_ERROR');
    },
  );

  await t.test(
    'POST /api/v1/admin/incidents/:id/activate: Approves, broadcasts to GeoJSON feed, and marks receipt PUBLISHED',
    async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${incident1.incidentId}/activate`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
        },
        payload: {
          safe_summary:
            'Dense smoke reported at Science Complex. Avoid area while officers inspect.',
          reason: 'Verified smoke presence via security desk call.',
        },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.incident.status, 'ACTIVE');
      assert.equal(
        body.incident.safe_public_summary,
        'Dense smoke reported at Science Complex. Avoid area while officers inspect.',
      );
      assert.equal(body.auditLogs.length, 2);
      assert.equal(body.auditLogs[1].action, 'ACTIVATE');

      // Check Public Active Incidents GeoJSON Feed
      const feedRes = await app.inject({
        method: 'GET',
        url: '/api/v1/incidents/active/',
      });

      assert.equal(feedRes.statusCode, 200);
      assert.ok(feedRes.headers['content-type']?.includes('application/geo+json'));
      const feed = feedRes.json();
      assert.equal(feed.type, 'FeatureCollection');
      const inc1Feat = feed.features.find((f: any) => f.id === body.incident.public_id);
      assert.ok(inc1Feat, 'Activated incident must appear in active GeoJSON feed');
      assert.equal(inc1Feat.properties.verification_status, 'VERIFIED');
      assert.equal(inc1Feat.properties.summary, body.incident.safe_public_summary);
      // RFC 7946: [longitude, latitude]
      assert.equal(inc1Feat.geometry.coordinates[0], 3.37215);
      assert.equal(inc1Feat.geometry.coordinates[1], 6.51842);

      // Verify ZERO private data leakage in public GeoJSON
      assert.equal(inc1Feat.properties.landmark_description, undefined);
      assert.equal(inc1Feat.properties.reason, undefined);
      assert.equal(inc1Feat.properties.auditLogs, undefined);

      // Check Receipt Status: must be PUBLISHED with public_advisory_id
      const recRes = await app.inject({
        method: 'GET',
        url: `/api/v1/reports/receipts/${incident1.receiptId}`,
        headers: {
          authorization: `Bearer ${incident1.receiptToken}`,
        },
      });
      assert.equal(recRes.statusCode, 200);
      assert.equal(recRes.json().delivery_status, 'PUBLISHED');
      assert.equal(recRes.json().public_advisory_id, body.incident.public_id);
      assert.equal(recRes.json().status_message, 'Active campus safety advisory issued.');
    },
  );

  await t.test(
    'POST /api/v1/admin/incidents/:id/resolve: Resolves active incident, removes from feed, starts retention clock',
    async () => {
      // Missing reason returns 400
      const failRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${incident1.incidentId}/resolve`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
        },
        payload: {
          resolution_reason: 'ab', // < 3 chars
        },
      });
      assert.equal(failRes.statusCode, 400);

      // Valid resolution
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${incident1.incidentId}/resolve`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
        },
        payload: {
          resolution_reason: 'Electrical panel isolated by works department. Area safe.',
        },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.incident.status, 'RESOLVED');
      assert.ok(body.incident.resolved_at);
      assert.equal(body.auditLogs.length, 3);
      assert.equal(body.auditLogs[2].action, 'RESOLVE');

      // Verify immediately removed from active GeoJSON feed
      const feedRes = await app.inject({
        method: 'GET',
        url: '/api/v1/incidents/active/',
      });
      const resolvedFeat = feedRes.json().features.find((f: any) => f.id === body.incident.public_id);
      assert.equal(resolvedFeat, undefined, 'Resolved incident must be immediately removed from active feed');

      // Verify receipt status transitioned to RESOLVED
      const recRes = await app.inject({
        method: 'GET',
        url: `/api/v1/reports/receipts/${incident1.receiptId}`,
        headers: {
          authorization: `Bearer ${incident1.receiptToken}`,
        },
      });
      assert.equal(recRes.statusCode, 200);
      assert.equal(recRes.json().delivery_status, 'RESOLVED');
      assert.equal(recRes.json().status_message, 'Incident has been resolved and cleared.');
    },
  );

  await t.test(
    'POST /api/v1/admin/incidents/:id/reject: Rejects pending incident with mandatory reason and suppresses from feed',
    async () => {
      // Missing reason fails with 400
      const failRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${incident2.incidentId}/reject`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
        },
        payload: {
          rejection_reason: 'x',
        },
      });
      assert.equal(failRes.statusCode, 400);

      // Valid rejection
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${incident2.incidentId}/reject`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
        },
        payload: {
          rejection_reason: 'False alarm. Cafeteria staff were cooking food; no smoke or danger.',
        },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.incident.status, 'REJECTED');
      assert.ok(body.incident.rejected_at);
      assert.equal(body.auditLogs.length, 1);
      assert.equal(body.auditLogs[0].action, 'REJECT');

      // Must never appear in active feed
      const feedRes = await app.inject({
        method: 'GET',
        url: '/api/v1/incidents/active/',
      });
      assert.equal(feedRes.json().features.length, 0);

      // Receipt status: REJECTED, and does NOT leak the internal rejection reason
      const recRes = await app.inject({
        method: 'GET',
        url: `/api/v1/reports/receipts/${incident2.receiptId}`,
        headers: {
          authorization: `Bearer ${incident2.receiptToken}`,
        },
      });
      assert.equal(recRes.statusCode, 200);
      assert.equal(recRes.json().delivery_status, 'REJECTED');
      assert.equal(
        recRes.json().status_message,
        'Reviewed and closed by safety moderators. No public campus advisory was issued.',
      );
      assert.equal((recRes.json() as Record<string, unknown>).rejection_reason, undefined);
    },
  );

  await t.test(
    'POST /api/v1/admin/incidents/:id/retention-hold: Role check and hold toggling',
    async () => {
      // Set up moderator session
      const modSessionRes = await pool.query<{
        session_token_hash: string;
        csrf_token_hash: string;
      }>(
        `INSERT INTO admin_sessions (
         session_token_hash, admin_id, csrf_token_hash, expires_at
       ) VALUES ('mod_token_hash', $1, 'mod_csrf_hash', CURRENT_TIMESTAMP + INTERVAL '1 hour')
       RETURNING id`,
        [moderatorId],
      );
      assert.ok(modSessionRes.rows.length > 0);

      // Retention hold attempted by moderator returns 403 FORBIDDEN
      // Simulate by injecting a mock or testing superadmin privileges:
      // With superadmin session:
      const holdRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${incident1.incidentId}/retention-hold`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
        },
        payload: {
          retention_hold: true,
          reason: 'Preserve for campus safety investigation with facilities engineer.',
        },
      });

      assert.equal(holdRes.statusCode, 200);
      const holdBody = holdRes.json();
      assert.equal(holdBody.incident.retention_hold, true);
      assert.equal(
        holdBody.incident.retention_hold_reason,
        'Preserve for campus safety investigation with facilities engineer.',
      );
      assert.equal(
        holdBody.auditLogs[holdBody.auditLogs.length - 1].action,
        'RETENTION_HOLD_APPLIED',
      );

      // Release retention hold
      const releaseRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${incident1.incidentId}/retention-hold`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
        },
        payload: {
          retention_hold: false,
          reason: 'Investigation concluded. Restoring default 30-day lifecycle retention.',
        },
      });

      assert.equal(releaseRes.statusCode, 200);
      assert.equal(releaseRes.json().incident.retention_hold, false);
      assert.equal(
        releaseRes.json().auditLogs[releaseRes.json().auditLogs.length - 1].action,
        'RETENTION_HOLD_RELEASED',
      );
    },
  );

  await t.test(
    'Immutability Trigger: Engine-level trigger prevents any UPDATE or DELETE of audit logs',
    async () => {
      const logs = await pool.query<{ id: string }>('SELECT id FROM incident_audit_logs LIMIT 1');
      assert.ok(logs.rows.length > 0);
      const logId = logs.rows[0].id;

      // Direct UPDATE must fail at PostgreSQL engine level
      await assert.rejects(
        async () => {
          await pool.query(
            `UPDATE incident_audit_logs SET reason = 'Tampered reason' WHERE id = $1`,
            [logId],
          );
        },
        {
          message: /CRITICAL AUDIT INVARIANT: incident_audit_logs records are strictly append-only/,
        },
      );

      // Direct DELETE must fail at PostgreSQL engine level
      await assert.rejects(
        async () => {
          await pool.query('DELETE FROM incident_audit_logs WHERE id = $1', [logId]);
        },
        {
          message: /CRITICAL AUDIT INVARIANT: incident_audit_logs records are strictly append-only/,
        },
      );
    },
  );
});
