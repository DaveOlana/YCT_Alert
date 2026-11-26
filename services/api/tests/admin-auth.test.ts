import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';
import { bootstrapAdmin, validatePasswordStrength } from '../scripts/bootstrap-admin.js';
import { runMigrations } from '../scripts/migrate.js';

const TEST_ADMIN_PASSWORD = 'ValidSuperSecret123!@#Admin';

test('Admin Auth & Session Security Suite', async (t) => {
  const config = loadConfig({ NODE_ENV: 'test' });
  const app = buildApp(config);

  // Setup fresh test database migrations
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

  // Clean tables before tests
  await pool.query('TRUNCATE TABLE incident_audit_logs, admin_sessions, admin_users CASCADE');

  await t.test('Password Policy: Enforces min length and character diversity', () => {
    assert.equal(validatePasswordStrength('short').valid, false);
    assert.equal(validatePasswordStrength('nouppercase123!').valid, false);
    assert.equal(validatePasswordStrength('NOLOWERCASE123!').valid, false);
    assert.equal(validatePasswordStrength('NoNumbersSpecial!').valid, false);
    assert.equal(validatePasswordStrength('NoSpecialChar123').valid, false);
    assert.equal(validatePasswordStrength(TEST_ADMIN_PASSWORD).valid, true);
    assert.equal(validatePasswordStrength('#05102005Aa').valid, true);
  });

  await t.test('CLI Bootstrap: Provisions ALERTadmin with Argon2id hash', async () => {
    const res = await bootstrapAdmin({
      databaseUrl: config.TEST_DATABASE_URL,
      password: TEST_ADMIN_PASSWORD,
    });

    assert.equal(res.username, 'ALERTadmin');
    assert.equal(res.role, 'SUPERADMIN');
    assert.equal(res.action, 'CREATED');

    const check = await pool.query<{ password_hash: string; role: string }>(
      'SELECT password_hash, role FROM admin_users WHERE username = $1',
      ['ALERTadmin'],
    );
    assert.equal(check.rows.length, 1);
    assert.ok(check.rows[0].password_hash.startsWith('$argon2id$'));
    assert.equal(check.rows[0].role, 'SUPERADMIN');
  });

  await t.test('CLI Bootstrap: Duplicate creation is prohibited', async () => {
    await assert.rejects(
      async () => {
        await bootstrapAdmin({
          databaseUrl: config.TEST_DATABASE_URL,
          password: TEST_ADMIN_PASSWORD,
        });
      },
      {
        message: /Duplicate super-administrators are prohibited/,
      },
    );
  });

  await t.test('CLI Bootstrap: Password rotation succeeds with explicit flag', async () => {
    const res = await bootstrapAdmin({
      databaseUrl: config.TEST_DATABASE_URL,
      password: 'NewRotatedPassword123!@#',
      rotatePassword: true,
    });
    assert.equal(res.action, 'ROTATED');

    // Restore test password
    await bootstrapAdmin({
      databaseUrl: config.TEST_DATABASE_URL,
      password: TEST_ADMIN_PASSWORD,
      rotatePassword: true,
    });
  });

  await t.test('POST /api/v1/admin/auth/login: Invalid credentials return 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: {
        username: 'ALERTadmin',
        password: 'WrongPassword123!',
      },
    });

    assert.equal(res.statusCode, 401);
    const body = res.json();
    assert.equal(body.error.code, 'INVALID_CREDENTIALS');
  });

  let sessionCookie: string;
  let csrfToken: string;

  await t.test(
    'POST /api/v1/admin/auth/login: Valid credentials return 200, cookie, and CSRF token',
    async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/auth/login',
        payload: {
          username: 'ALERTadmin',
          password: TEST_ADMIN_PASSWORD,
        },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.user.username, 'ALERTadmin');
      assert.equal(body.user.role, 'SUPERADMIN');
      assert.ok(body.csrf_token);
      csrfToken = body.csrf_token;

      const setCookie = res.headers['set-cookie'];
      assert.ok(setCookie);
      const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      assert.ok(cookieHeader.includes('yct_admin_session='));
      assert.ok(cookieHeader.includes('HttpOnly'));
      assert.ok(cookieHeader.includes('SameSite=Lax'));

      // Extract cookie value for subsequent requests
      sessionCookie = cookieHeader.split(';')[0];
    },
  );

  await t.test(
    'GET /api/v1/admin/auth/me: Returns current user and session CSRF token when authenticated',
    async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/auth/me',
        headers: {
          cookie: sessionCookie,
        },
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.user.username, 'ALERTadmin');
      assert.equal(body.user.role, 'SUPERADMIN');
      assert.ok(typeof body.csrf_token === 'string' && body.csrf_token.length === 64);
      csrfToken = body.csrf_token;
    },
  );

  await t.test('GET /api/v1/admin/auth/me: Missing cookie returns 401 UNAUTHORIZED', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/auth/me',
    });

    assert.equal(res.statusCode, 401);
    const body = res.json();
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });

  await t.test('GET /api/v1/admin/auth/me: Tampered cookie returns 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/auth/me',
      headers: {
        cookie: 'yct_admin_session=tampered-fake-session-cookie',
      },
    });

    assert.equal(res.statusCode, 401);
  });

  await t.test(
    'CSRF Defense: State-changing POST without X-CSRF-Token is rejected with 403',
    async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/incidents/00000000-0000-0000-0000-000000000001/claim',
        headers: {
          cookie: sessionCookie,
        },
        payload: {},
      });

      assert.equal(res.statusCode, 403);
      const body = res.json();
      assert.equal(body.error.code, 'CSRF_VALIDATION_FAILED');
    },
  );

  await t.test(
    'CSRF Defense: State-changing POST with invalid X-CSRF-Token is rejected with 403',
    async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/incidents/00000000-0000-0000-0000-000000000001/claim',
        headers: {
          cookie: sessionCookie,
          'x-csrf-token': 'wrong-csrf-token',
        },
        payload: {},
      });

      assert.equal(res.statusCode, 403);
      const body = res.json();
      assert.equal(body.error.code, 'CSRF_VALIDATION_FAILED');
    },
  );

  await t.test(
    'Origin Defense: State-changing POST from unapproved origin is rejected with 403',
    async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/incidents/00000000-0000-0000-0000-000000000001/claim',
        headers: {
          cookie: sessionCookie,
          'x-csrf-token': csrfToken,
          origin: 'https://evil-phishing-site.example.com',
        },
        payload: {},
      });

      assert.equal(res.statusCode, 403);
      const body = res.json();
      assert.equal(body.error.code, 'CSRF_VALIDATION_FAILED');
    },
  );

  await t.test('Session Lifecycle: Idle timeout (> 30 min) revokes session', async () => {
    // Manually rewind last_active_at by 31 minutes
    await pool.query(
      `UPDATE admin_sessions
       SET last_active_at = CURRENT_TIMESTAMP - INTERVAL '31 minutes'`,
    );

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/auth/me',
      headers: {
        cookie: sessionCookie,
      },
    });

    assert.equal(res.statusCode, 401);
    const body = res.json();
    assert.equal(body.error.code, 'SESSION_EXPIRED');
  });

  await t.test('POST /api/v1/admin/auth/logout: Revokes session and clears cookie', async () => {
    // Re-login to get fresh session
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: {
        username: 'ALERTadmin',
        password: TEST_ADMIN_PASSWORD,
      },
    });
    const newCookie = (loginRes.headers['set-cookie'] as string).split(';')[0];
    const newCsrf = loginRes.json().csrf_token;

    // Logout
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/logout',
      headers: {
        cookie: newCookie,
        'x-csrf-token': newCsrf,
      },
    });

    assert.equal(logoutRes.statusCode, 200);

    // Subsequent /me returns 401
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/auth/me',
      headers: {
        cookie: newCookie,
      },
    });
    assert.equal(meRes.statusCode, 401);
  });
});
