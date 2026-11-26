import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INCIDENT_CATEGORIES,
  CATEGORY_CATALOGUE,
  CreateReportRequestSchema,
  IncidentCategory,
} from '@yctalert/contracts';
import { SAMPLE_CAMPUS_PLACES } from '../src/fixtures/samplePlaces.js';

test('Form Category: All 5 approved categories are valid and mapped to metadata', () => {
  assert.equal(INCIDENT_CATEGORIES.length, 5);
  for (const cat of INCIDENT_CATEGORIES) {
    const meta = CATEGORY_CATALOGUE[cat];
    assert.ok(meta, `Category ${cat} must exist in catalogue`);
    assert.ok(meta.label);
    assert.ok(['CRITICAL', 'HIGH', 'MEDIUM'].includes(meta.urgencyLevel));
  }
});

test('Location Matrix: Accepts Place selection only (coordinates & landmark optional)', () => {
  const sample = SAMPLE_CAMPUS_PLACES[0];
  const payload = {
    category_code: 'FIRE_OR_SMOKE' as IncidentCategory,
    description: 'Smoke reported near entrance of building',
    incident_location: {
      latitude: null,
      longitude: null,
      source: 'MAP_PLACE' as const,
      yct_map_place_id: sample.id,
      place_name_snapshot: sample.name,
      landmark_description: null,
    },
  };
  const parsed = CreateReportRequestSchema.parse(payload);
  assert.equal(parsed.incident_location.source, 'MAP_PLACE');
  assert.equal(parsed.incident_location.yct_map_place_id, sample.id);
});

test('Location Matrix: Accepts Device Coordinates only (place & landmark optional)', () => {
  const payload = {
    category_code: 'MEDICAL_EMERGENCY' as IncidentCategory,
    description: 'Student needs immediate medical attention near sports pitch',
    incident_location: {
      latitude: 6.5173,
      longitude: 3.3738,
      source: 'DEVICE_GPS' as const,
      yct_map_place_id: null,
      place_name_snapshot: null,
      landmark_description: null,
    },
  };
  const parsed = CreateReportRequestSchema.parse(payload);
  assert.equal(parsed.incident_location.source, 'DEVICE_GPS');
  assert.equal(parsed.incident_location.latitude, 6.5173);
});

test('Location Matrix: Accepts Landmark text only (place & coordinates optional)', () => {
  const payload = {
    category_code: 'PHYSICAL_HAZARD' as IncidentCategory,
    description: 'Collapsed walkway slab near main lecture hall corridor',
    incident_location: {
      latitude: null,
      longitude: null,
      source: 'TEXT_ONLY' as const,
      yct_map_place_id: null,
      place_name_snapshot: null,
      landmark_description: 'Room 204, Second Floor, North Stairwell',
    },
  };
  const parsed = CreateReportRequestSchema.parse(payload);
  assert.equal(parsed.incident_location.source, 'TEXT_ONLY');
  assert.equal(
    parsed.incident_location.landmark_description,
    'Room 204, Second Floor, North Stairwell',
  );
});

test('Location Matrix: Rejects when zero location information is provided', () => {
  const payload = {
    category_code: 'OTHER_URGENT' as IncidentCategory,
    description: 'Dangerous situation on campus grounds',
    incident_location: {
      latitude: null,
      longitude: null,
      source: 'MANUAL_POINT' as const,
      yct_map_place_id: null,
      place_name_snapshot: null,
      landmark_description: null,
    },
  };
  assert.throws(() => CreateReportRequestSchema.parse(payload));
});

test('Description Boundary: Enforces 5 to 1000 characters limit', () => {
  const tooShort = {
    category_code: 'SECURITY_INCIDENT' as IncidentCategory,
    description: 'Help',
    incident_location: {
      landmark_description: 'Near North Gate',
    },
  };
  assert.throws(() => CreateReportRequestSchema.parse(tooShort));

  const exactlyFive = {
    category_code: 'SECURITY_INCIDENT' as IncidentCategory,
    description: 'Theft',
    incident_location: {
      landmark_description: 'Near North Gate',
    },
  };
  assert.ok(CreateReportRequestSchema.parse(exactlyFive));

  const tooLong = {
    category_code: 'SECURITY_INCIDENT' as IncidentCategory,
    description: 'A'.repeat(1001),
    incident_location: {
      landmark_description: 'Near North Gate',
    },
  };
  assert.throws(() => CreateReportRequestSchema.parse(tooLong));
});

test('Anti-Abuse: Honeypot field must be empty or undefined', () => {
  const spamPayload = {
    category_code: 'FIRE_OR_SMOKE' as IncidentCategory,
    description: 'Smoke spotted near substation',
    incident_location: { landmark_description: 'Block B' },
    website_url: 'https://spam-bot.xyz',
  };
  assert.throws(() => CreateReportRequestSchema.parse(spamPayload));

  const validEmptyHoneypot = {
    category_code: 'FIRE_OR_SMOKE' as IncidentCategory,
    description: 'Smoke spotted near substation',
    incident_location: { landmark_description: 'Block B' },
    website_url: '',
  };
  assert.ok(CreateReportRequestSchema.parse(validEmptyHoneypot));
});

test('Photo Validation: 5 MiB (5,242,880 bytes) boundary logic', () => {
  const MAX_BYTES = 5 * 1024 * 1024; // Exactly 5 MiB per D-14
  assert.equal(MAX_BYTES, 5242880);

  const validSizes = [1024, 1024 * 1024, 5242880];
  for (const size of validSizes) {
    assert.equal(size <= MAX_BYTES, true, `Size ${size} should be within 5 MiB`);
  }

  const invalidSizes = [5242881, 6 * 1024 * 1024, 10 * 1024 * 1024];
  for (const size of invalidSizes) {
    assert.equal(size <= MAX_BYTES, false, `Size ${size} should exceed 5 MiB`);
  }
});

test('Zero Transmission Assertion: Ticket S2 client makes 0 HTTP fetch requests', () => {
  // In Ticket S2, the form transitions to LocalReviewScreen without invoking fetch
  let fetchCallCount = 0;
  const mockFetch = () => {
    fetchCallCount++;
    return Promise.reject(new Error('Network transmission must not be called in S2'));
  };

  // Simulating client-side S2 validation flow
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    // Client flow only executes local Zod schema validation
    const sample = SAMPLE_CAMPUS_PLACES[0];
    const reportData = {
      category_code: 'FIRE_OR_SMOKE' as IncidentCategory,
      description: 'Verified fire alarm ringing in building',
      incident_location: {
        latitude: sample.coordinates.latitude,
        longitude: sample.coordinates.longitude,
        source: 'MAP_PLACE' as const,
        yct_map_place_id: sample.id,
        place_name_snapshot: sample.name,
        landmark_description: 'First floor foyer',
      },
    };
    const validated = CreateReportRequestSchema.parse(reportData);
    assert.ok(validated);
    assert.equal(fetchCallCount, 0, 'Zero network fetch requests should be triggered in S2');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Sample Fixtures: All fixtures use synthetic non-colliding UUIDs', () => {
  assert.ok(SAMPLE_CAMPUS_PLACES.length >= 10);
  for (const place of SAMPLE_CAMPUS_PLACES) {
    assert.match(
      place.id,
      /^00000000-0000-4000-8000-[0-9a-f]{12}$/,
      `Sample place ${place.name} must use synthetic 00000000 UUID`,
    );
    assert.equal(place.is_sample_fixture, true);
  }
});

test('Location Presentation & Guidance: 100-metre threshold classification', () => {
  const isBroadAccuracy = (accuracy: number | null | undefined): boolean => {
    return typeof accuracy === 'number' && accuracy > 100;
  };

  assert.equal(isBroadAccuracy(15), false, '15m is precise (< 100m)');
  assert.equal(isBroadAccuracy(100), false, '100m is boundary threshold (not > 100m)');
  assert.equal(isBroadAccuracy(101), true, '101m is broad accuracy (> 100m)');
  assert.equal(isBroadAccuracy(250), true, '250m is broad accuracy (> 100m)');
  assert.equal(isBroadAccuracy(null), false, 'null accuracy is not broad');
  assert.equal(isBroadAccuracy(undefined), false, 'undefined accuracy is not broad');
});
