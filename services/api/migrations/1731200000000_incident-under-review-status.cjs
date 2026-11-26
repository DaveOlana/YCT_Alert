/* global exports */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    -- 1. Update check constraint on incidents table to permit UNDER_REVIEW status
    ALTER TABLE incidents DROP CONSTRAINT IF EXISTS chk_incident_status;
    ALTER TABLE incidents ADD CONSTRAINT chk_incident_status CHECK (
        status IN ('PENDING', 'UNDER_REVIEW', 'ACTIVE', 'RESOLVED', 'REJECTED')
    );

    -- 2. Retroactively transition any already-claimed pending incidents to UNDER_REVIEW
    UPDATE incidents
    SET status = 'UNDER_REVIEW',
        updated_at = CURRENT_TIMESTAMP
    WHERE status = 'PENDING' AND assigned_admin_id IS NOT NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    -- Revert any UNDER_REVIEW incidents back to PENDING before tightening constraint
    UPDATE incidents
    SET status = 'PENDING',
        updated_at = CURRENT_TIMESTAMP
    WHERE status = 'UNDER_REVIEW';

    ALTER TABLE incidents DROP CONSTRAINT IF EXISTS chk_incident_status;
    ALTER TABLE incidents ADD CONSTRAINT chk_incident_status CHECK (
        status IN ('PENDING', 'ACTIVE', 'RESOLVED', 'REJECTED')
    );
  `);
};
