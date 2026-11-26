/* global exports */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    -- 1. Singleton table for persistent campus geography snapshots & distributed lease
    CREATE TABLE IF NOT EXISTS campus_geography_snapshots (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload JSONB NOT NULL,
      etag_hash VARCHAR(64) NOT NULL,
      record_count INTEGER NOT NULL DEFAULT 0,
      sync_status VARCHAR(20) NOT NULL DEFAULT 'FAILED' CHECK (sync_status IN ('HEALTHY', 'DEGRADED', 'STALE', 'FAILED')),
      last_sync_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_successful_sync_at TIMESTAMPTZ NULL,
      -- Mandatory Safeguard: Lease Ownership Fencing
      lease_token VARCHAR(64) NULL,
      lease_version BIGINT NOT NULL DEFAULT 0,
      lease_holder_id VARCHAR(128) NULL,
      lease_acquired_at TIMESTAMPTZ NULL,
      lease_expires_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Ensure last_successful_sync_at allows NULL if table already existed
    ALTER TABLE campus_geography_snapshots ALTER COLUMN last_successful_sync_at DROP NOT NULL;

    -- 2. Seed initial singleton row if not exists with safe fallback baseline
    INSERT INTO campus_geography_snapshots (
      id,
      payload,
      etag_hash,
      record_count,
      sync_status,
      last_sync_attempt_at,
      last_successful_sync_at,
      lease_version
    ) VALUES (
      1,
      '{"places":[],"total":0,"snapshot_age_seconds":0,"sync_status":"FAILED"}',
      'initial-seed-baseline',
      0,
      'FAILED',
      CURRENT_TIMESTAMP,
      NULL,
      0
    ) ON CONFLICT (id) DO NOTHING;

    -- 3. Idempotent fixup: If baseline row was previously seeded with HEALTHY and 0 records, fix it
    UPDATE campus_geography_snapshots
    SET 
      sync_status = 'FAILED',
      last_successful_sync_at = NULL,
      payload = '{"places":[],"total":0,"snapshot_age_seconds":0,"sync_status":"FAILED"}'
    WHERE id = 1 
      AND etag_hash = 'initial-seed-baseline' 
      AND record_count = 0;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS campus_geography_snapshots;
  `);
};
