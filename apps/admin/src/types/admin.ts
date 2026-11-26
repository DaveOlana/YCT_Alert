export type IncidentStatus = 'PENDING' | 'UNDER_REVIEW' | 'ACTIVE' | 'RESOLVED' | 'REJECTED';

export type IncidentStatusFilter = 'ALL' | IncidentStatus;

export interface AdminUser {
  id: string;
  username: string;
  role: 'SUPERADMIN' | 'MODERATOR';
}

export interface IncidentSummary {
  id: string;
  public_id: string;
  status: 'PENDING' | 'UNDER_REVIEW' | 'ACTIVE' | 'RESOLVED' | 'REJECTED';
  category_code: string;
  safe_public_summary: string | null;
  display_lat: number | string | null;
  display_lon: number | string | null;
  first_reported_at: string;
  last_reported_at: string;
  assigned_admin_id: string | null;
  assigned_admin_username: string | null;
  triaged_at: string | null;
  activated_at: string | null;
  resolved_at: string | null;
  rejected_at: string | null;
  retention_hold: boolean;
  purged_at: string | null;
  report_count: number;
}

export interface IncidentQueueResponse {
  items: IncidentSummary[];
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
}

export interface IncidentAuditLog {
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
  created_at: string;
}

export interface IncidentLinkedReport {
  id: string;
  receipt_id: string;
  category_code: string;
  description: string;
  location_source: string;
  incident_lat: number | string | null;
  incident_lon: number | string | null;
  yct_map_place_id: string | null;
  place_name_snapshot: string | null;
  landmark_description: string | null;
  is_test: boolean;
  submitted_at: string;
  match_method?: 'CREATION' | 'SUGGESTED' | 'ADMIN' | string;
  linked_at?: string;
}

export interface AdminUserRecord {
  id: string;
  username: string;
  role: 'SUPERADMIN' | 'MODERATOR';
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface ListAdminUsersResponse {
  users: AdminUserRecord[];
}

export interface UnlinkReportResponse {
  message: string;
  sourceIncident: IncidentDetail;
  newIncident: IncidentDetail;
}

export interface MergeReportResponse {
  message: string;
  targetIncident: IncidentDetail;
  sourceIncident: IncidentDetail;
}

export interface ReviseSummaryResponse {
  message: string;
  incident: IncidentDetail;
}

export interface IncidentDetail {
  incident: IncidentSummary & {
    resolution_reason: string | null;
    rejection_reason: string | null;
    retention_hold_reason: string | null;
    retention_hold_at: string | null;
    retention_hold_by_username: string | null;
    row_version: number;
  };
  reports: IncidentLinkedReport[];
  auditLogs: IncidentAuditLog[];
}
