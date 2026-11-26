import type { AdminUserRecord, ListAdminUsersResponse } from '../types/admin.js';
import { adminAuthService, getApiBaseUrl } from './adminAuthService.js';

async function getCsrfHeaders(): Promise<Record<string, string>> {
  const csrf = (await adminAuthService.ensureCsrfToken()) || adminAuthService.getCsrfToken();
  return {
    'Content-Type': 'application/json',
    ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
  };
}

export const adminUserService = {
  async listUsers(): Promise<ListAdminUsersResponse> {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/admin/users`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const errorObj = new Error(err.error?.message || 'Failed to list administrator accounts.');
      if (err.error?.code) {
        (errorObj as Error & { code?: string }).code = err.error.code;
      }
      throw errorObj;
    }

    return res.json();
  },

  async createModerator(payload: {
    username: string;
    password: string;
    reason?: string;
  }): Promise<{ user: AdminUserRecord; message: string }> {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/admin/users`, {
      method: 'POST',
      headers: await getCsrfHeaders(),
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const errorObj = new Error(err.error?.message || 'Failed to create moderator account.');
      if (err.error?.code) {
        (errorObj as Error & { code?: string }).code = err.error.code;
      }
      throw errorObj;
    }

    return res.json();
  },

  async revokeModerator(
    id: string,
    reason: string,
  ): Promise<{ message: string; revoked_admin_id: string }> {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/admin/users/${id}/revoke`, {
      method: 'POST',
      headers: await getCsrfHeaders(),
      credentials: 'include',
      body: JSON.stringify({ reason }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const errorObj = new Error(err.error?.message || 'Failed to revoke administrator account.');
      if (err.error?.code) {
        (errorObj as Error & { code?: string }).code = err.error.code;
      }
      throw errorObj;
    }

    return res.json();
  },

  async resetModeratorPassword(
    id: string,
    payload: {
      new_password: string;
      reason?: string;
    },
  ): Promise<{ message: string; reset_admin_id: string }> {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/admin/users/${id}/reset-password`, {
      method: 'POST',
      headers: await getCsrfHeaders(),
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const errorObj = new Error(err.error?.message || 'Failed to reset moderator password.');
      if (err.error?.code) {
        (errorObj as Error & { code?: string }).code = err.error.code;
      }
      throw errorObj;
    }

    return res.json();
  },
};
