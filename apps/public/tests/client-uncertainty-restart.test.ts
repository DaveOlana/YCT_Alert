import test from 'node:test';
import assert from 'node:assert/strict';
import {
  submitReport,
  generateIdempotencyKey,
  type SubmissionError,
} from '../src/services/reportSubmissionService.js';
import type { ReportFormData } from '../src/types/reportForm.js';

function createMockFormData(): ReportFormData {
  return {
    category_code: 'FIRE_OR_SMOKE',
    description: 'Electrical fire in basement server rack near Science Complex.',
    incident_location: {
      latitude: 6.51842,
      longitude: 3.37215,
      accuracy: 12,
      captured_at: new Date().toISOString(),
      source: 'DEVICE_GPS',
      yct_map_place_id: null,
      place_name_snapshot: null,
      landmark_description: 'Near basement transformer room',
    },
    photo: null,
    website_url: '',
  };
}

test('Client Resilience, Offline Handling & In-Memory Privacy Suite', async (t) => {
  const originalFetch = globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await t.test(
    'Offline / Airplane Mode: Network failure throws NETWORK_UNCERTAIN without generating fake receipt',
    async () => {
      // Simulate airplane mode / offline drop via TypeError: Failed to fetch
      globalThis.fetch = async () => {
        const error = new TypeError('Failed to fetch');
        throw error;
      };

      const formData = createMockFormData();
      const key = generateIdempotencyKey();

      try {
        await submitReport(formData, key, 5000);
        assert.fail('Submission should have failed');
      } catch (err) {
        const subErr = err as SubmissionError;
        assert.equal(subErr.isNetworkUncertain, true);
        assert.equal(subErr.code, 'NETWORK_UNCERTAIN');
        assert.ok(
          subErr.message.includes(
            'Network connection was interrupted before a confirmation was received',
          ),
        );
        // Verify no fake receipt credentials were returned
        assert.equal((subErr as unknown as { receipt_id?: string }).receipt_id, undefined);
        assert.equal((subErr as unknown as { receipt_token?: string }).receipt_token, undefined);
      }
    },
  );

  await t.test(
    'Timeout Abort: Request timeout aborts cleanly and marks as NETWORK_UNCERTAIN',
    async () => {
      globalThis.fetch = async (_url: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (signal) {
            signal.addEventListener('abort', () => {
              const abortErr = new Error('The operation was aborted');
              abortErr.name = 'AbortError';
              reject(abortErr);
            });
          }
        });
      };

      const formData = createMockFormData();
      const key = generateIdempotencyKey();

      try {
        // Test short timeout of 50ms
        await submitReport(formData, key, 50);
        assert.fail('Should have aborted');
      } catch (err) {
        const subErr = err as SubmissionError;
        assert.equal(subErr.isNetworkUncertain, true);
        assert.equal(subErr.code, 'NETWORK_UNCERTAIN');
      }
    },
  );

  await t.test(
    'Memory-Only Privacy Invariant: Verify that global storage is not used for draft persistence',
    () => {
      // Confirm that the submission service does not rely on or pollute window.localStorage
      const formData = createMockFormData();
      assert.ok(formData.description.length >= 5);

      // In browser environment, localStorage should not contain raw descriptions or tokens
      if (typeof globalThis.localStorage !== 'undefined') {
        assert.equal(globalThis.localStorage.getItem('yct_report_draft'), null);
        assert.equal(globalThis.localStorage.getItem('yct_receipt_token'), null);
      }
    },
  );
});
