import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';
import { bootstrapAdmin } from '../scripts/bootstrap-admin.js';
import { runMigrations } from '../scripts/migrate.js';
import { parseCoordinate } from '../src/services/adminIncidentService.js';

const ADMIN_PASSWORD = 'ValidSuperSecret123!@#Admin';

test('Admin Incident Coordinate Serialization & Session Probe Suite', async (t) => {
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

  // Clean tables before tests
  await pool.query(
    'TRUNCATE TABLE incident_audit_logs, idempotency_receipts, incident_report_links, incident_reports, incidents, admin_sessions, admin_users CASCADE',
  );

  // Provision superadmin
  await bootstrapAdmin({
    databaseUrl: config.TEST_DATABASE_URL,
    password: ADMIN_PASSWORD,
  });

  // Login as superadmin to obtain session cookie
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

  // Helper to submit a public report
  async function submitReport(
    description: string,
    lat: number | null,
    lon: number | null,
    placeName: string = 'Administrative Block',
  ) {
    const key = crypto.randomUUID();
    const payload: Record<string, unknown> = {
      category_code: 'SECURITY_INCIDENT',
      description,
    };

    if (lat !== null && lon !== null) {
      payload.incident_location = {
        latitude: lat,
        longitude: lon,
        source: 'DEVICE_GPS',
        place_name_snapshot: placeName,
        landmark_description: 'Near Entrance A',
      };
    } else {
      payload.incident_location = {
        source: 'MAP_PLACE',
        place_name_snapshot: placeName,
        landmark_description: 'Near Gate 2',
      };
    }

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: {
        'idempotency-key': key,
      },
      payload,
    });

    assert.equal(res.statusCode, 202);
    const body = res.json();
    const receiptId = body.receipt_id;

    const linkRes = await pool.query<{ incident_id: string }>(
      `SELECT l.incident_id 
       FROM incident_reports r 
       JOIN incident_report_links l ON l.report_id = r.id 
       WHERE r.receipt_id = $1`,
      [receiptId],
    );

    return { receiptId, incidentId: linkRes.rows[0].incident_id };
  }

  await t.test('parseCoordinate: Unit boundary specifications', () => {
    // 1. Valid numbers
    assert.equal(parseCoordinate(6.519818), 6.519818);
    assert.equal(parseCoordinate(3.374608), 3.374608);

    // 2. Numeric strings from PostgreSQL NUMERIC type
    assert.equal(parseCoordinate('6.519818'), 6.519818);
    assert.equal(parseCoordinate('3.374608'), 3.374608);
    assert.equal(typeof parseCoordinate('6.519818'), 'number');

    // 3. Null / undefined / empty string handling
    assert.equal(parseCoordinate(null), null);
    assert.equal(parseCoordinate(undefined), null);
    assert.equal(parseCoordinate(''), null);
    assert.equal(parseCoordinate('   '), null);

    // 4. Missing coordinates are NEVER converted into zero
    assert.notEqual(parseCoordinate(null), 0);
    assert.notEqual(parseCoordinate(undefined), 0);
    assert.notEqual(parseCoordinate(''), 0);

    // 5. Genuine 0 is preserved
    assert.equal(parseCoordinate(0), 0);
    assert.equal(parseCoordinate('0'), 0);

    // 6. Invalid and malformed values return null
    assert.equal(parseCoordinate('not-a-number'), null);
    assert.equal(parseCoordinate(NaN), null);
    assert.equal(parseCoordinate(Infinity), null);
    assert.equal(parseCoordinate(-Infinity), null);
    assert.equal(parseCoordinate({}), null);
    assert.equal(parseCoordinate([]), null);
  });

  await t.test(
    'API Serialization: Incident details returns numbers (not strings) for display coordinates',
    async () => {
      const { incidentId } = await submitReport(
        'Test Incident with GPS Coordinates',
        6.519818,
        3.374608,
        'Main Gate',
      );

      const detailRes = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/incidents/${incidentId}`,
        headers: {
          cookie: adminCookie,
        },
      });

      assert.equal(detailRes.statusCode, 200);
      const body = detailRes.json();

      // Verify parent incident coordinate normalization
      assert.equal(typeof body.incident.display_lat, 'number');
      assert.equal(typeof body.incident.display_lon, 'number');
      assert.notEqual(typeof body.incident.display_lat, 'string');
      assert.notEqual(typeof body.incident.display_lon, 'string');
      assert.equal(body.incident.display_lat, 6.519818);
      assert.equal(body.incident.display_lon, 3.374608);

      // Verify linked reports coordinate normalization
      assert.ok(Array.isArray(body.reports));
      assert.equal(body.reports.length, 1);
      assert.equal(typeof body.reports[0].incident_lat, 'number');
      assert.equal(typeof body.reports[0].incident_lon, 'number');
      assert.notEqual(typeof body.reports[0].incident_lat, 'string');
      assert.notEqual(typeof body.reports[0].incident_lon, 'string');
      assert.equal(body.reports[0].incident_lat, 6.519818);
      assert.equal(body.reports[0].incident_lon, 3.374608);
    },
  );

  await t.test(
    'API Serialization: Missing coordinates return null and are never converted to zero',
    async () => {
      const { incidentId } = await submitReport(
        'Test Incident without Coordinates',
        null,
        null,
        'Sports Complex',
      );

      const detailRes = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/incidents/${incidentId}`,
        headers: {
          cookie: adminCookie,
        },
      });

      assert.equal(detailRes.statusCode, 200);
      const body = detailRes.json();

      assert.equal(body.incident.display_lat, null);
      assert.equal(body.incident.display_lon, null);
      assert.notEqual(body.incident.display_lat, 0);
      assert.notEqual(body.incident.display_lon, 0);

      assert.equal(body.reports[0].incident_lat, null);
      assert.equal(body.reports[0].incident_lon, null);
      assert.notEqual(body.reports[0].incident_lat, 0);
      assert.notEqual(body.reports[0].incident_lon, 0);
    },
  );

  await t.test(
    'Admin Auth Probe: GET /api/v1/admin/auth/me returns 401 unauthenticated and 200 authenticated',
    async () => {
      // 1. Unauthenticated request (matching frontend initial boot probe)
      const unauthRes = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/auth/me',
      });

      assert.equal(unauthRes.statusCode, 401);
      const unauthBody = unauthRes.json();
      assert.equal(unauthBody.error?.code, 'UNAUTHORIZED');
      assert.equal(unauthBody.error?.message, 'Administrative authentication is required.');

      // 2. Authenticated request with valid session cookie
      const authRes = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/auth/me',
        headers: {
          cookie: adminCookie,
        },
      });

      assert.equal(authRes.statusCode, 200);
      const authBody = authRes.json();
      assert.ok(authBody.user);
      assert.equal(authBody.user.username, 'ALERTadmin');
      assert.equal(authBody.user.role, 'SUPERADMIN');
    },
  );
});
