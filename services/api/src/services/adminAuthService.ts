import crypto from 'node:crypto';
import argon2 from 'argon2';
import { query, withTransaction } from '../db/pool.js';

export interface AdminUser {
  id: string;
  username: string;
  role: 'SUPERADMIN' | 'MODERATOR';
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface AdminSession {
  sessionId: string;
  adminId: string;
  username: string;
  role: 'SUPERADMIN' | 'MODERATOR';
  csrfTokenHash: string;
  expiresAt: Date;
  lastActiveAt: Date;
}

export const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const ABSOLUTE_EXPIRY_MS = 12 * 60 * 60 * 1000; // 12 hours

export class AdminAuthService {
  async verifyCredentials(username: string, password: string): Promise<AdminUser | null> {
    const res = await query<{
      id: string;
      username: string;
      password_hash: string;
      role: 'SUPERADMIN' | 'MODERATOR';
      is_active: boolean;
      last_login_at: string | null;
      created_at: string;
    }>(
      `SELECT id, username, password_hash, role, is_active, last_login_at, created_at
       FROM admin_users
       WHERE username = $1`,
      [username],
    );

    if (res.rows.length === 0) {
      return null;
    }

    const row = res.rows[0];
    if (!row.is_active) {
      return null;
    }

    const isValid = await argon2.verify(row.password_hash, password);
    if (!isValid) {
      return null;
    }

    return {
      id: row.id,
      username: row.username,
      role: row.role,
      is_active: row.is_active,
      last_login_at: row.last_login_at,
      created_at: row.created_at,
    };
  }

  async createSession(
    adminId: string,
    clientIp?: string,
    userAgent?: string,
  ): Promise<{
    rawSessionToken: string;
    rawCsrfToken: string;
    session: AdminSession;
  }> {
    const rawSessionToken = crypto.randomBytes(32).toString('hex');
    const sessionTokenHash = crypto.createHash('sha256').update(rawSessionToken).digest('hex');

    const rawCsrfToken = crypto.randomBytes(32).toString('hex');
    const csrfTokenHash = crypto.createHash('sha256').update(rawCsrfToken).digest('hex');

    const expiresAt = new Date(Date.now() + ABSOLUTE_EXPIRY_MS);

    return withTransaction(async (client) => {
      // Session rotation: revoke previous active sessions for this admin to prevent fixation
      await client.query(
        `UPDATE admin_sessions
         SET revoked_at = CURRENT_TIMESTAMP
         WHERE admin_id = $1 AND revoked_at IS NULL`,
        [adminId],
      );

      // Create new session
      const sessionRes = await client.query<{
        id: string;
        expires_at: Date;
        last_active_at: Date;
      }>(
        `INSERT INTO admin_sessions (
           session_token_hash, admin_id, csrf_token_hash, expires_at, client_ip, user_agent
         ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, expires_at, last_active_at`,
        [sessionTokenHash, adminId, csrfTokenHash, expiresAt, clientIp || null, userAgent || null],
      );

      // Update admin last_login_at
      await client.query(
        `UPDATE admin_users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [adminId],
      );

      const userRes = await client.query<{ username: string; role: 'SUPERADMIN' | 'MODERATOR' }>(
        `SELECT username, role FROM admin_users WHERE id = $1`,
        [adminId],
      );

      const sessionRow = sessionRes.rows[0];
      const userRow = userRes.rows[0];

      return {
        rawSessionToken,
        rawCsrfToken,
        session: {
          sessionId: sessionRow.id,
          adminId,
          username: userRow.username,
          role: userRow.role,
          csrfTokenHash,
          expiresAt: sessionRow.expires_at,
          lastActiveAt: sessionRow.last_active_at,
        },
      };
    });
  }

  async validateSession(rawSessionToken: string): Promise<AdminSession | null> {
    if (!rawSessionToken) {
      return null;
    }

    const sessionTokenHash = crypto.createHash('sha256').update(rawSessionToken).digest('hex');

    const res = await query<{
      session_id: string;
      admin_id: string;
      csrf_token_hash: string;
      expires_at: Date;
      last_active_at: Date;
      revoked_at: Date | null;
      username: string;
      role: 'SUPERADMIN' | 'MODERATOR';
      is_active: boolean;
    }>(
      `SELECT s.id AS session_id, s.admin_id, s.csrf_token_hash, s.expires_at, s.last_active_at, s.revoked_at,
              u.username, u.role, u.is_active
       FROM admin_sessions s
       JOIN admin_users u ON u.id = s.admin_id
       WHERE s.session_token_hash = $1`,
      [sessionTokenHash],
    );

    if (res.rows.length === 0) {
      return null;
    }

    const row = res.rows[0];

    // Check revoked or inactive user
    if (row.revoked_at !== null || !row.is_active) {
      return null;
    }

    const now = Date.now();
    const expiresTime = new Date(row.expires_at).getTime();
    const lastActiveTime = new Date(row.last_active_at).getTime();

    // Check absolute expiration (12 hours)
    if (now >= expiresTime) {
      await query(
        `UPDATE admin_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1 AND revoked_at IS NULL`,
        [row.session_id],
      );
      return null;
    }

    // Check idle expiration (30 minutes)
    if (now - lastActiveTime > IDLE_TIMEOUT_MS) {
      await query(
        `UPDATE admin_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1 AND revoked_at IS NULL`,
        [row.session_id],
      );
      return null;
    }

    // Refresh last_active_at
    await query(`UPDATE admin_sessions SET last_active_at = CURRENT_TIMESTAMP WHERE id = $1`, [
      row.session_id,
    ]);

    return {
      sessionId: row.session_id,
      adminId: row.admin_id,
      username: row.username,
      role: row.role,
      csrfTokenHash: row.csrf_token_hash,
      expiresAt: row.expires_at,
      lastActiveAt: new Date(),
    };
  }

  async revokeSession(rawSessionToken: string): Promise<void> {
    if (!rawSessionToken) return;
    const sessionTokenHash = crypto.createHash('sha256').update(rawSessionToken).digest('hex');
    await query(
      `UPDATE admin_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE session_token_hash = $1 AND revoked_at IS NULL`,
      [sessionTokenHash],
    );
  }

  async refreshCsrfToken(
    sessionId: string,
  ): Promise<{ rawCsrfToken: string; csrfTokenHash: string }> {
    const rawCsrfToken = crypto.randomBytes(32).toString('hex');
    const csrfTokenHash = crypto.createHash('sha256').update(rawCsrfToken).digest('hex');
    await query(
      `UPDATE admin_sessions SET csrf_token_hash = $1 WHERE id = $2 AND revoked_at IS NULL`,
      [csrfTokenHash, sessionId],
    );
    return { rawCsrfToken, csrfTokenHash };
  }

  validateCsrfToken(rawCsrfToken: string, storedCsrfTokenHash: string): boolean {
    if (!rawCsrfToken || !storedCsrfTokenHash) return false;
    const computedHash = crypto.createHash('sha256').update(rawCsrfToken).digest('hex');
    const computedBuf = Buffer.from(computedHash, 'utf-8');
    const storedBuf = Buffer.from(storedCsrfTokenHash, 'utf-8');
    if (computedBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(computedBuf, storedBuf);
  }
}
