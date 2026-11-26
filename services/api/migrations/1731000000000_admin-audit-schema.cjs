/* global exports */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    -- 1. Administrative Users Table
    CREATE TABLE admin_users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        username VARCHAR(64) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(32) NOT NULL DEFAULT 'MODERATOR',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_login_at TIMESTAMPTZ NULL,
        CONSTRAINT chk_admin_role CHECK (role IN ('SUPERADMIN', 'MODERATOR'))
    );

    CREATE INDEX idx_admin_users_username ON admin_users (username);

    -- 2. Administrative Sessions Table
    CREATE TABLE admin_sessions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        session_token_hash VARCHAR(64) NOT NULL UNIQUE,
        admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        csrf_token_hash VARCHAR(64) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        last_active_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        revoked_at TIMESTAMPTZ NULL,
        client_ip VARCHAR(45) NULL,
        user_agent TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX idx_admin_sessions_token ON admin_sessions (session_token_hash);
    CREATE INDEX idx_admin_sessions_admin_id ON admin_sessions (admin_id);
    CREATE INDEX idx_admin_sessions_active ON admin_sessions (last_active_at, expires_at);

    -- 3. Incident Audit Logs Table (Append-Only)
    CREATE TABLE incident_audit_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
        admin_id UUID NOT NULL REFERENCES admin_users(id),
        admin_username VARCHAR(64) NOT NULL,
        action VARCHAR(32) NOT NULL,
        previous_status VARCHAR(20) NOT NULL,
        new_status VARCHAR(20) NOT NULL,
        reason TEXT NOT NULL,
        request_id VARCHAR(64) NULL,
        metadata JSONB NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_audit_action CHECK (
            action IN ('CLAIM', 'ACTIVATE', 'RESOLVE', 'REJECT', 'RETENTION_HOLD_APPLIED', 'RETENTION_HOLD_RELEASED')
        ),
        CONSTRAINT chk_audit_reason_length CHECK (char_length(reason) >= 3)
    );

    CREATE INDEX idx_audit_logs_incident ON incident_audit_logs (incident_id, created_at DESC);
    CREATE INDEX idx_audit_logs_admin ON incident_audit_logs (admin_id);

    -- 4. PostgreSQL Engine-Level Immutability Trigger for Audit Logs
    CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
    RETURNS TRIGGER AS $$
    BEGIN
        RAISE EXCEPTION 'CRITICAL AUDIT INVARIANT: incident_audit_logs records are strictly append-only and cannot be updated or deleted.';
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_incident_audit_logs_immutable
    BEFORE UPDATE OR DELETE ON incident_audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

    -- 5. Extend Incidents Table with Audit & Workflow Columns
    ALTER TABLE incidents ADD COLUMN IF NOT EXISTS assigned_admin_id UUID NULL REFERENCES admin_users(id);
    ALTER TABLE incidents ADD COLUMN IF NOT EXISTS triaged_at TIMESTAMPTZ NULL;
    ALTER TABLE incidents ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ NULL;
    ALTER TABLE incidents ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ NULL;
    ALTER TABLE incidents ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ NULL;
    ALTER TABLE incidents ADD COLUMN IF NOT EXISTS resolution_reason TEXT NULL;
    ALTER TABLE incidents ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL;
    ALTER TABLE incidents ADD COLUMN IF NOT EXISTS last_modified_by_admin_id UUID NULL REFERENCES admin_users(id);
    ALTER TABLE incidents ADD COLUMN IF NOT EXISTS retention_hold_reason TEXT NULL;
    ALTER TABLE incidents ADD COLUMN IF NOT EXISTS retention_hold_at TIMESTAMPTZ NULL;
    ALTER TABLE incidents ADD COLUMN IF NOT EXISTS retention_hold_by_admin_id UUID NULL REFERENCES admin_users(id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE incidents DROP COLUMN IF EXISTS retention_hold_by_admin_id;
    ALTER TABLE incidents DROP COLUMN IF EXISTS retention_hold_at;
    ALTER TABLE incidents DROP COLUMN IF EXISTS retention_hold_reason;
    ALTER TABLE incidents DROP COLUMN IF EXISTS last_modified_by_admin_id;
    ALTER TABLE incidents DROP COLUMN IF EXISTS rejection_reason;
    ALTER TABLE incidents DROP COLUMN IF EXISTS resolution_reason;
    ALTER TABLE incidents DROP COLUMN IF EXISTS rejected_at;
    ALTER TABLE incidents DROP COLUMN IF EXISTS resolved_at;
    ALTER TABLE incidents DROP COLUMN IF EXISTS activated_at;
    ALTER TABLE incidents DROP COLUMN IF EXISTS triaged_at;
    ALTER TABLE incidents DROP COLUMN IF EXISTS assigned_admin_id;

    DROP TRIGGER IF EXISTS trg_incident_audit_logs_immutable ON incident_audit_logs;
    DROP FUNCTION IF EXISTS prevent_audit_log_mutation();
    DROP TABLE IF EXISTS incident_audit_logs CASCADE;
    DROP TABLE IF EXISTS admin_sessions CASCADE;
    DROP TABLE IF EXISTS admin_users CASCADE;
  `);
};
