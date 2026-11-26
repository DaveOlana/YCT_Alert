import argon2 from 'argon2';
import type { AdminUserSummary, CreateModeratorRequest } from '@yctalert/contracts';
import { query, withTransaction } from '../db/pool.js';

export const SUPERADMIN_USERNAME = 'ALERTadmin';

export function validatePasswordStrength(password: string): {
  valid: boolean;
  reason?: string;
} {
  if (password.length < 10) {
    return {
      valid: false,
      reason: 'Password must be at least 10 characters long.',
    };
  }
  if (!/[A-Z]/.test(password)) {
    return {
      valid: false,
      reason: 'Password must contain at least one uppercase letter.',
    };
  }
  if (!/[a-z]/.test(password)) {
    return {
      valid: false,
      reason: 'Password must contain at least one lowercase letter.',
    };
  }
  if (!/[0-9]/.test(password)) {
    return {
      valid: false,
      reason: 'Password must contain at least one number.',
    };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return {
      valid: false,
      reason: 'Password must contain at least one special character.',
    };
  }
  return { valid: true };
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

export class AdminUserService {
  async listUsers(): Promise<AdminUserSummary[]> {
    const res = await query<{
      id: string;
      username: string;
      role: 'SUPERADMIN' | 'MODERATOR';
      is_active: boolean;
      created_at: Date;
      last_login_at: Date | null;
    }>(
      `SELECT id, username, role, is_active, created_at, last_login_at
       FROM admin_users
       ORDER BY created_at ASC`,
    );

    return res.rows.map((row) => ({
      id: row.id,
      username: row.username,
      role: row.role,
      is_active: row.is_active,
      created_at: row.created_at.toISOString(),
      last_login_at: row.last_login_at ? row.last_login_at.toISOString() : null,
    }));
  }

  async createModerator(
    caller: { id: string; username: string },
    req: CreateModeratorRequest,
    requestId?: string,
  ): Promise<AdminUserSummary> {
    const normalizedUsername = req.username.trim();

    // Prevent collision with reserved superadmin name (case-insensitive)
    if (normalizedUsername.toLowerCase() === SUPERADMIN_USERNAME.toLowerCase()) {
      throw new Error('RESERVED_USERNAME');
    }

    // Password policy validation
    const passwordCheck = validatePasswordStrength(req.password);
    if (!passwordCheck.valid) {
      throw new Error(`PASSWORD_POLICY_VIOLATION: ${passwordCheck.reason}`);
    }

    const passwordHash = await hashPassword(req.password);
    const reason = req.reason?.trim() || 'Provisioned student moderator account';

    return withTransaction(async (client) => {
      // Advisory lock serializes moderator provisioning
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['ADMIN_USER_PROVISION']);

      // Enforce case-insensitive uniqueness check
      const existing = await client.query<{ id: string }>(
        'SELECT id FROM admin_users WHERE LOWER(username) = LOWER($1)',
        [normalizedUsername],
      );

      if (existing.rows.length > 0) {
        throw new Error('DUPLICATE_USERNAME');
      }

      // Insert new moderator
      const insertRes = await client.query<{
        id: string;
        username: string;
        role: 'SUPERADMIN' | 'MODERATOR';
        is_active: boolean;
        created_at: Date;
        last_login_at: Date | null;
      }>(
        `INSERT INTO admin_users (username, password_hash, role, is_active)
         VALUES ($1, $2, 'MODERATOR', TRUE)
         RETURNING id, username, role, is_active, created_at, last_login_at`,
        [normalizedUsername, passwordHash],
      );

      const newUser = insertRes.rows[0];

      // Record immutable governance audit
      await client.query(
        `INSERT INTO admin_governance_audit_logs (
           admin_id, admin_username, target_admin_id, target_username, action, reason, request_id, metadata
         ) VALUES ($1, $2, $3, $4, 'MODERATOR_CREATED', $5, $6, $7)`,
        [
          caller.id,
          caller.username,
          newUser.id,
          newUser.username,
          reason,
          requestId || null,
          JSON.stringify({ role: 'MODERATOR' }),
        ],
      );

      return {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role,
        is_active: newUser.is_active,
        created_at: newUser.created_at.toISOString(),
        last_login_at: null,
      };
    });
  }

  async revokeModerator(
    caller: { id: string; username: string },
    targetId: string,
    reason: string,
    requestId?: string,
  ): Promise<AdminUserSummary> {
    return withTransaction(async (client) => {
      // Row-lock target user
      const checkRes = await client.query<{
        id: string;
        username: string;
        role: string;
        is_active: boolean;
      }>('SELECT id, username, role, is_active FROM admin_users WHERE id = $1 FOR UPDATE', [
        targetId,
      ]);

      if (checkRes.rows.length === 0) {
        throw new Error('USER_NOT_FOUND');
      }

      const target = checkRes.rows[0];

      // Critical Invariant: Prevent deactivation of ALERTadmin
      if (
        target.username === SUPERADMIN_USERNAME ||
        target.username.toLowerCase() === SUPERADMIN_USERNAME.toLowerCase()
      ) {
        throw new Error('CANNOT_REVOKE_SUPERADMIN');
      }

      // Prevent self-revocation
      if (caller.id === target.id) {
        throw new Error('CANNOT_REVOKE_SELF');
      }

      // Deactivate target user
      const updateRes = await client.query<{
        id: string;
        username: string;
        role: 'SUPERADMIN' | 'MODERATOR';
        is_active: boolean;
        created_at: Date;
        last_login_at: Date | null;
      }>(
        `UPDATE admin_users
         SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id, username, role, is_active, created_at, last_login_at`,
        [targetId],
      );

      // Immediate session revocation: Invalidate all active sessions for this administrator
      await client.query(
        `UPDATE admin_sessions
         SET revoked_at = CURRENT_TIMESTAMP
         WHERE admin_id = $1 AND revoked_at IS NULL`,
        [targetId],
      );

      // Record immutable governance audit
      await client.query(
        `INSERT INTO admin_governance_audit_logs (
           admin_id, admin_username, target_admin_id, target_username, action, reason, request_id, metadata
         ) VALUES ($1, $2, $3, $4, 'MODERATOR_REVOKED', $5, $6, $7)`,
        [
          caller.id,
          caller.username,
          target.id,
          target.username,
          reason.trim(),
          requestId || null,
          JSON.stringify({
            previous_active_state: target.is_active,
            new_active_state: false,
          }),
        ],
      );

      const user = updateRes.rows[0];
      return {
        id: user.id,
        username: user.username,
        role: user.role,
        is_active: user.is_active,
        created_at: user.created_at.toISOString(),
        last_login_at: user.last_login_at ? user.last_login_at.toISOString() : null,
      };
    });
  }

  async resetModeratorPassword(
    caller: { id: string; username: string },
    targetId: string,
    newPassword: string,
    reason?: string,
    requestId?: string,
  ): Promise<AdminUserSummary> {
    const passwordCheck = validatePasswordStrength(newPassword);
    if (!passwordCheck.valid) {
      throw new Error(`PASSWORD_POLICY_VIOLATION: ${passwordCheck.reason}`);
    }

    const passwordHash = await hashPassword(newPassword);
    const auditReason = reason?.trim() || 'Administrative password reset';

    return withTransaction(async (client) => {
      // Row-lock target user
      const checkRes = await client.query<{
        id: string;
        username: string;
        role: string;
        is_active: boolean;
      }>('SELECT id, username, role, is_active FROM admin_users WHERE id = $1 FOR UPDATE', [
        targetId,
      ]);

      if (checkRes.rows.length === 0) {
        throw new Error('USER_NOT_FOUND');
      }

      const target = checkRes.rows[0];

      // Critical Invariant: Prevent password reset of ALERTadmin via moderator management API
      if (
        target.username === SUPERADMIN_USERNAME ||
        target.username.toLowerCase() === SUPERADMIN_USERNAME.toLowerCase()
      ) {
        throw new Error('CANNOT_RESET_SUPERADMIN_VIA_API');
      }

      // Update password hash
      const updateRes = await client.query<{
        id: string;
        username: string;
        role: 'SUPERADMIN' | 'MODERATOR';
        is_active: boolean;
        created_at: Date;
        last_login_at: Date | null;
      }>(
        `UPDATE admin_users
         SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, username, role, is_active, created_at, last_login_at`,
        [passwordHash, targetId],
      );

      // Immediate session revocation: Invalidate all existing sessions on credential change
      await client.query(
        `UPDATE admin_sessions
         SET revoked_at = CURRENT_TIMESTAMP
         WHERE admin_id = $1 AND revoked_at IS NULL`,
        [targetId],
      );

      // Record immutable governance audit
      await client.query(
        `INSERT INTO admin_governance_audit_logs (
           admin_id, admin_username, target_admin_id, target_username, action, reason, request_id, metadata
         ) VALUES ($1, $2, $3, $4, 'PASSWORD_RESET', $5, $6, $7)`,
        [
          caller.id,
          caller.username,
          target.id,
          target.username,
          auditReason,
          requestId || null,
          JSON.stringify({ sessions_revoked: true }),
        ],
      );

      const user = updateRes.rows[0];
      return {
        id: user.id,
        username: user.username,
        role: user.role,
        is_active: user.is_active,
        created_at: user.created_at.toISOString(),
        last_login_at: user.last_login_at ? user.last_login_at.toISOString() : null,
      };
    });
  }
}
