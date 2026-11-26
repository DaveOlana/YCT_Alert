/* global exports */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    -- Explicit Retention Purge Tracking for Incidents (Decision D-16)
    ALTER TABLE incidents ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ NULL;

    -- High-performance partial index for purge candidate filtering
    CREATE INDEX IF NOT EXISTS idx_incidents_retention_purge
    ON incidents (status, retention_hold, purged_at)
    WHERE purged_at IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_incidents_retention_purge;
    ALTER TABLE incidents DROP COLUMN IF EXISTS purged_at;
  `);
};
