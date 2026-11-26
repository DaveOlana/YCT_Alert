import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';
import { runMigrations } from '../scripts/migrate.js';
import { bootstrapAdmin } from '../scripts/bootstrap-admin.js';

const ADMIN_PASSWORD = 'ValidSuperSecret123!@#Admin';

test('Admin Login Brute-Force Rate-Limiter Integration Suite', async (t) => {
  // Test isolation: Dedicated Fastify instance with empty in-memory rate-limiter store
  const config = loadConfig({ NODE_ENV: 'test', ENABLE_BACKGROUND_PURGE: 'false' });
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

  // Clean tables so bootstrap can provision cleanly
  await pool.query(
    'TRUNCATE TABLE incident_audit_logs, idempotency_receipts, incident_report_links, incident_reports, incidents, admin_sessions, admin_users CASCADE',
  );

  await bootstrapAdmin({
    databaseUrl: config.TEST_DATABASE_URL,
    password: ADMIN_PASSWORD,
  });

  await t.test(
    'Enforces 5 requests per 15-minute window, returning 429 on 6th attempt, then recovers after expiry',
    async () => {
      // 1. Attempts 1 through 5: Send failed login attempts
      for (let i = 1; i <= 5; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/admin/auth/login',
          payload: {
            username: 'ALERTadmin',
            password: `WrongPasswordAttempt${i}`,
          },
        });

        assert.equal(res.statusCode, 401);
        const body = res.json();
        assert.equal(body.error?.code, 'INVALID_CREDENTIALS');
      }

      // 2. Attempt 6: Exceeds rate limit threshold
      const blockedRes = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/auth/login',
        payload: {
          username: 'ALERTadmin',
          password: 'WrongPasswordAttempt6',
        },
      });

      assert.equal(blockedRes.statusCode, 429);
      const blockedBody = blockedRes.json();
      assert.equal(blockedBody.statusCode, 429);
      assert.equal(blockedBody.error, 'Too Many Requests');
      assert.equal(blockedBody.code, 'RATE_LIMIT_EXCEEDED');
      assert.ok(blockedBody.message?.includes('Rate limit exceeded'));

      // Check standard RFC rate-limiting headers
      const retryAfter = blockedRes.headers['retry-after'];
      assert.ok(retryAfter !== undefined);
      const retrySeconds = parseInt(String(retryAfter), 10);
      assert.ok(retrySeconds > 0 && retrySeconds <= 900);

      assert.equal(String(blockedRes.headers['x-ratelimit-limit']), '5');
      assert.equal(String(blockedRes.headers['x-ratelimit-remaining']), '0');

      // 3. Time-mocked expiry: Advance clock past 15-minute window
      const originalDateNow = Date.now;
      try {
        // Advance simulated time by 15 minutes + 1 second
        Date.now = () => originalDateNow() + 15 * 60 * 1000 + 1000;

        // 4. Attempt 7: Must reach handler and return 401 instead of 429
        const recoveredRes = await app.inject({
          method: 'POST',
          url: '/api/v1/admin/auth/login',
          payload: {
            username: 'ALERTadmin',
            password: 'StillWrongPasswordAfterExpiry',
          },
        });

        assert.equal(recoveredRes.statusCode, 401);
        const recoveredBody = recoveredRes.json();
        assert.equal(recoveredBody.error?.code, 'INVALID_CREDENTIALS');
      } finally {
        Date.now = originalDateNow;
      }
    },
  );
});
