/* global exports */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    -- 1. Ensure last_successful_sync_at is nullable
    ALTER TABLE campus_geography_snapshots 
      ALTER COLUMN last_successful_sync_at DROP NOT NULL;

    -- 2. Idempotent baseline fixup: If baseline was seeded with HEALTHY and 0 records, transition to FAILED
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
  // Reversible no-op to preserve snapshot state
  pgm.sql(`SELECT 1;`);
};
