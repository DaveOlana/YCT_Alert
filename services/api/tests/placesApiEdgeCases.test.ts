import test from 'node:test';
import assert from 'node:assert/strict';
import { CampusPlace, CampusPlacesListResponse } from '@yctalert/contracts';
import { geographySyncService } from '../src/services/geographySyncService.js';
import { initPool, getPool, closePool } from '../src/db/pool.js';
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

function createMockPlace(overrides?: Partial<CampusPlace>): CampusPlace {
  return {
    id: overrides?.id || '00000000-0000-0000-0000-000000000001',
    name: overrides?.name || 'Sample Hall',
    category_slug: overrides?.category_slug || 'academic',
    category_name: overrides?.category_name || 'Academic Buildings',
    coordinates: overrides?.coordinates || { latitude: 6.518, longitude: 3.372 },
    primary_entrance: overrides?.primary_entrance ?? null,
    verification_state: overrides?.verification_state || 'VERIFIED',
    aliases: overrides?.aliases || [],
    is_active: overrides?.is_active ?? true,
  };
}

test('G3.2 Edge Cases & Readiness Resilience Test Suite', async (t) => {
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

  await t.test('Test 1 — Initialized Empty Geography Snapshot returns 200 with empty list', async () => {
    // 1. Initialize catalogue successfully with zero places
    const emptyCatalog: CampusPlacesListResponse = {
      places: [],
      total: 0,
      snapshot_age_seconds: 5,
      sync_status: 'HEALTHY',
    };
    geographySyncService.setInMemoryCatalog(emptyCatalog, new Date());

    // 2. Inject request into GET /api/v1/places/
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/places/',
    });

    // 3. Assert HTTP 200 and valid empty structure
    assert.equal(res.statusCode, 200, 'Initialized empty catalogue must return 200 OK');
    assert.notEqual(res.statusCode, 503, 'Must NOT be treated as uninitialized 503');
    assert.equal(res.headers['cache-control'], 'public, max-age=30, stale-while-revalidate=120');

    const body = JSON.parse(res.payload);
    assert.deepEqual(body.places, []);
    assert.equal(body.total, 0);
    assert.equal(body.sync_status, 'HEALTHY');
  });

  await t.test('Test 2 — Database Disconnection causes /health/ready to return 503', async () => {
    // Non-destructively mock pool.query to simulate database failure during isDatabaseConnected()
    const pool = getPool();
    const originalQuery = pool.query.bind(pool);

    pool.query = (async (text: unknown, params?: unknown[]) => {
      if (typeof text === 'string' && text.includes('SELECT 1')) {
        throw new Error('Simulated database network disconnection');
      }
      return originalQuery(text as any, params);
    }) as typeof pool.query;

    try {
      const res = await app.inject({
        method: 'GET',
        url: '/health/ready',
      });

      assert.equal(res.statusCode, 503, 'Database failure must return HTTP 503 on readiness');
      const body = JSON.parse(res.payload);
      assert.equal(body.status, 'not_ready');
      assert.equal(body.database, 'disconnected');
    } finally {
      // Restore original pool.query immediately to guarantee test isolation
      pool.query = originalQuery;
    }
  });

  await t.test('Test 3 — Geography Failure Does Not Fail Readiness (/health/ready returns 200)', async () => {
    // State A: Uninitialized geography snapshot (null)
    geographySyncService.setInMemoryCatalog(null);

    const resUninit = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    assert.equal(resUninit.statusCode, 200, 'Uninitialized geography must NOT fail readiness probe');
    const bodyUninit = JSON.parse(resUninit.payload);
    assert.equal(bodyUninit.status, 'ready');
    assert.equal(bodyUninit.database, 'connected');
    assert.equal(bodyUninit.geography.status, 'UNINITIALIZED');
    assert.equal(bodyUninit.geography.record_count, 0);
    assert.equal(bodyUninit.geography.snapshot_age_seconds, null);

    // State B: Initialized snapshot in FAILED state (e.g. baseline or degraded sync)
    const failedCatalog: CampusPlacesListResponse = {
      places: [],
      total: 0,
      snapshot_age_seconds: 0,
      sync_status: 'FAILED',
    };
    geographySyncService.setInMemoryCatalog(failedCatalog, null);

    const resFailed = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    assert.equal(resFailed.statusCode, 200, 'FAILED geography sync must NOT fail readiness probe');
    const bodyFailed = JSON.parse(resFailed.payload);
    assert.equal(bodyFailed.status, 'ready');
    assert.equal(bodyFailed.database, 'connected');
    assert.equal(bodyFailed.geography.status, 'FAILED');
    assert.equal(bodyFailed.geography.record_count, 0);
  });

  await t.test('Test 4 — Places Route Rate Limiting enforces 300 req/min limit', async () => {
    // Warm catalog with an active place
    const mockCatalog: CampusPlacesListResponse = {
      places: [createMockPlace({ name: 'Rate Limited Building' })],
      total: 1,
      snapshot_age_seconds: 10,
      sync_status: 'HEALTHY',
    };
    geographySyncService.setInMemoryCatalog(mockCatalog, new Date());

    // Use an isolated dedicated IP to avoid cross-test pollution
    const isolatedIp = '198.51.100.42';

    // 1. Send 300 allowed requests in rapid succession
    for (let i = 1; i <= 300; i++) {
      const allowedRes = await app.inject({
        method: 'GET',
        url: '/api/v1/places/',
        remoteAddress: isolatedIp,
      });
      assert.equal(allowedRes.statusCode, 200, `Request #${i} within 300 limit must return 200 OK`);
    }

    // 2. Request 301 must exceed rate limit threshold and receive HTTP 429
    const blockedRes = await app.inject({
      method: 'GET',
      url: '/api/v1/places/',
      remoteAddress: isolatedIp,
    });

    assert.equal(blockedRes.statusCode, 429, 'Request #301 exceeding 300/min must be blocked with 429');
    const blockedBody = JSON.parse(blockedRes.payload);
    assert.equal(blockedBody.statusCode, 429);
    assert.equal(blockedBody.error, 'Too Many Requests');
    assert.equal(blockedBody.code, 'RATE_LIMIT_EXCEEDED');
    assert.ok(blockedBody.message?.includes('Rate limit exceeded'));

    // Check rate-limiting response headers
    assert.equal(String(blockedRes.headers['x-ratelimit-limit']), '300');
    assert.equal(String(blockedRes.headers['x-ratelimit-remaining']), '0');
  });
});
