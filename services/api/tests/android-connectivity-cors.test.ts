import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';
import { closePool } from '../src/db/pool.js';
import { runMigrations } from '../scripts/migrate.js';

let app: FastifyInstance;
const testConfig = loadConfig({
  NODE_ENV: 'test',
  RATE_LIMIT_MAX: '1000',
  RATE_LIMIT_WINDOW_MINUTES: '1',
});

before(async () => {
  await runMigrations({
    databaseUrl: testConfig.TEST_DATABASE_URL,
    direction: 'up',
    verbose: false,
  });

  app = buildApp(testConfig);
  await app.ready();
});

after(async () => {
  if (app) {
    await app.close();
  }
  await closePool();
});

test('Android WebView Connectivity & Strict CORS Suite', async (t) => {
  const ANDROID_WEBVIEW_ORIGIN = 'https://localhost';

  await t.test(
    'Preflight: OPTIONS /api/v1/reports from Android WebView origin returns 204 and CORS headers',
    async () => {
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/api/v1/reports',
        headers: {
          origin: ANDROID_WEBVIEW_ORIGIN,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type,idempotency-key',
        },
      });

      assert.equal(res.statusCode, 204);
      assert.equal(res.headers['access-control-allow-origin'], ANDROID_WEBVIEW_ORIGIN);
      assert.equal(res.headers['access-control-allow-credentials'], 'true');
      assert.ok(
        String(res.headers['access-control-allow-headers'])
          .toLowerCase()
          .includes('idempotency-key'),
      );
      assert.ok(
        String(res.headers['access-control-allow-headers']).toLowerCase().includes('content-type'),
      );
      assert.ok(String(res.headers['access-control-allow-methods']).includes('POST'));
    },
  );

  let createdReceiptId: string;
  let createdReceiptToken: string;

  await t.test(
    'Submission: POST /api/v1/reports from Android WebView origin succeeds with CORS allow header',
    async () => {
      const idempotencyKey = crypto.randomUUID();
      const payload = {
        category_code: 'PHYSICAL_HAZARD',
        description: 'Exposed high-voltage wire trailing near Engineering workshop entrance',
        incident_location: {
          latitude: 6.51812,
          longitude: 3.37194,
          source: 'DEVICE_GPS',
          landmark_description: 'Near north entrance doorway',
        },
      };

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/reports',
        headers: {
          origin: ANDROID_WEBVIEW_ORIGIN,
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        payload,
      });

      assert.equal(res.statusCode, 202);
      assert.equal(res.headers['access-control-allow-origin'], ANDROID_WEBVIEW_ORIGIN);

      const body = JSON.parse(res.body);
      assert.ok(body.receipt_id);
      assert.ok(body.receipt_token);
      assert.equal(body.delivery_status, 'RECEIVED');

      createdReceiptId = body.receipt_id;
      createdReceiptToken = body.receipt_token;
    },
  );

  await t.test(
    'Preflight: OPTIONS /api/v1/reports/receipts/:id from Android WebView origin permits Authorization header',
    async () => {
      const res = await app.inject({
        method: 'OPTIONS',
        url: `/api/v1/reports/receipts/${createdReceiptId}`,
        headers: {
          origin: ANDROID_WEBVIEW_ORIGIN,
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'authorization',
        },
      });

      assert.equal(res.statusCode, 204);
      assert.equal(res.headers['access-control-allow-origin'], ANDROID_WEBVIEW_ORIGIN);
      assert.ok(
        String(res.headers['access-control-allow-headers']).toLowerCase().includes('authorization'),
      );
    },
  );

  await t.test(
    'Status Lookup: GET /api/v1/reports/receipts/:id from Android WebView origin returns receipt with CORS allow header',
    async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/reports/receipts/${createdReceiptId}`,
        headers: {
          origin: ANDROID_WEBVIEW_ORIGIN,
          authorization: `Bearer ${createdReceiptToken}`,
        },
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['access-control-allow-origin'], ANDROID_WEBVIEW_ORIGIN);

      const body = JSON.parse(res.body);
      assert.equal(body.receipt_id, createdReceiptId);
      assert.equal(body.delivery_status, 'RECEIVED');
    },
  );

  await t.test(
    'Strict Origin Security: Unapproved origins do not receive access-control-allow-origin header',
    async () => {
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/api/v1/reports',
        headers: {
          origin: 'https://malicious-external-domain.com',
          'access-control-request-method': 'POST',
        },
      });

      assert.equal(res.headers['access-control-allow-origin'], undefined);
      assert.notEqual(res.headers['access-control-allow-origin'], '*');
    },
  );

  await t.test(
    'Configuration Guard: Verifies loopback binding preservation without exposing on 0.0.0.0',
    () => {
      const defaultEnv = loadConfig();
      assert.equal(defaultEnv.API_HOST, '127.0.0.1');
      assert.equal(defaultEnv.API_PORT, 4000);
      assert.notEqual(defaultEnv.API_HOST, '0.0.0.0');
    },
  );
});
