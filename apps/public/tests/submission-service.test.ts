import test from 'node:test';
import assert from 'node:assert/strict';
import {
  submitReport,
  fetchReceiptStatus,
  generateIdempotencyKey,
  type SubmissionError,
} from '../src/services/reportSubmissionService.js';
import type { ReportFormData } from '../src/types/reportForm.js';

function createMockFormData(overrides?: Partial<ReportFormData>): ReportFormData {
  return {
    category_code: 'FIRE_OR_SMOKE',
    description: 'Smoke coming from ventilation unit on the 2nd floor.',
    incident_location: {
      latitude: 6.518,
      longitude: 3.372,
      accuracy: 25,
      captured_at: new Date().toISOString(),
      coordinates_provenance: 'DEVICE_GPS',
      source: 'DEVICE_GPS',
      yct_map_place_id: null,
      place_name_snapshot: null,
      landmark_description: 'Near 2nd floor elevator',
    },
    photo: null,
    website_url: '',
    ...overrides,
  };
}

test('generateIdempotencyKey: Generates valid UUIDv4 strings', () => {
  const key1 = generateIdempotencyKey();
  const key2 = generateIdempotencyKey();

  assert.match(key1, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.match(key2, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.notEqual(key1, key2, 'Keys must be unique');
});

test('submitReport: Successful submission returns 202 receipt', async () => {
  const originalFetch = globalThis.fetch;
  const mockKey = '11111111-2222-4333-8444-555555555555';
  let capturedHeaders: Record<string, string> = {};
  let capturedBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    capturedHeaders = (init?.headers as Record<string, string>) || {};
    capturedBody = JSON.parse(init?.body as string) as Record<string, unknown>;

    return {
      status: 202,
      ok: true,
      json: async () => ({
        receipt_id: 'rec_test_123',
        receipt_token: 'tok_test_secret_token_123',
        delivery_status: 'RECEIVED',
        received_at: '2026-11-07T12:00:00.000Z',
        message: 'Report received and queued for safety team review.',
      }),
    } as Response;
  }) as typeof fetch;

  try {
    const formData = createMockFormData();
    const result = await submitReport(formData, mockKey);

    assert.equal(capturedHeaders['Idempotency-Key'], mockKey);
    assert.equal(capturedHeaders['Content-Type'], 'application/json');
    assert.equal(capturedBody?.category_code, 'FIRE_OR_SMOKE');
    assert.equal(
      (capturedBody?.incident_location as Record<string, unknown>)?.source,
      'DEVICE_GPS',
    );

    assert.equal(result.receipt_id, 'rec_test_123');
    assert.equal(result.receipt_token, 'tok_test_secret_token_123');
    assert.equal(result.delivery_status, 'RECEIVED');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('submitReport: Identifies network uncertainty on fetch abort or network drops', async () => {
  const originalFetch = globalThis.fetch;
  const mockKey = '22222222-3333-4444-8555-666666666666';

  globalThis.fetch = (async () => {
    const err = new TypeError('Failed to fetch');
    throw err;
  }) as typeof fetch;

  try {
    const formData = createMockFormData();
    await assert.rejects(
      async () => submitReport(formData, mockKey),
      (err: SubmissionError) => {
        assert.equal(err.isNetworkUncertain, true);
        assert.equal(err.code, 'NETWORK_UNCERTAIN');
        assert.match(err.message, /interrupted/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('submitReport: Captures 409 conflict and 429 rate limit errors cleanly', async () => {
  const originalFetch = globalThis.fetch;
  const mockKey = '33333333-4444-4555-8666-777777777777';

  // 1. Conflict test
  globalThis.fetch = (async () => {
    return {
      status: 409,
      ok: false,
      json: async () => ({
        error: {
          code: 'IDEMPOTENCY_KEY_REUSED',
          message: 'Key used with different payload',
        },
      }),
    } as Response;
  }) as typeof fetch;

  try {
    const formData = createMockFormData();
    await assert.rejects(
      async () => submitReport(formData, mockKey),
      (err: SubmissionError) => {
        assert.equal(err.code, 'IDEMPOTENCY_KEY_REUSED');
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  // 2. Rate limit test
  globalThis.fetch = (async () => {
    return {
      status: 429,
      ok: false,
      json: async () => ({
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded. Try again in 60 seconds.',
      }),
    } as Response;
  }) as typeof fetch;

  try {
    const formData = createMockFormData();
    await assert.rejects(
      async () => submitReport(formData, mockKey),
      (err: SubmissionError) => {
        assert.equal(err.code, 'RATE_LIMIT_EXCEEDED');
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchReceiptStatus: Sends Bearer token and returns mapped status', async () => {
  const originalFetch = globalThis.fetch;
  let capturedAuth: string | undefined;

  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    capturedAuth = (init?.headers as Record<string, string>)?.['Authorization'];
    return {
      status: 200,
      ok: true,
      json: async () => ({
        receipt_id: 'rec_test_123',
        delivery_status: 'PUBLISHED',
        category: 'FIRE_OR_SMOKE',
        received_at: '2026-11-07T12:00:00.000Z',
        public_advisory_id: 'inc_pub_456',
        status_message: 'Active campus safety advisory issued.',
      }),
    } as Response;
  }) as typeof fetch;

  try {
    const status = await fetchReceiptStatus('rec_test_123', 'tok_my_secret_token');
    assert.equal(capturedAuth, 'Bearer tok_my_secret_token');
    assert.equal(status.delivery_status, 'PUBLISHED');
    assert.equal(status.public_advisory_id, 'inc_pub_456');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
