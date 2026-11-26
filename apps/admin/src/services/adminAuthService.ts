import type { AdminUser } from '../types/admin.js';

export function getApiBaseUrl(): string {
  const envUrl = (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL;
  if (envUrl) return envUrl;
  if (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1') {
    return 'http://127.0.0.1:4000';
  }
  return 'http://localhost:4000';
}

class AdminAuthService {
  private inMemoryCsrfToken: string | null = null;

  public getCsrfToken(): string | null {
    return this.inMemoryCsrfToken;
  }

  public setCsrfToken(token: string | null): void {
    this.inMemoryCsrfToken = token;
  }

  public async login(
    username: string,
    password: string,
  ): Promise<{ user: AdminUser; csrfToken: string }> {
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/api/v1/admin/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const message =
        err.error?.message ||
        (res.status === 429 ? err.message : null) ||
        err.message ||
        'Authentication failed. Please check your credentials.';
      throw new Error(message);
    }

    const data = await res.json();
    this.setCsrfToken(data.csrf_token);
    return {
      user: data.user,
      csrfToken: data.csrf_token,
    };
  }

  public async ensureCsrfToken(): Promise<string | null> {
    if (this.inMemoryCsrfToken) {
      return this.inMemoryCsrfToken;
    }
    await this.getProfile();
    return this.inMemoryCsrfToken;
  }

  public async logout(): Promise<void> {
    const baseUrl = getApiBaseUrl();
    const csrf = (await this.ensureCsrfToken()) || this.getCsrfToken();
    try {
      await fetch(`${baseUrl}/api/v1/admin/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
        credentials: 'include',
      });
    } finally {
      this.setCsrfToken(null);
    }
  }

  public async getProfile(): Promise<AdminUser | null> {
    const baseUrl = getApiBaseUrl();
    try {
      const res = await fetch(`${baseUrl}/api/v1/admin/auth/me`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        credentials: 'include',
      });

      if (!res.ok) {
        return null;
      }

      const data = await res.json();
      if (data.csrf_token) {
        this.setCsrfToken(data.csrf_token);
      }
      return data.user;
    } catch {
      return null;
    }
  }
}

export const adminAuthService = new AdminAuthService();
