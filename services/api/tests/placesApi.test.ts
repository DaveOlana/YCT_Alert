import test from 'node:test';
import assert from 'node:assert/strict';
import { CampusPlace, CampusPlacesListResponse } from '@yctalert/contracts';
import { geographySyncService } from '../src/services/geographySyncService.js';
import { initPool, closePool } from '../src/db/pool.js';
import { loadConfig } from '../src/config.js';
import { runMigrations } from '../scripts/migrate.js';
import { buildApp } from '../src/app.js';

const TEST_CONFIG = loadConfig({
  NODE_ENV: 'test',
  YCT_MAP_BASE_URL: 'https://mock-yct-map.internal',
  GEOGRAPHY_SYNC_INTERVAL_MINUTES: 15,
  ENABLE_BACKGROUND_PURGE: false,
  ENABLE_GEOGRAPHY_SYNC: false,
});

function createMockPlace(overrides: Partial<CampusPlace>): CampusPlace {
  return {
    id: overrides.id || '00000000-0000-0000-0000-000000000001',
    name: overrides.name || 'Sample Hall',
    category_slug: overrides.category_slug || 'academic',
    category_name: overrides.category_name || 'Academic Buildings',
    coordinates: overrides.coordinates || { latitude: 6.518, longitude: 3.372 },
    primary_entrance: overrides.primary_entrance ?? null,
    verification_state: overrides.verification_state || 'VERIFIED',
    aliases: overrides.aliases || [],
    is_active: overrides.is_active ?? true,
  };
}

test('G3.2A Cached Campus Places API Test Suite', async (t) => {
  initPool(TEST_CONFIG);
  await runMigrations({
    databaseUrl: TEST_CONFIG.TEST_DATABASE_URL,
    direction: 'up',
    verbose: false,
  });

  const app = buildApp(TEST_CONFIG);
  await app.ready();

  t.after(async () => {
    await app.close();
    await closePool();
  });

  await t.test('1. Returns HTTP 503 with Cache-Control: no-store when uninitialized', async () => {
    geographySyncService.setInMemoryCatalog(null);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/places/',
    });

    assert.equal(res.statusCode, 503);
    assert.equal(res.headers['cache-control'], 'no-store');
    const body = JSON.parse(res.payload);
    assert.equal(body.error.code, 'GEOGRAPHY_UNAVAILABLE');
  });

  await t.test('2. Returns HTTP 200 with places and Cache-Control headers when initialized', async () => {
    const mockCatalog: CampusPlacesListResponse = {
      places: [
        createMockPlace({ id: '11111111-1111-1111-1111-111111111111', name: 'Main Auditorium' }),
        createMockPlace({ id: '22222222-2222-2222-2222-222222222222', name: 'Science Complex' }),
      ],
      total: 2,
      snapshot_age_seconds: 45,
      sync_status: 'HEALTHY',
    };
    geographySyncService.setInMemoryCatalog(mockCatalog, new Date());

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/places/',
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['cache-control'], 'public, max-age=30, stale-while-revalidate=120');
    assert.equal(res.headers['x-geography-stale'], undefined);
    assert.equal(res.headers['x-geography-degraded'], undefined);

    const body = JSON.parse(res.payload);
    assert.equal(body.places.length, 2);
    assert.equal(body.total, 2);
    assert.equal(body.sync_status, 'HEALTHY');
  });

  await t.test('3. Both /api/v1/places/ and /api/v1/places respond identically', async () => {
    const resWithSlash = await app.inject({ method: 'GET', url: '/api/v1/places/' });
    const resWithoutSlash = await app.inject({ method: 'GET', url: '/api/v1/places' });

    assert.equal(resWithSlash.statusCode, 200);
    assert.equal(resWithoutSlash.statusCode, 200);
    assert.deepEqual(JSON.parse(resWithSlash.payload), JSON.parse(resWithoutSlash.payload));
  });

  await t.test('4. Excludes inactive places (is_active === false)', async () => {
    const mockCatalog: CampusPlacesListResponse = {
      places: [
        createMockPlace({ name: 'Active Library', is_active: true }),
        createMockPlace({ name: 'Demolished Block', is_active: false }),
      ],
      total: 2,
      snapshot_age_seconds: 10,
      sync_status: 'HEALTHY',
    };
    geographySyncService.setInMemoryCatalog(mockCatalog);

    const res = await app.inject({ method: 'GET', url: '/api/v1/places/' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.total, 1);
    assert.equal(body.places[0].name, 'Active Library');
  });

  await t.test('5. Includes active unverified places (verification_state !== VERIFIED)', async () => {
    const mockCatalog: CampusPlacesListResponse = {
      places: [
        createMockPlace({ name: 'Official Hall', verification_state: 'VERIFIED' }),
        createMockPlace({ name: 'New Student Kiosk', verification_state: 'UNVERIFIED' }),
      ],
      total: 2,
      snapshot_age_seconds: 10,
      sync_status: 'HEALTHY',
    };
    geographySyncService.setInMemoryCatalog(mockCatalog);

    const res = await app.inject({ method: 'GET', url: '/api/v1/places/' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.total, 2);
    const unverified = body.places.find((p: CampusPlace) => p.name === 'New Student Kiosk');
    assert.ok(unverified);
    assert.equal(unverified.verification_state, 'UNVERIFIED');
  });

  await t.test('6. Category filtering by slug, name, and case-insensitivity', async () => {
    const mockCatalog: CampusPlacesListResponse = {
      places: [
        createMockPlace({ name: 'Central Clinic', category_slug: 'health', category_name: 'Health & Medical' }),
        createMockPlace({ name: 'Lecture Hall A', category_slug: 'academic', category_name: 'Academic Facilities' }),
        createMockPlace({ name: 'Sports Complex', category_slug: 'sports', category_name: 'Sports & Recreation' }),
      ],
      total: 3,
      snapshot_age_seconds: 10,
      sync_status: 'HEALTHY',
    };
    geographySyncService.setInMemoryCatalog(mockCatalog);

    // Filter by slug
    const resSlug = await app.inject({ method: 'GET', url: '/api/v1/places/?category=health' });
    const bodySlug = JSON.parse(resSlug.payload);
    assert.equal(bodySlug.total, 1);
    assert.equal(bodySlug.places[0].name, 'Central Clinic');

    // Filter by category_name (case-insensitive)
    const resName = await app.inject({ method: 'GET', url: '/api/v1/places/?category=HEALTH%20%26%20MEDICAL' });
    const bodyName = JSON.parse(resName.payload);
    assert.equal(bodyName.total, 1);
    assert.equal(bodyName.places[0].name, 'Central Clinic');

    // Filter by slug uppercase
    const resUpper = await app.inject({ method: 'GET', url: '/api/v1/places/?category=ACADEMIC' });
    const bodyUpper = JSON.parse(resUpper.payload);
    assert.equal(bodyUpper.total, 1);
    assert.equal(bodyUpper.places[0].name, 'Lecture Hall A');
  });

  await t.test('7. Deterministic 6-Tier Relevance Ranking: All tiers in strict order', async () => {
    // We search for "lib"
    // Tier 1: Exact official-name match ("lib")
    // Tier 2: Exact alias match ("lib")
    // Tier 3: Prefix official-name match ("library ...")
    // Tier 4: Prefix alias match ("lib-wing")
    // Tier 5: Substring official-name match ("main lib building")
    // Tier 6: Substring alias match ("old-lib-corner")
    const mockCatalog: CampusPlacesListResponse = {
      places: [
        createMockPlace({ id: '00000000-0000-0000-0000-000000000006', name: 'Zeta Center', aliases: ['old-lib-corner'] }), // Tier 6
        createMockPlace({ id: '00000000-0000-0000-0000-000000000004', name: 'Gamma Hall', aliases: ['lib-wing'] }), // Tier 4
        createMockPlace({ id: '00000000-0000-0000-0000-000000000001', name: 'Lib', aliases: [] }), // Tier 1
        createMockPlace({ id: '00000000-0000-0000-0000-000000000005', name: 'Main Lib Building', aliases: [] }), // Tier 5
        createMockPlace({ id: '00000000-0000-0000-0000-000000000002', name: 'Alpha Hall', aliases: ['Lib'] }), // Tier 2
        createMockPlace({ id: '00000000-0000-0000-0000-000000000003', name: 'Library Complex', aliases: [] }), // Tier 3
        createMockPlace({ id: '00000000-0000-0000-0000-000000000099', name: 'Unrelated Hall', aliases: ['none'] }), // No match
      ],
      total: 7,
      snapshot_age_seconds: 10,
      sync_status: 'HEALTHY',
    };
    geographySyncService.setInMemoryCatalog(mockCatalog);

    const res = await app.inject({ method: 'GET', url: '/api/v1/places/?q=lib' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);

    assert.equal(body.total, 6, 'Should match exactly 6 places, excluding Unrelated Hall');
    const names = body.places.map((p: CampusPlace) => p.name);

    assert.deepEqual(names, [
      'Lib', // Tier 1: Exact official name
      'Alpha Hall', // Tier 2: Exact alias
      'Library Complex', // Tier 3: Prefix official name
      'Gamma Hall', // Tier 4: Prefix alias
      'Main Lib Building', // Tier 5: Substring official name
      'Zeta Center', // Tier 6: Substring alias
    ]);
  });

  await t.test('8. Alphabetical tie-breaking within the same ranking tier', async () => {
    // Both prefix matches on "hall"
    const mockCatalog: CampusPlacesListResponse = {
      places: [
        createMockPlace({ name: 'Hall C' }),
        createMockPlace({ name: 'Hall A' }),
        createMockPlace({ name: 'Hall B' }),
      ],
      total: 3,
      snapshot_age_seconds: 10,
      sync_status: 'HEALTHY',
    };
    geographySyncService.setInMemoryCatalog(mockCatalog);

    const res = await app.inject({ method: 'GET', url: '/api/v1/places/?q=hall' });
    const body = JSON.parse(res.payload);
    const names = body.places.map((p: CampusPlace) => p.name);
    assert.deepEqual(names, ['Hall A', 'Hall B', 'Hall C']);
  });

  await t.test('9. Limit parameter restricts returned count while total preserves match count', async () => {
    const mockCatalog: CampusPlacesListResponse = {
      places: [
        createMockPlace({ name: 'Block A' }),
        createMockPlace({ name: 'Block B' }),
        createMockPlace({ name: 'Block C' }),
        createMockPlace({ name: 'Block D' }),
      ],
      total: 4,
      snapshot_age_seconds: 10,
      sync_status: 'HEALTHY',
    };
    geographySyncService.setInMemoryCatalog(mockCatalog);

    const res = await app.inject({ method: 'GET', url: '/api/v1/places/?limit=2' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.places.length, 2, 'Should return exactly 2 items');
    assert.equal(body.total, 4, 'Total must reflect total matches before limit');
    assert.equal(body.places[0].name, 'Block A');
    assert.equal(body.places[1].name, 'Block B');
  });

  await t.test('10. Invalid query parameters return HTTP 400 VALIDATION_ERROR', async () => {
    // limit exceeds 200
    const resLimitHigh = await app.inject({ method: 'GET', url: '/api/v1/places/?limit=250' });
    assert.equal(resLimitHigh.statusCode, 400);
    assert.equal(JSON.parse(resLimitHigh.payload).error.code, 'VALIDATION_ERROR');

    // limit < 1
    const resLimitLow = await app.inject({ method: 'GET', url: '/api/v1/places/?limit=0' });
    assert.equal(resLimitLow.statusCode, 400);

    // q > 80 chars
    const resQLong = await app.inject({ method: 'GET', url: `/api/v1/places/?q=${'x'.repeat(85)}` });
    assert.equal(resQLong.statusCode, 400);
  });

  await t.test('11. Degraded and Stale HTTP headers', async () => {
    const mockCatalog: CampusPlacesListResponse = {
      places: [createMockPlace({ name: 'Test Place' })],
      total: 1,
      snapshot_age_seconds: 10,
      sync_status: 'DEGRADED',
    };

    // Degraded state: should emit X-Geography-Degraded, but NOT X-Geography-Stale
    geographySyncService.setInMemoryCatalog(mockCatalog, new Date());
    const resDegraded = await app.inject({ method: 'GET', url: '/api/v1/places/' });
    assert.equal(resDegraded.statusCode, 200);
    assert.equal(resDegraded.headers['x-geography-degraded'], 'true');
    assert.equal(resDegraded.headers['x-geography-stale'], undefined);

    // Stale state: age > 7200 seconds -> dynamic STALE status
    const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000);
    geographySyncService.setInMemoryCatalog(mockCatalog, threeHoursAgo);
    const resStale = await app.inject({ method: 'GET', url: '/api/v1/places/' });
    assert.equal(resStale.statusCode, 200);
    assert.equal(resStale.headers['x-geography-stale'], 'true');
  });

  await t.test('12. /health/ready probe reflects database connection and dynamic geography snapshot state', async () => {
    const mockCatalog: CampusPlacesListResponse = {
      places: [createMockPlace({ name: 'Test Place' })],
      total: 1,
      snapshot_age_seconds: 10,
      sync_status: 'HEALTHY',
    };
    geographySyncService.setInMemoryCatalog(mockCatalog, new Date());

    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.status, 'ready');
    assert.equal(body.database, 'connected');
    assert.ok(body.geography);
    assert.equal(body.geography.status, 'HEALTHY');
    assert.equal(body.geography.record_count, 1);
  });
});
