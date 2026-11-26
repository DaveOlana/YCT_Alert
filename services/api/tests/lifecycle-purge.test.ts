import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';
import { bootstrapAdmin } from '../scripts/bootstrap-admin.js';
import { runMigrations } from '../scripts/migrate.js';
import { AdminIncidentService } from '../src/services/adminIncidentService.js';

const ADMIN_PASSWORD = 'ValidSuperSecret123!@#Admin';

test('Retention Purge Lifecycle & Concurrency Invariants Suite (Decision D-16)', async (t) => {
  // Test isolation: strictly targets yct_alert_test
  const config = loadConfig({ NODE_ENV: 'test', ENABLE_BACKGROUND_PURGE: 'false' });
  const app = buildApp(config);

  await runMigrations({
    databaseUrl: config.TEST_DATABASE_URL,
    direction: 'up',
    verbose: false,
  });

  const pool = new Pool({ connectionString: config.TEST_DATABASE_URL, max: 5 });
  const adminIncidentService = new AdminIncidentService();

  t.after(async () => {
    await app.close();
    await pool.end();
  });

  // Clean tables
  await pool.query(
    'TRUNCATE TABLE incident_audit_logs, idempotency_receipts, incident_report_links, incident_reports, incidents, admin_sessions, admin_users CASCADE',
  );

  // Bootstrap superadmin
  await bootstrapAdmin({
    databaseUrl: config.TEST_DATABASE_URL,
    password: ADMIN_PASSWORD,
  });

  const adminUserRes = await pool.query<{ id: string }>(
    `SELECT id FROM admin_users WHERE username = 'ALERTadmin'`,
  );
  const adminId = adminUserRes.rows[0].id;

  // Helper to seed a report, incident, link, idempotency receipt, and audit log
  async function seedIncidentWithReport(opts: {
    status: 'PENDING' | 'ACTIVE' | 'RESOLVED' | 'REJECTED';
    daysAgo: number;
    retentionHold?: boolean;
    assignedAdmin?: boolean;
  }): Promise<{ incidentId: string; reportId: string; receiptId: string }> {
    const publicId = `inc_${crypto.randomBytes(8).toString('hex')}`;
    const receiptId = `rcpt_${crypto.randomBytes(8).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex');
    const pastDate = new Date(Date.now() - opts.daysAgo * 24 * 60 * 60 * 1000);

    const reportRes = await pool.query<{ id: string }>(
      `INSERT INTO incident_reports (
        submitted_at, category_code, description, location_source,
        incident_lat, incident_lon, accuracy_meters, landmark_description,
        receipt_id, receipt_token_hash, is_test
      ) VALUES ($1, 'FIRE_OR_SMOKE', 'Sensitive raw reporter narrative: near building transformer.', 'DEVICE_GPS',
        6.518420, 3.372150, 8.5, 'Near Generator Yard', $2, 'dummy_token_hash', TRUE)
      RETURNING id`,
      [pastDate, receiptId],
    );
    const reportId = reportRes.rows[0].id;

    const incRes = await pool.query<{ id: string }>(
      `INSERT INTO incidents (
        public_id, status, category_code, safe_public_summary,
        display_lat, display_lon, first_reported_at, last_reported_at,
        created_at, updated_at, resolved_at, rejected_at,
        retention_hold, assigned_admin_id, triaged_at
      ) VALUES (
        $1, $2, 'FIRE_OR_SMOKE', 'Smoke hazard advisory outside main yard.',
        6.518420, 3.372150, $3, $3,
        $3, $3,
        $4, $5,
        $6, $7, $8
      ) RETURNING id`,
      [
        publicId,
        opts.status,
        pastDate,
        opts.status === 'RESOLVED' ? pastDate : null,
        opts.status === 'REJECTED' ? pastDate : null,
        opts.retentionHold === true,
        opts.assignedAdmin ? adminId : null,
        opts.assignedAdmin ? pastDate : null,
      ],
    );
    const incidentId = incRes.rows[0].id;

    await pool.query(
      `INSERT INTO incident_report_links (incident_id, report_id, match_method)
       VALUES ($1, $2, 'CREATION')`,
      [incidentId, reportId],
    );

    await pool.query(
      `INSERT INTO idempotency_receipts (
        scope, key_hash, request_fingerprint, report_id, response_code,
        encrypted_response, encryption_iv, encryption_tag, replay_expires_at
      ) VALUES (
        'PUBLIC_REPORT', $1, 'fingerprint123', $2, 202,
        $3, $4, $5, $6
      )`,
      [
        keyHash,
        reportId,
        Buffer.from('encrypted_payload_data'),
        Buffer.from('123456789012'),
        Buffer.from('1234567890123456'),
        new Date(pastDate.getTime() + 7 * 24 * 60 * 60 * 1000),
      ],
    );

    // Seed immutable audit record
    await pool.query(
      `INSERT INTO incident_audit_logs (
        incident_id, admin_id, admin_username, action, previous_status, new_status, reason
      ) VALUES ($1, $2, 'ALERTadmin', $3, 'PENDING', $4, 'Administrative triage decision')`,
      [incidentId, adminId, opts.status === 'RESOLVED' ? 'RESOLVE' : 'CLAIM', opts.status],
    );

    return { incidentId, reportId, receiptId };
  }

  await t.test(
    'Scenario 1: Active and Pending Incident Immunity (Active/Pending records are never purged)',
    async () => {
      const active = await seedIncidentWithReport({ status: 'ACTIVE', daysAgo: 60 });
      const pending = await seedIncidentWithReport({ status: 'PENDING', daysAgo: 45 });
      const underReview = await seedIncidentWithReport({
        status: 'PENDING',
        daysAgo: 45,
        assignedAdmin: true,
      });

      const purgeResult = await adminIncidentService.purgeExpiredIncidents(new Date());
      assert.equal(purgeResult.purgedIncidentCount, 0);
      assert.equal(purgeResult.purgedReportCount, 0);

      // Verify active incident and report survived untouched
      const activeCheck = await pool.query(
        'SELECT status, safe_public_summary, display_lat, purged_at FROM incidents WHERE id = $1',
        [active.incidentId],
      );
      assert.equal(activeCheck.rows[0].status, 'ACTIVE');
      assert.notEqual(activeCheck.rows[0].display_lat, null);
      assert.equal(activeCheck.rows[0].purged_at, null);

      const activeReportCheck = await pool.query('SELECT id FROM incident_reports WHERE id = $1', [
        active.reportId,
      ]);
      assert.equal(activeReportCheck.rows.length, 1);

      // Verify pending and under_review survived
      const pendingCheck = await pool.query(
        'SELECT status, purged_at FROM incidents WHERE id = $1',
        [pending.incidentId],
      );
      assert.equal(pendingCheck.rows[0].status, 'PENDING');
      assert.equal(pendingCheck.rows[0].purged_at, null);

      const reviewCheck = await pool.query(
        'SELECT status, assigned_admin_id, purged_at FROM incidents WHERE id = $1',
        [underReview.incidentId],
      );
      assert.equal(reviewCheck.rows[0].status, 'PENDING');
      assert.equal(reviewCheck.rows[0].assigned_admin_id, adminId);
      assert.equal(reviewCheck.rows[0].purged_at, null);
    },
  );

  await t.test(
    'Scenario 2: Retention Hold Immunity (Retention hold unconditionally protects record)',
    async () => {
      const held = await seedIncidentWithReport({
        status: 'RESOLVED',
        daysAgo: 40,
        retentionHold: true,
      });

      const purgeResult = await adminIncidentService.purgeExpiredIncidents(new Date());
      assert.equal(purgeResult.purgedIncidentCount, 0);
      assert.equal(purgeResult.purgedReportCount, 0);

      const heldCheck = await pool.query(
        'SELECT status, retention_hold, display_lat, purged_at FROM incidents WHERE id = $1',
        [held.incidentId],
      );
      assert.equal(heldCheck.rows[0].status, 'RESOLVED');
      assert.equal(heldCheck.rows[0].retention_hold, true);
      assert.equal(heldCheck.rows[0].purged_at, null);
      assert.notEqual(heldCheck.rows[0].display_lat, null);

      const reportCheck = await pool.query('SELECT id FROM incident_reports WHERE id = $1', [
        held.reportId,
      ]);
      assert.equal(reportCheck.rows.length, 1);
    },
  );

  await t.test(
    'Scenario 3: Purge of Expired Resolved Incident (30-day threshold, cascade report deletion, redaction, and audit survival)',
    async () => {
      const expiredResolved = await seedIncidentWithReport({
        status: 'RESOLVED',
        daysAgo: 35,
        retentionHold: false,
      });

      // Also seed an unexpired resolved incident (< 30 days) to ensure strict threshold filtering
      const freshResolved = await seedIncidentWithReport({
        status: 'RESOLVED',
        daysAgo: 15,
        retentionHold: false,
      });

      const purgeResult = await adminIncidentService.purgeExpiredIncidents(new Date());
      assert.equal(purgeResult.purgedIncidentCount, 1);
      assert.equal(purgeResult.purgedReportCount, 1);

      // Verify expired incident was redacted and stamped with purged_at
      const incCheck = await pool.query(
        'SELECT status, display_lat, display_lon, safe_public_summary, purged_at FROM incidents WHERE id = $1',
        [expiredResolved.incidentId],
      );
      assert.equal(incCheck.rows[0].status, 'RESOLVED');
      assert.equal(incCheck.rows[0].display_lat, null);
      assert.equal(incCheck.rows[0].display_lon, null);
      assert.equal(
        incCheck.rows[0].safe_public_summary,
        '[REDACTED ARCHIVAL RECORD — PURGED PER RETENTION POLICY D-16]',
      );
      assert.ok(incCheck.rows[0].purged_at instanceof Date);

      // Verify raw report and its idempotency receipt were expunged
      const repCheck = await pool.query('SELECT id FROM incident_reports WHERE id = $1', [
        expiredResolved.reportId,
      ]);
      assert.equal(repCheck.rows.length, 0);

      const idempCheck = await pool.query(
        'SELECT id FROM idempotency_receipts WHERE report_id = $1',
        [expiredResolved.reportId],
      );
      assert.equal(idempCheck.rows.length, 0);

      const linkCheck = await pool.query(
        'SELECT id FROM incident_report_links WHERE incident_id = $1',
        [expiredResolved.incidentId],
      );
      assert.equal(linkCheck.rows.length, 0);

      // Verify immutable audit log survived intact
      const auditCheck = await pool.query(
        'SELECT id, action, reason FROM incident_audit_logs WHERE incident_id = $1',
        [expiredResolved.incidentId],
      );
      assert.ok(auditCheck.rows.length > 0);
      assert.equal(auditCheck.rows[0].action, 'RESOLVE');

      // Verify fresh resolved incident remained completely untouched
      const freshCheck = await pool.query(
        'SELECT status, display_lat, purged_at FROM incidents WHERE id = $1',
        [freshResolved.incidentId],
      );
      assert.equal(freshCheck.rows[0].status, 'RESOLVED');
      assert.notEqual(freshCheck.rows[0].display_lat, null);
      assert.equal(freshCheck.rows[0].purged_at, null);

      const freshRepCheck = await pool.query('SELECT id FROM incident_reports WHERE id = $1', [
        freshResolved.reportId,
      ]);
      assert.equal(freshRepCheck.rows.length, 1);
    },
  );

  await t.test(
    'Scenario 4: Purge of Expired Rejected Incident (30-day threshold on rejected_at)',
    async () => {
      const expiredRejected = await seedIncidentWithReport({
        status: 'REJECTED',
        daysAgo: 32,
        retentionHold: false,
      });

      const purgeResult = await adminIncidentService.purgeExpiredIncidents(new Date());
      assert.equal(purgeResult.purgedIncidentCount, 1);
      assert.equal(purgeResult.purgedReportCount, 1);

      const incCheck = await pool.query(
        'SELECT status, purged_at, safe_public_summary FROM incidents WHERE id = $1',
        [expiredRejected.incidentId],
      );
      assert.equal(incCheck.rows[0].status, 'REJECTED');
      assert.ok(incCheck.rows[0].purged_at instanceof Date);
      assert.equal(
        incCheck.rows[0].safe_public_summary,
        '[REDACTED ARCHIVAL RECORD — PURGED PER RETENTION POLICY D-16]',
      );

      const repCheck = await pool.query('SELECT id FROM incident_reports WHERE id = $1', [
        expiredRejected.reportId,
      ]);
      assert.equal(repCheck.rows.length, 0);
    },
  );

  await t.test(
    'Scenario 5: Concurrency Safety & Post-Lock Recheck (Cannot bypass newly applied retention hold)',
    async () => {
      const candidate = await seedIncidentWithReport({
        status: 'RESOLVED',
        daysAgo: 40,
        retentionHold: false,
      });

      // Emulate concurrent transaction: client 1 holds an exclusive lock and updates retention_hold
      const client1 = await pool.connect();
      try {
        await client1.query('BEGIN');
        await client1.query('SELECT id FROM incidents WHERE id = $1 FOR UPDATE', [
          candidate.incidentId,
        ]);
        await client1.query(
          'UPDATE incidents SET retention_hold = TRUE, retention_hold_reason = $1 WHERE id = $2',
          ['Emergency institutional audit freeze', candidate.incidentId],
        );
        await client1.query('COMMIT');
      } finally {
        client1.release();
      }

      // Now run purge. The candidate must be skipped by the recheck query
      const purgeResult = await adminIncidentService.purgeExpiredIncidents(new Date());
      assert.equal(purgeResult.purgedIncidentCount, 0);

      const check = await pool.query(
        'SELECT status, retention_hold, purged_at FROM incidents WHERE id = $1',
        [candidate.incidentId],
      );
      assert.equal(check.rows[0].retention_hold, true);
      assert.equal(check.rows[0].purged_at, null);

      const repCheck = await pool.query('SELECT id FROM incident_reports WHERE id = $1', [
        candidate.reportId,
      ]);
      assert.equal(repCheck.rows.length, 1);
    },
  );

  await t.test(
    'Scenario 6: Second Purge Pass Idempotency (Already purged records are ignored)',
    async () => {
      const secondPass = await adminIncidentService.purgeExpiredIncidents(new Date());
      assert.equal(secondPass.purgedIncidentCount, 0);
      assert.equal(secondPass.purgedReportCount, 0);
    },
  );
});
