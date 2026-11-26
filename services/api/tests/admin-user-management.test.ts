import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';
import { bootstrapAdmin } from '../scripts/bootstrap-admin.js';
import { runMigrations } from '../scripts/migrate.js';

const SUPERADMIN_PASSWORD = 'ValidSuperSecret123!@#Admin';

test('Administrator Role Management & Immediate Session Revocation Suite (G2.2)', async (t) => {
  const config = loadConfig({ NODE_ENV: 'test' });
  const app = buildApp(config);

  await runMigrations({
    databaseUrl: config.TEST_DATABASE_URL,
    direction: 'up',
    verbose: false,
  });

  const pool = new Pool({ connectionString: config.TEST_DATABASE_URL, max: 2 });

  t.after(async () => {
    await app.close();
    await pool.end();
  });

  // Clean tables before test run
  await pool.query(
    'TRUNCATE TABLE admin_governance_audit_logs, admin_sessions, admin_users CASCADE',
  );

  // 1. Provision bootstrap superadmin
  await bootstrapAdmin({
    databaseUrl: config.TEST_DATABASE_URL,
    password: SUPERADMIN_PASSWORD,
  });

  // Login as superadmin to obtain session cookie & CSRF token
  const superLoginRes = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/auth/login',
    payload: {
      username: 'ALERTadmin',
      password: SUPERADMIN_PASSWORD,
    },
  });
  assert.equal(superLoginRes.statusCode, 200);
  const superCookie = (superLoginRes.headers['set-cookie'] as string).split(';')[0];
  const superCsrf = superLoginRes.json().csrf_token;
  const superUser = superLoginRes.json().user;
  assert.equal(superUser.role, 'SUPERADMIN');

  let testModeratorId = '';

  await t.test(
    'GET /api/v1/admin/users: Lists accounts without exposing password hashes or tokens',
    async () => {
      // Unauthenticated request fails
      const unauthRes = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/users',
      });
      assert.equal(unauthRes.statusCode, 401);

      // Superadmin list
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/users',
        headers: { cookie: superCookie },
      });
      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.ok(Array.isArray(body.users));
      assert.equal(body.users.length, 1);
      assert.equal(body.users[0].username, 'ALERTadmin');
      assert.equal(body.users[0].role, 'SUPERADMIN');
      assert.equal(body.users[0].is_active, true);
      assert.equal(body.users[0].password_hash, undefined);
      assert.equal(body.users[0].session_token, undefined);
    },
  );

  await t.test(
    'POST /api/v1/admin/users: Creates MODERATOR with Argon2id and generates immutable audit',
    async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/users',
        headers: {
          cookie: superCookie,
          'x-csrf-token': superCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          username: 'mod_john',
          password: 'ModPassword123!@#',
          reason: 'Authorized student moderator onboarding',
        },
      });

      assert.equal(res.statusCode, 201);
      const body = res.json();
      assert.equal(body.user.username, 'mod_john');
      assert.equal(body.user.role, 'MODERATOR');
      assert.equal(body.user.is_active, true);
      assert.equal(body.user.password_hash, undefined);
      testModeratorId = body.user.id;

      // Database verification: Argon2id hash & role
      const dbUser = await pool.query<{ password_hash: string; role: string; is_active: boolean }>(
        'SELECT password_hash, role, is_active FROM admin_users WHERE id = $1',
        [testModeratorId],
      );
      assert.equal(dbUser.rows.length, 1);
      assert.equal(dbUser.rows[0].role, 'MODERATOR');
      assert.equal(dbUser.rows[0].is_active, true);
      assert.ok(dbUser.rows[0].password_hash.startsWith('$argon2id$'));

      // Governance audit verification
      const auditRes = await pool.query<{
        admin_username: string;
        target_username: string;
        action: string;
        reason: string;
      }>(
        'SELECT admin_username, target_username, action, reason FROM admin_governance_audit_logs WHERE target_admin_id = $1',
        [testModeratorId],
      );
      assert.equal(auditRes.rows.length, 1);
      assert.equal(auditRes.rows[0].admin_username, 'ALERTadmin');
      assert.equal(auditRes.rows[0].target_username, 'mod_john');
      assert.equal(auditRes.rows[0].action, 'MODERATOR_CREATED');
      assert.equal(auditRes.rows[0].reason, 'Authorized student moderator onboarding');
    },
  );

  await t.test(
    'RBAC: Created moderator can log in but cannot access moderator management endpoints',
    async () => {
      // Moderator logs in
      const modLoginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/auth/login',
        payload: {
          username: 'mod_john',
          password: 'ModPassword123!@#',
        },
      });
      assert.equal(modLoginRes.statusCode, 200);
      const modCookie = (modLoginRes.headers['set-cookie'] as string).split(';')[0];
      const modCsrf = modLoginRes.json().csrf_token;
      assert.equal(modLoginRes.json().user.role, 'MODERATOR');

      // GET /api/v1/admin/users -> 403 Forbidden
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/users',
        headers: { cookie: modCookie },
      });
      assert.equal(listRes.statusCode, 403);
      assert.equal(listRes.json().error.code, 'FORBIDDEN');

      // POST /api/v1/admin/users -> 403 Forbidden
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/users',
        headers: {
          cookie: modCookie,
          'x-csrf-token': modCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          username: 'mod_rogue',
          password: 'ModPassword123!@#',
        },
      });
      assert.equal(createRes.statusCode, 403);
      assert.equal(createRes.json().error.code, 'FORBIDDEN');

      // POST /api/v1/admin/users/:id/revoke -> 403 Forbidden
      const revokeRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/users/${testModeratorId}/revoke`,
        headers: {
          cookie: modCookie,
          'x-csrf-token': modCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          reason: 'Unauthorized deactivation attempt',
        },
      });
      assert.equal(revokeRes.statusCode, 403);
      assert.equal(revokeRes.json().error.code, 'FORBIDDEN');

      // POST /api/v1/admin/users/:id/reset-password -> 403 Forbidden
      const resetRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/users/${testModeratorId}/reset-password`,
        headers: {
          cookie: modCookie,
          'x-csrf-token': modCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          new_password: 'NewModPassword123!@#',
        },
      });
      assert.equal(resetRes.statusCode, 403);
      assert.equal(resetRes.json().error.code, 'FORBIDDEN');
    },
  );

  await t.test(
    'POST /api/v1/admin/users: Enforces username validation, uniqueness and reserved words',
    async () => {
      // Duplicate username (exact match)
      const dupRes = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/users',
        headers: {
          cookie: superCookie,
          'x-csrf-token': superCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          username: 'mod_john',
          password: 'ModPassword123!@#',
        },
      });
      assert.equal(dupRes.statusCode, 409);
      assert.equal(dupRes.json().error.code, 'DUPLICATE_USERNAME');

      // Duplicate username (case-insensitive match)
      const dupCaseRes = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/users',
        headers: {
          cookie: superCookie,
          'x-csrf-token': superCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          username: 'MOD_JOHN',
          password: 'ModPassword123!@#',
        },
      });
      assert.equal(dupCaseRes.statusCode, 409);
      assert.equal(dupCaseRes.json().error.code, 'DUPLICATE_USERNAME');

      // Reserved bootstrap username ALERTadmin
      const reservedRes = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/users',
        headers: {
          cookie: superCookie,
          'x-csrf-token': superCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          username: 'ALERTadmin',
          password: 'ModPassword123!@#',
        },
      });
      assert.equal(reservedRes.statusCode, 400);
      assert.equal(reservedRes.json().error.code, 'RESERVED_USERNAME');

      // Invalid characters (spaces, symbols)
      const invalidCharRes = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/users',
        headers: {
          cookie: superCookie,
          'x-csrf-token': superCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          username: 'mod-user@123',
          password: 'ModPassword123!@#',
        },
      });
      assert.equal(invalidCharRes.statusCode, 400);
      assert.equal(invalidCharRes.json().error.code, 'VALIDATION_ERROR');

      // Too short username (< 3 chars)
      const shortRes = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/users',
        headers: {
          cookie: superCookie,
          'x-csrf-token': superCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          username: 'ab',
          password: 'ModPassword123!@#',
        },
      });
      assert.equal(shortRes.statusCode, 400);
      assert.equal(shortRes.json().error.code, 'VALIDATION_ERROR');
    },
  );

  await t.test('POST /api/v1/admin/users: Enforces strong password policy', async () => {
    // Missing uppercase
    const noUpperRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: {
        cookie: superCookie,
        'x-csrf-token': superCsrf,
        origin: 'http://localhost:5173',
      },
      payload: {
        username: 'mod_badpass1',
        password: 'password12345!@#',
      },
    });
    assert.equal(noUpperRes.statusCode, 400);
    assert.equal(noUpperRes.json().error.code, 'WEAK_PASSWORD');

    // Missing lowercase
    const noLowerRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: {
        cookie: superCookie,
        'x-csrf-token': superCsrf,
        origin: 'http://localhost:5173',
      },
      payload: {
        username: 'mod_badpass2',
        password: 'PASSWORD12345!@#',
      },
    });
    assert.equal(noLowerRes.statusCode, 400);
    assert.equal(noLowerRes.json().error.code, 'WEAK_PASSWORD');

    // Missing number
    const noNumRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: {
        cookie: superCookie,
        'x-csrf-token': superCsrf,
        origin: 'http://localhost:5173',
      },
      payload: {
        username: 'mod_badpass3',
        password: 'PasswordNoNumber!@#',
      },
    });
    assert.equal(noNumRes.statusCode, 400);
    assert.equal(noNumRes.json().error.code, 'WEAK_PASSWORD');

    // Missing special character
    const noSpecialRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: {
        cookie: superCookie,
        'x-csrf-token': superCsrf,
        origin: 'http://localhost:5173',
      },
      payload: {
        username: 'mod_badpass4',
        password: 'Password12345678',
      },
    });
    assert.equal(noSpecialRes.statusCode, 400);
    assert.equal(noSpecialRes.json().error.code, 'WEAK_PASSWORD');
  });

  await t.test(
    'POST /api/v1/admin/users/:id/revoke: Deactivates moderator & immediately invalidates active sessions',
    async () => {
      // 1. Create a moderator Alice
      const createAliceRes = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/users',
        headers: {
          cookie: superCookie,
          'x-csrf-token': superCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          username: 'mod_alice',
          password: 'AliceSecurePass123!@#',
          reason: 'Shift team lead',
        },
      });
      assert.equal(createAliceRes.statusCode, 201);
      const aliceId = createAliceRes.json().user.id;

      // 2. Alice logs in to establish an active session
      const aliceLogin = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/auth/login',
        remoteAddress: '127.0.0.10',
        payload: {
          username: 'mod_alice',
          password: 'AliceSecurePass123!@#',
        },
      });
      assert.equal(aliceLogin.statusCode, 200);
      const aliceCookie = (aliceLogin.headers['set-cookie'] as string).split(';')[0];

      // 3. Alice verifies session is valid
      const meBefore = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/auth/me',
        headers: { cookie: aliceCookie },
      });
      assert.equal(meBefore.statusCode, 200);
      assert.equal(meBefore.json().user.username, 'mod_alice');

      // 4. Superadmin revokes Alice
      const revokeRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/users/${aliceId}/revoke`,
        headers: {
          cookie: superCookie,
          'x-csrf-token': superCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          reason: 'Completed campus rotation; immediate credential deactivation',
        },
      });
      assert.equal(revokeRes.statusCode, 200);
      assert.equal(revokeRes.json().user.is_active, false);

      // 5. Database check: user is_active = FALSE and all sessions revoked
      const dbAlice = await pool.query<{ is_active: boolean }>(
        'SELECT is_active FROM admin_users WHERE id = $1',
        [aliceId],
      );
      assert.equal(dbAlice.rows[0].is_active, false);

      const activeSessions = await pool.query<{ count: string }>(
        'SELECT count(*) FROM admin_sessions WHERE admin_id = $1 AND revoked_at IS NULL',
        [aliceId],
      );
      assert.equal(activeSessions.rows[0].count, '0');

      // 6. Alice attempts immediate action with existing cookie -> 401 SESSION_EXPIRED
      const meAfter = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/auth/me',
        headers: { cookie: aliceCookie },
      });
      assert.equal(meAfter.statusCode, 401);
      assert.equal(meAfter.json().error.code, 'SESSION_EXPIRED');

      // 7. Alice attempts to log in again -> 401 UNAUTHORIZED (deactivated account)
      const reLogin = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/auth/login',
        remoteAddress: '127.0.0.11',
        payload: {
          username: 'mod_alice',
          password: 'AliceSecurePass123!@#',
        },
      });
      assert.equal(reLogin.statusCode, 401);

      // 8. Audit event check
      const auditRes = await pool.query<{ action: string; reason: string }>(
        'SELECT action, reason FROM admin_governance_audit_logs WHERE target_admin_id = $1 AND action = $2',
        [aliceId, 'MODERATOR_REVOKED'],
      );
      assert.equal(auditRes.rows.length, 1);
      assert.equal(
        auditRes.rows[0].reason,
        'Completed campus rotation; immediate credential deactivation',
      );
    },
  );

  await t.test(
    'POST /api/v1/admin/users/:id/reset-password: Resets credentials & invalidates sessions',
    async () => {
      // 1. Create a moderator Bob
      const createBobRes = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/users',
        headers: {
          cookie: superCookie,
          'x-csrf-token': superCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          username: 'mod_bob',
          password: 'BobSecurePass123!@#',
          reason: 'Weekend shift operator',
        },
      });
      assert.equal(createBobRes.statusCode, 201);
      const bobId = createBobRes.json().user.id;

      // 2. Bob logs in with initial password
      const bobLogin = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/auth/login',
        remoteAddress: '127.0.0.20',
        payload: {
          username: 'mod_bob',
          password: 'BobSecurePass123!@#',
        },
      });
      assert.equal(bobLogin.statusCode, 200);
      const bobCookie = (bobLogin.headers['set-cookie'] as string).split(';')[0];

      // 3. Bob's session works
      const meBefore = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/auth/me',
        headers: { cookie: bobCookie },
      });
      assert.equal(meBefore.statusCode, 200);

      // 4. Superadmin resets Bob's password
      const resetRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/users/${bobId}/reset-password`,
        headers: {
          cookie: superCookie,
          'x-csrf-token': superCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          new_password: 'NewBobSecurePass456!@#',
          reason: 'Routine quarterly credential rotation',
        },
      });
      assert.equal(resetRes.statusCode, 200);

      // 5. Bob's existing session is immediately revoked -> 401
      const meAfter = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/auth/me',
        headers: { cookie: bobCookie },
      });
      assert.equal(meAfter.statusCode, 401);

      // 6. Old password fails
      const oldLogin = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/auth/login',
        remoteAddress: '127.0.0.21',
        payload: {
          username: 'mod_bob',
          password: 'BobSecurePass123!@#',
        },
      });
      assert.equal(oldLogin.statusCode, 401);

      // 7. New password succeeds
      const newLogin = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/auth/login',
        remoteAddress: '127.0.0.22',
        payload: {
          username: 'mod_bob',
          password: 'NewBobSecurePass456!@#',
        },
      });
      assert.equal(newLogin.statusCode, 200);

      // 8. Governance audit record verified
      const auditRes = await pool.query<{ action: string; reason: string }>(
        'SELECT action, reason FROM admin_governance_audit_logs WHERE target_admin_id = $1 AND action = $2',
        [bobId, 'PASSWORD_RESET'],
      );
      assert.equal(auditRes.rows.length, 1);
      assert.equal(auditRes.rows[0].reason, 'Routine quarterly credential rotation');
    },
  );

  await t.test(
    'ALERTadmin Invariant: Cannot revoke, reset, or self-revoke bootstrap superadmin via API',
    async () => {
      // Attempt to revoke ALERTadmin via API
      const revokeSuper = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/users/${superUser.id}/revoke`,
        headers: {
          cookie: superCookie,
          'x-csrf-token': superCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          reason: 'Attempted superadmin deactivation',
        },
      });
      assert.equal(revokeSuper.statusCode, 403);
      assert.equal(revokeSuper.json().error.code, 'FORBIDDEN');

      // Attempt to reset ALERTadmin password via API
      const resetSuper = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/users/${superUser.id}/reset-password`,
        headers: {
          cookie: superCookie,
          'x-csrf-token': superCsrf,
          origin: 'http://localhost:5173',
        },
        payload: {
          new_password: 'NewSuperPassword123!@#',
          reason: 'Attempted API reset of superadmin',
        },
      });
      assert.equal(resetSuper.statusCode, 403);
      assert.equal(resetSuper.json().error.code, 'FORBIDDEN');
    },
  );

  await t.test('PostgreSQL Engine Trigger: Blocks direct SQL mutation of ALERTadmin', async () => {
    // 1. DELETE FROM admin_users WHERE username = 'ALERTadmin'
    await assert.rejects(
      async () => {
        await pool.query("DELETE FROM admin_users WHERE username = 'ALERTadmin'");
      },
      (err: Error) => {
        return err.message.includes(
          'CRITICAL SECURITY INVARIANT: The protected super-administrator ALERTadmin cannot be deleted',
        );
      },
    );

    // 2. UPDATE admin_users SET is_active = FALSE WHERE username = 'ALERTadmin'
    await assert.rejects(
      async () => {
        await pool.query("UPDATE admin_users SET is_active = FALSE WHERE username = 'ALERTadmin'");
      },
      (err: Error) => {
        return err.message.includes(
          'CRITICAL SECURITY INVARIANT: The protected super-administrator ALERTadmin cannot be deactivated',
        );
      },
    );

    // 3. UPDATE admin_users SET role = 'MODERATOR' WHERE username = 'ALERTadmin'
    await assert.rejects(
      async () => {
        await pool.query("UPDATE admin_users SET role = 'MODERATOR' WHERE username = 'ALERTadmin'");
      },
      (err: Error) => {
        return err.message.includes(
          'CRITICAL SECURITY INVARIANT: The protected super-administrator ALERTadmin cannot be demoted',
        );
      },
    );

    // 4. UPDATE admin_users SET username = 'ALERT_RENAMED' WHERE username = 'ALERTadmin'
    await assert.rejects(
      async () => {
        await pool.query(
          "UPDATE admin_users SET username = 'ALERT_RENAMED' WHERE username = 'ALERTadmin'",
        );
      },
      (err: Error) => {
        return err.message.includes(
          'CRITICAL SECURITY INVARIANT: The protected super-administrator ALERTadmin username cannot be renamed',
        );
      },
    );
  });

  await t.test(
    'PostgreSQL Engine Trigger: Enforces append-only immutability on admin_governance_audit_logs',
    async () => {
      // Insert dummy record to test immutability
      const res = await pool.query<{ id: string }>(
        `INSERT INTO admin_governance_audit_logs (
         admin_id, admin_username, target_admin_id, target_username, action, reason
       ) VALUES ($1, 'ALERTadmin', $1, 'ALERTadmin', 'MODERATOR_CREATED', 'Initial log')
       RETURNING id`,
        [superUser.id],
      );
      const logId = res.rows[0].id;

      // Direct UPDATE must fail
      await assert.rejects(
        async () => {
          await pool.query('UPDATE admin_governance_audit_logs SET reason = $1 WHERE id = $2', [
            'Tampered reason',
            logId,
          ]);
        },
        (err: Error) => {
          return err.message.includes(
            'CRITICAL AUDIT INVARIANT: admin_governance_audit_logs records are strictly append-only and cannot be updated or deleted',
          );
        },
      );

      // Direct DELETE must fail
      await assert.rejects(
        async () => {
          await pool.query('DELETE FROM admin_governance_audit_logs WHERE id = $1', [logId]);
        },
        (err: Error) => {
          return err.message.includes(
            'CRITICAL AUDIT INVARIANT: admin_governance_audit_logs records are strictly append-only and cannot be updated or deleted',
          );
        },
      );
    },
  );
});
