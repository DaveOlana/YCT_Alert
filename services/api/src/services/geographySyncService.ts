import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  CampusPlacesListResponse,
  CampusPlacesListResponseSchema,
  CampusPlacesQuery,
  CampusPlace,
  SyncStatus,
  YctMapLocationsUpstreamSchema,
  normalizeUpstreamPlace,
} from '@yctalert/contracts';
import { getPool } from '../db/pool.js';
import type { Environment } from '../config.js';

export interface LeaseState {
  leaseToken: string;
  leaseVersion: number;
  leaseExpiresAt: Date;
}

export class LeaseFencingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LeaseFencingError';
  }
}

export type SyncResult =
  | { status: 'UPDATED'; recordCount: number; etagHash: string }
  | { status: 'NO_CHANGE'; recordCount: number; etagHash: string }
  | { status: 'SKIPPED_ACTIVE_LEASE'; message: string }
  | { status: 'FAILED_UPSTREAM'; error: string }
  | { status: 'FAILED_VALIDATION'; error: string }
  | { status: 'FAILED_FENCING'; error: string };

export interface PersistedSnapshotRow {
  id: number;
  payload: CampusPlacesListResponse;
  etag_hash: string;
  record_count: number;
  sync_status: SyncStatus;
  last_sync_attempt_at: Date;
  last_successful_sync_at: Date | null;
  lease_token: string | null;
  lease_version: string | number;
  lease_holder_id: string | null;
  lease_acquired_at: Date | null;
  lease_expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type FetchFunction = (url: string, init?: RequestInit) => Promise<Response>;

export class GeographySyncService {
  private inMemoryCatalog: CampusPlacesListResponse | null = null;
  private lastSuccessfulSyncTime: Date | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private isSyncRunning: boolean = false;
  private readonly holderId: string;
  private baseUrl: string;
  private syncIntervalMinutes: number;
  private readonly fetchFn: FetchFunction;

  constructor(
    config?: Partial<Environment>,
    customFetch?: FetchFunction,
  ) {
    this.holderId = `${process.env.HOSTNAME || 'localhost'}:${process.pid}:${crypto.randomBytes(4).toString('hex')}`;
    this.baseUrl = (config?.YCT_MAP_BASE_URL || 'https://yct-map.onrender.com').replace(/\/+$/, '');
    this.syncIntervalMinutes = config?.GEOGRAPHY_SYNC_INTERVAL_MINUTES ?? 15;
    this.fetchFn = customFetch || globalThis.fetch;
  }

  /**
   * Reconfigure service dynamically (e.g. at app build time from Environment).
   */
  configure(config?: Partial<Environment>): void {
    if (config?.YCT_MAP_BASE_URL) {
      this.baseUrl = config.YCT_MAP_BASE_URL.replace(/\/+$/, '');
    }
    if (config?.GEOGRAPHY_SYNC_INTERVAL_MINUTES !== undefined) {
      this.syncIntervalMinutes = config.GEOGRAPHY_SYNC_INTERVAL_MINUTES;
    }
  }

  /**
   * Return the configured upstream YCT Map base URL.
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Acquire distributed lease with monotonically increasing fencing version.
   * If a valid, non-expired lease is already held by any worker, acquisition returns null.
   */
  async acquireLease(
    clientOrPool: Pool | PoolClient,
    leaseDurationSeconds: number = 300,
  ): Promise<LeaseState | null> {
    const newToken = crypto.randomUUID();
    const result = await clientOrPool.query<{
      lease_token: string;
      lease_version: string | number;
      lease_expires_at: Date;
    }>(
      `UPDATE campus_geography_snapshots
       SET 
         lease_token = $1,
         lease_version = lease_version + 1,
         lease_holder_id = $2,
         lease_acquired_at = CURRENT_TIMESTAMP,
         lease_expires_at = CURRENT_TIMESTAMP + ($3::text || ' seconds')::INTERVAL,
         last_sync_attempt_at = CURRENT_TIMESTAMP
       WHERE id = 1
         AND (lease_expires_at IS NULL OR lease_expires_at < CURRENT_TIMESTAMP)
       RETURNING lease_token, lease_version, lease_expires_at`,
      [newToken, this.holderId, leaseDurationSeconds],
    );

    if (result.rowCount === 0 || !result.rows[0]) {
      return null;
    }

    const row = result.rows[0];
    return {
      leaseToken: row.lease_token,
      leaseVersion: Number(row.lease_version),
      leaseExpiresAt: new Date(row.lease_expires_at),
    };
  }

  /**
   * Commit a newly ingested snapshot to the database.
   * Enforces mandatory lease ownership fencing:
   * 1. Committing worker must hold the exact leaseToken.
   * 2. Committing worker must hold the exact leaseVersion.
   * 3. Lease must not have expired.
   * If fencing check fails, an error is thrown and no data is written.
   */
  async commitSnapshot(
    clientOrPool: Pool | PoolClient,
    lease: LeaseState,
    payload: CampusPlacesListResponse,
    etagHash: string,
    recordCount: number,
  ): Promise<void> {
    const result = await clientOrPool.query(
      `UPDATE campus_geography_snapshots
       SET 
         payload = $1,
         etag_hash = $2,
         record_count = $3,
         sync_status = 'HEALTHY',
         last_successful_sync_at = CURRENT_TIMESTAMP,
         lease_token = NULL,
         lease_holder_id = NULL,
         lease_expires_at = NULL,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = 1
         AND lease_token = $4
         AND lease_version = $5
         AND lease_expires_at > CURRENT_TIMESTAMP
       RETURNING id`,
      [JSON.stringify(payload), etagHash, recordCount, lease.leaseToken, lease.leaseVersion],
    );

    if (result.rowCount === 0) {
      throw new LeaseFencingError(
        `Lease fencing violation: worker lease (version ${lease.leaseVersion}) expired or was superseded. Snapshot commit rejected.`,
      );
    }

    this.inMemoryCatalog = payload;
    this.lastSuccessfulSyncTime = new Date();
  }

  /**
   * Release lease on non-committing exit (e.g. identical payload, upstream error).
   * Verified against the leaseToken and leaseVersion so stale workers never clear newer leases.
   */
  async releaseLease(
    clientOrPool: Pool | PoolClient,
    lease: LeaseState,
    isFailure: boolean = false,
  ): Promise<void> {
    await clientOrPool.query(
      `UPDATE campus_geography_snapshots
       SET 
         lease_token = NULL,
         lease_holder_id = NULL,
         lease_expires_at = NULL,
         sync_status = CASE 
           WHEN $1::boolean THEN 
             CASE WHEN last_successful_sync_at IS NULL THEN 'FAILED' ELSE 'DEGRADED' END
           ELSE sync_status 
         END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = 1
         AND lease_token = $2
         AND lease_version = $3
         AND lease_expires_at > CURRENT_TIMESTAMP`,
      [isFailure, lease.leaseToken, lease.leaseVersion],
    );
  }

  /**
   * Query the persisted singleton row from the database.
   */
  async getCurrentSnapshot(clientOrPool?: Pool | PoolClient): Promise<PersistedSnapshotRow | null> {
    const client = clientOrPool || getPool();
    const result = await client.query<PersistedSnapshotRow>(
      `SELECT 
        id,
        payload,
        etag_hash,
        record_count,
        sync_status,
        last_sync_attempt_at,
        last_successful_sync_at,
        lease_token,
        lease_version,
        lease_holder_id,
        lease_acquired_at,
        lease_expires_at,
        created_at,
        updated_at
       FROM campus_geography_snapshots
       WHERE id = 1`,
    );

    if (result.rowCount === 0 || !result.rows[0]) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Load the active snapshot from PostgreSQL into memory.
   */
  async loadPersistedSnapshot(clientOrPool?: Pool | PoolClient): Promise<CampusPlacesListResponse | null> {
    const row = await this.getCurrentSnapshot(clientOrPool);
    if (row && row.payload && Array.isArray(row.payload.places)) {
      this.inMemoryCatalog = row.payload;
      this.lastSuccessfulSyncTime = row.last_successful_sync_at
        ? new Date(row.last_successful_sync_at)
        : null;
      return this.inMemoryCatalog;
    }
    return null;
  }

  /**
   * Fetch upstream GeoJSON with bounded timeouts:
   * Attempt 1: 75 seconds, Backoff: 10 seconds, Attempt 2: bounded to 45 seconds.
   * Total worst-case execution budget: 75s + 10s + 45s = 130 seconds.
   */
  async fetchUpstreamLocations(options?: {
    attemptTimeoutsMs?: number[];
    maxRetries?: number;
    backoffMs?: number;
  }): Promise<{ rawText: string; json: unknown }> {
    const url = `${this.baseUrl}/api/locations/`;
    let lastError: Error | null = null;
    const timeouts = options?.attemptTimeoutsMs ?? [75000, 45000];
    const maxRetries = options?.maxRetries ?? (timeouts.length - 1);
    const backoffMs = options?.backoffMs ?? 10000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }

      const timeoutMs = timeouts[attempt] ?? timeouts[timeouts.length - 1] ?? 45000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await this.fetchFn(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json, application/geo+json',
            'User-Agent': 'YCT-Alert-GeographySync/1.0',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Upstream YCT Map returned HTTP ${response.status}: ${response.statusText}`);
        }

        const rawText = await response.text();
        let json: unknown;
        try {
          json = JSON.parse(rawText);
        } catch {
          throw new Error('Upstream YCT Map response is not valid JSON.');
        }

        return { rawText, json };
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw lastError || new Error('Upstream YCT Map request failed after retries.');
  }

  /**
   * Execute a single synchronization lifecycle pass.
   */
  async syncOnce(options?: {
    attemptTimeoutsMs?: number[];
    maxRetries?: number;
    backoffMs?: number;
    leaseDurationSeconds?: number;
  }): Promise<SyncResult> {
    const pool = getPool();

    // 1. Acquire Distributed Lease (default 300 seconds)
    const lease = await this.acquireLease(pool, options?.leaseDurationSeconds ?? 300);
    if (!lease) {
      return {
        status: 'SKIPPED_ACTIVE_LEASE',
        message: 'A valid geography synchronization lease is currently active.',
      };
    }

    try {
      // 2. Fetch Upstream Data with Bounded Timeout & Retry (Attempt 1: 75s, Backoff: 10s, Attempt 2: 45s)
      let fetchResult: { rawText: string; json: unknown };
      try {
        fetchResult = await this.fetchUpstreamLocations({
          attemptTimeoutsMs: options?.attemptTimeoutsMs,
          maxRetries: options?.maxRetries,
          backoffMs: options?.backoffMs,
        });
      } catch (upstreamErr: unknown) {
        const errMsg = upstreamErr instanceof Error ? upstreamErr.message : String(upstreamErr);
        await this.releaseLease(pool, lease, true);
        return { status: 'FAILED_UPSTREAM', error: errMsg };
      }

      // 3. Schema Validation & Anomaly Guard
      const parseResult = YctMapLocationsUpstreamSchema.safeParse(fetchResult.json);
      if (!parseResult.success) {
        const errMsg = `Upstream schema validation failed: ${parseResult.error.message}`;
        await this.releaseLease(pool, lease, true);
        return { status: 'FAILED_VALIDATION', error: errMsg };
      }

      const upstreamFeatures = parseResult.data.features;
      // Anomaly detection: campus geography cannot have 0 places
      if (upstreamFeatures.length === 0) {
        const errMsg = 'Unexpected empty upstream feature collection (0 places). Snapshot preserved.';
        await this.releaseLease(pool, lease, true);
        return { status: 'FAILED_VALIDATION', error: errMsg };
      }

      // 4. SHA-256 Fingerprint Comparison
      const etagHash = crypto.createHash('sha256').update(fetchResult.rawText).digest('hex');
      const currentSnapshot = await this.getCurrentSnapshot(pool);

      if (currentSnapshot && currentSnapshot.etag_hash === etagHash) {
        // Data has not changed upstream
        await this.releaseLease(pool, lease, false);
        return {
          status: 'NO_CHANGE',
          recordCount: currentSnapshot.record_count,
          etagHash,
        };
      }

      // 5. Normalization Adapter
      const normalizedPlaces: CampusPlace[] = upstreamFeatures.map(normalizeUpstreamPlace);

      const newCatalog: CampusPlacesListResponse = {
        places: normalizedPlaces,
        total: normalizedPlaces.length,
        snapshot_age_seconds: 0,
        sync_status: 'HEALTHY',
      };

      // Ensure normalized payload validates against internal contract
      CampusPlacesListResponseSchema.parse(newCatalog);

      // 6. Commit Snapshot with Lease Fencing
      try {
        await this.commitSnapshot(pool, lease, newCatalog, etagHash, normalizedPlaces.length);
      } catch (fencingErr: unknown) {
        const errMsg = fencingErr instanceof Error ? fencingErr.message : String(fencingErr);
        return { status: 'FAILED_FENCING', error: errMsg };
      }

      return {
        status: 'UPDATED',
        recordCount: normalizedPlaces.length,
        etagHash,
      };
    } catch (err: unknown) {
      // Emergency lease release on unexpected error
      try {
        await this.releaseLease(pool, lease, true);
      } catch {
        // Ignore secondary error
      }
      throw err;
    }
  }

  /**
   * Start the background scheduled sync worker.
   */
  async startScheduledSync(): Promise<void> {
    if (this.syncTimer) {
      return;
    }

    // Trigger initial background sync non-blockingly
    this.syncOnce().catch((err) => {
      console.warn('[GeographySyncService] Initial background sync failed', err);
    });

    const intervalMs = Math.max(1, this.syncIntervalMinutes) * 60 * 1000;
    this.syncTimer = setInterval(() => {
      if (this.isSyncRunning) return;
      this.isSyncRunning = true;
      this.syncOnce()
        .catch((err) => {
          console.error('[GeographySyncService] Scheduled sync cycle error', err);
        })
        .finally(() => {
          this.isSyncRunning = false;
        });
    }, intervalMs);

    // Prevent sync timer from holding process open during test runs
    if (typeof this.syncTimer.unref === 'function') {
      this.syncTimer.unref();
    }
  }

  /**
   * Stop scheduled synchronization.
   */
  stopScheduledSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * Set in-memory catalog directly (primarily for testing and controlled initialization).
   */
  setInMemoryCatalog(
    catalog: CampusPlacesListResponse | null,
    syncTime: Date | null = new Date(),
  ): void {
    this.inMemoryCatalog = catalog;
    this.lastSuccessfulSyncTime = syncTime;
  }

  /**
   * Return the cached catalog with dynamic snapshot_age_seconds and status.
   */
  getCachedCatalog(): CampusPlacesListResponse | null {
    if (!this.inMemoryCatalog) {
      return null;
    }

    const ageSeconds = this.lastSuccessfulSyncTime
      ? Math.max(0, Math.floor((Date.now() - this.lastSuccessfulSyncTime.getTime()) / 1000))
      : 0;

    let syncStatus: SyncStatus = this.inMemoryCatalog.sync_status;
    if (this.lastSuccessfulSyncTime && ageSeconds > 7200) {
      // Stale if > 2 hours without successful sync
      syncStatus = 'STALE';
    }

    return {
      ...this.inMemoryCatalog,
      snapshot_age_seconds: ageSeconds,
      sync_status: syncStatus,
    };
  }

  /**
   * Query in-memory places with pre-filtering, 6-tier relevance ranking, and bounded pagination.
   */
  queryPlaces(options?: CampusPlacesQuery): CampusPlacesListResponse | null {
    if (!this.inMemoryCatalog) {
      return null;
    }

    const ageSeconds = this.lastSuccessfulSyncTime
      ? Math.max(0, Math.floor((Date.now() - this.lastSuccessfulSyncTime.getTime()) / 1000))
      : 0;

    let syncStatus: SyncStatus = this.inMemoryCatalog.sync_status;
    if (this.lastSuccessfulSyncTime && ageSeconds > 7200) {
      syncStatus = 'STALE';
    }

    // 1. Pre-filtering: Exclude inactive places (is_active === false)
    // Note: Active unverified places are preserved and included.
    let candidates = (this.inMemoryCatalog.places || []).filter((p) => p.is_active !== false);

    // 2. Category filter
    if (options?.category && options.category.trim().length > 0) {
      const cat = options.category.trim().toLowerCase();
      candidates = candidates.filter(
        (p) =>
          p.category_slug.toLowerCase() === cat ||
          p.category_name.toLowerCase() === cat,
      );
    }

    // 3. Search query filter and 6-tier relevance ranking
    let rankedPlaces: CampusPlace[];
    const searchTerm = options?.q?.trim().toLowerCase();

    if (searchTerm && searchTerm.length > 0) {
      interface ScoredCandidate {
        place: CampusPlace;
        tier: number;
      }

      const scored: ScoredCandidate[] = [];

      for (const place of candidates) {
        const nameLower = place.name.toLowerCase();
        const aliasesLower = (place.aliases || []).map((a) => a.toLowerCase());

        let tier: number | null = null;

        // Tier 1: Exact official-name match
        if (nameLower === searchTerm) {
          tier = 1;
        }
        // Tier 2: Exact alias match
        else if (aliasesLower.some((a) => a === searchTerm)) {
          tier = 2;
        }
        // Tier 3: Prefix official-name match
        else if (nameLower.startsWith(searchTerm)) {
          tier = 3;
        }
        // Tier 4: Prefix alias match
        else if (aliasesLower.some((a) => a.startsWith(searchTerm))) {
          tier = 4;
        }
        // Tier 5: Substring official-name match
        else if (nameLower.includes(searchTerm)) {
          tier = 5;
        }
        // Tier 6: Substring alias match
        else if (aliasesLower.some((a) => a.includes(searchTerm))) {
          tier = 6;
        }

        if (tier !== null) {
          scored.push({ place, tier });
        }
      }

      // Sort by tier ascending, then tie-break alphabetically by official name
      scored.sort((a, b) => {
        if (a.tier !== b.tier) {
          return a.tier - b.tier;
        }
        return a.place.name.localeCompare(b.place.name);
      });

      rankedPlaces = scored.map((s) => s.place);
    } else {
      // No query term: sort alphabetically by official name
      rankedPlaces = [...candidates].sort((a, b) => a.name.localeCompare(b.name));
    }

    // 4. Calculate total matches before limit
    const total = rankedPlaces.length;

    // 5. Slice according to limit (default 50, capped between 1 and 200)
    const limit = Math.min(200, Math.max(1, options?.limit ?? 50));
    const paginatedPlaces = rankedPlaces.slice(0, limit);

    return {
      places: paginatedPlaces,
      total,
      snapshot_age_seconds: ageSeconds,
      sync_status: syncStatus,
    };
  }
}

export const geographySyncService = new GeographySyncService();
