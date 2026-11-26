import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';
import { closePool, initPool, query } from '../src/db/pool.js';
import { runMigrations } from '../scripts/migrate.js';

let app: FastifyInstance;
const testConfig = loadConfig({
  NODE_ENV: 'test',
  RATE_LIMIT_MAX: '1000',
  RATE_LIMIT_WINDOW_MINUTES: '1',
});

before(async () => {
  // Ensure test database migrations are applied
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

beforeEach(async () => {
  initPool(testConfig);
  // Truncate tables between tests in yct_alert_test
  await query(
    'TRUNCATE idempotency_receipts, incident_report_links, incidents, incident_reports CASCADE;',
  );
});

function createValidPayload(overrides?: Record<string, unknown>) {
  return {
    category_code: 'PHYSICAL_HAZARD',
    description: 'Broken handrail on the north stairwell of the engineering block.',
    incident_location: {
      source: 'MANUAL_POINT',
      latitude: 6.5182,
      longitude: 3.3721,
      landmark_description: 'Engineering Block North Stairwell',
    },
    ...overrides,
  };
}

test('POST /api/v1/reports: Fresh submission creates entities and returns 202', async () => {
  const idempotencyKey = crypto.randomUUID();
  const payload = createValidPayload();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
    payload,
  });

  assert.equal(response.statusCode, 202);
  const body = response.json();

  assert.ok(body.receipt_id, 'Receipt ID should be present');
  assert.ok(body.receipt_token?.startsWith('tok_'), 'Receipt token should start with tok_');
  assert.ok(body.reference_number?.startsWith('#REF-'), 'Reference number should start with #REF-');
  assert.equal(body.delivery_status, 'RECEIVED');
  assert.equal(body.message, 'Report received and queued for safety team review.');

  // Verify database persistence
  const reportCheck = await query('SELECT * FROM incident_reports WHERE receipt_id = $1', [
    body.receipt_id,
  ]);
  assert.equal(reportCheck.rows.length, 1);
  assert.equal(reportCheck.rows[0].category_code, 'PHYSICAL_HAZARD');
  assert.equal(reportCheck.rows[0].is_test, true);

  const incidentCheck = await query('SELECT * FROM incidents WHERE category_code = $1', [
    'PHYSICAL_HAZARD',
  ]);
  assert.equal(incidentCheck.rows.length, 1);
  assert.equal(incidentCheck.rows[0].status, 'PENDING');

  const idempotencyCheck = await query('SELECT * FROM idempotency_receipts WHERE report_id = $1', [
    reportCheck.rows[0].id,
  ]);
  assert.equal(idempotencyCheck.rows.length, 1);
  assert.ok(idempotencyCheck.rows[0].encrypted_response, 'Encrypted response should be stored');
});

test('POST /api/v1/reports: 10 concurrent requests with same key serialize and produce 1 report', async () => {
  const idempotencyKey = crypto.randomUUID();
  const payload = createValidPayload();

  // Send 10 simultaneous requests
  const promises = Array.from({ length: 10 }).map(() =>
    app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
      payload,
    }),
  );

  const responses = await Promise.all(promises);

  // All 10 must return 202
  for (const res of responses) {
    assert.equal(res.statusCode, 202);
  }

  // All 10 must return the exact same receipt_id and receipt_token
  const firstBody = responses[0].json();
  for (let i = 1; i < responses.length; i++) {
    const b = responses[i].json();
    assert.equal(b.receipt_id, firstBody.receipt_id);
    assert.equal(b.receipt_token, firstBody.receipt_token);
  }

  // Exactly 1 row in DB tables
  const reportCount = await query('SELECT COUNT(*) FROM incident_reports');
  assert.equal(parseInt(reportCount.rows[0].count, 10), 1);

  const incidentCount = await query('SELECT COUNT(*) FROM incidents');
  assert.equal(parseInt(incidentCount.rows[0].count, 10), 1);

  const idempotencyCount = await query('SELECT COUNT(*) FROM idempotency_receipts');
  assert.equal(parseInt(idempotencyCount.rows[0].count, 10), 1);
});

test('POST /api/v1/reports: Conflicting payload with reused key returns 409 IDEMPOTENCY_KEY_REUSED', async () => {
  const idempotencyKey = crypto.randomUUID();
  const payload1 = createValidPayload({ description: 'Original fire incident description.' });
  const payload2 = createValidPayload({
    description: 'Conflicting medical emergency description.',
  });

  const res1 = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': idempotencyKey },
    payload: payload1,
  });
  assert.equal(res1.statusCode, 202);

  const res2 = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': idempotencyKey },
    payload: payload2,
  });
  assert.equal(res2.statusCode, 409);
  const errBody = res2.json();
  assert.equal(errBody.error.code, 'IDEMPOTENCY_KEY_REUSED');

  // Verify only 1 report exists
  const count = await query('SELECT COUNT(*) FROM incident_reports');
  assert.equal(parseInt(count.rows[0].count, 10), 1);
});

test('POST /api/v1/reports: Expired replay window (> 7 days) returns 409 and blocks duplicates', async () => {
  const idempotencyKey = crypto.randomUUID();
  const payload = createValidPayload();

  const res1 = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': idempotencyKey },
    payload,
  });
  assert.equal(res1.statusCode, 202);

  // Manually expire the replay window
  await query(
    "UPDATE idempotency_receipts SET replay_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 hour'",
  );

  // Retry with same payload and key
  const res2 = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': idempotencyKey },
    payload,
  });
  assert.equal(res2.statusCode, 409);
  const errBody = res2.json();
  assert.equal(errBody.error.code, 'IDEMPOTENCY_REPLAY_EXPIRED');

  // Assert no duplicate report created
  const count = await query('SELECT COUNT(*) FROM incident_reports');
  assert.equal(parseInt(count.rows[0].count, 10), 1);
});

test('POST /api/v1/reports: Honeypot field rejects automated bots with 400', async () => {
  const idempotencyKey = crypto.randomUUID();
  const payload = createValidPayload({ website_url: 'https://spam-bot.site' });

  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': idempotencyKey },
    payload,
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error.code, 'VALIDATION_ERROR');

  const count = await query('SELECT COUNT(*) FROM incident_reports');
  assert.equal(parseInt(count.rows[0].count, 10), 0);
});

test('POST /api/v1/reports: Missing or invalid Idempotency-Key header is rejected', async () => {
  const payload = createValidPayload();

  // Missing header
  const resMissing = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    payload,
  });
  assert.equal(resMissing.statusCode, 400);
  assert.equal(resMissing.json().error.code, 'INVALID_IDEMPOTENCY_KEY');

  // Malformed header
  const resMalformed = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': 'not-a-uuid' },
    payload,
  });
  assert.equal(resMalformed.statusCode, 400);
  assert.equal(resMalformed.json().error.code, 'INVALID_IDEMPOTENCY_KEY');
});

test('GET /api/v1/reports/receipts/:id: Authenticated status lookup and lifecycle transitions', async () => {
  const idempotencyKey = crypto.randomUUID();
  const payload = createValidPayload();

  // Create report
  const createRes = await app.inject({
    method: 'POST',
    url: '/api/v1/reports',
    headers: { 'Idempotency-Key': idempotencyKey },
    payload,
  });
  assert.equal(createRes.statusCode, 202);
  const { receipt_id, receipt_token } = createRes.json();

  // 1. Missing Authorization header -> 401
  const resNoAuth = await app.inject({
    method: 'GET',
    url: `/api/v1/reports/receipts/${receipt_id}`,
  });
  assert.equal(resNoAuth.statusCode, 401);

  // 2. Wrong token -> 403
  const resWrongToken = await app.inject({
    method: 'GET',
    url: `/api/v1/reports/receipts/${receipt_id}`,
    headers: { Authorization: 'Bearer tok_wrong_invalid_token' },
  });
  assert.equal(resWrongToken.statusCode, 403);
  assert.equal(resWrongToken.json().error.code, 'INVALID_RECEIPT_TOKEN');

  // 3. Unknown receipt ID -> 404
  const resNotFound = await app.inject({
    method: 'GET',
    url: `/api/v1/reports/receipts/${crypto.randomUUID()}`,
    headers: { Authorization: `Bearer ${receipt_token}` },
  });
  assert.equal(resNotFound.statusCode, 404);
  assert.equal(resNotFound.json().error.code, 'RECEIPT_NOT_FOUND');

  // 4. Valid token -> 200 with initial PENDING/RECEIVED status
  const resValid = await app.inject({
    method: 'GET',
    url: `/api/v1/reports/receipts/${receipt_id}`,
    headers: { Authorization: `Bearer ${receipt_token}` },
  });
  assert.equal(resValid.statusCode, 200);
  const statusBody = resValid.json();
  assert.equal(statusBody.receipt_id, receipt_id);
  assert.equal(statusBody.delivery_status, 'RECEIVED');
  assert.equal(statusBody.category, 'PHYSICAL_HAZARD');
  assert.equal(statusBody.public_advisory_id, null);

  // 5. Transition incident to ACTIVE -> maps to PUBLISHED with public_advisory_id
  await query("UPDATE incidents SET status = 'ACTIVE' WHERE category_code = 'PHYSICAL_HAZARD'");
  const resActive = await app.inject({
    method: 'GET',
    url: `/api/v1/reports/receipts/${receipt_id}`,
    headers: { Authorization: `Bearer ${receipt_token}` },
  });
  assert.equal(resActive.statusCode, 200);
  assert.equal(resActive.json().delivery_status, 'PUBLISHED');
  assert.ok(resActive.json().public_advisory_id?.startsWith('inc_'));

  // 6. Transition incident to RESOLVED
  await query("UPDATE incidents SET status = 'RESOLVED' WHERE category_code = 'PHYSICAL_HAZARD'");
  const resResolved = await app.inject({
    method: 'GET',
    url: `/api/v1/reports/receipts/${receipt_id}`,
    headers: { Authorization: `Bearer ${receipt_token}` },
  });
  assert.equal(resResolved.statusCode, 200);
  assert.equal(resResolved.json().delivery_status, 'RESOLVED');

  // 7. Transition incident to REJECTED
  await query("UPDATE incidents SET status = 'REJECTED' WHERE category_code = 'PHYSICAL_HAZARD'");
  const resRejected = await app.inject({
    method: 'GET',
    url: `/api/v1/reports/receipts/${receipt_id}`,
    headers: { Authorization: `Bearer ${receipt_token}` },
  });
  assert.equal(resRejected.statusCode, 200);
  assert.equal(resRejected.json().delivery_status, 'REJECTED');
  assert.match(resRejected.json().status_message, /Reviewed and closed/);
});

test('POST /api/v1/reports: Rate limiting triggers 429 after threshold', async () => {
  const rateLimitConfig = loadConfig({
    NODE_ENV: 'test',
    RATE_LIMIT_MAX: '3',
    RATE_LIMIT_WINDOW_MINUTES: '1',
  });
  const rateLimitedApp = buildApp(rateLimitConfig);
  await rateLimitedApp.ready();

  try {
    const payload = createValidPayload();
    const responses = [];
    for (let i = 0; i < 4; i++) {
      const res = await rateLimitedApp.inject({
        method: 'POST',
        url: '/api/v1/reports',
        headers: {
          'Idempotency-Key': crypto.randomUUID(),
        },
        payload,
      });
      responses.push(res);
    }

    assert.equal(responses[0].statusCode, 202);
    assert.equal(responses[1].statusCode, 202);
    assert.equal(responses[2].statusCode, 202);
    assert.equal(responses[3].statusCode, 429);
    assert.equal(responses[3].json().code, 'RATE_LIMIT_EXCEEDED');
  } finally {
    await rateLimitedApp.close();
  }
});

test('POST /api/v1/reports: PII guardrail rejects submissions containing sensitive personal data', async () => {
  const piiCases = [
    {
      description: 'Fire spotted near hostel, call 08012345678 immediately.',
      expectedType: 'PHONE_NUMBER',
    },
    {
      description: 'Medical emergency, student email is victim@gmail.com for contact.',
      expectedType: 'EMAIL_ADDRESS',
    },
    {
      description: 'The student involved has matric number F/ND/21/3210001 please hurry.',
      expectedType: 'MATRICULATION_NUMBER',
    },
  ];

  for (const c of piiCases) {
    const payload = createValidPayload({ description: c.description });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: {
        'Idempotency-Key': crypto.randomUUID(),
      },
      payload,
    });

    assert.equal(res.statusCode, 400);
    const body = res.json();
    assert.equal(body.error?.code, 'SENSITIVE_DATA_DETECTED');
    assert.equal(body.error?.violation_type, c.expectedType);
    // Invariant: Never echo the sensitive data back in the error message
    assert.equal(body.error?.message?.includes('08012345678'), false);
    assert.equal(body.error?.message?.includes('victim@gmail.com'), false);
    assert.equal(body.error?.message?.includes('3210001'), false);
  }
});
