import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';
import { closePool, query, withTransaction } from '../src/db/pool.js';
import { runMigrations } from '../scripts/migrate.js';
import {
  calculateHaversineDistanceMeters,
  isGeographicMatch,
  parseCoordinate,
} from '../src/services/matchingService.js';

let app: FastifyInstance;
const testConfig = loadConfig({
  NODE_ENV: 'test',
  RATE_LIMIT_MAX: '1000',
  RATE_LIMIT_WINDOW_MINUTES: '1',
});

before(async () => {
  await runMigrations({
    databaseUrl: testConfig.TEST_DATABASE_URL,
    direction: 'up',
    verbose: false,
  });

  app = buildApp(testConfig);
  await app.ready();
});

after(async () => {
  if (app) {
    await app.close();
  }
  await closePool();
});

beforeEach(async () => {
  await query(
    'TRUNCATE idempotency_receipts, incident_audit_logs, incident_report_links, incidents, incident_reports CASCADE;',
  );
});

function createReportPayload(overrides?: Record<string, unknown>) {
  return {
    category_code: 'FIRE_OR_SMOKE',
    description: 'Heavy black smoke observed near the generator house.',
    incident_location: {
      source: 'MANUAL_POINT',
      latitude: 6.518,
      longitude: 3.372,
      landmark_description: 'Generator House Behind Workshop',
      place_name_snapshot: 'Central Workshop',
      yct_map_place_id: null,
    },
    ...overrides,
  };
}

// ============================================================================
// PART 1: Pure Unit Tests for Spatial Math & Matching Service
// ============================================================================

test('Unit: calculateHaversineDistanceMeters accurately calculates distances', () => {
  // 1. Identical coordinates return 0
  assert.equal(calculateHaversineDistanceMeters(6.518, 3.372, 6.518, 3.372), 0);

  // 2. Small distance ~22.2 meters at YABATECH latitude
  const d22m = calculateHaversineDistanceMeters(6.518, 3.372, 6.5182, 3.372);
  assert.ok(d22m > 20 && d22m < 25, `Expected ~22.2m, got ${d22m}`);

  // 3. Distance ~55.5 meters at YABATECH latitude (crosses 50m threshold)
  const d55m = calculateHaversineDistanceMeters(6.518, 3.372, 6.5185, 3.372);
  assert.ok(d55m > 50 && d55m < 60, `Expected ~55.5m, got ${d55m}`);

  // 4. Distance ~111 meters
  const d111m = calculateHaversineDistanceMeters(6.518, 3.372, 6.519, 3.372);
  assert.ok(d111m > 105 && d111m < 115, `Expected ~111m, got ${d111m}`);

  // 5. Equator points
  const dEquator = calculateHaversineDistanceMeters(0, 0, 0, 0.00045);
  assert.ok(dEquator > 48 && dEquator < 52, `Expected ~50m, got ${dEquator}`);
});

test('Unit: isGeographicMatch enforces 50m threshold and place ID fallback rules', () => {
  const placeA = 'a0000000-0000-0000-0000-000000000001';
  const placeB = 'b0000000-0000-0000-0000-000000000002';

  // Rule 1: Both have micro-location coordinates <= 50m -> matches
  const matchWithin50m = isGeographicMatch(6.5182, 3.372, null, 6.518, 3.372, null);
  assert.equal(matchWithin50m.isMatch, true);
  assert.equal(matchWithin50m.reason, 'COORDINATES_WITHIN_THRESHOLD');
  assert.ok(matchWithin50m.distanceMeters! <= 50.0);

  // Rule 2: Both have micro-location coordinates > 50m -> fails, EVEN IF place IDs are identical!
  // CRITICAL SAFEGUARD: Shared place ID must NOT override a failed distance check.
  const matchBeyond50m = isGeographicMatch(6.519, 3.372, placeA, 6.518, 3.372, placeA);
  assert.equal(matchBeyond50m.isMatch, false);
  assert.equal(matchBeyond50m.reason, 'COORDINATES_EXCEED_THRESHOLD');
  assert.ok(matchBeyond50m.distanceMeters! > 50.0);

  // Rule 3: Micro-location coordinates unavailable on candidate, matching place ID -> matches
  const matchMissingCandCoords = isGeographicMatch(6.518, 3.372, placeA, null, null, placeA);
  assert.equal(matchMissingCandCoords.isMatch, true);
  assert.equal(matchMissingCandCoords.reason, 'MATCHING_PLACE_ID_FALLBACK');

  // Rule 4: Micro-location coordinates unavailable on incoming, matching place ID -> matches
  const matchMissingInCoords = isGeographicMatch(null, null, placeA, 6.518, 3.372, placeA);
  assert.equal(matchMissingInCoords.isMatch, true);
  assert.equal(matchMissingInCoords.reason, 'MATCHING_PLACE_ID_FALLBACK');

  // Rule 5: Micro-location coordinates unavailable on both, matching place ID -> matches
  const matchBothMissingCoords = isGeographicMatch(null, null, placeA, null, null, placeA);
  assert.equal(matchBothMissingCoords.isMatch, true);
  assert.equal(matchBothMissingCoords.reason, 'MATCHING_PLACE_ID_FALLBACK');

  // Rule 6: Micro-location coordinates unavailable, different place IDs -> fails
  const matchDifferentPlaces = isGeographicMatch(null, null, placeA, null, null, placeB);
  assert.equal(matchDifferentPlaces.isMatch, false);
  assert.equal(matchDifferentPlaces.reason, 'DIFFERENT_PLACE_IDS');

  // Rule 7: Micro-location coordinates unavailable and no place IDs (landmark text only) -> fails
  const matchMissingData = isGeographicMatch(null, null, null, null, null, null);
  assert.equal(matchMissingData.isMatch, false);
  assert.equal(matchMissingData.reason, 'MISSING_SPATIAL_DATA');
});

test('Unit: parseCoordinate safely parses numbers, strings, and handles malformed inputs', () => {
  assert.equal(parseCoordinate(6.518), 6.518);
  assert.equal(parseCoordinate('6.518000'), 6.518);
  assert.equal(parseCoordinate('  3.372000  '), 3.372);
  assert.equal(parseCoordinate(null), null);
  assert.equal(parseCoordinate(undefined), null);
  assert.equal(parseCoordinate(''), null);
  assert.equal(parseCoordinate('not-a-number'), null);
  assert.equal(parseCoordinate(NaN), null);
  assert.equal(parseCoordinate(Infinity), null);
});

// ============================================================================
// PART 2: Essential Integration Scenarios
// ============================================================================

test('Scenario 1: Same category, within 50 metres and 15 minutes links as SUGGESTED', async () => {
  // 1. Initial report creates Incident 1
  const key1 = crypto.randomUUID();
  const res1 = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': key1 },
    payload: createReportPayload({
      incident_location: {
        source: 'MANUAL_POINT',
        latitude: 6.518,
        longitude: 3.372,
        landmark_description: 'Generator House',
      },
    }),
  });
  assert.equal(res1.statusCode, 202);
  const body1 = res1.json();

  // 2. Corroborating report within ~22m, same category, immediate submission
  const key2 = crypto.randomUUID();
  const res2 = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': key2 },
    payload: createReportPayload({
      description: 'Second witness: flames now visible at generator house.',
      incident_location: {
        source: 'MANUAL_POINT',
        latitude: 6.5182, // ~22m away
        longitude: 3.372,
        landmark_description: 'Near Generator House',
      },
    }),
  });
  assert.equal(res2.statusCode, 202);
  const body2 = res2.json();

  // Verify DB state
  const incRes = await query('SELECT * FROM incidents');
  assert.equal(incRes.rows.length, 1, 'Exactly one incident must exist');
  const incident = incRes.rows[0];

  assert.equal(incident.status, 'PENDING', 'Incident status must remain PENDING');
  assert.equal(incident.row_version, 2, 'Row version must increment');

  // Verify report links
  const linksRes = await query(
    'SELECT * FROM incident_report_links WHERE incident_id = $1 ORDER BY linked_at ASC',
    [incident.id],
  );
  assert.equal(linksRes.rows.length, 2, 'Incident must have 2 linked reports');

  // Initial report link is CREATION
  const link1 = linksRes.rows[0];
  assert.equal(link1.match_method, 'CREATION');

  // Second report link is SUGGESTED
  const link2 = linksRes.rows[1];
  assert.equal(link2.match_method, 'SUGGESTED');

  // Verify reports table
  const rep1 = await query('SELECT * FROM incident_reports WHERE receipt_id = $1', [
    body1.receipt_id,
  ]);
  const rep2 = await query('SELECT * FROM incident_reports WHERE receipt_id = $1', [
    body2.receipt_id,
  ]);
  assert.equal(rep1.rows.length, 1);
  assert.equal(rep2.rows.length, 1);
  assert.equal(link1.report_id, rep1.rows[0].id);
  assert.equal(link2.report_id, rep2.rows[0].id);
});

test('Scenario 2: Distance greater than 50 metres creates an independent PENDING incident', async () => {
  // Report 1 at (6.5180, 3.3720)
  const res1 = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    payload: createReportPayload({
      incident_location: {
        source: 'MANUAL_POINT',
        latitude: 6.518,
        longitude: 3.372,
        landmark_description: 'Point A',
      },
    }),
  });
  assert.equal(res1.statusCode, 202);

  // Report 2 at (6.5190, 3.3720) -> ~111m away
  const res2 = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    payload: createReportPayload({
      description: 'Separate fire at academic block B.',
      incident_location: {
        source: 'MANUAL_POINT',
        latitude: 6.519, // ~111m away
        longitude: 3.372,
        landmark_description: 'Point B',
      },
    }),
  });
  assert.equal(res2.statusCode, 202);

  // Verify DB state: 2 separate incidents, both with CREATION links
  const incRes = await query('SELECT * FROM incidents ORDER BY created_at ASC');
  assert.equal(incRes.rows.length, 2, 'Two separate incidents must exist due to distance > 50m');
  assert.equal(incRes.rows[0].status, 'PENDING');
  assert.equal(incRes.rows[1].status, 'PENDING');

  const linksRes = await query('SELECT * FROM incident_report_links');
  assert.equal(linksRes.rows.length, 2);
  assert.equal(linksRes.rows[0].match_method, 'CREATION');
  assert.equal(linksRes.rows[1].match_method, 'CREATION');
});

test('Scenario 3: Time greater than 15 minutes creates an independent PENDING incident', async () => {
  // Report 1 at T0
  const res1 = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    payload: createReportPayload(),
  });
  assert.equal(res1.statusCode, 202);

  // Manually age the incident's last_reported_at and first_reported_at to 16 minutes ago
  await query(
    `UPDATE incidents 
     SET last_reported_at = CURRENT_TIMESTAMP - INTERVAL '16 minutes',
         first_reported_at = CURRENT_TIMESTAMP - INTERVAL '16 minutes'`,
  );

  // Report 2 at exact same coordinates, 16 minutes after Report 1
  const res2 = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    payload: createReportPayload({
      description: 'New smoke reported after 16 minutes silence.',
    }),
  });
  assert.equal(res2.statusCode, 202);

  // Verify DB state: 2 separate incidents due to time window expiry
  const incRes = await query('SELECT * FROM incidents');
  assert.equal(incRes.rows.length, 2, 'Two separate incidents must exist due to time > 15m');
});

test('Scenario 4: Different categories at identical coordinates create separate incidents', async () => {
  // Report 1: FIRE_OR_SMOKE
  const res1 = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    payload: createReportPayload({
      category_code: 'FIRE_OR_SMOKE',
    }),
  });
  assert.equal(res1.statusCode, 202);

  // Report 2: SECURITY_INCIDENT at identical coordinates
  const res2 = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    payload: createReportPayload({
      category_code: 'SECURITY_INCIDENT',
      description: 'Physical altercation in front of the workshop.',
    }),
  });
  assert.equal(res2.statusCode, 202);

  // Verify DB state: 2 separate incidents
  const incRes = await query('SELECT * FROM incidents ORDER BY created_at ASC');
  assert.equal(incRes.rows.length, 2, 'Different categories must never merge');
  assert.equal(incRes.rows[0].category_code, 'FIRE_OR_SMOKE');
  assert.equal(incRes.rows[1].category_code, 'SECURITY_INCIDENT');
});

test('Scenario 5: Matching with missing coordinates and identical place IDs links as SUGGESTED', async () => {
  const placeId = 'c0000000-0000-0000-0000-000000000001';

  // Report 1: PHYSICAL_HAZARD with place ID, no GPS coordinates
  const res1 = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    payload: createReportPayload({
      category_code: 'PHYSICAL_HAZARD',
      incident_location: {
        source: 'MAP_PLACE',
        latitude: null,
        longitude: null,
        yct_map_place_id: placeId,
        place_name_snapshot: 'School of Technology Library',
        landmark_description: 'Near front steps',
      },
    }),
  });
  assert.equal(res1.statusCode, 202);

  // Report 2: PHYSICAL_HAZARD with same place ID, no GPS coordinates
  const res2 = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    payload: createReportPayload({
      category_code: 'PHYSICAL_HAZARD',
      description: 'Slippery floor reported at the library entrance.',
      incident_location: {
        source: 'MAP_PLACE',
        latitude: null,
        longitude: null,
        yct_map_place_id: placeId,
        place_name_snapshot: 'School of Technology Library',
        landmark_description: 'Entrance foyer',
      },
    }),
  });
  assert.equal(res2.statusCode, 202);

  // Verify DB state: 1 incident with 2 linked reports (1 CREATION, 1 SUGGESTED)
  const incRes = await query('SELECT * FROM incidents');
  assert.equal(incRes.rows.length, 1, 'Should cluster under single incident via place ID');

  const linksRes = await query(
    'SELECT * FROM incident_report_links WHERE incident_id = $1 ORDER BY linked_at ASC',
    [incRes.rows[0].id],
  );
  assert.equal(linksRes.rows.length, 2);
  assert.equal(linksRes.rows[0].match_method, 'CREATION');
  assert.equal(linksRes.rows[1].match_method, 'SUGGESTED');
});

test('Scenario 6: Different place IDs with missing coordinates create separate incidents', async () => {
  const placeA = 'c0000000-0000-0000-0000-000000000001';
  const placeB = 'c0000000-0000-0000-0000-000000000002';

  // Report 1: Place A, no coordinates
  const res1 = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    payload: createReportPayload({
      category_code: 'PHYSICAL_HAZARD',
      incident_location: {
        source: 'MAP_PLACE',
        latitude: null,
        longitude: null,
        yct_map_place_id: placeA,
        place_name_snapshot: 'Building A',
      },
    }),
  });
  assert.equal(res1.statusCode, 202);

  // Report 2: Place B, no coordinates
  const res2 = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    payload: createReportPayload({
      category_code: 'PHYSICAL_HAZARD',
      incident_location: {
        source: 'MAP_PLACE',
        latitude: null,
        longitude: null,
        yct_map_place_id: placeB,
        place_name_snapshot: 'Building B',
      },
    }),
  });
  assert.equal(res2.statusCode, 202);

  // Verify DB state: 2 separate incidents
  const incRes = await query('SELECT * FROM incidents');
  assert.equal(incRes.rows.length, 2, 'Different place IDs must create separate incidents');
});

test('Scenario 7: Multiple ambiguous candidates create an independent PENDING incident', async () => {
  // Seed two distinct PENDING incidents located close to each other
  // Incident 1 at (6.51800, 3.37200)
  const res1 = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    payload: createReportPayload({
      incident_location: {
        source: 'MANUAL_POINT',
        latitude: 6.518,
        longitude: 3.372,
        landmark_description: 'Point 1',
      },
    }),
  });
  assert.equal(res1.statusCode, 202);

  // Force-create Incident 2 at (6.51810, 3.37200) (~11m away) by temporarily setting distance
  // Or inserting directly into DB to simulate two pre-existing incidents
  const incident2Id = crypto.randomUUID();
  const report2Id = crypto.randomUUID();
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO incident_reports (
        id, receipt_id, receipt_token_hash, category_code, description, location_source,
        incident_lat, incident_lon, is_test, submitted_at
      ) VALUES ($1, $2, 'dummyhash', 'FIRE_OR_SMOKE', 'Report 2 at Point 2', 'MANUAL_POINT',
                6.51810, 3.37200, TRUE, CURRENT_TIMESTAMP)`,
      [report2Id, crypto.randomUUID()],
    );
    await client.query(
      `INSERT INTO incidents (
        id, public_id, status, category_code, display_lat, display_lon,
        first_reported_at, last_reported_at
      ) VALUES ($1, $2, 'PENDING', 'FIRE_OR_SMOKE', 6.51810, 3.37200,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [incident2Id, 'inc_ambiguous_test_02'],
    );
    await client.query(
      `INSERT INTO incident_report_links (incident_id, report_id, match_method)
       VALUES ($1, $2, 'CREATION')`,
      [incident2Id, report2Id],
    );
  });

  // Now submit Report 3 at (6.51805, 3.37200), which is ~5.5m from Incident 1 and ~5.5m from Incident 2
  // Both candidates are eligible!
  const res3 = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    payload: createReportPayload({
      description: 'Report 3 situated equidistant between Incident 1 and Incident 2.',
      incident_location: {
        source: 'MANUAL_POINT',
        latitude: 6.51805,
        longitude: 3.372,
        landmark_description: 'Between Point 1 and 2',
      },
    }),
  });
  assert.equal(res3.statusCode, 202);

  // CRITICAL SAFEGUARD: When multiple candidates match, DO NOT arbitrarily associate.
  // Create an independent PENDING incident and preserve ambiguity for moderator review.
  const incRes = await query('SELECT * FROM incidents ORDER BY created_at ASC');
  assert.equal(incRes.rows.length, 3, 'Must create independent third incident due to ambiguity');

  // Verify that the third incident was linked via CREATION
  const lastInc = incRes.rows[2];
  const lastLinks = await query('SELECT * FROM incident_report_links WHERE incident_id = $1', [
    lastInc.id,
  ]);
  assert.equal(lastLinks.rows.length, 1);
  assert.equal(lastLinks.rows[0].match_method, 'CREATION');
});

test('Scenario 8: Concurrent matching submissions with distinct idempotency keys serialize cleanly', async () => {
  const payloadA = createReportPayload({
    description: 'Concurrent reporter A at main entrance.',
    incident_location: {
      source: 'MANUAL_POINT',
      latitude: 6.518,
      longitude: 3.372,
      landmark_description: 'Main Gate',
    },
  });

  const payloadB = createReportPayload({
    description: 'Concurrent reporter B at main entrance.',
    incident_location: {
      source: 'MANUAL_POINT',
      latitude: 6.51802, // ~2.2m away
      longitude: 3.372,
      landmark_description: 'Main Gate',
    },
  });

  // Launch both requests simultaneously with distinct idempotency keys
  const [resA, resB] = await Promise.all([
    app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      payload: payloadA,
    }),
    app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      payload: payloadB,
    }),
  ]);

  assert.equal(resA.statusCode, 202);
  assert.equal(resB.statusCode, 202);

  // Advisory lock guarantees serialization: exactly ONE incident was created,
  // and both reports were linked to it (1 CREATION, 1 SUGGESTED)
  const incRes = await query('SELECT * FROM incidents');
  assert.equal(incRes.rows.length, 1, 'Advisory lock must prevent concurrent duplicate incidents');

  const linksRes = await query('SELECT * FROM incident_report_links');
  assert.equal(linksRes.rows.length, 2, 'Both reports must be linked to the single incident');

  const methods = linksRes.rows.map((r) => r.match_method).sort();
  assert.deepEqual(methods, ['CREATION', 'SUGGESTED']);
});

test('Scenario 9: Idempotency replay does not duplicate associations or increment count', async () => {
  const key = crypto.randomUUID();
  const payload = createReportPayload();

  // First submission
  const res1 = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': key },
    payload,
  });
  assert.equal(res1.statusCode, 202);
  const body1 = res1.json();

  // Replay identical submission
  const res2 = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': key },
    payload,
  });
  assert.equal(res2.statusCode, 202);
  const body2 = res2.json();

  assert.equal(body1.receipt_id, body2.receipt_id, 'Receipt IDs must match on replay');

  // Verify DB state: strictly 1 incident, 1 report, 1 link
  const incRes = await query('SELECT * FROM incidents');
  assert.equal(incRes.rows.length, 1);
  assert.equal(incRes.rows[0].row_version, 1, 'Row version must not increment on replay');

  const repRes = await query('SELECT * FROM incident_reports');
  assert.equal(repRes.rows.length, 1);

  const linksRes = await query('SELECT * FROM incident_report_links');
  assert.equal(linksRes.rows.length, 1);
});

test('Scenario 10: At least ten corroborating reports never automatically activate an incident', async () => {
  // Initial report creates Incident
  const resInit = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    payload: createReportPayload({
      description: 'Initial report of major fire.',
    }),
  });
  assert.equal(resInit.statusCode, 202);

  // Submit 10 subsequent corroborating reports within 30m
  for (let i = 1; i <= 10; i++) {
    const latOffset = i * 0.00002; // ~2.2m per step, up to ~22m max
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      payload: createReportPayload({
        description: `Corroborating witness #${i} confirms fire.`,
        incident_location: {
          source: 'MANUAL_POINT',
          latitude: 6.518 + latOffset,
          longitude: 3.372,
          landmark_description: `Witness #${i} location`,
        },
      }),
    });
    assert.equal(res.statusCode, 202);
  }

  // Inspect the incident in DB
  const incRes = await query('SELECT * FROM incidents');
  assert.equal(incRes.rows.length, 1, 'All 11 reports must cluster under the single incident');
  const incident = incRes.rows[0];

  // CRITICAL INVARIANT: 10+ corroborating reports must NEVER automatically activate an incident!
  assert.equal(
    incident.status,
    'PENDING',
    'CRITICAL INVARIANT VIOLATION: Incident was automatically activated by report volume!',
  );

  // Verify all 11 reports linked: 1 CREATION and 10 SUGGESTED
  const linksRes = await query(
    'SELECT match_method, COUNT(*) AS cnt FROM incident_report_links WHERE incident_id = $1 GROUP BY match_method',
    [incident.id],
  );
  const counts: Record<string, number> = {};
  for (const row of linksRes.rows) {
    counts[row.match_method] = parseInt(row.cnt, 10);
  }

  assert.equal(counts['CREATION'], 1);
  assert.equal(counts['SUGGESTED'], 10);

  // Verify row_version incremented 10 times (from 1 to 11)
  assert.equal(incident.row_version, 11);
});

test('Scenario 11: Transaction rollback and association integrity', async () => {
  // Verify that an error inside the intake transaction rolls back cleanly
  // We simulate by attempting to use an invalid category or injecting directly
  try {
    await withTransaction(async (client) => {
      // Insert a report
      await client.query(
        `INSERT INTO incident_reports (
          receipt_id, receipt_token_hash, category_code, description, location_source, is_test
        ) VALUES ($1, 'hash', 'FIRE_OR_SMOKE', 'Simulated failure test', 'TEXT_ONLY', TRUE)`,
        [crypto.randomUUID()],
      );

      // Deliberately trigger an error
      throw new Error('SIMULATED_TRANSACTION_FAILURE');
    });
  } catch (err: unknown) {
    assert.equal((err as Error).message, 'SIMULATED_TRANSACTION_FAILURE');
  }

  // Verify database contains zero rows
  const repRes = await query('SELECT * FROM incident_reports');
  assert.equal(repRes.rows.length, 0, 'Rolled back transaction must leave 0 reports');

  const incRes = await query('SELECT * FROM incidents');
  assert.equal(incRes.rows.length, 0, 'Rolled back transaction must leave 0 incidents');

  const linksRes = await query('SELECT * FROM incident_report_links');
  assert.equal(linksRes.rows.length, 0, 'Rolled back transaction must leave 0 links');
});

test('Scenario 12: Preserves status of UNDER_REVIEW and ACTIVE candidate incidents', async () => {
  // 1. Submit initial report -> creates PENDING incident
  const res1 = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    payload: createReportPayload(),
  });
  assert.equal(res1.statusCode, 202);

  const incRes1 = await query('SELECT id FROM incidents');
  const incidentId = incRes1.rows[0].id;

  // Transition incident to UNDER_REVIEW
  await query("UPDATE incidents SET status = 'UNDER_REVIEW' WHERE id = $1", [incidentId]);

  // Submit corroborating report
  const res2 = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    payload: createReportPayload({
      description: 'Report arriving while incident is UNDER_REVIEW.',
    }),
  });
  assert.equal(res2.statusCode, 202);

  const checkUnderReview = await query('SELECT status FROM incidents WHERE id = $1', [incidentId]);
  assert.equal(
    checkUnderReview.rows[0].status,
    'UNDER_REVIEW',
    'Incident status must remain UNDER_REVIEW',
  );

  // Transition incident to ACTIVE
  await query("UPDATE incidents SET status = 'ACTIVE' WHERE id = $1", [incidentId]);

  // Submit corroborating report
  const res3 = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    payload: createReportPayload({
      description: 'Report arriving while incident is ACTIVE.',
    }),
  });
  assert.equal(res3.statusCode, 202);

  const checkActive = await query('SELECT status FROM incidents WHERE id = $1', [incidentId]);
  assert.equal(checkActive.rows[0].status, 'ACTIVE', 'Incident status must remain ACTIVE');
});

// ============================================================================
// PART 3: G2.5 Rigorous Isolation & Concurrency Verification
// ============================================================================

test('Scenario 13 (Test A1): Spatial Non-Transitivity & Anchor Invariance', async () => {
  // Anchor A at Central Library Complex
  const anchorCoords = { latitude: 6.5186, longitude: 3.3729 };
  // Report B offset north ~27.8m (< 50m from Anchor A)
  const reportBCoords = { latitude: 6.51885, longitude: 3.3729 };
  // Report C offset north ~38.9m from B, ~66.7m from Anchor A (> 50m from Anchor A)
  const reportCCoords = { latitude: 6.5192, longitude: 3.3729 };

  // 1. Submit Report A (Creation Anchor)
  const keyA = crypto.randomUUID();
  const resA = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': keyA },
    payload: createReportPayload({
      category_code: 'PHYSICAL_HAZARD',
      description: 'Report A - Creation Anchor at Central Library Complex.',
      incident_location: {
        source: 'MANUAL_POINT',
        latitude: anchorCoords.latitude,
        longitude: anchorCoords.longitude,
        landmark_description: 'Central Library Complex',
      },
    }),
  });
  assert.equal(resA.statusCode, 202);
  const bodyA = JSON.parse(resA.payload);
  const receiptIdA = bodyA.receipt_id;

  // Retrieve incident A
  const incResA = await query(
    `SELECT i.id, i.public_id, l.match_method
     FROM incidents i
     JOIN incident_report_links l ON l.incident_id = i.id
     JOIN incident_reports r ON r.id = l.report_id
     WHERE r.receipt_id = $1`,
    [receiptIdA],
  );
  assert.equal(incResA.rows.length, 1);
  const incidentIdA = incResA.rows[0].id;
  assert.equal(incResA.rows[0].match_method, 'CREATION');

  // 2. Submit Report B (~27.8m from Anchor A -> should MATCH incident A)
  const keyB = crypto.randomUUID();
  const resB = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': keyB },
    payload: createReportPayload({
      category_code: 'PHYSICAL_HAZARD',
      description: 'Report B - 27.8m from Anchor A, corroborating.',
      incident_location: {
        source: 'MANUAL_POINT',
        latitude: reportBCoords.latitude,
        longitude: reportBCoords.longitude,
        landmark_description: 'Near Library North Walkway',
      },
    }),
  });
  assert.equal(resB.statusCode, 202);
  const bodyB = JSON.parse(resB.payload);
  const receiptIdB = bodyB.receipt_id;

  const linkResB = await query(
    `SELECT l.incident_id, l.match_method
     FROM incident_report_links l
     JOIN incident_reports r ON r.id = l.report_id
     WHERE r.receipt_id = $1`,
    [receiptIdB],
  );
  assert.equal(linkResB.rows.length, 1);
  assert.equal(linkResB.rows[0].incident_id, incidentIdA, 'Report B must match Incident A');
  assert.equal(linkResB.rows[0].match_method, 'SUGGESTED');

  // 3. Submit Report C (~38.9m from B, but ~66.7m from Anchor A -> should NOT match incident A)
  const keyC = crypto.randomUUID();
  const resC = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': keyC },
    payload: createReportPayload({
      category_code: 'PHYSICAL_HAZARD',
      description: 'Report C - 38.9m from B but 66.7m from A, proving non-transitivity.',
      incident_location: {
        source: 'MANUAL_POINT',
        latitude: reportCCoords.latitude,
        longitude: reportCCoords.longitude,
        landmark_description: 'Farther North Axis',
      },
    }),
  });
  assert.equal(resC.statusCode, 202);
  const bodyC = JSON.parse(resC.payload);
  const receiptIdC = bodyC.receipt_id;

  const linkResC = await query(
    `SELECT l.incident_id, l.match_method
     FROM incident_report_links l
     JOIN incident_reports r ON r.id = l.report_id
     WHERE r.receipt_id = $1`,
    [receiptIdC],
  );
  assert.equal(linkResC.rows.length, 1);
  assert.notEqual(linkResC.rows[0].incident_id, incidentIdA, 'Report C must NOT match Incident A');
  assert.equal(linkResC.rows[0].match_method, 'CREATION', 'Report C must create a new incident');
});

test('Scenario 14 (Test A2): Concurrent Intake Isolation & Scoped Cleanup', async () => {
  const targetCoords = { latitude: 6.5191, longitude: 3.3734 };
  const CONCURRENT_COUNT = 10;
  const idempotencyKeys = Array.from({ length: CONCURRENT_COUNT }, () => crypto.randomUUID());

  // 1. Fire 10 concurrent intake submissions at identical coordinates
  const responses = await Promise.all(
    idempotencyKeys.map((key, idx) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/reports',
        headers: { 'Idempotency-Key': key },
        payload: createReportPayload({
          category_code: 'PHYSICAL_HAZARD',
          description: `Concurrent hazard observation #${idx + 1}`,
          incident_location: {
            source: 'MANUAL_POINT',
            latitude: targetCoords.latitude,
            longitude: targetCoords.longitude,
            landmark_description: 'School of Technology Complex',
          },
        }),
      }),
    ),
  );

  // 2. All 10 requests return HTTP 202 Accepted
  for (const res of responses) {
    assert.equal(res.statusCode, 202, 'Every concurrent request must receive 202 Accepted');
  }

  // 3. Exactly 10 distinct receipt IDs captured
  const capturedReceiptIds = responses.map((r) => JSON.parse(r.payload).receipt_id);
  const uniqueReceiptIds = new Set(capturedReceiptIds);
  assert.equal(uniqueReceiptIds.size, CONCURRENT_COUNT, 'All 10 receipt IDs must be distinct');

  // 4. Query scenario-owned reports and associations
  const reportsRes = await query<{ id: string; receipt_id: string }>(
    `SELECT id, receipt_id FROM incident_reports WHERE receipt_id = ANY($1::varchar[])`,
    [capturedReceiptIds],
  );
  assert.equal(
    reportsRes.rows.length,
    CONCURRENT_COUNT,
    'All 10 reports must be located in database',
  );
  const reportInternalIds = reportsRes.rows.map((r) => r.id);

  const linksRes = await query<{ report_id: string; incident_id: string; match_method: string }>(
    `SELECT report_id, incident_id, match_method
     FROM incident_report_links
     WHERE report_id = ANY($1::uuid[])`,
    [reportInternalIds],
  );
  assert.equal(linksRes.rows.length, CONCURRENT_COUNT, 'All 10 report links must be found');

  // Exactly 1 CREATION link and 9 SUGGESTED links
  const creationLinks = linksRes.rows.filter((l) => l.match_method === 'CREATION');
  const suggestedLinks = linksRes.rows.filter((l) => l.match_method === 'SUGGESTED');
  assert.equal(creationLinks.length, 1, 'Exactly 1 link must have match_method = CREATION');
  assert.equal(suggestedLinks.length, 9, 'Exactly 9 links must have match_method = SUGGESTED');

  // All 10 link to the same incident ID
  const targetIncidentId = creationLinks[0].incident_id;
  for (const link of linksRes.rows) {
    assert.equal(
      link.incident_id,
      targetIncidentId,
      'All reports must associate to the same incident',
    );
  }

  // 5. Safe, scenario-scoped cleanup
  // Step 5a: Delete scenario reports via captured receipt IDs (cascades to links and receipts)
  const delReportsRes = await query(
    `DELETE FROM incident_reports WHERE receipt_id = ANY($1::varchar[])`,
    [capturedReceiptIds],
  );
  assert.equal(delReportsRes.rowCount, CONCURRENT_COUNT);

  // Step 5b: Delete scenario incident
  const delIncRes = await query(`DELETE FROM incidents WHERE id = $1`, [targetIncidentId]);
  assert.equal(delIncRes.rowCount, 1);

  // Verify zero leftover scenario records
  const checkReports = await query(
    `SELECT COUNT(*) AS cnt FROM incident_reports WHERE receipt_id = ANY($1::varchar[])`,
    [capturedReceiptIds],
  );
  assert.equal(parseInt(checkReports.rows[0].cnt, 10), 0);
});
