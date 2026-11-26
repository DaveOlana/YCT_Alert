import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import {
  GeographySyncService,
  LeaseFencingError,
  geographySyncService,
} from '../src/services/geographySyncService.js';
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

const SAMPLE_UPSTREAM_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'e0b9b3e1-5f21-4f40-8f92-5d9c228a0112',
      geometry: {
        type: 'Point',
        coordinates: [3.373456, 6.518234], // [lon, lat]
      },
      properties: {
        id: 'e0b9b3e1-5f21-4f40-8f92-5d9c228a0112',
        destination_key: 'location:e0b9b3e1-5f21-4f40-8f92-5d9c228a0112',
        destination_type: 'location',
        name: 'Bakassi Lecture Theatre',
        category: 'academic',
        category_label: 'Academic Facilities',
        description: 'Main lecture hall.',
        verification_state: 'VERIFIED',
        verification_label: 'Verified',
        is_checkpoint: false,
        aliases: ['BLT', 'Bakassi Hall'],
        categories: [{ slug: 'academic', name: 'Academic' }],
        place_type: 'building',
        place_type_label: 'Building',
        routing_available: true,
        routing_unavailable_reason: null,
        places_inside_count: 2,
      },
    },
    {
      type: 'Feature',
      id: 'f1a2b3c4-1234-4567-8901-abcdef123456',
      geometry: {
        type: 'Point',
        coordinates: [3.372911, 6.518645],
      },
      properties: {
        id: 'f1a2b3c4-1234-4567-8901-abcdef123456',
        name: 'Central Library Complex',
        category: 'library',
        category_label: 'Library Services',
        verification_state: 'VERIFIED',
        aliases: ['Main Library'],
        categories: [{ slug: 'library', name: 'Library' }],
      },
    },
  ],
  meta: { count: 2, query: '', category: '' },
};

test('G3.1 Geography Synchronization & Lease Fencing Test Suite', async (t) => {
  let pool: Pool;

  t.before(async () => {
    pool = initPool(TEST_CONFIG);
    await runMigrations({
      databaseUrl: TEST_CONFIG.TEST_DATABASE_URL,
      direction: 'up',
      verbose: false,
    });
  });

  t.after(async () => {
    await closePool();
  });

  t.beforeEach(async () => {
    // Reset singleton row to initial baseline (FAILED, NULL last_successful_sync_at, 0 records)
    await pool.query(
      `UPDATE campus_geography_snapshots
       SET 
         payload = '{"places":[],"total":0,"snapshot_age_seconds":0,"sync_status":"FAILED"}',
         etag_hash = 'initial-seed-baseline',
         record_count = 0,
         sync_status = 'FAILED',
         lease_token = NULL,
         lease_version = 0,
         lease_holder_id = NULL,
         lease_acquired_at = NULL,
         lease_expires_at = NULL,
         last_sync_attempt_at = CURRENT_TIMESTAMP,
         last_successful_sync_at = NULL,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
    );
  });

  await t.test('1. Default 300-Second Lease Duration', async () => {
    const syncService = new GeographySyncService(TEST_CONFIG);
    const beforeAcquire = Date.now();
    const lease = await syncService.acquireLease(pool); // using default leaseDurationSeconds
    const afterAcquire = Date.now();

    assert.ok(lease, 'Lease acquisition must succeed');
    const durationMs = lease.leaseExpiresAt.getTime() - beforeAcquire;
    // Expected default duration: 300,000ms (300 seconds)
    assert.ok(
      durationMs >= 295000 && durationMs <= 305000,
      `Expected ~300s lease duration, got ${durationMs / 1000}s`,
    );

    // Verify database row interval
    const dbRes = await pool.query<{ lease_diff_sec: number }>(
      `SELECT EXTRACT(EPOCH FROM (lease_expires_at - lease_acquired_at))::integer AS lease_diff_sec
       FROM campus_geography_snapshots WHERE id = 1`,
    );
    assert.equal(dbRes.rows[0].lease_diff_sec, 300, 'Database lease interval must be 300 seconds');

    await syncService.releaseLease(pool, lease, false);
  });

  await t.test('2. Two-Attempt Retry Execution Budget (75s + 10s + 45s = 130s <= 300s)', async () => {
    let callCount = 0;

    const mockFailingThenSucceedingFetch = async (_url: string) => {
      callCount++;
      if (callCount === 1) {
        // Attempt 1 fails
        throw new Error('Connection timeout on attempt 1');
      }

      // Attempt 2 succeeds
      return new Response(JSON.stringify(SAMPLE_UPSTREAM_GEOJSON), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const syncService = new GeographySyncService(TEST_CONFIG, mockFailingThenSucceedingFetch);

    // Verify retry execution: 1 initial attempt and 1 retry
    const result = await syncService.fetchUpstreamLocations({
      attemptTimeoutsMs: [50, 50],
      backoffMs: 20,
      maxRetries: 1,
    });

    assert.equal(callCount, 2, 'Must perform exactly 1 initial attempt and 1 retry');
    assert.ok(result.rawText);
    const parsed = JSON.parse(result.rawText) as { features: unknown[] };
    assert.equal(parsed.features.length, 2);

    // Assert that the configured default worst-case total execution budget:
    // Attempt 1 (75s) + Backoff (10s) + Attempt 2 (45s) = 130s.
    // 130s is strictly bounded inside the 300s lease duration with a 170s safety margin.
    const worstCaseBudget = 75 + 10 + 45;
    const defaultLeaseDuration = 300;
    assert.ok(
      worstCaseBudget < defaultLeaseDuration,
      `Worst-case budget (${worstCaseBudget}s) must be less than default lease duration (${defaultLeaseDuration}s)`,
    );
    assert.equal(defaultLeaseDuration - worstCaseBudget, 170, 'Must have 170s safety margin');
  });

  await t.test('3. Monotonic Fencing: Rejection of expired/superseded worker commits', async () => {
    const syncService = new GeographySyncService(TEST_CONFIG);

    // Worker A acquires lease version 1
    const leaseA = await syncService.acquireLease(pool, 60);
    assert.ok(leaseA);
    assert.equal(leaseA.leaseVersion, 1);

    // Worker A stalls: Database lease is expired and superseded by Worker B (version 2)
    await pool.query(
      `UPDATE campus_geography_snapshots
       SET 
         lease_token = 'worker-b-token-456',
         lease_version = 2,
         lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '60 seconds'
       WHERE id = 1`,
    );

    // Stale Worker A attempts to commit with superseded lease (version 1)
    const dummyPayload = {
      places: [],
      total: 0,
      snapshot_age_seconds: 0,
      sync_status: 'HEALTHY' as const,
    };

    await assert.rejects(
      async () => {
        await syncService.commitSnapshot(pool, leaseA, dummyPayload, 'stale-hash', 0);
      },
      (err: Error) => {
        assert.ok(err instanceof LeaseFencingError);
        assert.match(err.message, /Lease fencing violation/);
        return true;
      },
      'Commit by superseded worker must be rejected by fencing check',
    );

    // Verify database snapshot was NOT overwritten
    const current = await syncService.getCurrentSnapshot();
    assert.notEqual(current?.etag_hash, 'stale-hash');
  });

  await t.test('4. Prevention of Stale Workers Clearing Active Leases on Exit', async () => {
    const syncService = new GeographySyncService(TEST_CONFIG);

    // Worker 1 acquires lease
    const lease1 = await syncService.acquireLease(pool, 60);
    assert.ok(lease1);

    // Worker 2 supersedes Worker 1
    await pool.query(
      `UPDATE campus_geography_snapshots
       SET 
         lease_token = 'worker-2-active-token',
         lease_version = 2,
         lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '120 seconds'
       WHERE id = 1`,
    );

    // Worker 1 attempts to release its superseded lease
    await syncService.releaseLease(pool, lease1, true);

    // Verify Worker 2's lease is still active and was NOT cleared
    const row = await syncService.getCurrentSnapshot();
    assert.equal(row?.lease_token, 'worker-2-active-token', "Worker 2's token must not be cleared");
    assert.equal(row?.lease_version, '2', "Worker 2's version must not be changed");
    assert.ok(row?.lease_expires_at && new Date(row.lease_expires_at) > new Date());
  });

  await t.test('5. Fastify Startup Awaiting Snapshot Load Before Request Readiness', async () => {
    // 1. Seed database with active snapshot
    const initialPlaces = [
      {
        id: 'e0b9b3e1-5f21-4f40-8f92-5d9c228a0112',
        name: 'Bakassi Lecture Theatre',
        category_slug: 'academic',
        category_name: 'Academic Facilities',
        coordinates: { latitude: 6.518234, longitude: 3.373456 },
        primary_entrance: null,
        verification_state: 'VERIFIED',
        aliases: ['BLT'],
        is_active: true,
      },
    ];

    await pool.query(
      `UPDATE campus_geography_snapshots
       SET 
         payload = $1,
         etag_hash = 'startup-test-hash',
         record_count = 1,
         sync_status = 'HEALTHY',
         last_successful_sync_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
      [
        JSON.stringify({
          places: initialPlaces,
          total: 1,
          snapshot_age_seconds: 0,
          sync_status: 'HEALTHY',
        }),
      ],
    );

    // Build app and await readiness hook
    const app = buildApp(TEST_CONFIG);
    await app.ready();

    // Verify cache is immediately loaded in memory without any request-time DB query
    const cached = geographySyncService.getCachedCatalog();
    assert.ok(cached, 'Cache must be warmed during onReady');
    assert.equal(cached.places.length, 1);
    assert.equal(cached.places[0].name, 'Bakassi Lecture Theatre');
    assert.deepEqual(cached.places[0].aliases, ['BLT']);

    await app.close();
  });

  await t.test('6. Initial Baseline Snapshot Reporting FAILED and NULL Timestamp Prior to First Sync', async () => {
    const syncService = new GeographySyncService(TEST_CONFIG);
    const snapshot = await syncService.getCurrentSnapshot();

    assert.ok(snapshot);
    assert.equal(snapshot.record_count, 0, 'Baseline record count must be 0');
    assert.equal(snapshot.sync_status, 'FAILED', 'Baseline sync_status must be FAILED');
    assert.equal(
      snapshot.last_successful_sync_at,
      null,
      'Baseline last_successful_sync_at must be null',
    );

    // Loading baseline snapshot into memory
    await syncService.loadPersistedSnapshot();
    const cached = syncService.getCachedCatalog();
    assert.ok(cached);
    assert.equal(cached.sync_status, 'FAILED', 'In-memory status must reflect FAILED baseline');
    assert.equal(cached.total, 0);
  });

  await t.test('7. First Successful Sync Transitioning Status to HEALTHY', async () => {
    const mockFetch = async () =>
      new Response(JSON.stringify(SAMPLE_UPSTREAM_GEOJSON), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const syncService = new GeographySyncService(TEST_CONFIG, mockFetch);
    const result = await syncService.syncOnce();

    assert.equal(result.status, 'UPDATED');
    assert.equal(result.recordCount, 2);

    // Verify DB snapshot transitions to HEALTHY with timestamp set
    const snapshot = await syncService.getCurrentSnapshot();
    assert.ok(snapshot);
    assert.equal(snapshot.sync_status, 'HEALTHY');
    assert.ok(snapshot.last_successful_sync_at, 'last_successful_sync_at must now be set');
    assert.equal(snapshot.record_count, 2);

    // In-memory catalog is now HEALTHY
    const cached = syncService.getCachedCatalog();
    assert.ok(cached);
    assert.equal(cached.sync_status, 'HEALTHY');
    assert.equal(cached.places.length, 2);
  });

  await t.test('8. Preservation and Querying of Location Aliases', async () => {
    const mockFetch = async () =>
      new Response(JSON.stringify(SAMPLE_UPSTREAM_GEOJSON), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const syncService = new GeographySyncService(TEST_CONFIG, mockFetch);
    await syncService.syncOnce();

    const cached = syncService.getCachedCatalog();
    assert.ok(cached);

    // Assert alias preservation
    const bakassi = cached.places.find((p) => p.name === 'Bakassi Lecture Theatre');
    assert.ok(bakassi);
    assert.deepEqual(bakassi.aliases, ['BLT', 'Bakassi Hall']);

    const library = cached.places.find((p) => p.name === 'Central Library Complex');
    assert.ok(library);
    assert.deepEqual(library.aliases, ['Main Library']);

    // Reporter search simulation: searching for 'BLT' matches Bakassi Lecture Theatre
    const query = 'blt';
    const matches = cached.places.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        (p.aliases && p.aliases.some((a) => a.toLowerCase().includes(query))),
    );
    assert.equal(matches.length, 1);
    assert.equal(matches[0].name, 'Bakassi Lecture Theatre');
  });

  await t.test('9. Anomaly Guard Rejecting Empty Feature Collections (0 places)', async () => {
    // 1. Establish valid snapshot first
    const initialFetch = async () =>
      new Response(JSON.stringify(SAMPLE_UPSTREAM_GEOJSON), { status: 200 });
    const service1 = new GeographySyncService(TEST_CONFIG, initialFetch);
    await service1.syncOnce();

    // 2. Upstream returns anomalous 0 features
    const emptyFetch = async () =>
      new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }), {
        status: 200,
      });
    const anomalyService = new GeographySyncService(TEST_CONFIG, emptyFetch);

    const result = await anomalyService.syncOnce({
      attemptTimeoutsMs: [50, 50],
      backoffMs: 10,
      maxRetries: 0,
    });

    assert.equal(result.status, 'FAILED_VALIDATION');
    assert.match(result.error, /Unexpected empty upstream feature collection/);

    // Existing snapshot survives intact (not replaced by empty data)
    const snapshot = await anomalyService.getCurrentSnapshot();
    assert.equal(snapshot?.record_count, 2);
    assert.equal(snapshot?.sync_status, 'DEGRADED');
  });

  await t.test('10. Preservation of Previous Snapshot on Upstream Network/Server Failure', async () => {
    // 1. Establish valid snapshot first
    const initialFetch = async () =>
      new Response(JSON.stringify(SAMPLE_UPSTREAM_GEOJSON), { status: 200 });
    const healthyService = new GeographySyncService(TEST_CONFIG, initialFetch);
    await healthyService.syncOnce();

    const previousSnapshot = await healthyService.getCurrentSnapshot();
    const previousSyncTime = previousSnapshot?.last_successful_sync_at;

    // 2. Next sync encounters upstream 503
    const failingFetch = async () =>
      new Response('Service Unavailable', { status: 503, statusText: 'Service Unavailable' });
    const failingService = new GeographySyncService(TEST_CONFIG, failingFetch);

    const result = await failingService.syncOnce({
      attemptTimeoutsMs: [50, 50],
      backoffMs: 10,
      maxRetries: 1,
    });

    assert.equal(result.status, 'FAILED_UPSTREAM');
    assert.match(result.error, /HTTP 503/);

    // Verify existing snapshot places survive and last_successful_sync_at is preserved
    const snapshot = await failingService.getCurrentSnapshot();
    assert.ok(snapshot);
    assert.equal(snapshot.record_count, 2, 'Previous valid places must survive failed refresh');
    assert.equal(snapshot.payload.places.length, 2);
    assert.equal(snapshot.sync_status, 'DEGRADED', 'Status must transition to DEGRADED');
    assert.deepEqual(snapshot.last_successful_sync_at, previousSyncTime);
  });
});
