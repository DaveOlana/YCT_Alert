import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INCIDENT_CATEGORIES,
  CATEGORY_CATALOGUE,
  IncidentCategory,
  CreateReportRequestSchema,
  CreateReportResponseSchema,
  ReceiptStatusResponseSchema,
  PublicActiveIncidentsGeoJSONSchema,
  PublicIncidentDetailResponseSchema,
  ActivateIncidentRequestSchema,
  ResolveIncidentRequestSchema,
  RejectIncidentRequestSchema,
  RetentionHoldRequestSchema,
  OverrideIncidentCoordinatesRequestSchema,
  CampusPlacesListResponseSchema,
  CampusPlacesQuerySchema,
  CampusPlaceSchema,
  YctMapLocationsUpstreamSchema,
  normalizeUpstreamPlace,
  ErrorResponseSchema,
  ERROR_CODES,
  OPENAPI_SPECIFICATION,
} from '../src/index.js';

test('Taxonomy: Contains exactly the 5 approved incident categories', () => {
  assert.equal(INCIDENT_CATEGORIES.length, 5);
  const expectedCategories: IncidentCategory[] = [
    'FIRE_OR_SMOKE',
    'MEDICAL_EMERGENCY',
    'PHYSICAL_HAZARD',
    'SECURITY_INCIDENT',
    'OTHER_URGENT',
  ];
  for (const cat of expectedCategories) {
    assert.equal(INCIDENT_CATEGORIES.includes(cat), true);
    assert.ok(CATEGORY_CATALOGUE[cat]);
  }
});

test('Report Schema: Accepts valid 3-layer location with coordinates', () => {
  const validReport = {
    category_code: 'FIRE_OR_SMOKE',
    description: 'Dense black smoke spotted near Engineering workshop entrance',
    incident_location: {
      latitude: 6.518,
      longitude: 3.372,
      source: 'MANUAL_POINT',
      landmark_description: 'Near workshop gate',
    },
  };
  const parsed = CreateReportRequestSchema.parse(validReport);
  assert.equal(parsed.category_code, 'FIRE_OR_SMOKE');
  assert.equal(parsed.incident_location.latitude, 6.518);
});

test('Report Schema: Accepts text-only location with landmark description (no coordinates)', () => {
  const textOnlyReport = {
    category_code: 'PHYSICAL_HAZARD',
    description: 'Exposed live electric wire lying across walkway after rainfall',
    incident_location: {
      latitude: null,
      longitude: null,
      source: 'TEXT_ONLY',
      landmark_description: 'Between School of Art and Main Library pathway',
    },
  };
  const parsed = CreateReportRequestSchema.parse(textOnlyReport);
  assert.equal(parsed.incident_location.source, 'TEXT_ONLY');
  assert.equal(parsed.incident_location.latitude, null);
});

test('Report Schema: Accepts place UUID location from YCT Map snapshot', () => {
  const mapPlaceReport = {
    category_code: 'MEDICAL_EMERGENCY',
    description: 'Student collapsed inside lecture theater',
    incident_location: {
      source: 'MAP_PLACE',
      yct_map_place_id: 'a0000000-0000-0000-0000-000000000001',
      place_name_snapshot: 'Bakassi Lecture Theatre',
    },
  };
  const parsed = CreateReportRequestSchema.parse(mapPlaceReport);
  assert.equal(parsed.incident_location.source, 'MAP_PLACE');
  assert.equal(parsed.incident_location.place_name_snapshot, 'Bakassi Lecture Theatre');
});

test('Report Schema: Rejects report with zero location information', () => {
  const invalidReport = {
    category_code: 'OTHER_URGENT',
    description: 'Something dangerous happened somewhere on campus',
    incident_location: {
      latitude: null,
      longitude: null,
      source: 'MANUAL_POINT',
      landmark_description: null,
      yct_map_place_id: null,
    },
  };
  assert.throws(() => CreateReportRequestSchema.parse(invalidReport));
});

test('Report Schema: Rejects honeypot violation', () => {
  const spamReport = {
    category_code: 'FIRE_OR_SMOKE',
    description: 'Spam report containing automated link',
    incident_location: {
      landmark_description: 'Near sports complex',
    },
    website_url: 'https://spam-bot.example.com',
  };
  assert.throws(() => CreateReportRequestSchema.parse(spamReport));
});

test('Report Schema: Enforces description length boundary (5 to 1000 chars)', () => {
  const tooShort = {
    category_code: 'FIRE_OR_SMOKE',
    description: 'Fire',
    incident_location: { landmark_description: 'Block A' },
  };
  assert.throws(() => CreateReportRequestSchema.parse(tooShort));

  const tooLong = {
    category_code: 'FIRE_OR_SMOKE',
    description: 'A'.repeat(1001),
    incident_location: { landmark_description: 'Block A' },
  };
  assert.throws(() => CreateReportRequestSchema.parse(tooLong));
});

test('Receipt Contracts: Validates CreateReportResponse & ReceiptStatusResponse', () => {
  const createResp = {
    receipt_id: 'rct_01HXYZ99999999999999999999',
    receipt_token: 'csprng_bearer_token_hex_or_base64_secret_key',
    delivery_status: 'RECEIVED' as const,
    received_at: new Date().toISOString(),
    message: 'Report received and queued for review.',
  };
  const parsedCreate = CreateReportResponseSchema.parse(createResp);
  assert.equal(parsedCreate.delivery_status, 'RECEIVED');

  const statusResp = {
    receipt_id: 'rct_01HXYZ99999999999999999999',
    delivery_status: 'PUBLISHED' as const,
    category: 'FIRE_OR_SMOKE' as const,
    received_at: new Date().toISOString(),
    public_advisory_id: 'adv_01HXYZ',
  };
  const parsedStatus = ReceiptStatusResponseSchema.parse(statusResp);
  assert.equal(parsedStatus.delivery_status, 'PUBLISHED');

  const rejectedStatusResp = {
    receipt_id: 'rct_01HXYZ99999999999999999999',
    delivery_status: 'REJECTED' as const,
    category: 'FIRE_OR_SMOKE' as const,
    received_at: new Date().toISOString(),
    public_advisory_id: null,
    status_message: 'Report reviewed and closed by safety moderators.',
  };
  const parsedRejected = ReceiptStatusResponseSchema.parse(rejectedStatusResp);
  assert.equal(parsedRejected.delivery_status, 'REJECTED');
});

test('GeoJSON Feed: Enforces RFC 7946 [longitude, latitude] coordinates order', () => {
  const validFeed = {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        id: 'inc_001',
        geometry: {
          type: 'Point' as const,
          coordinates: [3.3725, 6.5182] as [number, number], // [lon, lat]
        },
        properties: {
          public_id: 'adv_001',
          category: 'FIRE_OR_SMOKE' as const,
          status: 'ACTIVE' as const,
          verification_status: 'VERIFIED' as const,
          summary: 'Electrical fire near Sub-station B, area cordoned off.',
          place_name: 'Sub-station B',
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          public_photo_url: null,
        },
      },
    ],
    generated_at: new Date().toISOString(),
  };

  const parsed = PublicActiveIncidentsGeoJSONSchema.parse(validFeed);
  assert.equal(parsed.features[0].geometry.coordinates[0], 3.3725); // Longitude first
  assert.equal(parsed.features[0].geometry.coordinates[1], 6.5182); // Latitude second
  assert.equal(parsed.features[0].properties.status, 'ACTIVE');
  assert.equal(parsed.features[0].properties.verification_status, 'VERIFIED');
  assert.equal(parsed.features[0].properties.place_name, 'Sub-station B');
  assert.equal(parsed.features[0].properties.public_photo_url, null);
});

test('Public Incident Details Contract: Validates public details with and without coordinates', () => {
  const withCoords = {
    public_id: 'INC-20261115-001',
    category: 'FIRE_OR_SMOKE' as const,
    status: 'ACTIVE' as const,
    verification_status: 'VERIFIED' as const,
    summary: 'Active fire near workshop',
    location: {
      coordinates: [3.3725, 6.5182] as [number, number],
      place_name: 'Engineering Workshop',
      landmark_description: 'Near north gate',
      yct_map_place_id: 'a0000000-0000-0000-0000-000000000001',
    },
    timestamps: {
      reported_at: new Date().toISOString(),
      activated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    photos: [],
  };
  const parsedCoords = PublicIncidentDetailResponseSchema.parse(withCoords);
  assert.equal(parsedCoords.public_id, 'INC-20261115-001');
  assert.equal(parsedCoords.verification_status, 'VERIFIED');
  assert.equal(parsedCoords.location.coordinates?.[0], 3.3725);
  assert.deepEqual(parsedCoords.photos, []);

  const unverifiedTextOnly = {
    public_id: 'INC-20261115-002',
    category: 'SECURITY_INCIDENT' as const,
    status: 'ACTIVE' as const,
    verification_status: 'UNVERIFIED' as const,
    summary: 'Suspicious individual reported near library path',
    location: {
      coordinates: null,
      place_name: 'Library Pathway',
      landmark_description: 'Beside main hall',
      yct_map_place_id: null,
    },
    timestamps: {
      reported_at: new Date().toISOString(),
      activated_at: null,
      updated_at: new Date().toISOString(),
    },
    photos: [],
  };
  const parsedText = PublicIncidentDetailResponseSchema.parse(unverifiedTextOnly);
  assert.equal(parsedText.public_id, 'INC-20261115-002');
  assert.equal(parsedText.verification_status, 'UNVERIFIED');
  assert.equal(parsedText.timestamps.activated_at, null);
  assert.equal(parsedText.location.coordinates, null);
  assert.equal(parsedText.location.place_name, 'Library Pathway');
});

test('Admin Lifecycle & Retention Contracts: Validates transition requests', () => {
  const activateReq = {
    safe_summary: 'Confirmed chemical spill contained within Lab 3; avoid hallway.',
    display_latitude: 6.518,
    display_longitude: 3.372,
    approve_photo: false,
    reason: 'Verified by campus safety team',
  };
  assert.ok(ActivateIncidentRequestSchema.parse(activateReq));

  const resolveReq = {
    resolution_reason: 'Hazard cleared by maintenance team and certified safe.',
  };
  assert.ok(ResolveIncidentRequestSchema.parse(resolveReq));

  const rejectReq = {
    rejection_reason: 'Duplicate report of already managed event.',
  };
  assert.ok(RejectIncidentRequestSchema.parse(rejectReq));

  const retentionHoldReq = {
    retention_hold: true,
    reason: 'Safety audit in progress regarding electrical conduit installation.',
  };
  assert.ok(RetentionHoldRequestSchema.parse(retentionHoldReq));

  const overrideCoordsReq = {
    latitude: 6.5182,
    longitude: 3.3725,
    reason: 'GPS adjusted based on safety officer physical inspection.',
    expected_version: 2,
  };
  const parsedOverride = OverrideIncidentCoordinatesRequestSchema.parse(overrideCoordsReq);
  assert.equal(parsedOverride.latitude, 6.5182);
  assert.equal(parsedOverride.longitude, 3.3725);
  assert.equal(parsedOverride.expected_version, 2);
});

test('Geography: Validates CampusPlacesListResponse from YCT Map snapshot', () => {
  const snapshotData = {
    places: [
      {
        id: 'd0000000-0000-0000-0000-000000000004',
        name: 'School of Technology Hall',
        category_slug: 'academic',
        category_name: 'Academic Buildings',
        coordinates: {
          latitude: 6.5185,
          longitude: 3.3728,
        },
        primary_entrance: {
          id: 'e0000000-0000-0000-0000-000000000005',
          name: 'Main North Entrance',
          latitude: 6.5184,
          longitude: 3.3727,
        },
        verification_state: 'VERIFIED',
        is_active: true,
      },
    ],
    total: 1,
    snapshot_age_seconds: 120,
    sync_status: 'HEALTHY' as const,
  };
  const parsed = CampusPlacesListResponseSchema.parse(snapshotData);
  assert.equal(parsed.places.length, 1);
  assert.equal(parsed.places[0].name, 'School of Technology Hall');
});

test('Geography G3.1: Validates YctMapLocationsUpstreamSchema and normalizes to CampusPlace', () => {
  const upstreamGeoJson = {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        id: 'e0b9b3e1-5f21-4f40-8f92-5d9c228a0112',
        geometry: {
          type: 'Point' as const,
          coordinates: [3.373456, 6.518234] as [number, number], // [lon, lat]
        },
        properties: {
          id: 'e0b9b3e1-5f21-4f40-8f92-5d9c228a0112',
          destination_key: 'location:e0b9b3e1-5f21-4f40-8f92-5d9c228a0112',
          destination_type: 'location',
          name: 'Bakassi Lecture Theatre',
          category: 'academic',
          category_label: 'Academic Facilities',
          description: 'Primary lecture theatre.',
          verification_state: 'VERIFIED',
          verification_label: 'Verified',
          is_checkpoint: false,
          aliases: ['BLT', 'Bakassi Hall'],
          categories: [{ slug: 'academic', name: 'Academic' }],
          place_type: 'building',
          place_type_label: 'Building',
          routing_available: true,
          routing_unavailable_reason: null,
          places_inside_count: 2,
        },
      },
    ],
    meta: {
      count: 1,
      query: '',
      category: '',
    },
  };

  const parsed = YctMapLocationsUpstreamSchema.parse(upstreamGeoJson);
  assert.equal(parsed.features.length, 1);
  assert.equal(parsed.features[0].properties.name, 'Bakassi Lecture Theatre');

  // Verify Normalization Adapter
  const normalized = normalizeUpstreamPlace(parsed.features[0]);
  assert.equal(normalized.id, 'e0b9b3e1-5f21-4f40-8f92-5d9c228a0112');
  assert.equal(normalized.name, 'Bakassi Lecture Theatre');
  assert.equal(normalized.category_slug, 'academic');
  assert.equal(normalized.category_name, 'Academic Facilities');
  // Coordinates must be inverted: coordinates: [lon, lat] -> { latitude: lat, longitude: lon }
  assert.equal(normalized.coordinates.latitude, 6.518234);
  assert.equal(normalized.coordinates.longitude, 3.373456);
  assert.equal(normalized.verification_state, 'VERIFIED');
  assert.equal(normalized.is_active, true);
  assert.equal(normalized.primary_entrance, null);
  assert.deepEqual(normalized.aliases, ['BLT', 'Bakassi Hall']);

  // Verify normalized place passes CampusPlaceSchema
  assert.doesNotThrow(() => CampusPlaceSchema.parse(normalized));
});

test('Geography G3.2: Validates CampusPlacesQuerySchema parameters and boundaries', () => {
  // Default values
  const defaultParsed = CampusPlacesQuerySchema.parse({});
  assert.equal(defaultParsed.limit, 50);
  assert.equal(defaultParsed.q, undefined);
  assert.equal(defaultParsed.category, undefined);

  // String coercion for limit
  const coerced = CampusPlacesQuerySchema.parse({ limit: '25', q: '  Library  ', category: '  academic  ' });
  assert.equal(coerced.limit, 25);
  assert.equal(coerced.q, 'Library');
  assert.equal(coerced.category, 'academic');

  // Boundary checks: max limit 200
  const maxLimit = CampusPlacesQuerySchema.parse({ limit: 200 });
  assert.equal(maxLimit.limit, 200);

  // Limit > 200 fails
  assert.throws(() => CampusPlacesQuerySchema.parse({ limit: 201 }));

  // Limit < 1 fails
  assert.throws(() => CampusPlacesQuerySchema.parse({ limit: 0 }));

  // Q string exceeding max 80 chars fails
  assert.throws(() => CampusPlacesQuerySchema.parse({ q: 'a'.repeat(81) }));

  // Category exceeding max 50 chars fails
  assert.throws(() => CampusPlacesQuerySchema.parse({ category: 'c'.repeat(51) }));
});


test('Error Envelope: Canonical error schema validates all 9 error codes', () => {
  assert.equal(ERROR_CODES.length, 9);
  for (const code of ERROR_CODES) {
    const errorPayload = {
      error: {
        code,
        message: `Simulated error for code: ${code}`,
        request_id: 'req_test_12345',
        details: [{ field: 'test_field', message: 'Specific detail message' }],
      },
    };
    const parsed = ErrorResponseSchema.parse(errorPayload);
    assert.equal(parsed.error.code, code);
  }
});

test('OpenAPI Specification: Validates presence of all routes and component schemas', () => {
  assert.equal(OPENAPI_SPECIFICATION.openapi, '3.1.0');
  const expectedPaths = [
    '/health/live',
    '/health/ready',
    '/api/v1/taxonomy',
    '/api/v1/places/',
    '/api/v1/reports',
    '/api/v1/reports/receipts/{receipt_id}',
    '/api/v1/incidents/active/',
    '/api/v1/incidents/public/{public_id}',
    '/api/v1/admin/incidents/{id}/activate',
    '/api/v1/admin/incidents/{id}/resolve',
    '/api/v1/admin/incidents/{id}/reject',
    '/api/v1/admin/incidents/{id}/retention-hold',
    '/api/v1/admin/sync-geography',
  ];
  const paths = OPENAPI_SPECIFICATION.paths as Record<string, unknown>;
  for (const path of expectedPaths) {
    assert.ok(paths[path], `Missing expected OpenAPI path: ${path}`);
  }

  const expectedSchemas = [
    'CreateReportRequest',
    'CreateReportResponse',
    'ReceiptStatusResponse',
    'PublicIncidentFeature',
    'PublicIncidentFeatureProperties',
    'PublicIncidentLocation',
    'PublicIncidentTimestamps',
    'PublicIncidentDetailResponse',
    'PublicActiveIncidentsGeoJSON',
    'ActivateIncidentRequest',
    'ResolveIncidentRequest',
    'RejectIncidentRequest',
    'RetentionHoldRequest',
    'CampusPlace',
    'CampusEntrance',
    'CampusPlacesListResponse',
    'GeographySyncMeta',
    'ErrorResponse',
  ];
  const schemas = OPENAPI_SPECIFICATION.components.schemas as Record<string, unknown>;
  for (const schemaName of expectedSchemas) {
    assert.ok(schemas[schemaName], `Missing expected OpenAPI schema: ${schemaName}`);
  }
});
