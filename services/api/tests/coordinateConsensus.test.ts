import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';
import { runMigrations } from '../scripts/migrate.js';
import { bootstrapAdmin } from '../scripts/bootstrap-admin.js';
import { closePool, initPool } from '../src/db/pool.js';
import {
  haversineDistanceMeters,
  calculateCoordinateMedoid,
} from '../src/services/coordinateConsensusService.js';
import type { PublicActiveIncidentsGeoJSON } from '@yctalert/contracts';

test('Coordinate Consensus & Location Provenance Suite', async (t) => {
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

  await pool.query(
    'TRUNCATE TABLE incident_audit_logs, idempotency_receipts, incident_report_links, incident_reports, incidents, admin_sessions, admin_users CASCADE',
  );

  const ADMIN_PASSWORD = 'TestAdminPassword123!@#';
  await bootstrapAdmin({
    databaseUrl: config.TEST_DATABASE_URL,
    password: ADMIN_PASSWORD,
  });

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

  // Helper to seed incident
  async function seedTestIncident(publicId: string, status = 'ACTIVE') {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO incidents (public_id, status, category_code, safe_public_summary, first_reported_at, last_reported_at, activated_at, updated_at)
       VALUES ($1, $2, 'FIRE_OR_SMOKE', 'Consensus coordinate testing advisory.', NOW(), NOW(), NOW(), NOW())
       RETURNING id`,
      [publicId, status],
    );
    return res.rows[0].id;
  }

  // --- UNIT TESTS ---

  await t.test('1. Haversine distance calculation is accurate and handles zero distance', () => {
    // Same point -> 0 meters
    const d0 = haversineDistanceMeters(6.51842, 3.37215, 6.51842, 3.37215);
    assert.equal(d0, 0);

    // Known campus distance: ~150 to 250 meters
    const d1 = haversineDistanceMeters(6.51842, 3.37215, 6.51980, 3.37380);
    assert.ok(d1 > 150 && d1 < 300, `Expected distance ~200-250m, got ${d1}`);
  });

  await t.test('2. Single candidate report returns candidate coordinates with EXACT confidence', () => {
    const single = [
      { reportId: 'r1', latitude: 6.51842, longitude: 3.37215, submittedAt: new Date('2026-11-15T10:00:00Z') },
    ];
    const res = calculateCoordinateMedoid(single);
    assert.ok(res);
    assert.equal(res.latitude, 6.51842);
    assert.equal(res.longitude, 3.37215);
    assert.equal(res.confidence, 'EXACT');
  });

  await t.test('3. Multi-report cluster within 50m selects the medoid coordinate', () => {
    const candidates = [
      { reportId: 'r1', latitude: 6.51840, longitude: 3.37210, submittedAt: new Date('2026-11-15T10:00:00Z') },
      { reportId: 'r2', latitude: 6.51842, longitude: 3.37212, submittedAt: new Date('2026-11-15T10:01:00Z') },
      { reportId: 'r3', latitude: 6.51845, longitude: 3.37215, submittedAt: new Date('2026-11-15T10:02:00Z') },
    ];
    const res = calculateCoordinateMedoid(candidates);
    assert.ok(res);
    // r2 is physically centered among r1 and r3
    assert.equal(res.latitude, 6.51842);
    assert.equal(res.longitude, 3.37212);
    assert.equal(res.confidence, 'CONSENSUS');
  });

  await t.test('4. Scattered reports beyond 50m threshold yields DIVERGENT confidence', () => {
    const candidates = [
      { reportId: 'r1', latitude: 6.51840, longitude: 3.37210, submittedAt: new Date('2026-11-15T10:00:00Z') },
      { reportId: 'r2', latitude: 6.51841, longitude: 3.37211, submittedAt: new Date('2026-11-15T10:01:00Z') },
      // Far outlier > 500m away
      { reportId: 'r_outlier', latitude: 6.52500, longitude: 3.38000, submittedAt: new Date('2026-11-15T10:02:00Z') },
    ];
    const res = calculateCoordinateMedoid(candidates);
    assert.ok(res);
    // Because max distance exceeds 50m threshold, consensus is marked DIVERGENT
    assert.equal(res.confidence, 'DIVERGENT');
    assert.equal(res.latitude, null);
    assert.equal(res.longitude, null);
  });

  await t.test('5. Deterministic tie-breaking selects earliest submitted report', () => {
    const tEarly = new Date('2026-11-15T09:00:00Z');
    const tLate = new Date('2026-11-15T10:00:00Z');
    // Two equidistant points within 50m (~12m apart)
    const candidates = [
      { reportId: 'r_late', latitude: 6.51820, longitude: 3.37215, submittedAt: tLate },
      { reportId: 'r_early', latitude: 6.51810, longitude: 3.37210, submittedAt: tEarly },
    ];
    const res = calculateCoordinateMedoid(candidates);
    assert.ok(res);
    assert.equal(res.latitude, 6.51810);
    assert.equal(res.longitude, 3.37210);
  });

  // --- INTEGRATION TESTS: ADMIN OVERRIDE & FEED PRECEDENCE ---

  await t.test('6. Admin coordinate override requires full [lat, lon] pair and reason', async () => {
    const incId = await seedTestIncident('INC-OVR-VALIDATION');

    // Missing longitude
    const resNoLon = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/incidents/${incId}/override-coordinates`,
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: { latitude: 6.5185, reason: 'Valid reason here' },
    });
    assert.equal(resNoLon.statusCode, 400);

    // Out-of-bounds latitude > 90
    const resOob = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/incidents/${incId}/override-coordinates`,
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: { latitude: 95.0, longitude: 3.372, reason: 'Valid reason here' },
    });
    assert.equal(resOob.statusCode, 400);

    // Reason too short (< 5 chars)
    const resShortReason = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/incidents/${incId}/override-coordinates`,
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: { latitude: 6.5185, longitude: 3.3725, reason: 'bad' },
    });
    assert.equal(resShortReason.statusCode, 400);
  });

  await t.test('7. Admin coordinate override supersedes consensus in active GeoJSON feed', async () => {
    const publicId = 'INC-OVR-FEED-PRECEDENCE';
    const incId = await seedTestIncident(publicId);

    // Link a legitimate report with initial coordinates
    const reportId = crypto.randomUUID();
    const receiptId = 'rcpt_' + crypto.randomBytes(4).toString('hex');
    await pool.query(
      `INSERT INTO incident_reports (id, receipt_id, receipt_token_hash, submitted_at, category_code, description, location_source, incident_lat, incident_lon, is_test)
       VALUES ($1, $2, 'dummy_token_hash', NOW(), 'FIRE_OR_SMOKE', 'Initial report near workshop', 'DEVICE_GPS', 6.51800, 3.37200, false)`,
      [reportId, receiptId],
    );
    await pool.query(
      `INSERT INTO incident_report_links (incident_id, report_id, match_method)
       VALUES ($1, $2, 'CREATION')`,
      [incId, reportId],
    );

    // Check initial feed coordinates match report
    const initialFeed = await app.inject({ method: 'GET', url: '/api/v1/incidents/active/' });
    const initialFeat = (initialFeed.json() as PublicActiveIncidentsGeoJSON).features.find((f) => f.id === publicId);
    assert.ok(initialFeat);
    assert.equal(initialFeat.geometry.coordinates[0], 3.37200);
    assert.equal(initialFeat.geometry.coordinates[1], 6.51800);

    // Apply Admin Override to new coordinates
    const overrideLat = 6.51950;
    const overrideLon = 3.37450;
    const overrideRes = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/incidents/${incId}/override-coordinates`,
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: {
        latitude: overrideLat,
        longitude: overrideLon,
        expected_version: 1,
        reason: 'Adjusted to exact entrance of the Science Workshop following safety team confirmation.',
      },
    });

    assert.equal(overrideRes.statusCode, 200);
    const overrideBody = overrideRes.json();
    assert.equal(overrideBody.incident.admin_override_lat, overrideLat);
    assert.equal(overrideBody.incident.admin_override_lon, overrideLon);

    // Verify audit log has COORDINATE_OVERRIDE
    const auditRes = await pool.query<{ action: string; reason: string }>(
      `SELECT action, reason FROM incident_audit_logs WHERE incident_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [incId],
    );
    assert.equal(auditRes.rows[0].action, 'COORDINATE_OVERRIDE');
    assert.ok(auditRes.rows[0].reason.includes('Science Workshop'));

    // Check that public GeoJSON feed reflects the OVERRIDE coordinates!
    const updatedFeed = await app.inject({ method: 'GET', url: '/api/v1/incidents/active/' });
    const updatedFeat = (updatedFeed.json() as PublicActiveIncidentsGeoJSON).features.find((f) => f.id === publicId);
    assert.ok(updatedFeat);
    assert.equal(updatedFeat.geometry.coordinates[0], overrideLon);
    assert.equal(updatedFeat.geometry.coordinates[1], overrideLat);

    // Check details endpoint also reflects override coordinates
    const detailRes = await app.inject({ method: 'GET', url: `/api/v1/incidents/public/${publicId}` });
    assert.equal(detailRes.statusCode, 200);
    assert.deepEqual(detailRes.json().location.coordinates, [overrideLon, overrideLat]);
  });

  await t.test('8. DEF-01 Regression: Divergent coordinates without admin override produce NO public coordinates', async () => {
    const publicId = 'INC-DIVERGENT-NO-OVERRIDE';
    const incId = await seedTestIncident(publicId);

    // Link two reports > 150m apart (divergent)
    const report1Id = crypto.randomUUID();
    const report2Id = crypto.randomUUID();
    const receipt1 = 'rcpt_' + crypto.randomBytes(4).toString('hex');
    const receipt2 = 'rcpt_' + crypto.randomBytes(4).toString('hex');

    await pool.query(
      `INSERT INTO incident_reports (id, receipt_id, receipt_token_hash, submitted_at, category_code, description, location_source, incident_lat, incident_lon, is_test)
       VALUES 
       ($1, $2, 'dummy1', NOW() - INTERVAL '2 minutes', 'FIRE_OR_SMOKE', 'Report 1 near Library', 'DEVICE_GPS', 6.51840, 3.37210, false),
       ($3, $4, 'dummy2', NOW() - INTERVAL '1 minute', 'FIRE_OR_SMOKE', 'Report 2 near Sports Field', 'DEVICE_GPS', 6.52200, 3.37600, false)`,
      [report1Id, receipt1, report2Id, receipt2],
    );

    await pool.query(
      `INSERT INTO incident_report_links (incident_id, report_id, match_method)
       VALUES ($1, $2, 'CREATION'), ($1, $3, 'SUGGESTED')`,
      [incId, report1Id, report2Id],
    );

    // Explicitly set consensus as DIVERGENT (as recomputeIncidentCoordinateConsensus would calculate)
    await pool.query(
      `UPDATE incidents 
       SET consensus_lat = NULL, consensus_lon = NULL, consensus_confidence = 'DIVERGENT', consensus_evaluated_at = NOW()
       WHERE id = $1`,
      [incId],
    );

    // 1. Verify GeoJSON feed: Incident must NOT be published in GeoJSON (no valid coordinates)
    const feedRes = await app.inject({ method: 'GET', url: '/api/v1/incidents/active/' });
    assert.equal(feedRes.statusCode, 200);
    const feed = feedRes.json() as PublicActiveIncidentsGeoJSON;
    const foundInFeed = feed.features.find((f) => f.id === publicId);
    assert.equal(foundInFeed, undefined, 'Divergent incident must NOT appear on public map feed');

    // 2. Verify public details endpoint: Incident exists as text advisory, but location.coordinates is NULL
    const detailRes = await app.inject({ method: 'GET', url: `/api/v1/incidents/public/${publicId}` });
    assert.equal(detailRes.statusCode, 200);
    const detail = detailRes.json();
    assert.equal(detail.location.coordinates, null, 'Must NOT fall back to earliest report coordinate when divergent');
  });

  await t.test('9. DEF-01 Regression: Divergent coordinates WITH admin override publishes override', async () => {
    const publicId = 'INC-DIVERGENT-WITH-OVERRIDE';
    const incId = await seedTestIncident(publicId);

    // Link divergent reports
    const report1Id = crypto.randomUUID();
    const report2Id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO incident_reports (id, receipt_id, receipt_token_hash, submitted_at, category_code, description, location_source, incident_lat, incident_lon, is_test)
       VALUES 
       ($1, 'rcpt_div1', 'dummy1', NOW() - INTERVAL '2 minutes', 'FIRE_OR_SMOKE', 'Report 1', 'DEVICE_GPS', 6.51840, 3.37210, false),
       ($2, 'rcpt_div2', 'dummy2', NOW() - INTERVAL '1 minute', 'FIRE_OR_SMOKE', 'Report 2', 'DEVICE_GPS', 6.52500, 3.38000, false)`,
      [report1Id, report2Id],
    );
    await pool.query(
      `INSERT INTO incident_report_links (incident_id, report_id, match_method)
       VALUES ($1, $2, 'CREATION'), ($1, $3, 'SUGGESTED')`,
      [incId, report1Id, report2Id],
    );

    // Mark as DIVERGENT
    await pool.query(
      `UPDATE incidents 
       SET consensus_lat = NULL, consensus_lon = NULL, consensus_confidence = 'DIVERGENT', consensus_evaluated_at = NOW()
       WHERE id = $1`,
      [incId],
    );

    // Apply Admin Override to resolve the divergence
    const overrideLat = 6.51900;
    const overrideLon = 3.37300;
    const overrideRes = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/incidents/${incId}/override-coordinates`,
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: {
        latitude: overrideLat,
        longitude: overrideLon,
        expected_version: 1,
        reason: 'Resolved ground location after field team verified smoke at Admin Block.',
      },
    });
    assert.equal(overrideRes.statusCode, 200);

    // Now feed MUST include the override coordinates!
    const feedRes = await app.inject({ method: 'GET', url: '/api/v1/incidents/active/' });
    const feed = feedRes.json() as PublicActiveIncidentsGeoJSON;
    const feat = feed.features.find((f) => f.id === publicId);
    assert.ok(feat, 'Incident with admin override must be published to GeoJSON feed');
    assert.equal(feat.geometry.coordinates[0], overrideLon);
    assert.equal(feat.geometry.coordinates[1], overrideLat);

    // Public detail must also reflect override coordinates
    const detailRes = await app.inject({ method: 'GET', url: `/api/v1/incidents/public/${publicId}` });
    assert.equal(detailRes.statusCode, 200);
    assert.deepEqual(detailRes.json().location.coordinates, [overrideLon, overrideLat]);
  });
});
