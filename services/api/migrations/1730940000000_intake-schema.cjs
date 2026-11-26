/* global exports */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    -- 1. Raw Reports Table
    CREATE TABLE incident_reports (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        category_code VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        location_source VARCHAR(20) NOT NULL,
        incident_lat NUMERIC(9, 6) NULL,
        incident_lon NUMERIC(9, 6) NULL,
        accuracy_meters NUMERIC(6, 1) NULL,
        coordinates_captured_at TIMESTAMPTZ NULL,
        yct_map_place_id UUID NULL,
        place_name_snapshot VARCHAR(160) NULL,
        landmark_description VARCHAR(300) NULL,
        receipt_id VARCHAR(64) NOT NULL UNIQUE,
        receipt_token_hash VARCHAR(128) NOT NULL,
        is_test BOOLEAN NOT NULL DEFAULT TRUE,
        validation_metadata JSONB NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_report_category CHECK (
            category_code IN ('FIRE_OR_SMOKE', 'MEDICAL_EMERGENCY', 'PHYSICAL_HAZARD', 'SECURITY_INCIDENT', 'OTHER_URGENT')
        ),
        CONSTRAINT chk_location_source CHECK (
            location_source IN ('MANUAL_POINT', 'MAP_PLACE', 'DEVICE_GPS', 'TEXT_ONLY')
        ),
        CONSTRAINT chk_description_length CHECK (
            char_length(description) >= 5 AND char_length(description) <= 1000
        )
    );

    CREATE INDEX idx_reports_category ON incident_reports (category_code);
    CREATE INDEX idx_reports_submitted_at ON incident_reports (submitted_at DESC);
    CREATE INDEX idx_reports_receipt_id ON incident_reports (receipt_id);

    -- 2. Incidents Table
    CREATE TABLE incidents (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        public_id VARCHAR(64) NOT NULL UNIQUE,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        category_code VARCHAR(50) NOT NULL,
        safe_public_summary TEXT NULL,
        severity_code VARCHAR(20) NULL,
        display_lat NUMERIC(9, 6) NULL,
        display_lon NUMERIC(9, 6) NULL,
        first_reported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_reported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        row_version INTEGER NOT NULL DEFAULT 1,
        retention_hold BOOLEAN NOT NULL DEFAULT FALSE,
        CONSTRAINT chk_incident_status CHECK (
            status IN ('PENDING', 'ACTIVE', 'RESOLVED', 'REJECTED')
        )
    );

    CREATE INDEX idx_incidents_status ON incidents (status);
    CREATE INDEX idx_incidents_created_at ON incidents (created_at DESC);

    -- 3. Incident Report Links Table
    CREATE TABLE incident_report_links (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
        report_id UUID NOT NULL UNIQUE REFERENCES incident_reports(id) ON DELETE CASCADE,
        linked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        match_method VARCHAR(20) NOT NULL DEFAULT 'CREATION',
        CONSTRAINT chk_match_method CHECK (
            match_method IN ('CREATION', 'SUGGESTED', 'ADMIN')
        )
    );

    CREATE INDEX idx_links_incident_id ON incident_report_links (incident_id);

    -- 4. Idempotency Receipts Table
    CREATE TABLE idempotency_receipts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        scope VARCHAR(30) NOT NULL DEFAULT 'PUBLIC_REPORT',
        key_hash VARCHAR(64) NOT NULL,
        request_fingerprint VARCHAR(64) NOT NULL,
        report_id UUID NOT NULL REFERENCES incident_reports(id) ON DELETE CASCADE,
        response_code INTEGER NOT NULL DEFAULT 202,
        encrypted_response BYTEA NULL,
        encryption_iv BYTEA NULL,
        encryption_tag BYTEA NULL,
        key_version SMALLINT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        replay_expires_at TIMESTAMPTZ NOT NULL,
        CONSTRAINT uq_idempotency_scope_key UNIQUE (scope, key_hash)
    );

    CREATE INDEX idx_idempotency_replay_expires ON idempotency_receipts (replay_expires_at);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS idempotency_receipts CASCADE;
    DROP TABLE IF EXISTS incident_report_links CASCADE;
    DROP TABLE IF EXISTS incidents CASCADE;
    DROP TABLE IF EXISTS incident_reports CASCADE;
  `);
};
