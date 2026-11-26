import type {
  IncidentDetail,
  IncidentQueueResponse,
  IncidentStatusFilter,
  ReviseSummaryResponse,
  UnlinkReportResponse,
  MergeReportResponse,
} from '../types/admin.js';
import { adminAuthService, getApiBaseUrl } from './adminAuthService.js';

async function getCsrfHeaders(): Promise<Record<string, string>> {
  const csrf = (await adminAuthService.ensureCsrfToken()) || adminAuthService.getCsrfToken();
  return {
    'Content-Type': 'application/json',
    ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
  };
}

export const adminIncidentService = {
  async getQueue(
    params: {
      status?: IncidentStatusFilter;
      category?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<IncidentQueueResponse> {
    const q = new URLSearchParams();
    if (params.status && params.status !== 'ALL') q.set('status', params.status);
    if (params.category) q.set('category', params.category);
    if (params.page) q.set('page', String(params.page));
    if (params.limit) q.set('limit', String(params.limit));

    const url = `${getApiBaseUrl()}/api/v1/admin/incidents?${q.toString()}`;
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to fetch incident queue.');
    }

    return res.json();
  },

  async getIncidentDetails(id: string): Promise<IncidentDetail> {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/admin/incidents/${id}`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to fetch incident details.');
    }

    return res.json();
  },

  async claimIncident(id: string, reason?: string): Promise<IncidentDetail> {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/admin/incidents/${id}/claim`, {
      method: 'POST',
      headers: await getCsrfHeaders(),
      credentials: 'include',
      body: JSON.stringify({ reason }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to claim incident.');
    }

    return res.json();
  },

  async activateIncident(
    id: string,
    payload: {
      safe_summary: string;
      reason?: string;
      display_latitude?: number;
      display_longitude?: number;
    },
  ): Promise<IncidentDetail> {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/admin/incidents/${id}/activate`, {
      method: 'POST',
      headers: await getCsrfHeaders(),
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to activate incident.');
    }

    return res.json();
  },

  async resolveIncident(id: string, resolution_reason: string): Promise<IncidentDetail> {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/admin/incidents/${id}/resolve`, {
      method: 'POST',
      headers: await getCsrfHeaders(),
      credentials: 'include',
      body: JSON.stringify({ resolution_reason }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to resolve incident.');
    }

    return res.json();
  },

  async rejectIncident(id: string, rejection_reason: string): Promise<IncidentDetail> {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/admin/incidents/${id}/reject`, {
      method: 'POST',
      headers: await getCsrfHeaders(),
      credentials: 'include',
      body: JSON.stringify({ rejection_reason }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to reject incident.');
    }

    return res.json();
  },

  async setRetentionHold(
    id: string,
    retention_hold: boolean,
    reason: string,
  ): Promise<IncidentDetail> {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/admin/incidents/${id}/retention-hold`, {
      method: 'POST',
      headers: await getCsrfHeaders(),
      credentials: 'include',
      body: JSON.stringify({ retention_hold, reason }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to update retention hold.');
    }

    return res.json();
  },

  async reviseIncidentSummary(
    id: string,
    payload: {
      safe_summary: string;
      reason: string;
      expected_version: number;
    },
  ): Promise<ReviseSummaryResponse> {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/admin/incidents/${id}/summary`, {
      method: 'PATCH',
      headers: await getCsrfHeaders(),
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const errorObj = new Error(err.error?.message || 'Failed to revise incident summary.');
      if (err.error?.code) {
        (errorObj as Error & { code?: string }).code = err.error.code;
      }
      throw errorObj;
    }

    return res.json();
  },

  async unlinkReport(
    incidentId: string,
    reportId: string,
    payload: {
      reason: string;
      expected_version: number;
    },
  ): Promise<UnlinkReportResponse> {
    const res = await fetch(
      `${getApiBaseUrl()}/api/v1/admin/incidents/${incidentId}/reports/${reportId}/unlink`,
      {
        method: 'POST',
        headers: await getCsrfHeaders(),
        credentials: 'include',
        body: JSON.stringify(payload),
      },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const errorObj = new Error(err.error?.message || 'Failed to unlink report.');
      if (err.error?.code) {
        (errorObj as Error & { code?: string }).code = err.error.code;
      }
      throw errorObj;
    }

    return res.json();
  },

  async mergeReport(
    targetIncidentId: string,
    payload: {
      report_id: string;
      reason: string;
      expected_version: number;
      source_expected_version: number;
    },
  ): Promise<MergeReportResponse> {
    const res = await fetch(
      `${getApiBaseUrl()}/api/v1/admin/incidents/${targetIncidentId}/merge-report`,
      {
        method: 'POST',
        headers: await getCsrfHeaders(),
        credentials: 'include',
        body: JSON.stringify(payload),
      },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const errorObj = new Error(err.error?.message || 'Failed to merge report.');
      if (err.error?.code) {
        (errorObj as Error & { code?: string }).code = err.error.code;
      }
      throw errorObj;
    }

    return res.json();
  },
};
