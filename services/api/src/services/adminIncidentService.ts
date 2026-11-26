import type {
  ActivateIncidentRequest,
  ResolveIncidentRequest,
  RejectIncidentRequest,
  RetentionHoldRequest,
  ReviseIncidentSummaryRequest,
  UnlinkReportRequest,
  MergeReportRequest,
  OverrideIncidentCoordinatesRequest,
  PublicActiveIncidentsGeoJSON,
  PublicIncidentFeature,
  IncidentStatus,
  IncidentCategory,
} from '@yctalert/contracts';
import { query, withTransaction } from '../db/pool.js';
import { generatePublicIncidentId } from './reportService.js';
import { detectPublicSummaryPii } from './piiGuardrailService.js';
import { PublicIncidentService } from './publicIncidentService.js';
import { recomputeIncidentCoordinateConsensus } from './coordinateConsensusService.js';

export interface IncidentSummaryRow {
  id: string;
  public_id: string;
  status: IncidentStatus;
  category_code: IncidentCategory;
  safe_public_summary: string | null;
  display_lat: number | null;
  display_lon: number | null;
  first_reported_at: Date;
  last_reported_at: Date;
  assigned_admin_id: string | null;
  assigned_admin_username: string | null;
  triaged_at: Date | null;
  activated_at: Date | null;
  resolved_at: Date | null;
  rejected_at: Date | null;
  retention_hold: boolean;
  purged_at: Date | null;
  report_count: number;
}

/**
 * Safely parses coordinate values (including PostgreSQL NUMERIC string representations)
 * to finite JavaScript numbers, or null if absent, empty, or malformed.
 * Never converts missing coordinates into zero.
 */
export function parseCoordinate(val: unknown): number | null {
  if (val === null || val === undefined) {
    return null;
  }
  if (typeof val === 'number') {
    return isFinite(val) ? val : null;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '') return null;
    const num = Number(trimmed);
    return isFinite(num) ? num : null;
  }
  return null;
}

export interface IncidentAuditLogRow {
  id: string;
  incident_id: string;
  admin_id: string;
  admin_username: string;
  action: string;
  previous_status: string;
  new_status: string;
  reason: string;
  request_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

export interface IncidentLinkedReportRow {
  id: string;
  receipt_id: string;
  category_code: IncidentCategory;
  description: string;
  location_source: string;
  incident_lat: number | null;
  incident_lon: number | null;
  yct_map_place_id: string | null;
  place_name_snapshot: string | null;
  landmark_description: string | null;
  is_test: boolean;
  submitted_at: Date;
  match_method: 'CREATION' | 'SUGGESTED' | 'ADMIN';
  linked_at: Date;
}

export interface IncidentDetail {
  incident: IncidentSummaryRow & {
    resolution_reason: string | null;
    rejection_reason: string | null;
    retention_hold_reason: string | null;
    retention_hold_at: Date | null;
    retention_hold_by_username: string | null;
    row_version: number;
    admin_override_lat?: number | null;
    admin_override_lon?: number | null;
    admin_override_reason?: string | null;
    admin_override_by?: string | null;
    admin_override_at?: Date | null;
    consensus_lat?: number | null;
    consensus_lon?: number | null;
    consensus_confidence?: string | null;
    consensus_evaluated_at?: Date | null;
  };
  reports: IncidentLinkedReportRow[];
  auditLogs: IncidentAuditLogRow[];
}

export class AdminIncidentService {
  async getQueue(params: {
    status?: IncidentStatus;
    category?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    items: IncidentSummaryRow[];
    total: number;
    page: number;
    limit: number;
    counts: {
      all: number;
      pending: number;
      under_review: number;
      active: number;
      resolved: number;
      rejected: number;
    };
  }> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 25));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (params.status) {
      values.push(params.status);
      conditions.push(`i.status = $${values.length}`);
    }

    if (params.category) {
      values.push(params.category);
      conditions.push(`i.category_code = $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Status breakdown counts
    const countsRes = await query<{
      status: string;
      cnt: string;
    }>(
      `SELECT status, COUNT(*) AS cnt
       FROM incidents
       GROUP BY status`,
    );

    const counts = {
      all: 0,
      pending: 0,
      under_review: 0,
      active: 0,
      resolved: 0,
      rejected: 0,
    };

    for (const row of countsRes.rows) {
      const c = parseInt(row.cnt, 10);
      counts.all += c;
      if (row.status === 'PENDING') counts.pending = c;
      if (row.status === 'UNDER_REVIEW') counts.under_review = c;
      if (row.status === 'ACTIVE') counts.active = c;
      if (row.status === 'RESOLVED') counts.resolved = c;
      if (row.status === 'REJECTED') counts.rejected = c;
    }

    // Filtered total count
    const totalRes = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM incidents i ${whereClause}`,
      values,
    );
    const total = parseInt(totalRes.rows[0]?.count || '0', 10);

    // Items query
    const itemsRes = await query<{
      id: string;
      public_id: string;
      status: IncidentStatus;
      category_code: IncidentCategory;
      safe_public_summary: string | null;
      display_lat: number | null;
      display_lon: number | null;
      first_reported_at: Date;
      last_reported_at: Date;
      assigned_admin_id: string | null;
      assigned_admin_username: string | null;
      triaged_at: Date | null;
      activated_at: Date | null;
      resolved_at: Date | null;
      rejected_at: Date | null;
      retention_hold: boolean;
      purged_at: Date | null;
      report_count: string;
    }>(
      `SELECT 
        i.id,
        i.public_id,
        i.status,
        i.category_code,
        i.safe_public_summary,
        i.display_lat,
        i.display_lon,
        i.first_reported_at,
        i.last_reported_at,
        i.assigned_admin_id,
        u.username AS assigned_admin_username,
        i.triaged_at,
        i.activated_at,
        i.resolved_at,
        i.rejected_at,
        i.retention_hold,
        i.purged_at,
        COUNT(l.report_id) AS report_count
       FROM incidents i
       LEFT JOIN admin_users u ON u.id = i.assigned_admin_id
       LEFT JOIN incident_report_links l ON l.incident_id = i.id
       ${whereClause}
       GROUP BY i.id, u.username, i.purged_at
       ORDER BY i.last_reported_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    );

    const items: IncidentSummaryRow[] = itemsRes.rows.map((row) => ({
      ...row,
      display_lat: parseCoordinate(row.display_lat),
      display_lon: parseCoordinate(row.display_lon),
      report_count: parseInt(row.report_count, 10),
    }));

    return {
      items,
      total,
      page,
      limit,
      counts,
    };
  }

  async getIncidentDetails(incidentId: string): Promise<IncidentDetail | null> {
    const incRes = await query<{
      id: string;
      public_id: string;
      status: IncidentStatus;
      category_code: IncidentCategory;
      safe_public_summary: string | null;
      display_lat: number | null;
      display_lon: number | null;
      first_reported_at: Date;
      last_reported_at: Date;
      assigned_admin_id: string | null;
      assigned_admin_username: string | null;
      triaged_at: Date | null;
      activated_at: Date | null;
      resolved_at: Date | null;
      rejected_at: Date | null;
      resolution_reason: string | null;
      rejection_reason: string | null;
      retention_hold: boolean;
      retention_hold_reason: string | null;
      retention_hold_at: Date | null;
      retention_hold_by_username: string | null;
      row_version: number;
      purged_at: Date | null;
      admin_override_lat: number | null;
      admin_override_lon: number | null;
      admin_override_reason: string | null;
      admin_override_by: string | null;
      admin_override_at: Date | null;
      consensus_lat: number | null;
      consensus_lon: number | null;
      consensus_confidence: string | null;
      consensus_evaluated_at: Date | null;
    }>(
      `SELECT 
        i.id,
        i.public_id,
        i.status,
        i.category_code,
        i.safe_public_summary,
        i.display_lat,
        i.display_lon,
        i.admin_override_lat,
        i.admin_override_lon,
        i.admin_override_reason,
        i.admin_override_by,
        i.admin_override_at,
        i.consensus_lat,
        i.consensus_lon,
        i.consensus_confidence,
        i.consensus_evaluated_at,
        i.first_reported_at,
        i.last_reported_at,
        i.assigned_admin_id,
        u.username AS assigned_admin_username,
        i.triaged_at,
        i.activated_at,
        i.resolved_at,
        i.rejected_at,
        i.resolution_reason,
        i.rejection_reason,
        i.retention_hold,
        i.retention_hold_reason,
        i.retention_hold_at,
        hu.username AS retention_hold_by_username,
        i.row_version,
        i.purged_at
       FROM incidents i
       LEFT JOIN admin_users u ON u.id = i.assigned_admin_id
       LEFT JOIN admin_users hu ON hu.id = i.retention_hold_by_admin_id
       WHERE i.id = $1`,
      [incidentId],
    );

    if (incRes.rows.length === 0) {
      return null;
    }

    const row = incRes.rows[0];

    // Linked reports
    const repRes = await query<IncidentLinkedReportRow>(
      `SELECT 
        r.id,
        r.receipt_id,
        r.category_code,
        r.description,
        r.location_source,
        r.incident_lat,
        r.incident_lon,
        r.yct_map_place_id,
        r.place_name_snapshot,
        r.landmark_description,
        r.is_test,
        r.submitted_at,
        l.match_method,
        l.linked_at
       FROM incident_reports r
       JOIN incident_report_links l ON l.report_id = r.id
       WHERE l.incident_id = $1
       ORDER BY r.submitted_at ASC`,
      [incidentId],
    );

    // Audit logs
    const auditRes = await query<IncidentAuditLogRow>(
      `SELECT 
        id,
        incident_id,
        admin_id,
        admin_username,
        action,
        previous_status,
        new_status,
        reason,
        request_id,
        metadata,
        created_at
       FROM incident_audit_logs
       WHERE incident_id = $1
       ORDER BY created_at ASC`,
      [incidentId],
    );

    return {
      incident: {
        ...row,
        display_lat: parseCoordinate(row.display_lat),
        display_lon: parseCoordinate(row.display_lon),
        admin_override_lat: parseCoordinate(row.admin_override_lat),
        admin_override_lon: parseCoordinate(row.admin_override_lon),
        consensus_lat: parseCoordinate(row.consensus_lat),
        consensus_lon: parseCoordinate(row.consensus_lon),
        report_count: repRes.rows.length,
      },
      reports: repRes.rows.map((r) => ({
        ...r,
        incident_lat: parseCoordinate(r.incident_lat),
        incident_lon: parseCoordinate(r.incident_lon),
      })),
      auditLogs: auditRes.rows,
    };
  }

  async claimIncident(
    incidentId: string,
    admin: { id: string; username: string },
    requestId?: string,
    reason?: string,
  ): Promise<IncidentDetail> {
    const claimReason = (reason && reason.trim()) || 'Triage initiated by moderator';

    await withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`INCIDENT:${incidentId}`]);

      const check = await client.query<{ status: string; assigned_admin_id: string | null }>(
        `SELECT status, assigned_admin_id FROM incidents WHERE id = $1 FOR UPDATE`,
        [incidentId],
      );

      if (check.rows.length === 0) {
        throw new Error('INCIDENT_NOT_FOUND');
      }

      const current = check.rows[0];
      if (current.status !== 'PENDING') {
        throw new Error(
          `CANNOT_CLAIM_STATUS: Incident is ${current.status}, only PENDING incidents can be claimed`,
        );
      }

      await client.query(
        `UPDATE incidents
         SET status = 'UNDER_REVIEW',
             assigned_admin_id = $1,
             triaged_at = COALESCE(triaged_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP,
             last_modified_by_admin_id = $1,
             row_version = row_version + 1
         WHERE id = $2`,
        [admin.id, incidentId],
      );

      await client.query(
        `INSERT INTO incident_audit_logs (
           incident_id, admin_id, admin_username, action, previous_status, new_status, reason, request_id
         ) VALUES ($1, $2, $3, 'CLAIM', 'PENDING', 'UNDER_REVIEW', $4, $5)`,
        [incidentId, admin.id, admin.username, claimReason, requestId || null],
      );
    });

    const updated = await this.getIncidentDetails(incidentId);
    return updated!;
  }

  async activateIncident(
    incidentId: string,
    admin: { id: string; username: string },
    req: ActivateIncidentRequest,
    requestId?: string,
  ): Promise<IncidentDetail> {
    const auditReason =
      (req.reason && req.reason.trim()) || 'Incident approved and broadcast to public feed';

    // Reject partial coordinates
    if (
      (req.display_latitude != null && req.display_longitude == null) ||
      (req.display_latitude == null && req.display_longitude != null)
    ) {
      throw new Error('INVALID_COORDINATES: Both latitude and longitude must be provided together.');
    }

    if (req.display_latitude != null && req.display_longitude != null) {
      if (req.display_latitude < -90 || req.display_latitude > 90) {
        throw new Error('INVALID_COORDINATES: Latitude must be between -90 and 90.');
      }
      if (req.display_longitude < -180 || req.display_longitude > 180) {
        throw new Error('INVALID_COORDINATES: Longitude must be between -180 and 180.');
      }
    }

    await withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`INCIDENT:${incidentId}`]);

      const check = await client.query<{ status: string; resolved_at: Date | null; purged_at: Date | null }>(
        `SELECT status, resolved_at, purged_at FROM incidents WHERE id = $1 FOR UPDATE`,
        [incidentId],
      );

      if (check.rows.length === 0) {
        throw new Error('INCIDENT_NOT_FOUND');
      }

      const row = check.rows[0];
      const prevStatus = row.status;

      if (
        prevStatus !== 'PENDING' &&
        prevStatus !== 'UNDER_REVIEW' &&
        prevStatus !== 'ACTIVE' &&
        prevStatus !== 'RESOLVED'
      ) {
        throw new Error(
          `CANNOT_ACTIVATE_STATUS: Cannot activate incident with status ${prevStatus}`,
        );
      }

      if (prevStatus === 'RESOLVED') {
        if (row.purged_at) {
          throw new Error('CANNOT_REACTIVATE_PURGED: Incident has already been purged.');
        }
        if (
          row.resolved_at &&
          new Date(row.resolved_at).getTime() <= Date.now() - 30 * 24 * 60 * 60 * 1000
        ) {
          throw new Error(
            'CANNOT_REACTIVATE_EXPIRED: Resolved incident can only be reactivated within 30 days.',
          );
        }
      }

      const hasOverrideCoords = req.display_latitude != null && req.display_longitude != null;

      await client.query(
        `UPDATE incidents
         SET status = 'ACTIVE',
             safe_public_summary = $1,
             display_lat = COALESCE($2, display_lat),
             display_lon = COALESCE($3, display_lon),
             admin_override_lat = CASE WHEN $6::boolean THEN $2::numeric ELSE admin_override_lat END,
             admin_override_lon = CASE WHEN $6::boolean THEN $3::numeric ELSE admin_override_lon END,
             admin_override_by = CASE WHEN $6::boolean THEN $4::uuid ELSE admin_override_by END,
             admin_override_at = CASE WHEN $6::boolean THEN CURRENT_TIMESTAMP ELSE admin_override_at END,
             admin_override_reason = CASE WHEN $6::boolean THEN $7::text ELSE admin_override_reason END,
             activated_at = COALESCE(activated_at, CURRENT_TIMESTAMP),
             resolved_at = NULL,
             assigned_admin_id = COALESCE(assigned_admin_id, $4),
             triaged_at = COALESCE(triaged_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP,
             last_modified_by_admin_id = $4,
             row_version = row_version + 1
         WHERE id = $5`,
        [
          req.safe_summary.trim(),
          req.display_latitude ?? null,
          req.display_longitude ?? null,
          admin.id,
          incidentId,
          hasOverrideCoords,
          auditReason,
        ],
      );

      const auditAction = prevStatus === 'RESOLVED' ? 'REACTIVATE' : 'ACTIVATE';

      await client.query(
        `INSERT INTO incident_audit_logs (
           incident_id, admin_id, admin_username, action, previous_status, new_status, reason, request_id
         ) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, $7)`,
        [incidentId, admin.id, admin.username, auditAction, prevStatus, auditReason, requestId || null],
      );
    });

    const updated = await this.getIncidentDetails(incidentId);
    return updated!;
  }

  async resolveIncident(
    incidentId: string,
    admin: { id: string; username: string },
    req: ResolveIncidentRequest,
    requestId?: string,
  ): Promise<IncidentDetail> {
    await withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`INCIDENT:${incidentId}`]);

      const check = await client.query<{ status: string }>(
        `SELECT status FROM incidents WHERE id = $1 FOR UPDATE`,
        [incidentId],
      );

      if (check.rows.length === 0) {
        throw new Error('INCIDENT_NOT_FOUND');
      }

      const prevStatus = check.rows[0].status;
      if (prevStatus !== 'ACTIVE') {
        throw new Error(
          `CANNOT_RESOLVE_STATUS: Only ACTIVE incidents can be resolved. Current status: ${prevStatus}`,
        );
      }

      await client.query(
        `UPDATE incidents
         SET status = 'RESOLVED',
             resolved_at = CURRENT_TIMESTAMP,
             resolution_reason = $1,
             updated_at = CURRENT_TIMESTAMP,
             last_modified_by_admin_id = $2,
             row_version = row_version + 1
         WHERE id = $3`,
        [req.resolution_reason.trim(), admin.id, incidentId],
      );

      await client.query(
        `INSERT INTO incident_audit_logs (
           incident_id, admin_id, admin_username, action, previous_status, new_status, reason, request_id
         ) VALUES ($1, $2, $3, 'RESOLVE', 'ACTIVE', 'RESOLVED', $4, $5)`,
        [incidentId, admin.id, admin.username, req.resolution_reason.trim(), requestId || null],
      );
    });

    const updated = await this.getIncidentDetails(incidentId);
    return updated!;
  }

  async rejectIncident(
    incidentId: string,
    admin: { id: string; username: string },
    req: RejectIncidentRequest,
    requestId?: string,
  ): Promise<IncidentDetail> {
    await withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`INCIDENT:${incidentId}`]);

      const check = await client.query<{ status: string }>(
        `SELECT status FROM incidents WHERE id = $1 FOR UPDATE`,
        [incidentId],
      );

      if (check.rows.length === 0) {
        throw new Error('INCIDENT_NOT_FOUND');
      }

      const prevStatus = check.rows[0].status;
      if (prevStatus !== 'PENDING' && prevStatus !== 'UNDER_REVIEW') {
        throw new Error(
          `CANNOT_REJECT_STATUS: Only PENDING or UNDER_REVIEW incidents can be rejected. Current status: ${prevStatus}`,
        );
      }

      await client.query(
        `UPDATE incidents
         SET status = 'REJECTED',
             rejected_at = CURRENT_TIMESTAMP,
             rejection_reason = $1,
             updated_at = CURRENT_TIMESTAMP,
             last_modified_by_admin_id = $2,
             row_version = row_version + 1
         WHERE id = $3`,
        [req.rejection_reason.trim(), admin.id, incidentId],
      );

      await client.query(
        `INSERT INTO incident_audit_logs (
           incident_id, admin_id, admin_username, action, previous_status, new_status, reason, request_id
         ) VALUES ($1, $2, $3, 'REJECT', $4, 'REJECTED', $5, $6)`,
        [
          incidentId,
          admin.id,
          admin.username,
          prevStatus,
          req.rejection_reason.trim(),
          requestId || null,
        ],
      );
    });

    const updated = await this.getIncidentDetails(incidentId);
    return updated!;
  }

  async setRetentionHold(
    incidentId: string,
    admin: { id: string; username: string; role: string },
    req: RetentionHoldRequest,
    requestId?: string,
  ): Promise<IncidentDetail> {
    if (admin.role !== 'SUPERADMIN') {
      throw new Error('SUPERADMIN_REQUIRED');
    }

    await withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`INCIDENT:${incidentId}`]);

      const check = await client.query<{ status: string; retention_hold: boolean }>(
        `SELECT status, retention_hold FROM incidents WHERE id = $1 FOR UPDATE`,
        [incidentId],
      );

      if (check.rows.length === 0) {
        throw new Error('INCIDENT_NOT_FOUND');
      }

      const current = check.rows[0];
      const action = req.retention_hold ? 'RETENTION_HOLD_APPLIED' : 'RETENTION_HOLD_RELEASED';

      await client.query(
        `UPDATE incidents
         SET retention_hold = $1,
             retention_hold_reason = $2,
             retention_hold_at = CURRENT_TIMESTAMP,
             retention_hold_by_admin_id = $3,
             updated_at = CURRENT_TIMESTAMP,
             last_modified_by_admin_id = $3,
             row_version = row_version + 1
         WHERE id = $4`,
        [req.retention_hold, req.reason.trim(), admin.id, incidentId],
      );

      await client.query(
        `INSERT INTO incident_audit_logs (
           incident_id, admin_id, admin_username, action, previous_status, new_status, reason, request_id
         ) VALUES ($1, $2, $3, $4, $5, $5, $6, $7)`,
        [
          incidentId,
          admin.id,
          admin.username,
          action,
          current.status,
          req.reason.trim(),
          requestId || null,
        ],
      );
    });

    const updated = await this.getIncidentDetails(incidentId);
    return updated!;
  }

  async getActiveIncidentsGeoJSON(): Promise<PublicActiveIncidentsGeoJSON> {
    const publicService = new PublicIncidentService();
    return publicService.getActiveIncidentsGeoJSON();
  }

  async reviseIncidentSummary(
    incidentId: string,
    admin: { id: string; username: string },
    req: ReviseIncidentSummaryRequest,
    requestId?: string,
  ): Promise<IncidentDetail> {
    const summary = req.safe_summary.trim();
    const reason = req.reason.trim();

    // 1. Server-side PII guardrail check
    const piiCheck = detectPublicSummaryPii(summary);
    if (piiCheck.hasPii) {
      throw new Error(`PROHIBITED_PII_DETECTED: ${piiCheck.message}`);
    }

    if (!reason || reason.length < 3) {
      throw new Error('REASON_REQUIRED');
    }

    await withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`INCIDENT:${incidentId}`]);

      const check = await client.query<{
        id: string;
        status: IncidentStatus;
        safe_public_summary: string | null;
        row_version: number;
      }>(
        `SELECT id, status, safe_public_summary, row_version
         FROM incidents
         WHERE id = $1
         FOR UPDATE`,
        [incidentId],
      );

      if (check.rows.length === 0) {
        throw new Error('INCIDENT_NOT_FOUND');
      }

      const current = check.rows[0];

      // Optimistic concurrency check
      if (current.row_version !== req.expected_version) {
        throw new Error(
          `VERSION_CONFLICT: Expected incident version ${req.expected_version}, but current version is ${current.row_version}.`,
        );
      }

      // Lifecycle check: only ACTIVE incidents can have summaries revised
      if (current.status !== 'ACTIVE') {
        throw new Error(
          `CANNOT_REVISE_STATUS: Only ACTIVE incidents can have their summary revised. Current status: ${current.status}.`,
        );
      }

      // Update incident
      await client.query(
        `UPDATE incidents
         SET safe_public_summary = $1,
             updated_at = CURRENT_TIMESTAMP,
             last_modified_by_admin_id = $2,
             row_version = row_version + 1
         WHERE id = $3`,
        [summary, admin.id, incidentId],
      );

      // Write immutable audit log
      await client.query(
        `INSERT INTO incident_audit_logs (
           incident_id, admin_id, admin_username, action, previous_status, new_status, reason, request_id, metadata
         ) VALUES ($1, $2, $3, 'SUMMARY_REVISED', 'ACTIVE', 'ACTIVE', $4, $5, $6)`,
        [
          incidentId,
          admin.id,
          admin.username,
          reason,
          requestId || null,
          JSON.stringify({
            previous_summary: current.safe_public_summary,
            new_summary: summary,
          }),
        ],
      );
    });

    const updated = await this.getIncidentDetails(incidentId);
    return updated!;
  }

  async overrideCoordinates(
    incidentId: string,
    admin: { id: string; username: string },
    req: OverrideIncidentCoordinatesRequest,
    requestId?: string,
  ): Promise<IncidentDetail> {
    const reason = req.reason.trim();
    if (!reason || reason.length < 3) {
      throw new Error('REASON_REQUIRED');
    }

    if (req.latitude < -90 || req.latitude > 90 || req.longitude < -180 || req.longitude > 180) {
      throw new Error('INVALID_COORDINATES: Coordinates out of valid geographic bounds.');
    }

    await withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`INCIDENT:${incidentId}`]);

      const check = await client.query<{
        id: string;
        status: IncidentStatus;
        row_version: number;
        admin_override_lat: string | null;
        admin_override_lon: string | null;
      }>(
        `SELECT id, status, row_version, admin_override_lat, admin_override_lon
         FROM incidents WHERE id = $1 FOR UPDATE`,
        [incidentId],
      );

      if (check.rows.length === 0) {
        throw new Error('INCIDENT_NOT_FOUND');
      }

      const row = check.rows[0];
      if (row.row_version !== req.expected_version) {
        throw new Error(
          `VERSION_CONFLICT: Expected incident version ${req.expected_version}, but current version is ${row.row_version}.`,
        );
      }

      if (row.status === 'RESOLVED' || row.status === 'REJECTED') {
        throw new Error(
          `CANNOT_OVERRIDE_TERMINAL: Cannot modify coordinates of an incident in terminal state (${row.status}).`,
        );
      }

      await client.query(
        `UPDATE incidents
         SET admin_override_lat = $1,
             admin_override_lon = $2,
             admin_override_by = $3,
             admin_override_at = CURRENT_TIMESTAMP,
             admin_override_reason = $4,
             display_lat = $1,
             display_lon = $2,
             updated_at = CURRENT_TIMESTAMP,
             last_modified_by_admin_id = $3,
             row_version = row_version + 1
         WHERE id = $5`,
        [req.latitude, req.longitude, admin.id, reason, incidentId],
      );

      await client.query(
        `INSERT INTO incident_audit_logs (
           incident_id, admin_id, admin_username, action, previous_status, new_status, reason, request_id, metadata
         ) VALUES ($1, $2, $3, 'COORDINATE_OVERRIDE', $4, $4, $5, $6, $7)`,
        [
          incidentId,
          admin.id,
          admin.username,
          row.status,
          reason,
          requestId || null,
          JSON.stringify({
            previous_override: {
              latitude: row.admin_override_lat ? Number(row.admin_override_lat) : null,
              longitude: row.admin_override_lon ? Number(row.admin_override_lon) : null,
            },
            new_override: {
              latitude: req.latitude,
              longitude: req.longitude,
            },
            expected_version: req.expected_version,
            new_version: row.row_version + 1,
          }),
        ],
      );
    });

    const updated = await this.getIncidentDetails(incidentId);
    return updated!;
  }

  async unlinkReport(
    incidentId: string,
    reportId: string,
    admin: { id: string; username: string },
    req: UnlinkReportRequest,
    requestId?: string,
  ): Promise<{ sourceIncident: IncidentDetail; newIncident: IncidentDetail }> {
    const reason = req.reason.trim();
    if (!reason || reason.length < 3) {
      throw new Error('REASON_REQUIRED');
    }

    let newIncidentId = '';

    await withTransaction(async (client) => {
      // 1. Advisory lock on source incident
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`INCIDENT:${incidentId}`]);

      // 2. Lock and retrieve source incident
      const sourceRes = await client.query<{
        id: string;
        public_id: string;
        status: IncidentStatus;
        category_code: IncidentCategory;
        row_version: number;
        first_reported_at: Date;
        last_reported_at: Date;
      }>(
        `SELECT id, public_id, status, category_code, row_version, first_reported_at, last_reported_at
         FROM incidents
         WHERE id = $1
         FOR UPDATE`,
        [incidentId],
      );

      if (sourceRes.rows.length === 0) {
        throw new Error('INCIDENT_NOT_FOUND');
      }

      const source = sourceRes.rows[0];

      // Optimistic concurrency check
      if (source.row_version !== req.expected_version) {
        throw new Error(
          `VERSION_CONFLICT: Expected source incident version ${req.expected_version}, but current version is ${source.row_version}.`,
        );
      }

      // 3. Verify report is linked to this incident
      const linkRes = await client.query<{
        id: string;
        incident_id: string;
        match_method: string;
      }>(
        `SELECT id, incident_id, match_method
         FROM incident_report_links
         WHERE report_id = $1 AND incident_id = $2
         FOR UPDATE`,
        [reportId, incidentId],
      );

      if (linkRes.rows.length === 0) {
        throw new Error('REPORT_NOT_LINKED_TO_INCIDENT');
      }

      // 4. Fetch the report data
      const repRes = await client.query<{
        id: string;
        category_code: IncidentCategory;
        incident_lat: number | null;
        incident_lon: number | null;
        submitted_at: Date;
      }>(
        `SELECT id, category_code, incident_lat, incident_lon, submitted_at
         FROM incident_reports
         WHERE id = $1
         FOR UPDATE`,
        [reportId],
      );

      if (repRes.rows.length === 0) {
        throw new Error('REPORT_NOT_FOUND');
      }
      const report = repRes.rows[0];

      // 5. Count total reports linked to source incident
      const countRes = await client.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM incident_report_links WHERE incident_id = $1`,
        [incidentId],
      );
      const totalReports = parseInt(countRes.rows[0].cnt, 10);

      // 6. Delete association from source incident
      await client.query(
        `DELETE FROM incident_report_links WHERE report_id = $1 AND incident_id = $2`,
        [reportId, incidentId],
      );

      // 7. Create new PENDING incident for the detached report
      const newPublicId = generatePublicIncidentId();
      const insertNewRes = await client.query<{ id: string }>(
        `INSERT INTO incidents (
           public_id,
           status,
           category_code,
           display_lat,
           display_lon,
           first_reported_at,
           last_reported_at,
           created_at,
           updated_at,
           row_version
         ) VALUES ($1, 'PENDING', $2, $3, $4, $5, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
         RETURNING id`,
        [
          newPublicId,
          report.category_code,
          report.incident_lat,
          report.incident_lon,
          report.submitted_at,
        ],
      );
      newIncidentId = insertNewRes.rows[0].id;

      // 8. Create CREATION association on new incident
      await client.query(
        `INSERT INTO incident_report_links (incident_id, report_id, match_method)
         VALUES ($1, $2, 'CREATION')`,
        [newIncidentId, reportId],
      );

      // 9. Write audit log for the new incident
      await client.query(
        `INSERT INTO incident_audit_logs (
           incident_id, admin_id, admin_username, action, previous_status, new_status, reason, request_id, metadata
         ) VALUES ($1, $2, $3, 'INCIDENT_CREATED_FROM_SPLIT', 'PENDING', 'PENDING', $4, $5, $6)`,
        [
          newIncidentId,
          admin.id,
          admin.username,
          `Created from report split from incident ${source.public_id}`,
          requestId || null,
          JSON.stringify({
            source_incident_id: incidentId,
            source_public_id: source.public_id,
            report_id: reportId,
            split_reason: reason,
          }),
        ],
      );

      // 10. Handle source incident (empty vs remaining reports)
      if (totalReports > 1) {
        // Other reports remain: recalculate last_reported_at, preserve status, increment row_version
        const maxRes = await client.query<{ max_sub: Date }>(
          `SELECT MAX(r.submitted_at) AS max_sub
           FROM incident_reports r
           JOIN incident_report_links l ON l.report_id = r.id
           WHERE l.incident_id = $1`,
          [incidentId],
        );
        const newLastReported = maxRes.rows[0]?.max_sub || source.last_reported_at;

        await client.query(
          `UPDATE incidents
           SET last_reported_at = $1,
               updated_at = CURRENT_TIMESTAMP,
               last_modified_by_admin_id = $2,
               row_version = row_version + 1
           WHERE id = $3`,
          [newLastReported, admin.id, incidentId],
        );

        await client.query(
          `INSERT INTO incident_audit_logs (
             incident_id, admin_id, admin_username, action, previous_status, new_status, reason, request_id, metadata
           ) VALUES ($1, $2, $3, 'REPORT_UNLINKED', $4, $4, $5, $6, $7)`,
          [
            incidentId,
            admin.id,
            admin.username,
            source.status,
            reason,
            requestId || null,
            JSON.stringify({
              unlinked_report_id: reportId,
              split_into_incident_id: newIncidentId,
              split_into_public_id: newPublicId,
              remaining_report_count: totalReports - 1,
            }),
          ],
        );
      } else {
        // Emptied source incident:
        // 1. Record the report movement audit log (REPORT_UNLINKED)
        await client.query(
          `INSERT INTO incident_audit_logs (
             incident_id, admin_id, admin_username, action, previous_status, new_status, reason, request_id, metadata
           ) VALUES ($1, $2, $3, 'REPORT_UNLINKED', $4, $4, $5, $6, $7)`,
          [
            incidentId,
            admin.id,
            admin.username,
            source.status,
            reason,
            requestId || null,
            JSON.stringify({
              unlinked_report_id: reportId,
              split_into_incident_id: newIncidentId,
              split_into_public_id: newPublicId,
              remaining_report_count: 0,
            }),
          ],
        );

        // 2. Transition emptied source incident to REJECTED with rejection audit log
        const rejectionReason = `Incident emptied through report split: ${reason}`;
        await client.query(
          `UPDATE incidents
           SET status = 'REJECTED',
               rejection_reason = $1,
               rejected_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP,
               last_modified_by_admin_id = $2,
               row_version = row_version + 1
           WHERE id = $3`,
          [rejectionReason, admin.id, incidentId],
        );

        await client.query(
          `INSERT INTO incident_audit_logs (
             incident_id, admin_id, admin_username, action, previous_status, new_status, reason, request_id, metadata
           ) VALUES ($1, $2, $3, 'REJECT', $4, 'REJECTED', $5, $6, $7)`,
          [
            incidentId,
            admin.id,
            admin.username,
            source.status,
            rejectionReason,
            requestId || null,
            JSON.stringify({
              unlinked_report_id: reportId,
              split_into_incident_id: newIncidentId,
              split_into_public_id: newPublicId,
              emptied_by_split: true,
            }),
          ],
        );
      }

      // Recompute consensus coordinates for source and new incidents
      await recomputeIncidentCoordinateConsensus(incidentId, client);
      await recomputeIncidentCoordinateConsensus(newIncidentId, client);
    });

    const [sourceIncident, newIncident] = await Promise.all([
      this.getIncidentDetails(incidentId),
      this.getIncidentDetails(newIncidentId),
    ]);

    return {
      sourceIncident: sourceIncident!,
      newIncident: newIncident!,
    };
  }

  async mergeReport(
    targetIncidentId: string,
    admin: { id: string; username: string },
    req: MergeReportRequest,
    requestId?: string,
  ): Promise<{ targetIncident: IncidentDetail; sourceIncident: IncidentDetail }> {
    const reason = req.reason.trim();
    if (!reason || reason.length < 3) {
      throw new Error('REASON_REQUIRED');
    }

    let resolvedSourceIncidentId = '';

    await withTransaction(async (client) => {
      // 1. Discover current report association
      const linkLookup = await client.query<{
        incident_id: string;
        match_method: string;
        submitted_at: Date;
      }>(
        `SELECT l.incident_id, l.match_method, r.submitted_at
         FROM incident_report_links l
         JOIN incident_reports r ON r.id = l.report_id
         WHERE l.report_id = $1
         FOR UPDATE`,
        [req.report_id],
      );

      if (linkLookup.rows.length === 0) {
        throw new Error('REPORT_NOT_LINKED');
      }

      resolvedSourceIncidentId = linkLookup.rows[0].incident_id;

      // 2. Reject same-incident merge
      if (resolvedSourceIncidentId === targetIncidentId) {
        throw new Error(
          'CANNOT_MERGE_SAME_INCIDENT: Report is already associated with this incident.',
        );
      }

      // 3. Acquire locks in deterministic order to prevent deadlocks
      const [firstLockId, secondLockId] = [resolvedSourceIncidentId, targetIncidentId].sort();
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`INCIDENT:${firstLockId}`]);
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `INCIDENT:${secondLockId}`,
      ]);

      // 4. Lock both incident rows
      const sourceRes = await client.query<{
        id: string;
        public_id: string;
        status: IncidentStatus;
        row_version: number;
        last_reported_at: Date;
      }>(
        `SELECT id, public_id, status, row_version, last_reported_at
         FROM incidents
         WHERE id = $1
         FOR UPDATE`,
        [resolvedSourceIncidentId],
      );

      if (sourceRes.rows.length === 0) {
        throw new Error('SOURCE_INCIDENT_NOT_FOUND');
      }
      const source = sourceRes.rows[0];

      const targetRes = await client.query<{
        id: string;
        public_id: string;
        status: IncidentStatus;
        row_version: number;
        last_reported_at: Date;
      }>(
        `SELECT id, public_id, status, row_version, last_reported_at
         FROM incidents
         WHERE id = $1
         FOR UPDATE`,
        [targetIncidentId],
      );

      if (targetRes.rows.length === 0) {
        throw new Error('TARGET_INCIDENT_NOT_FOUND');
      }
      const target = targetRes.rows[0];

      // 5. Validate expected versions
      if (source.row_version !== req.source_expected_version) {
        throw new Error(
          `SOURCE_VERSION_CONFLICT: Expected source incident version ${req.source_expected_version}, but current version is ${source.row_version}.`,
        );
      }

      if (target.row_version !== req.expected_version) {
        throw new Error(
          `TARGET_VERSION_CONFLICT: Expected target incident version ${req.expected_version}, but current version is ${target.row_version}.`,
        );
      }

      // 6. Lifecycle compatibility checks
      if (source.status !== target.status) {
        throw new Error(
          `INCOMPATIBLE_INCIDENT_STATUS: Source incident status (${source.status}) does not match target incident status (${target.status}). Reports cannot be merged between different lifecycle states.`,
        );
      }

      if (
        target.status === 'RESOLVED' ||
        target.status === 'REJECTED' ||
        source.status === 'RESOLVED' ||
        source.status === 'REJECTED'
      ) {
        throw new Error(
          `CANNOT_MERGE_TERMINAL_INCIDENT: Cannot merge reports involving terminal incident status (${target.status}).`,
        );
      }

      // 7. Move report association to target incident with match_method = 'ADMIN'
      await client.query(
        `UPDATE incident_report_links
         SET incident_id = $1,
             match_method = 'ADMIN',
             linked_at = CURRENT_TIMESTAMP
         WHERE report_id = $2`,
        [targetIncidentId, req.report_id],
      );

      // 8. Update Target Incident
      const targetMaxRes = await client.query<{ max_sub: Date }>(
        `SELECT MAX(r.submitted_at) AS max_sub
         FROM incident_reports r
         JOIN incident_report_links l ON l.report_id = r.id
         WHERE l.incident_id = $1`,
        [targetIncidentId],
      );
      const targetLastReported = targetMaxRes.rows[0]?.max_sub || target.last_reported_at;

      await client.query(
        `UPDATE incidents
         SET last_reported_at = $1,
             updated_at = CURRENT_TIMESTAMP,
             last_modified_by_admin_id = $2,
             row_version = row_version + 1
         WHERE id = $3`,
        [targetLastReported, admin.id, targetIncidentId],
      );

      // Audit log on Target Incident
      await client.query(
        `INSERT INTO incident_audit_logs (
           incident_id, admin_id, admin_username, action, previous_status, new_status, reason, request_id, metadata
         ) VALUES ($1, $2, $3, 'REPORT_MERGED_IN', $4, $4, $5, $6, $7)`,
        [
          targetIncidentId,
          admin.id,
          admin.username,
          target.status,
          reason,
          requestId || null,
          JSON.stringify({
            moved_report_id: req.report_id,
            merged_from_incident_id: resolvedSourceIncidentId,
            source_public_id: source.public_id,
            match_method: 'ADMIN',
          }),
        ],
      );

      // 9. Update Source Incident & Handle Empty-Source
      const sourceCountRes = await client.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM incident_report_links WHERE incident_id = $1`,
        [resolvedSourceIncidentId],
      );
      const sourceRemainingReports = parseInt(sourceCountRes.rows[0].cnt, 10);

      if (sourceRemainingReports > 0) {
        // Source still has reports: update last_reported_at, preserve status, increment version
        const sourceMaxRes = await client.query<{ max_sub: Date }>(
          `SELECT MAX(r.submitted_at) AS max_sub
           FROM incident_reports r
           JOIN incident_report_links l ON l.report_id = r.id
           WHERE l.incident_id = $1`,
          [resolvedSourceIncidentId],
        );
        const sourceLastReported = sourceMaxRes.rows[0]?.max_sub || source.last_reported_at;

        await client.query(
          `UPDATE incidents
           SET last_reported_at = $1,
               updated_at = CURRENT_TIMESTAMP,
               last_modified_by_admin_id = $2,
               row_version = row_version + 1
           WHERE id = $3`,
          [sourceLastReported, admin.id, resolvedSourceIncidentId],
        );

        await client.query(
          `INSERT INTO incident_audit_logs (
             incident_id, admin_id, admin_username, action, previous_status, new_status, reason, request_id, metadata
           ) VALUES ($1, $2, $3, 'REPORT_MERGED_OUT', $4, $4, $5, $6, $7)`,
          [
            resolvedSourceIncidentId,
            admin.id,
            admin.username,
            source.status,
            reason,
            requestId || null,
            JSON.stringify({
              moved_report_id: req.report_id,
              merged_into_incident_id: targetIncidentId,
              target_public_id: target.public_id,
              remaining_report_count: sourceRemainingReports,
            }),
          ],
        );
      } else {
        // Source incident is now empty:
        // 1. Record the report movement audit log (REPORT_MERGED_OUT)
        await client.query(
          `INSERT INTO incident_audit_logs (
             incident_id, admin_id, admin_username, action, previous_status, new_status, reason, request_id, metadata
           ) VALUES ($1, $2, $3, 'REPORT_MERGED_OUT', $4, $4, $5, $6, $7)`,
          [
            resolvedSourceIncidentId,
            admin.id,
            admin.username,
            source.status,
            reason,
            requestId || null,
            JSON.stringify({
              moved_report_id: req.report_id,
              merged_into_incident_id: targetIncidentId,
              target_public_id: target.public_id,
              remaining_report_count: 0,
            }),
          ],
        );

        // 2. Transition emptied source incident to REJECTED with rejection audit log
        const rejectionReason = `Incident emptied through report merge: ${reason}`;
        await client.query(
          `UPDATE incidents
           SET status = 'REJECTED',
               rejection_reason = $1,
               rejected_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP,
               last_modified_by_admin_id = $2,
               row_version = row_version + 1
           WHERE id = $3`,
          [rejectionReason, admin.id, resolvedSourceIncidentId],
        );

        await client.query(
          `INSERT INTO incident_audit_logs (
             incident_id, admin_id, admin_username, action, previous_status, new_status, reason, request_id, metadata
           ) VALUES ($1, $2, $3, 'REJECT', $4, 'REJECTED', $5, $6, $7)`,
          [
            resolvedSourceIncidentId,
            admin.id,
            admin.username,
            source.status,
            rejectionReason,
            requestId || null,
            JSON.stringify({
              moved_report_id: req.report_id,
              merged_into_incident_id: targetIncidentId,
              target_public_id: target.public_id,
              emptied_by_merge: true,
            }),
          ],
        );
      }

      // Recompute consensus coordinates for target and source incidents
      await recomputeIncidentCoordinateConsensus(targetIncidentId, client);
      await recomputeIncidentCoordinateConsensus(resolvedSourceIncidentId, client);
    });

    const [targetIncident, sourceIncident] = await Promise.all([
      this.getIncidentDetails(targetIncidentId),
      this.getIncidentDetails(resolvedSourceIncidentId),
    ]);

    return {
      targetIncident: targetIncident!,
      sourceIncident: sourceIncident!,
    };
  }

  async purgeExpiredIncidents(asOfDate: Date = new Date()): Promise<{
    purgedIncidentCount: number;
    purgedReportCount: number;
  }> {
    return await withTransaction(async (client) => {
      // 1. Lock eligible candidate records using FOR UPDATE SKIP LOCKED
      // Excludes: PENDING, ACTIVE, retention_hold = TRUE, and already purged records (purged_at IS NOT NULL).
      const candidateRes = await client.query<{ id: string }>(
        `SELECT id FROM incidents
         WHERE status IN ('RESOLVED', 'REJECTED')
           AND retention_hold = FALSE
           AND purged_at IS NULL
           AND (
             (status = 'RESOLVED' AND resolved_at <= $1::timestamptz - INTERVAL '30 days')
             OR
             (status = 'REJECTED' AND rejected_at <= $1::timestamptz - INTERVAL '30 days')
           )
         FOR UPDATE SKIP LOCKED`,
        [asOfDate.toISOString()],
      );

      if (candidateRes.rows.length === 0) {
        return { purgedIncidentCount: 0, purgedReportCount: 0 };
      }

      const candidateIds = candidateRes.rows.map((r) => r.id);

      // 2. Recheck state under lock to guarantee that no concurrent transaction applied
      // a retention hold or altered lifecycle status between initial scan and lock acquisition
      const lockedRes = await client.query<{ id: string }>(
        `SELECT id FROM incidents
         WHERE id = ANY($1::uuid[])
           AND status IN ('RESOLVED', 'REJECTED')
           AND retention_hold = FALSE
           AND purged_at IS NULL
           AND (
             (status = 'RESOLVED' AND resolved_at <= $2::timestamptz - INTERVAL '30 days')
             OR
             (status = 'REJECTED' AND rejected_at <= $2::timestamptz - INTERVAL '30 days')
           )`,
        [candidateIds, asOfDate.toISOString()],
      );

      if (lockedRes.rows.length === 0) {
        return { purgedIncidentCount: 0, purgedReportCount: 0 };
      }

      const eligibleIncidentIds = lockedRes.rows.map((r) => r.id);

      // 3. Identify all linked raw report IDs
      const reportsRes = await client.query<{ report_id: string }>(
        `SELECT report_id FROM incident_report_links WHERE incident_id = ANY($1::uuid[])`,
        [eligibleIncidentIds],
      );
      const reportIds = reportsRes.rows.map((r) => r.report_id);

      // 4. Delete incident_reports (cascades transactionally to idempotency_receipts and incident_report_links)
      let purgedReportCount = 0;
      if (reportIds.length > 0) {
        const delReports = await client.query(
          `DELETE FROM incident_reports WHERE id = ANY($1::uuid[])`,
          [reportIds],
        );
        purgedReportCount = delReports.rowCount || 0;
      }

      // 5. Redact parent incident records and write purged_at timestamp atomically
      const redactIncidents = await client.query(
        `UPDATE incidents
         SET display_lat = NULL,
             display_lon = NULL,
             safe_public_summary = '[REDACTED ARCHIVAL RECORD — PURGED PER RETENTION POLICY D-16]',
             purged_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP,
             row_version = row_version + 1
         WHERE id = ANY($1::uuid[])`,
        [eligibleIncidentIds],
      );

      return {
        purgedIncidentCount: redactIncidents.rowCount || 0,
        purgedReportCount,
      };
    });
  }
}
