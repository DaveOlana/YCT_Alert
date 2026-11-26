/* global exports */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    -- 1. Add coordinate override and consensus columns to incidents
    ALTER TABLE incidents
      ADD COLUMN IF NOT EXISTS admin_override_lat NUMERIC(9, 6) NULL,
      ADD COLUMN IF NOT EXISTS admin_override_lon NUMERIC(9, 6) NULL,
      ADD COLUMN IF NOT EXISTS admin_override_by UUID NULL REFERENCES admin_users(id),
      ADD COLUMN IF NOT EXISTS admin_override_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS admin_override_reason TEXT NULL,
      ADD COLUMN IF NOT EXISTS consensus_lat NUMERIC(9, 6) NULL,
      ADD COLUMN IF NOT EXISTS consensus_lon NUMERIC(9, 6) NULL,
      ADD COLUMN IF NOT EXISTS consensus_confidence VARCHAR(20) NULL,
      ADD COLUMN IF NOT EXISTS consensus_evaluated_at TIMESTAMPTZ NULL;

    -- 2. Geographic bounds constraints
    ALTER TABLE incidents DROP CONSTRAINT IF EXISTS chk_incidents_admin_override_bounds;
    ALTER TABLE incidents ADD CONSTRAINT chk_incidents_admin_override_bounds CHECK (
      (admin_override_lat IS NULL AND admin_override_lon IS NULL) OR
      (
        admin_override_lat IS NOT NULL AND admin_override_lon IS NOT NULL AND
        admin_override_lat >= -90.0 AND admin_override_lat <= 90.0 AND
        admin_override_lon >= -180.0 AND admin_override_lon <= 180.0
      )
    );

    ALTER TABLE incidents DROP CONSTRAINT IF EXISTS chk_incidents_consensus_bounds;
    ALTER TABLE incidents ADD CONSTRAINT chk_incidents_consensus_bounds CHECK (
      (consensus_lat IS NULL AND consensus_lon IS NULL) OR
      (
        consensus_lat IS NOT NULL AND consensus_lon IS NOT NULL AND
        consensus_lat >= -90.0 AND consensus_lat <= 90.0 AND
        consensus_lon >= -180.0 AND consensus_lon <= 180.0
      )
    );

    -- 3. Extend audit log actions to support COORDINATE_OVERRIDE and REACTIVATE
    ALTER TABLE incident_audit_logs DROP CONSTRAINT IF EXISTS chk_audit_action;
    ALTER TABLE incident_audit_logs ADD CONSTRAINT chk_audit_action CHECK (
        action IN (
            'CLAIM',
            'ACTIVATE',
            'REACTIVATE',
            'RESOLVE',
            'REJECT',
            'RETENTION_HOLD_APPLIED',
            'RETENTION_HOLD_RELEASED',
            'SUMMARY_REVISED',
            'REPORT_UNLINKED',
            'REPORT_MERGED_OUT',
            'REPORT_MERGED_IN',
            'INCIDENT_CREATED_FROM_SPLIT',
            'COORDINATE_OVERRIDE'
        )
    );

    -- 4. Initial backfill of consensus coordinates for existing incidents with linked non-test reports
    UPDATE incidents i
    SET 
      consensus_lat = rep.incident_lat,
      consensus_lon = rep.incident_lon,
      consensus_confidence = 'EXACT',
      consensus_evaluated_at = CURRENT_TIMESTAMP
    FROM (
      SELECT DISTINCT ON (irl.incident_id)
        irl.incident_id,
        r.incident_lat,
        r.incident_lon
      FROM incident_report_links irl
      JOIN incident_reports r ON r.id = irl.report_id
      WHERE r.is_test = FALSE
        AND r.incident_lat IS NOT NULL
        AND r.incident_lon IS NOT NULL
      ORDER BY irl.incident_id, irl.linked_at ASC, r.submitted_at ASC
    ) rep
    WHERE i.id = rep.incident_id
      AND i.consensus_lat IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE incidents
      DROP COLUMN IF EXISTS admin_override_lat,
      DROP COLUMN IF EXISTS admin_override_lon,
      DROP COLUMN IF EXISTS admin_override_by,
      DROP COLUMN IF EXISTS admin_override_at,
      DROP COLUMN IF EXISTS admin_override_reason,
      DROP COLUMN IF EXISTS consensus_lat,
      DROP COLUMN IF EXISTS consensus_lon,
      DROP COLUMN IF EXISTS consensus_confidence,
      DROP COLUMN IF EXISTS consensus_evaluated_at;

    ALTER TABLE incident_audit_logs DROP CONSTRAINT IF EXISTS chk_audit_action;
    ALTER TABLE incident_audit_logs ADD CONSTRAINT chk_audit_action CHECK (
        action IN (
            'CLAIM',
            'ACTIVATE',
            'RESOLVE',
            'REJECT',
            'RETENTION_HOLD_APPLIED',
            'RETENTION_HOLD_RELEASED',
            'SUMMARY_REVISED',
            'REPORT_UNLINKED',
            'REPORT_MERGED_OUT',
            'REPORT_MERGED_IN',
            'INCIDENT_CREATED_FROM_SPLIT'
        )
    );
  `);
};
