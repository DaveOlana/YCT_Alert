/* global exports */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    -- 1. Extend chk_audit_action constraint on incident_audit_logs to permit G2.3 actions
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

exports.down = (pgm) => {
  pgm.sql(`
    -- Revert chk_audit_action to previous baseline
    ALTER TABLE incident_audit_logs DROP CONSTRAINT IF EXISTS chk_audit_action;
    ALTER TABLE incident_audit_logs ADD CONSTRAINT chk_audit_action CHECK (
        action IN ('CLAIM', 'ACTIVATE', 'RESOLVE', 'REJECT', 'RETENTION_HOLD_APPLIED', 'RETENTION_HOLD_RELEASED')
    );
  `);
};
