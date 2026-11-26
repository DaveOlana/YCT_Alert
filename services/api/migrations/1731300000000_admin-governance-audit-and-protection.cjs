/* global exports */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    -- 1. Administrative Governance Audit Logs Table (Append-Only)
    CREATE TABLE admin_governance_audit_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        admin_id UUID NOT NULL REFERENCES admin_users(id),
        admin_username VARCHAR(64) NOT NULL,
        target_admin_id UUID NOT NULL REFERENCES admin_users(id),
        target_username VARCHAR(64) NOT NULL,
        action VARCHAR(32) NOT NULL,
        reason TEXT NULL,
        request_id VARCHAR(64) NULL,
        metadata JSONB NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_gov_action CHECK (
            action IN ('MODERATOR_CREATED', 'MODERATOR_REVOKED', 'PASSWORD_RESET', 'ROLE_CHANGED')
        )
    );

    CREATE INDEX idx_gov_audit_target ON admin_governance_audit_logs (target_admin_id, created_at DESC);
    CREATE INDEX idx_gov_audit_admin ON admin_governance_audit_logs (admin_id);

    -- 2. PostgreSQL Engine-Level Immutability Trigger for Governance Audit Logs
    CREATE OR REPLACE FUNCTION prevent_governance_audit_log_mutation()
    RETURNS TRIGGER AS $$
    BEGIN
        RAISE EXCEPTION 'CRITICAL AUDIT INVARIANT: admin_governance_audit_logs records are strictly append-only and cannot be updated or deleted.';
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_admin_governance_audit_logs_immutable
    BEFORE UPDATE OR DELETE ON admin_governance_audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_governance_audit_log_mutation();

    -- 3. PostgreSQL Engine-Level Protection Trigger for ALERTadmin
    CREATE OR REPLACE FUNCTION protect_bootstrap_superadmin()
    RETURNS TRIGGER AS $$
    BEGIN
        IF (TG_OP = 'DELETE') THEN
            IF OLD.username = 'ALERTadmin' THEN
                RAISE EXCEPTION 'CRITICAL SECURITY INVARIANT: The protected super-administrator ALERTadmin cannot be deleted.';
            END IF;
            RETURN OLD;
        ELSIF (TG_OP = 'UPDATE') THEN
            IF OLD.username = 'ALERTadmin' THEN
                IF NEW.is_active = FALSE THEN
                    RAISE EXCEPTION 'CRITICAL SECURITY INVARIANT: The protected super-administrator ALERTadmin cannot be deactivated.';
                END IF;
                IF NEW.role != 'SUPERADMIN' THEN
                    RAISE EXCEPTION 'CRITICAL SECURITY INVARIANT: The protected super-administrator ALERTadmin cannot be demoted.';
                END IF;
                IF NEW.username != 'ALERTadmin' THEN
                    RAISE EXCEPTION 'CRITICAL SECURITY INVARIANT: The protected super-administrator ALERTadmin username cannot be renamed.';
                END IF;
            END IF;
            RETURN NEW;
        END IF;
        RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_protect_bootstrap_superadmin
    BEFORE UPDATE OR DELETE ON admin_users
    FOR EACH ROW EXECUTE FUNCTION protect_bootstrap_superadmin();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS trg_protect_bootstrap_superadmin ON admin_users;
    DROP FUNCTION IF EXISTS protect_bootstrap_superadmin();

    DROP TRIGGER IF EXISTS trg_admin_governance_audit_logs_immutable ON admin_governance_audit_logs;
    DROP FUNCTION IF EXISTS prevent_governance_audit_log_mutation();
    DROP TABLE IF EXISTS admin_governance_audit_logs CASCADE;
  `);
};
