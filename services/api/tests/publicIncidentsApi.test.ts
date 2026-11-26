import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';
import { runMigrations } from '../scripts/migrate.js';
import { closePool, initPool } from '../src/db/pool.js';
import type { PublicActiveIncidentsGeoJSON, PublicIncidentDetailResponse } from '@yctalert/contracts';

interface SeedReportInput {
  id?: string;
  isTest?: boolean;
  categoryCode?: string;
  description?: string;
  lat?: number | null;
  lon?: number | null;
  placeName?: string | null;
  landmark?: string | null;
  placeId?: string | null;
  matchMethod?: 'CREATION' | 'ADMIN' | 'SUGGESTED';
  submittedAt?: Date;
  linkedAt?: Date;
}

interface SeedIncidentInput {
  publicId?: string;
  status?: 'PENDING' | 'UNDER_REVIEW' | 'ACTIVE' | 'RESOLVED' | 'REJECTED';
  categoryCode?: string;
  safeSummary?: string | null;
  displayLat?: number | null;
  displayLon?: number | null;
  firstReportedAt?: Date;
  lastReportedAt?: Date;
  activatedAt?: Date | null;
  updatedAt?: Date;
  purgedAt?: Date | null;
  reports?: SeedReportInput[];
}

test('G3.3 Public Incident GeoJSON Feed & Details API Suite', async (t) => {
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

  // Clean database before test suite runs
  await pool.query(
    'TRUNCATE TABLE incident_audit_logs, idempotency_receipts, incident_report_links, incident_reports, incidents CASCADE',
  );

  async function seedIncident(input: SeedIncidentInput): Promise<{ incidentId: string; publicId: string }> {
    const publicId = input.publicId || `INC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const status = input.status || 'ACTIVE';
    const categoryCode = input.categoryCode || 'FIRE_OR_SMOKE';
    const safeSummary = input.safeSummary !== undefined ? input.safeSummary : 'Active incident campus advisory notice.';
    const displayLat = input.displayLat ?? null;
    const displayLon = input.displayLon ?? null;
    const now = new Date();
    const firstReportedAt = input.firstReportedAt || now;
    const lastReportedAt = input.lastReportedAt || now;
    const activatedAt = input.activatedAt !== undefined ? input.activatedAt : (status === 'ACTIVE' ? now : null);
    const updatedAt = input.updatedAt || now;
    const purgedAt = input.purgedAt ?? null;

    const incRes = await pool.query<{ id: string }>(
      `INSERT INTO incidents (
        public_id, status, category_code, safe_public_summary,
        display_lat, display_lon, first_reported_at, last_reported_at,
        activated_at, updated_at, purged_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id`,
      [
        publicId,
        status,
        categoryCode,
        safeSummary,
        displayLat,
        displayLon,
        firstReportedAt,
        lastReportedAt,
        activatedAt,
        updatedAt,
        purgedAt,
      ],
    );
    const incidentId = incRes.rows[0].id;

    if (input.reports && input.reports.length > 0) {
      for (const r of input.reports) {
        const reportId = r.id || crypto.randomUUID();
        const receiptId = `rcpt_${crypto.randomBytes(8).toString('hex')}`;
        const isTest = r.isTest !== undefined ? r.isTest : false;
        const subDate = r.submittedAt || now;
        const linkDate = r.linkedAt || now;
        const matchMethod = r.matchMethod || 'CREATION';

        await pool.query(
          `INSERT INTO incident_reports (
            id, submitted_at, category_code, description, location_source,
            incident_lat, incident_lon, place_name_snapshot, landmark_description,
            yct_map_place_id, receipt_id, receipt_token_hash, is_test
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'dummy_token_hash', $12)`,
          [
            reportId,
            subDate,
            categoryCode,
            r.description || 'Test report narrative description.',
            'DEVICE_GPS',
            r.lat !== undefined ? r.lat : 6.518420,
            r.lon !== undefined ? r.lon : 3.375210,
            r.placeName !== undefined ? r.placeName : 'Engineering Complex',
            r.landmark !== undefined ? r.landmark : 'North Gate entrance',
            r.placeId ?? null,
            receiptId,
            isTest,
          ],
        );

        await pool.query(
          `INSERT INTO incident_report_links (
            incident_id, report_id, match_method, linked_at
          ) VALUES ($1, $2, $3, $4)`,
          [incidentId, reportId, matchMethod, linkDate],
        );
      }
    }

    return { incidentId, publicId };
  }

  // Clear tables between each sub-test to ensure absolute isolation
  async function cleanTables() {
    await pool.query(
      'TRUNCATE TABLE incident_audit_logs, idempotency_receipts, incident_report_links, incident_reports, incidents CASCADE',
    );
  }

  await t.test('1. Eligible active incident with valid coordinates appears in feed and details', async () => {
    await cleanTables();
    const activatedAt = new Date('2026-11-15T10:00:00.000Z');
    const updatedAt = new Date('2026-11-15T10:05:00.000Z');
    const submittedAt = new Date('2026-11-15T09:55:00.000Z');

    const { publicId } = await seedIncident({
      publicId: 'INC-20261115-A101',
      status: 'ACTIVE',
      categoryCode: 'FIRE_OR_SMOKE',
      safeSummary: 'Active fire reported near the Engineering Workshop. Fire marshals on scene.',
      activatedAt,
      updatedAt,
      reports: [
        {
          isTest: false,
          lat: 6.51842,
          lon: 3.37521,
          placeName: 'Engineering Workshop Complex',
          landmark: 'Beside North Gate',
          placeId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
          submittedAt,
        },
      ],
    });

    // 1. Check GeoJSON Feed
    const feedRes = await app.inject({
      method: 'GET',
      url: '/api/v1/incidents/active/',
      remoteAddress: '192.168.1.1',
    });
    assert.equal(feedRes.statusCode, 200);
    assert.equal(feedRes.headers['content-type'], 'application/geo+json; charset=utf-8');
    assert.equal(
      feedRes.headers['cache-control'],
      'public, max-age=15, stale-while-revalidate=60, no-transform',
    );

    const feedBody = JSON.parse(feedRes.payload) as PublicActiveIncidentsGeoJSON;
    assert.equal(feedBody.type, 'FeatureCollection');
    assert.equal(feedBody.features.length, 1);

    const feature = feedBody.features[0];
    assert.equal(feature.id, publicId);
    assert.equal(feature.type, 'Feature');
    assert.equal(feature.geometry.type, 'Point');
    // RFC 7946 coordinate order: [longitude, latitude]
    assert.equal(feature.geometry.coordinates[0], 3.37521);
    assert.equal(feature.geometry.coordinates[1], 6.51842);
    assert.equal(feature.properties.public_id, publicId);
    assert.equal(feature.properties.category, 'FIRE_OR_SMOKE');
    assert.equal(feature.properties.status, 'ACTIVE');
    assert.equal(feature.properties.verification_status, 'VERIFIED');
    assert.equal(feature.properties.summary, 'Active fire reported near the Engineering Workshop. Fire marshals on scene.');
    assert.equal(feature.properties.place_name, 'Engineering Workshop Complex');
    assert.equal(feature.properties.published_at, activatedAt.toISOString());
    assert.equal(feature.properties.updated_at, updatedAt.toISOString());
    assert.equal(feature.properties.public_photo_url, null);

    // 2. Check Details Endpoint
    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/incidents/public/${publicId}`,
      remoteAddress: '192.168.1.1',
    });
    assert.equal(detailRes.statusCode, 200);
    assert.equal(detailRes.headers['content-type'], 'application/json; charset=utf-8');
    assert.equal(
      detailRes.headers['cache-control'],
      'public, max-age=15, stale-while-revalidate=60, no-transform',
    );

    const detailBody = JSON.parse(detailRes.payload) as PublicIncidentDetailResponse;
    assert.equal(detailBody.public_id, publicId);
    assert.equal(detailBody.category, 'FIRE_OR_SMOKE');
    assert.equal(detailBody.status, 'ACTIVE');
    assert.equal(detailBody.verification_status, 'VERIFIED');
    assert.equal(detailBody.summary, 'Active fire reported near the Engineering Workshop. Fire marshals on scene.');
    assert.deepEqual(detailBody.location.coordinates, [3.37521, 6.51842]);
    assert.equal(detailBody.location.place_name, 'Engineering Workshop Complex');
    assert.equal(detailBody.location.landmark_description, 'Beside North Gate');
    assert.equal(detailBody.location.yct_map_place_id, '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d');
    assert.equal(detailBody.timestamps.reported_at, submittedAt.toISOString());
    assert.equal(detailBody.timestamps.activated_at, activatedAt.toISOString());
    assert.equal(detailBody.timestamps.updated_at, updatedAt.toISOString());
    assert.deepEqual(detailBody.photos, []);
  });

  await t.test('2. Test-only incident is excluded from feed and details returns 404', async () => {
    await cleanTables();
    const { publicId } = await seedIncident({
      publicId: 'INC-20261115-TESTONLY',
      status: 'ACTIVE',
      safeSummary: 'Test incident summary that should never appear publicly.',
      reports: [
        {
          isTest: true,
          lat: 6.51842,
          lon: 3.37521,
          placeName: 'Internal Testing Building',
        },
      ],
    });

    const feedRes = await app.inject({
      method: 'GET',
      url: '/api/v1/incidents/active/',
      remoteAddress: '192.168.1.2',
    });
    const feedBody = JSON.parse(feedRes.payload) as PublicActiveIncidentsGeoJSON;
    assert.equal(feedBody.features.length, 0, 'Test-only incident must be excluded from feed');

    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/incidents/public/${publicId}`,
      remoteAddress: '192.168.1.2',
    });
    assert.equal(detailRes.statusCode, 404, 'Test-only incident must return 404');
    const errorBody = JSON.parse(detailRes.payload);
    assert.equal(errorBody.error.code, 'INCIDENT_NOT_FOUND');
    assert.equal(errorBody.error.message, 'Incident not found or is not publicly accessible.');
  });

  await t.test('3. Mixed test/non-test incident uses legitimate report coordinates only', async () => {
    await cleanTables();
    const { publicId } = await seedIncident({
      publicId: 'INC-20261115-MIXED',
      status: 'ACTIVE',
      safeSummary: 'Legitimate chemical hazard notice.',
      reports: [
        {
          isTest: true,
          lat: 6.111111,
          lon: 3.111111,
          placeName: 'Test Lab',
          matchMethod: 'CREATION',
          submittedAt: new Date('2026-11-15T08:00:00Z'),
        },
        {
          isTest: false,
          lat: 6.519999,
          lon: 3.378888,
          placeName: 'Actual Chemical Lab',
          matchMethod: 'ADMIN',
          submittedAt: new Date('2026-11-15T09:00:00Z'),
        },
      ],
    });

    const feedRes = await app.inject({
      method: 'GET',
      url: '/api/v1/incidents/active/',
      remoteAddress: '192.168.1.3',
    });
    const feedBody = JSON.parse(feedRes.payload) as PublicActiveIncidentsGeoJSON;
    assert.equal(feedBody.features.length, 1);
    assert.equal(feedBody.features[0].geometry.coordinates[0], 3.378888, 'Longitude must come from legitimate report');
    assert.equal(feedBody.features[0].geometry.coordinates[1], 6.519999, 'Latitude must come from legitimate report');

    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/incidents/public/${publicId}`,
      remoteAddress: '192.168.1.3',
    });
    const detailBody = JSON.parse(detailRes.payload) as PublicIncidentDetailResponse;
    assert.deepEqual(detailBody.location.coordinates, [3.378888, 6.519999]);
    assert.equal(detailBody.location.place_name, 'Actual Chemical Lab');
  });

  await t.test('4. Partial activation coordinate update cannot introduce display-field coordinates into public output', async () => {
    await cleanTables();
    // Simulate an incident with corrupt/partial coordinates on incidents table
    const { publicId } = await seedIncident({
      publicId: 'INC-20261115-SPLICED',
      status: 'ACTIVE',
      safeSummary: 'Security hazard advisory.',
      displayLat: 6.999999, // Unreliable display coordinates
      displayLon: 3.111111,
      reports: [
        {
          isTest: false,
          lat: 6.518123,
          lon: 3.372456,
          placeName: 'Science Lecture Theater',
          matchMethod: 'CREATION',
        },
      ],
    });

    const feedRes = await app.inject({
      method: 'GET',
      url: '/api/v1/incidents/active/',
      remoteAddress: '192.168.1.4',
    });
    const feedBody = JSON.parse(feedRes.payload) as PublicActiveIncidentsGeoJSON;
    assert.equal(feedBody.features.length, 1);
    // Verified invariant: Public coordinates MUST NOT use incidents.display_lat/lon!
    assert.equal(feedBody.features[0].geometry.coordinates[0], 3.372456);
    assert.equal(feedBody.features[0].geometry.coordinates[1], 6.518123);

    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/incidents/public/${publicId}`,
      remoteAddress: '192.168.1.4',
    });
    const detailBody = JSON.parse(detailRes.payload) as PublicIncidentDetailResponse;
    assert.deepEqual(detailBody.location.coordinates, [3.372456, 6.518123]);
  });

  await t.test('5. Text-only descriptive report plus another legitimate GPS report produces independent selections', async () => {
    await cleanTables();
    const { publicId } = await seedIncident({
      publicId: 'INC-20261115-INDEP',
      status: 'ACTIVE',
      safeSummary: 'Water main burst across central pathway.',
      reports: [
        {
          // Primary descriptive report: CREATION, text-only (no coordinates)
          isTest: false,
          lat: null,
          lon: null,
          placeName: 'Central Library Walkway',
          landmark: 'Opposite Student Affairs Building',
          placeId: '11111111-1111-1111-1111-111111111111',
          matchMethod: 'CREATION',
          submittedAt: new Date('2026-11-15T09:00:00Z'),
        },
        {
          // Secondary report with GPS coordinates
          isTest: false,
          lat: 6.518777,
          lon: 3.375888,
          placeName: null,
          landmark: null,
          placeId: null,
          matchMethod: 'ADMIN',
          submittedAt: new Date('2026-11-15T09:10:00Z'),
        },
      ],
    });

    const feedRes = await app.inject({
      method: 'GET',
      url: '/api/v1/incidents/active/',
      remoteAddress: '192.168.1.5',
    });
    const feedBody = JSON.parse(feedRes.payload) as PublicActiveIncidentsGeoJSON;
    assert.equal(feedBody.features.length, 1);
    // Coordinates come from coordinate report, place_name from descriptive report
    assert.equal(feedBody.features[0].geometry.coordinates[0], 3.375888);
    assert.equal(feedBody.features[0].geometry.coordinates[1], 6.518777);
    assert.equal(feedBody.features[0].properties.place_name, 'Central Library Walkway');

    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/incidents/public/${publicId}`,
      remoteAddress: '192.168.1.5',
    });
    const detailBody = JSON.parse(detailRes.payload) as PublicIncidentDetailResponse;
    assert.deepEqual(detailBody.location.coordinates, [3.375888, 6.518777]);
    assert.equal(detailBody.location.place_name, 'Central Library Walkway');
    assert.equal(detailBody.location.landmark_description, 'Opposite Student Affairs Building');
    assert.equal(detailBody.location.yct_map_place_id, '11111111-1111-1111-1111-111111111111');
  });

  await t.test('6. Eligible text-only incident appears in details with null coordinates but not the GeoJSON feed', async () => {
    await cleanTables();
    const { publicId } = await seedIncident({
      publicId: 'INC-20261115-TEXTONLY',
      status: 'ACTIVE',
      safeSummary: 'Elevator power failure in Administrative Block.',
      reports: [
        {
          isTest: false,
          lat: null,
          lon: null,
          placeName: 'Administrative Block A',
          landmark: 'East Wing Elevator Hall',
          matchMethod: 'CREATION',
        },
      ],
    });

    const feedRes = await app.inject({
      method: 'GET',
      url: '/api/v1/incidents/active/',
      remoteAddress: '192.168.1.6',
    });
    const feedBody = JSON.parse(feedRes.payload) as PublicActiveIncidentsGeoJSON;
    assert.equal(feedBody.features.length, 0, 'Text-only incident must be omitted from Point GeoJSON feed');

    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/incidents/public/${publicId}`,
      remoteAddress: '192.168.1.6',
    });
    assert.equal(detailRes.statusCode, 200);
    const detailBody = JSON.parse(detailRes.payload) as PublicIncidentDetailResponse;
    assert.equal(detailBody.public_id, publicId);
    assert.equal(detailBody.location.coordinates, null);
    assert.equal(detailBody.location.place_name, 'Administrative Block A');
    assert.equal(detailBody.location.landmark_description, 'East Wing Elevator Hall');
  });

  await t.test('7. Invalid or out-of-bounds report coordinates are ignored', async () => {
    await cleanTables();
    const { publicId } = await seedIncident({
      publicId: 'INC-20261115-OUTOFBOUNDS',
      status: 'ACTIVE',
      safeSummary: 'Hazard reported with invalid GPS coordinates.',
      reports: [
        {
          isTest: false,
          lat: 95.0, // Invalid: exceeds 90 degrees latitude
          lon: 3.37521,
          placeName: 'Boundary Testing Place',
          matchMethod: 'CREATION',
        },
      ],
    });

    const feedRes = await app.inject({
      method: 'GET',
      url: '/api/v1/incidents/active/',
      remoteAddress: '192.168.1.7',
    });
    const feedBody = JSON.parse(feedRes.payload) as PublicActiveIncidentsGeoJSON;
    assert.equal(feedBody.features.length, 0, 'Out-of-bounds coordinates must not be broadcast in Point feed');

    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/incidents/public/${publicId}`,
      remoteAddress: '192.168.1.7',
    });
    assert.equal(detailRes.statusCode, 200);
    const detailBody = JSON.parse(detailRes.payload) as PublicIncidentDetailResponse;
    assert.equal(detailBody.location.coordinates, null, 'Coordinates must be null when bounds are violated');
    assert.equal(detailBody.location.place_name, 'Boundary Testing Place');
  });

  await t.test('8. Deterministic descriptive and coordinate report selection under identical timestamps', async () => {
    await cleanTables();
    const fixedTime = new Date('2026-11-15T10:00:00Z');
    const idA = '00000000-0000-0000-0000-000000000001';
    const idB = '00000000-0000-0000-0000-000000000002';

    const { publicId } = await seedIncident({
      publicId: 'INC-20261115-TIEBREAKER',
      status: 'ACTIVE',
      safeSummary: 'Fire alarm testing across twin complex.',
      reports: [
        {
          id: idB, // ID B (higher UUID)
          isTest: false,
          lat: 6.5182,
          lon: 3.3722,
          placeName: 'Building B',
          matchMethod: 'CREATION',
          submittedAt: fixedTime,
          linkedAt: fixedTime,
        },
        {
          id: idA, // ID A (lower UUID)
          isTest: false,
          lat: 6.5181,
          lon: 3.3721,
          placeName: 'Building A',
          matchMethod: 'CREATION',
          submittedAt: fixedTime,
          linkedAt: fixedTime,
        },
      ],
    });

    // Query 5 times in succession to verify determinism
    for (let i = 0; i < 5; i++) {
      const detailRes = await app.inject({
        method: 'GET',
        url: `/api/v1/incidents/public/${publicId}`,
        remoteAddress: '192.168.1.8',
      });
      const detailBody = JSON.parse(detailRes.payload) as PublicIncidentDetailResponse;
      assert.equal(detailBody.location.place_name, 'Building A', 'Tie-breaker r.id ASC must deterministically select lower UUID');
      assert.deepEqual(detailBody.location.coordinates, [3.3721, 6.5181]);
    }
  });

  await t.test('9. Lifecycle states: PENDING and UNDER_REVIEW publish as UNVERIFIED; RESOLVED and REJECTED are excluded', async () => {
    await cleanTables();

    // 1. RESOLVED and REJECTED must be excluded from feed and return 404
    const excludedStatuses: Array<'RESOLVED' | 'REJECTED'> = ['RESOLVED', 'REJECTED'];
    for (const st of excludedStatuses) {
      const { publicId } = await seedIncident({
        publicId: `INC-STATUS-${st}`,
        status: st,
        safeSummary: `Advisory for incident in state ${st}`,
        reports: [{ isTest: false, lat: 6.518, lon: 3.372 }],
      });

      const feedRes = await app.inject({
        method: 'GET',
        url: '/api/v1/incidents/active/',
        remoteAddress: '192.168.1.9',
      });
      const feedBody = JSON.parse(feedRes.payload) as PublicActiveIncidentsGeoJSON;
      assert.ok(!feedBody.features.some((f) => f.id === publicId), `Incident with status ${st} must not appear in feed`);

      const detailRes = await app.inject({
        method: 'GET',
        url: `/api/v1/incidents/public/${publicId}`,
        remoteAddress: '192.168.1.9',
      });
      assert.equal(detailRes.statusCode, 404, `Incident with status ${st} must return 404`);
    }

    // 2. PENDING and UNDER_REVIEW must be published immediately as UNVERIFIED
    const unverifiedStatuses: Array<'PENDING' | 'UNDER_REVIEW'> = ['PENDING', 'UNDER_REVIEW'];
    for (const st of unverifiedStatuses) {
      const { publicId } = await seedIncident({
        publicId: `INC-STATUS-${st}`,
        status: st,
        safeSummary: `Immediate unverified report for state ${st}`,
        reports: [{ isTest: false, lat: 6.5185, lon: 3.3725 }],
      });

      const feedRes = await app.inject({
        method: 'GET',
        url: '/api/v1/incidents/active/',
        remoteAddress: '192.168.1.9',
      });
      const feedBody = JSON.parse(feedRes.payload) as PublicActiveIncidentsGeoJSON;
      const f = feedBody.features.find((item) => item.id === publicId);
      assert.ok(f, `Incident with status ${st} must appear in feed immediately`);
      assert.equal(f.properties.verification_status, 'UNVERIFIED');

      const detailRes = await app.inject({
        method: 'GET',
        url: `/api/v1/incidents/public/${publicId}`,
        remoteAddress: '192.168.1.9',
      });
      assert.equal(detailRes.statusCode, 200, `Incident with status ${st} must be accessible via details`);
      const detailBody = JSON.parse(detailRes.payload) as PublicIncidentDetailResponse;
      assert.equal(detailBody.verification_status, 'UNVERIFIED');
      assert.equal(detailBody.timestamps.activated_at, null);
    }
  });

  await t.test('10. Purged incidents are excluded from feed and details', async () => {
    await cleanTables();
    const { publicId } = await seedIncident({
      publicId: 'INC-20261115-PURGED',
      status: 'ACTIVE',
      safeSummary: 'Archival summary',
      purgedAt: new Date(),
      reports: [{ isTest: false, lat: 6.518, lon: 3.372 }],
    });

    const feedRes = await app.inject({
      method: 'GET',
      url: '/api/v1/incidents/active/',
      remoteAddress: '192.168.1.10',
    });
    const feedBody = JSON.parse(feedRes.payload) as PublicActiveIncidentsGeoJSON;
    assert.ok(!feedBody.features.some((f) => f.id === publicId), 'Purged incident must not appear in feed');

    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/incidents/public/${publicId}`,
      remoteAddress: '192.168.1.10',
    });
    assert.equal(detailRes.statusCode, 404, 'Purged incident must return 404');
  });

  await t.test('11. Null, empty, and whitespace-only public summaries are excluded', async () => {
    await cleanTables();
    const invalidSummaries = [null, '', '   ', '\t\n'];

    for (let i = 0; i < invalidSummaries.length; i++) {
      const summary = invalidSummaries[i];
      const { publicId } = await seedIncident({
        publicId: `INC-SUMMARY-${i}`,
        status: 'ACTIVE',
        safeSummary: summary,
        reports: [{ isTest: false, lat: 6.518, lon: 3.372 }],
      });

      const feedRes = await app.inject({
        method: 'GET',
        url: '/api/v1/incidents/active/',
        remoteAddress: '192.168.1.11',
      });
      const feedBody = JSON.parse(feedRes.payload) as PublicActiveIncidentsGeoJSON;
      assert.ok(!feedBody.features.some((f) => f.id === publicId));

      const detailRes = await app.inject({
        method: 'GET',
        url: `/api/v1/incidents/public/${publicId}`,
        remoteAddress: '192.168.1.11',
      });
      assert.equal(detailRes.statusCode, 404);
    }
  });

  await t.test('12. Earliest legitimate submission determines reported_at, even when a test report was submitted earlier', async () => {
    await cleanTables();
    const testReportTime = new Date('2026-11-15T07:00:00Z');
    const legitReport1Time = new Date('2026-11-15T08:30:00Z');
    const legitReport2Time = new Date('2026-11-15T09:15:00Z');

    const { publicId } = await seedIncident({
      publicId: 'INC-20261115-TIMING',
      status: 'ACTIVE',
      firstReportedAt: testReportTime, // Note: incident table holds test time
      reports: [
        {
          isTest: true,
          submittedAt: testReportTime,
          matchMethod: 'CREATION',
        },
        {
          isTest: false,
          submittedAt: legitReport1Time, // Earliest legitimate
          matchMethod: 'ADMIN',
        },
        {
          isTest: false,
          submittedAt: legitReport2Time,
          matchMethod: 'SUGGESTED',
        },
      ],
    });

    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/incidents/public/${publicId}`,
      remoteAddress: '192.168.1.12',
    });
    const detailBody = JSON.parse(detailRes.payload) as PublicIncidentDetailResponse;
    assert.equal(
      detailBody.timestamps.reported_at,
      legitReport1Time.toISOString(),
      'reported_at must match earliest legitimate non-test submission',
    );
  });

  await t.test('13. published_at maps to activated_at', async () => {
    await cleanTables();
    const activatedAt = new Date('2026-11-15T11:22:33Z');
    const { publicId } = await seedIncident({
      publicId: 'INC-20261115-PUB',
      status: 'ACTIVE',
      activatedAt,
      reports: [{ isTest: false, lat: 6.518, lon: 3.372 }],
    });

    const feedRes = await app.inject({
      method: 'GET',
      url: '/api/v1/incidents/active/',
      remoteAddress: '192.168.1.13',
    });
    const feedBody = JSON.parse(feedRes.payload) as PublicActiveIncidentsGeoJSON;
    const f = feedBody.features.find((item) => item.id === publicId);
    assert.ok(f);
    assert.equal(f.properties.published_at, activatedAt.toISOString());

    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/incidents/public/${publicId}`,
      remoteAddress: '192.168.1.13',
    });
    const detailBody = JSON.parse(detailRes.payload) as PublicIncidentDetailResponse;
    assert.equal(detailBody.timestamps.activated_at, activatedAt.toISOString());
  });

  await t.test('14. updated_at is mapped correctly across feed and details', async () => {
    await cleanTables();
    const updatedAt = new Date('2026-11-15T12:34:56Z');
    const { publicId } = await seedIncident({
      publicId: 'INC-20261115-UPD',
      status: 'ACTIVE',
      updatedAt,
      reports: [{ isTest: false, lat: 6.518, lon: 3.372 }],
    });

    const feedRes = await app.inject({
      method: 'GET',
      url: '/api/v1/incidents/active/',
      remoteAddress: '192.168.1.14',
    });
    const feedBody = JSON.parse(feedRes.payload) as PublicActiveIncidentsGeoJSON;
    const f = feedBody.features.find((item) => item.id === publicId);
    assert.ok(f);
    assert.equal(f.properties.updated_at, updatedAt.toISOString());

    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/incidents/public/${publicId}`,
      remoteAddress: '192.168.1.14',
    });
    const detailBody = JSON.parse(detailRes.payload) as PublicIncidentDetailResponse;
    assert.equal(detailBody.timestamps.updated_at, updatedAt.toISOString());
  });

  await t.test('15. GeoJSON coordinate order is strictly longitude then latitude', async () => {
    await cleanTables();
    const testLon = 3.372999;
    const testLat = 6.518888;
    await seedIncident({
      publicId: 'INC-20261115-COORDS',
      status: 'ACTIVE',
      reports: [{ isTest: false, lat: testLat, lon: testLon }],
    });

    const feedRes = await app.inject({
      method: 'GET',
      url: '/api/v1/incidents/active/',
      remoteAddress: '192.168.1.15',
    });
    const feedBody = JSON.parse(feedRes.payload) as PublicActiveIncidentsGeoJSON;
    assert.equal(feedBody.features.length, 1);
    assert.equal(feedBody.features[0].geometry.coordinates[0], testLon, 'Index 0 must be longitude');
    assert.equal(feedBody.features[0].geometry.coordinates[1], testLat, 'Index 1 must be latitude');
  });

  await t.test('16. Feed and details cache headers are correct', async () => {
    await cleanTables();
    const { publicId } = await seedIncident({
      publicId: 'INC-20261115-CACHE',
      status: 'ACTIVE',
      reports: [{ isTest: false, lat: 6.518, lon: 3.372 }],
    });

    const feedRes = await app.inject({
      method: 'GET',
      url: '/api/v1/incidents/active/',
      remoteAddress: '192.168.1.16',
    });
    assert.equal(
      feedRes.headers['cache-control'],
      'public, max-age=15, stale-while-revalidate=60, no-transform',
    );

    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/incidents/public/${publicId}`,
      remoteAddress: '192.168.1.16',
    });
    assert.equal(
      detailRes.headers['cache-control'],
      'public, max-age=15, stale-while-revalidate=60, no-transform',
    );
  });

  await t.test('17. Rate limiting behaves as specified (300 requests per 60 seconds)', async () => {
    await cleanTables();
    await seedIncident({
      publicId: 'INC-20261115-RATELIMIT',
      status: 'ACTIVE',
      reports: [{ isTest: false, lat: 6.518, lon: 3.372 }],
    });

    const testIp = '10.254.1.99'; // Unique IP dedicated to rate-limit testing

    // Execute 300 successful requests
    for (let i = 0; i < 300; i++) {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/incidents/active/',
        remoteAddress: testIp,
      });
      assert.equal(res.statusCode, 200);
    }

    // 301st request from same IP must be rate-limited (HTTP 429)
    const rateLimitedRes = await app.inject({
      method: 'GET',
      url: '/api/v1/incidents/active/',
      remoteAddress: testIp,
    });
    assert.equal(rateLimitedRes.statusCode, 429);
    const body = JSON.parse(rateLimitedRes.payload);
    assert.equal(body.code, 'RATE_LIMIT_EXCEEDED');

    // A request from a different IP must still succeed
    const differentIpRes = await app.inject({
      method: 'GET',
      url: '/api/v1/incidents/active/',
      remoteAddress: '10.254.1.100',
    });
    assert.equal(differentIpRes.statusCode, 200);
  });

  await t.test('18. Empty feed returns a valid FeatureCollection', async () => {
    await cleanTables();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/incidents/active/',
      remoteAddress: '192.168.1.18',
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'application/geo+json; charset=utf-8');

    const body = JSON.parse(res.payload) as PublicActiveIncidentsGeoJSON;
    assert.equal(body.type, 'FeatureCollection');
    assert.deepEqual(body.features, []);
    assert.ok(body.generated_at);
  });

  await t.test('19. Ineligible details requests return the same generic 404 response', async () => {
    await cleanTables();
    const nonexistentRes = await app.inject({
      method: 'GET',
      url: '/api/v1/incidents/public/INC-DOESNOTEXIST',
      remoteAddress: '192.168.1.19',
    });
    assert.equal(nonexistentRes.statusCode, 404);
    assert.equal(nonexistentRes.headers['cache-control'], 'no-cache, no-store, must-revalidate');

    const body = JSON.parse(nonexistentRes.payload);
    assert.deepEqual(body, {
      error: {
        code: 'INCIDENT_NOT_FOUND',
        message: 'Incident not found or is not publicly accessible.',
      },
    });
  });

  await t.test(
    '20. Case B — Legitimate report with no descriptive fields and no coordinates remains accessible via details with null location fields and is excluded from feed',
    async () => {
      await cleanTables();
      const submittedAt = new Date('2026-11-15T09:00:00.000Z');
      const activatedAt = new Date('2026-11-15T09:30:00.000Z');
      const updatedAt = new Date('2026-11-15T09:35:00.000Z');
      const safeSummary = 'Campus-wide advisory with no coordinates or descriptive place.';

      const { publicId } = await seedIncident({
        publicId: 'INC-20261115-CASE-B',
        status: 'ACTIVE',
        categoryCode: 'SECURITY_INCIDENT',
        safeSummary,
        activatedAt,
        updatedAt,
        reports: [
          {
            isTest: false,
            lat: null, // Explicit null overrides helper default
            lon: null, // Explicit null overrides helper default
            placeName: null, // Explicit null overrides helper default
            landmark: null, // Explicit null overrides helper default
            placeId: null, // Explicit null overrides helper default
            matchMethod: 'CREATION',
            submittedAt,
          },
        ],
      });

      // 1. Details endpoint must return HTTP 200 with all location fields null
      const detailRes = await app.inject({
        method: 'GET',
        url: `/api/v1/incidents/public/${publicId}`,
        remoteAddress: '192.168.1.20',
      });
      assert.equal(detailRes.statusCode, 200);
      assert.equal(detailRes.headers['content-type'], 'application/json; charset=utf-8');
      assert.equal(
        detailRes.headers['cache-control'],
        'public, max-age=15, stale-while-revalidate=60, no-transform',
      );

      const detailBody = JSON.parse(detailRes.payload) as PublicIncidentDetailResponse;
      assert.equal(detailBody.public_id, publicId);
      assert.equal(detailBody.category, 'SECURITY_INCIDENT');
      assert.equal(detailBody.status, 'ACTIVE');
      assert.equal(detailBody.summary, safeSummary);
      assert.equal(detailBody.location.coordinates, null);
      assert.equal(detailBody.location.place_name, null);
      assert.equal(detailBody.location.landmark_description, null);
      assert.equal(detailBody.location.yct_map_place_id, null);
      assert.equal(detailBody.timestamps.reported_at, submittedAt.toISOString());
      assert.equal(detailBody.timestamps.activated_at, activatedAt.toISOString());
      assert.equal(detailBody.timestamps.updated_at, updatedAt.toISOString());
      assert.deepEqual(detailBody.photos, []);

      // 2. Active GeoJSON feed must return HTTP 200, valid FeatureCollection, and exclude this incident
      const feedRes = await app.inject({
        method: 'GET',
        url: '/api/v1/incidents/active/',
        remoteAddress: '192.168.1.20',
      });
      assert.equal(feedRes.statusCode, 200);
      assert.equal(feedRes.headers['content-type'], 'application/geo+json; charset=utf-8');
      const feedBody = JSON.parse(feedRes.payload) as PublicActiveIncidentsGeoJSON;
      assert.equal(feedBody.type, 'FeatureCollection');
      assert.ok(
        !feedBody.features.some((f) => f.id === publicId),
        'Incident lacking coordinates must be omitted from Point GeoJSON feed',
      );
    },
  );

  await t.test(
    '21. Case C — Legitimate report with valid coordinates but no descriptive fields is included in feed with null place_name and returns coordinates with null descriptive fields in details',
    async () => {
      await cleanTables();
      const testLat = 6.519123;
      const testLon = 3.376456;
      const submittedAt = new Date('2026-11-15T10:15:00.000Z');
      const activatedAt = new Date('2026-11-15T10:30:00.000Z');
      const updatedAt = new Date('2026-11-15T10:35:00.000Z');
      const safeSummary = 'Advisory with GPS coordinates but no campus place or landmark.';

      const { publicId } = await seedIncident({
        publicId: 'INC-20261115-CASE-C',
        status: 'ACTIVE',
        categoryCode: 'PHYSICAL_HAZARD',
        safeSummary,
        activatedAt,
        updatedAt,
        reports: [
          {
            isTest: false,
            lat: testLat,
            lon: testLon,
            placeName: null, // Explicit null overrides helper default
            landmark: null, // Explicit null overrides helper default
            placeId: null, // Explicit null overrides helper default
            matchMethod: 'CREATION',
            submittedAt,
          },
        ],
      });

      // 1. Active GeoJSON feed must include incident with [lon, lat] and place_name: null
      const feedRes = await app.inject({
        method: 'GET',
        url: '/api/v1/incidents/active/',
        remoteAddress: '192.168.1.21',
      });
      assert.equal(feedRes.statusCode, 200);
      assert.equal(feedRes.headers['content-type'], 'application/geo+json; charset=utf-8');
      const feedBody = JSON.parse(feedRes.payload) as PublicActiveIncidentsGeoJSON;
      assert.equal(feedBody.type, 'FeatureCollection');

      const feature = feedBody.features.find((f) => f.id === publicId);
      assert.ok(feature, 'Incident with valid coordinates must be included in GeoJSON feed');
      assert.equal(feature.id, publicId);
      assert.equal(feature.geometry.type, 'Point');
      assert.deepEqual(
        feature.geometry.coordinates,
        [testLon, testLat],
        'Coordinates order must be [longitude, latitude]',
      );
      assert.equal(
        feature.properties.place_name,
        null,
        'Feed place_name must be null when descriptive text is absent',
      );
      assert.equal(feature.properties.category, 'PHYSICAL_HAZARD');
      assert.equal(feature.properties.status, 'ACTIVE');
      assert.equal(feature.properties.summary, safeSummary);
      assert.equal(feature.properties.published_at, activatedAt.toISOString());
      assert.equal(feature.properties.updated_at, updatedAt.toISOString());
      assert.equal(feature.properties.public_photo_url, null);

      // 2. Public details endpoint must return HTTP 200 with coordinates and null descriptive fields
      const detailRes = await app.inject({
        method: 'GET',
        url: `/api/v1/incidents/public/${publicId}`,
        remoteAddress: '192.168.1.21',
      });
      assert.equal(detailRes.statusCode, 200);
      const detailBody = JSON.parse(detailRes.payload) as PublicIncidentDetailResponse;
      assert.equal(detailBody.public_id, publicId);
      assert.equal(detailBody.category, 'PHYSICAL_HAZARD');
      assert.equal(detailBody.status, 'ACTIVE');
      assert.equal(detailBody.summary, safeSummary);
      assert.deepEqual(detailBody.location.coordinates, [testLon, testLat]);
      assert.equal(
        detailBody.location.place_name,
        null,
        'location.place_name must be null when report has no place',
      );
      assert.equal(
        detailBody.location.landmark_description,
        null,
        'location.landmark_description must be null when report has no landmark',
      );
      assert.equal(
        detailBody.location.yct_map_place_id,
        null,
        'location.yct_map_place_id must be null when report has no place ID',
      );
      assert.equal(detailBody.timestamps.reported_at, submittedAt.toISOString());
      assert.equal(detailBody.timestamps.activated_at, activatedAt.toISOString());
      assert.equal(detailBody.timestamps.updated_at, updatedAt.toISOString());
      assert.deepEqual(detailBody.photos, []);
    },
  );
});
