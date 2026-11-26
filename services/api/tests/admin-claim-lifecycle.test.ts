import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';
import { bootstrapAdmin } from '../scripts/bootstrap-admin.js';
import { runMigrations } from '../scripts/migrate.js';
import { withTransaction } from '../src/db/pool.js';

const ADMIN_PASSWORD = 'ValidSuperSecret123!@#Admin';

test('Admin Claim Lifecycle, State Transition, Audit & Rollback Suite', async (t) => {
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

  // 1. Provision superadmin
  await bootstrapAdmin({
    databaseUrl: config.TEST_DATABASE_URL,
    password: ADMIN_PASSWORD,
  });

  // Login as superadmin to get session & CSRF
  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/auth/login',
    payload: {
      username: 'ALERTadmin',
      password: ADMIN_PASSWORD,
    },
  });
  assert.equal(loginRes.statusCode, 200);
  const adminCookie = (loginRes.headers['set-cookie'] as string).split(';')[0];
  const adminCsrf = loginRes.json().csrf_token;
  const adminUser = loginRes.json().user;

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
          place_name_snapshot: 'Engineering Workshop',
          landmark_description: 'Near Panel 3B',
        },
      },
    });

    assert.equal(res.statusCode, 202);
    const body = res.json();
    const receiptId = body.receipt_id;
    const receiptToken = body.receipt_token;

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

  await t.test(
    'Claim Triage: Transitions PENDING -> UNDER_REVIEW, assigns admin, and synchronizes receipt',
    async () => {
      const item = await submitReport('Report A: Overheating breaker in block A');

      // Verify initial state is PENDING with null assignment
      const initialDetail = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/incidents/${item.incidentId}`,
        headers: { cookie: adminCookie },
      });
      assert.equal(initialDetail.statusCode, 200);
      assert.equal(initialDetail.json().incident.status, 'PENDING');
      assert.equal(initialDetail.json().incident.assigned_admin_id, null);

      // Execute Claim
      const claimRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${item.incidentId}/claim`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
        },
        payload: {
          reason: 'Claiming incident for active investigation',
        },
      });

      assert.equal(claimRes.statusCode, 200);
      const claimBody = claimRes.json();

      // 1. Status transition check
      assert.equal(claimBody.incident.status, 'UNDER_REVIEW');
      assert.equal(claimBody.incident.assigned_admin_username, 'ALERTadmin');
      assert.ok(claimBody.incident.triaged_at);

      // 2. Audit event check
      assert.equal(claimBody.auditLogs.length, 1);
      const audit = claimBody.auditLogs[0];
      assert.equal(audit.action, 'CLAIM');
      assert.equal(audit.previous_status, 'PENDING');
      assert.equal(audit.new_status, 'UNDER_REVIEW');
      assert.equal(audit.reason, 'Claiming incident for active investigation');
      assert.equal(audit.admin_username, 'ALERTadmin');

      // 3. Database direct verification
      const dbCheck = await pool.query<{
        status: string;
        assigned_admin_id: string;
        triaged_at: Date;
      }>('SELECT status, assigned_admin_id, triaged_at FROM incidents WHERE id = $1', [
        item.incidentId,
      ]);
      assert.equal(dbCheck.rows[0].status, 'UNDER_REVIEW');
      assert.equal(dbCheck.rows[0].assigned_admin_id, adminUser.id);
      assert.ok(dbCheck.rows[0].triaged_at);

      // 4. Receipt status check
      const recRes = await app.inject({
        method: 'GET',
        url: `/api/v1/reports/receipts/${item.receiptId}`,
        headers: {
          authorization: `Bearer ${item.receiptToken}`,
        },
      });
      assert.equal(recRes.statusCode, 200);
      assert.equal(recRes.json().delivery_status, 'UNDER_REVIEW');
      assert.equal(
        recRes.json().status_message,
        'Your report is actively under review by campus safety moderators.',
      );

      // 5. Queue classification and counters check
      const queueRes = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/incidents',
        headers: { cookie: adminCookie },
      });
      assert.equal(queueRes.statusCode, 200);
      assert.equal(queueRes.json().counts.pending, 0);
      assert.equal(queueRes.json().counts.under_review, 1);

      // 6. Filter by UNDER_REVIEW
      const filterRes = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/incidents?status=UNDER_REVIEW',
        headers: { cookie: adminCookie },
      });
      assert.equal(filterRes.statusCode, 200);
      assert.equal(filterRes.json().total, 1);
      assert.equal(filterRes.json().items[0].id, item.incidentId);
      assert.equal(filterRes.json().items[0].status, 'UNDER_REVIEW');

      // 7. Cannot re-claim an incident already in UNDER_REVIEW
      const reClaimRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${item.incidentId}/claim`,
        headers: {
          cookie: adminCookie,
          'x-csrf-token': adminCsrf,
        },
        payload: {
          reason: 'Attempting to re-claim',
        },
      });
      assert.equal(reClaimRes.statusCode, 400);
      assert.equal(reClaimRes.json().error.code, 'INVALID_STATUS');
      assert.match(reClaimRes.json().error.message, /CANNOT_CLAIM_STATUS/);
    },
  );

  await t.test(
    'Lifecycle Progression: Can activate or reject an incident from UNDER_REVIEW state',
    async () => {
      // Incident 1: Transition UNDER_REVIEW -> ACTIVE
      const item1 = await submitReport('Report 1 for activation from UNDER_REVIEW', 6.52, 3.374);
      await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${item1.incidentId}/claim`,
        headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
        payload: { reason: 'Triage for activation' },
      });

      const activateRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${item1.incidentId}/activate`,
        headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
        payload: {
          safe_summary: 'Confirmed fire in electrical room; firefighters on scene.',
          reason: 'Safety team verified hazard',
        },
      });
      assert.equal(activateRes.statusCode, 200);
      assert.equal(activateRes.json().incident.status, 'ACTIVE');

      // Verify audit log recorded UNDER_REVIEW -> ACTIVE
      const activateAudit = activateRes
        .json()
        .auditLogs.find((l: { action: string }) => l.action === 'ACTIVATE');
      assert.ok(activateAudit);
      assert.equal(activateAudit.previous_status, 'UNDER_REVIEW');
      assert.equal(activateAudit.new_status, 'ACTIVE');

      // Incident 2: Transition UNDER_REVIEW -> REJECTED (at distinct location >50m away)
      const item2 = await submitReport('Report 2 for rejection from UNDER_REVIEW', 6.522, 3.376);
      await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${item2.incidentId}/claim`,
        headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
        payload: { reason: 'Triage for rejection check' },
      });

      const rejectRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/incidents/${item2.incidentId}/reject`,
        headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
        payload: {
          rejection_reason: 'False alarm: smoke was from authorized culinary class',
        },
      });
      assert.equal(rejectRes.statusCode, 200);
      assert.equal(rejectRes.json().incident.status, 'REJECTED');

      // Verify audit log recorded UNDER_REVIEW -> REJECTED
      const rejectAudit = rejectRes
        .json()
        .auditLogs.find((l: { action: string }) => l.action === 'REJECT');
      assert.ok(rejectAudit);
      assert.equal(rejectAudit.previous_status, 'UNDER_REVIEW');
      assert.equal(rejectAudit.new_status, 'REJECTED');
    },
  );

  await t.test(
    'Transaction Atomicity: Failure during claim rolls back all status, assignment and audit changes',
    async () => {
      const item = await submitReport('Report for rollback verification', 6.524, 3.378);

      // Verify starting state
      const preCheck = await pool.query<{ status: string; assigned_admin_id: string | null }>(
        'SELECT status, assigned_admin_id FROM incidents WHERE id = $1',
        [item.incidentId],
      );
      assert.equal(preCheck.rows[0].status, 'PENDING');
      assert.equal(preCheck.rows[0].assigned_admin_id, null);

      // Execute an atomic transaction that simulates an error after the incident update
      await assert.rejects(async () => {
        await withTransaction(async (client) => {
          await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
            `INCIDENT:${item.incidentId}`,
          ]);

          // 1. Perform incident update
          await client.query(
            `UPDATE incidents
               SET status = 'UNDER_REVIEW',
                   assigned_admin_id = $1,
                   triaged_at = CURRENT_TIMESTAMP,
                   row_version = row_version + 1
               WHERE id = $2`,
            [adminUser.id, item.incidentId],
          );

          // 2. Perform audit insert
          await client.query(
            `INSERT INTO incident_audit_logs (
                 incident_id, admin_id, admin_username, action, previous_status, new_status, reason
               ) VALUES ($1, $2, $3, 'CLAIM', 'PENDING', 'UNDER_REVIEW', 'Test Reason')`,
            [item.incidentId, adminUser.id, adminUser.username],
          );

          // 3. Force an intentional error to trigger rollback
          throw new Error('SIMULATED_TRANSACTION_FAILURE');
        });
      }, /SIMULATED_TRANSACTION_FAILURE/);

      // Verify complete rollback: status must still be PENDING, no assignment, no audit log
      const postCheck = await pool.query<{
        status: string;
        assigned_admin_id: string | null;
        triaged_at: Date | null;
      }>('SELECT status, assigned_admin_id, triaged_at FROM incidents WHERE id = $1', [
        item.incidentId,
      ]);
      assert.equal(postCheck.rows[0].status, 'PENDING');
      assert.equal(postCheck.rows[0].assigned_admin_id, null);
      assert.equal(postCheck.rows[0].triaged_at, null);

      const auditCheck = await pool.query(
        'SELECT id FROM incident_audit_logs WHERE incident_id = $1',
        [item.incidentId],
      );
      assert.equal(auditCheck.rows.length, 0);
    },
  );
});
