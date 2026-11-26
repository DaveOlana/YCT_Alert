import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';
import { bootstrapAdmin } from '../scripts/bootstrap-admin.js';
import { runMigrations } from '../scripts/migrate.js';
import { closePool, initPool } from '../src/db/pool.js';
import type { PublicActiveIncidentsGeoJSON, PublicIncidentDetailResponse } from '@yctalert/contracts';

const ADMIN_PASSWORD = 'TestReactivatePass123!@#';

test('Incident Retention & Reactivation Lifecycle Suite', async (t) => {
  const config = loadConfig({
    NODE_ENV: 'test',
    ENABLE_BACKGROUND_PURGE: 'false',
    ENABLE_GEOGRAPHY_SYNC: 'false',
  });

  initPool(config);
  await runMigrations({
    databaseUrl: config.TEST_DATABASE_URL,
    direction: 'up',
    verbose: false,
  });

  const pool = new Pool({ connectionString: config.TEST_DATABASE_URL, max: 5 });
  const app = buildApp(config);
  await app.ready();

  t.after(async () => {
    await app.close();
    await pool.end();
    await closePool();
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

  // Log in admin to get cookie & CSRF token
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

  async function seedResolvedIncident(daysAgoResolved: number, publicId: string) {
    const resolvedAt = new Date(Date.now() - daysAgoResolved * 24 * 60 * 60 * 1000);
    const incRes = await pool.query<{ id: string }>(
      `INSERT INTO incidents (
        public_id, status, category_code, safe_public_summary,
        first_reported_at, last_reported_at, activated_at, resolved_at, updated_at
      ) VALUES ($1, 'RESOLVED', 'FIRE_OR_SMOKE', 'Electrical fire initially resolved.', $2, $2, $2, $2, $2)
      RETURNING id`,
      [publicId, resolvedAt],
    );
    const incidentId = incRes.rows[0].id;

    // Link a legitimate report
    const reportId = crypto.randomUUID();
    const receiptId = 'rcpt_' + crypto.randomBytes(4).toString('hex');
    await pool.query(
      `INSERT INTO incident_reports (
        id, receipt_id, receipt_token_hash, submitted_at, category_code,
        description, location_source, incident_lat, incident_lon, is_test
      ) VALUES ($1, $2, 'dummy_token_hash', $3, 'FIRE_OR_SMOKE', 'Report narrative', 'DEVICE_GPS', 6.51842, 3.37215, false)`,
      [reportId, receiptId, resolvedAt],
    );
    await pool.query(
      `INSERT INTO incident_report_links (incident_id, report_id, match_method)
       VALUES ($1, $2, 'CREATION')`,
      [incidentId, reportId],
    );

    return { incidentId, publicId };
  }

  await t.test('1. Resolved incident is immediately hidden from public active feed and public details returns 404', async () => {
    const { publicId } = await seedResolvedIncident(5, 'INC-REACTIVATE-001');

    // GeoJSON feed: must NOT include resolved incident
    const feedRes = await app.inject({ method: 'GET', url: '/api/v1/incidents/active/' });
    const feed = feedRes.json() as PublicActiveIncidentsGeoJSON;
    assert.equal(feed.features.some((f) => f.id === publicId), false);

    // Public details: must return 404
    const detailRes = await app.inject({ method: 'GET', url: `/api/v1/incidents/public/${publicId}` });
    assert.equal(detailRes.statusCode, 404);
  });

  await t.test('2. Admin reactivates resolved incident within 30 days: clears resolved_at, logs REACTIVATE, returns to public map', async () => {
    const { incidentId, publicId } = await seedResolvedIncident(10, 'INC-REACTIVATE-002');

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/incidents/${incidentId}/activate`,
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: {
        safe_summary: 'Fire reignited in the Science Workshop. Area evacuated and fire crews redeployed.',
        reason: 'Reported smoke and small flames rekindled in breaker panel.',
      },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.incident.status, 'ACTIVE');
    assert.equal(body.incident.resolved_at, null, 'resolved_at must be cleared to null upon reactivation');
    assert.ok(body.incident.activated_at, 'activated_at must be updated');

    // Verify audit log has REACTIVATE
    const auditRes = await pool.query<{ action: string; previous_status: string; new_status: string }>(
      `SELECT action, previous_status, new_status FROM incident_audit_logs WHERE incident_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [incidentId],
    );
    assert.equal(auditRes.rows[0].action, 'REACTIVATE');
    assert.equal(auditRes.rows[0].previous_status, 'RESOLVED');
    assert.equal(auditRes.rows[0].new_status, 'ACTIVE');

    // Verify database record has resolved_at = null (resetting the 30-day purge clock)
    const dbCheck = await pool.query<{ resolved_at: Date | null; status: string }>(
      `SELECT resolved_at, status FROM incidents WHERE id = $1`,
      [incidentId],
    );
    assert.equal(dbCheck.rows[0].status, 'ACTIVE');
    assert.equal(dbCheck.rows[0].resolved_at, null);

    // Verify incident reappears on public active feed as VERIFIED!
    const feedRes = await app.inject({ method: 'GET', url: '/api/v1/incidents/active/' });
    const feed = feedRes.json() as PublicActiveIncidentsGeoJSON;
    const feat = feed.features.find((f) => f.id === publicId);
    assert.ok(feat, 'Reactivated incident must reappear on active map');
    assert.equal(feat.properties.verification_status, 'VERIFIED');
    assert.equal(feat.properties.summary, 'Fire reignited in the Science Workshop. Area evacuated and fire crews redeployed.');

    // Verify public details returns 200 with status ACTIVE
    const detailRes = await app.inject({ method: 'GET', url: `/api/v1/incidents/public/${publicId}` });
    assert.equal(detailRes.statusCode, 200);
    const detail = detailRes.json() as PublicIncidentDetailResponse;
    assert.equal(detail.status, 'ACTIVE');
    assert.equal(detail.verification_status, 'VERIFIED');
  });

  await t.test('3. Cannot reactivate incident resolved more than 30 days ago', async () => {
    // 35 days ago: exceeds 30-day window
    const { incidentId } = await seedResolvedIncident(35, 'INC-REACTIVATE-003');

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/incidents/${incidentId}/activate`,
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: {
        safe_summary: 'Attempting to reactivate expired incident.',
        reason: 'Testing 30-day expiration policy boundary.',
      },
    });

    assert.equal(res.statusCode, 400);
    const body = res.json();
    assert.equal(body.error.code, 'CANNOT_REACTIVATE_EXPIRED');
    assert.ok(body.error.message.includes('30 days'));
  });

  await t.test('4. Cannot reactivate a REJECTED incident', async () => {
    const incRes = await pool.query<{ id: string }>(
      `INSERT INTO incidents (public_id, status, category_code, safe_public_summary, first_reported_at, last_reported_at, rejected_at, updated_at)
       VALUES ('INC-REACTIVATE-REJECTED', 'REJECTED', 'PHYSICAL_HAZARD', 'Rejected report', NOW(), NOW(), NOW(), NOW())
       RETURNING id`,
    );
    const incidentId = incRes.rows[0].id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/incidents/${incidentId}/activate`,
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: {
        safe_summary: 'Attempting to activate rejected incident.',
        reason: 'Testing terminal rejected invariant.',
      },
    });

    assert.equal(res.statusCode, 400);
    const body = res.json();
    assert.equal(body.error.code, 'INVALID_STATUS');
  });
});
