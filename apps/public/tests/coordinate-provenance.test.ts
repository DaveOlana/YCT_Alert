import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveLocationSource } from '../src/services/reportSubmissionService.js';
import type { ReportFormData, CoordinatesProvenance } from '../src/types/reportForm.js';
import type { CampusPlace } from '@yctalert/contracts';

const MOCK_PLACE_1: CampusPlace = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Central Library Complex',
  category_slug: 'academic',
  category_name: 'Academic Facilities',
  coordinates: { latitude: 6.5186, longitude: 3.3729 },
  primary_entrance: null,
  verification_state: 'VERIFIED',
  aliases: ['BLT'],
  is_active: true,
};

const MOCK_PLACE_2: CampusPlace = {
  id: '22222222-2222-2222-2222-222222222222',
  name: 'School of Technology',
  category_slug: 'school',
  category_name: 'Academic Schools',
  coordinates: { latitude: 6.5195, longitude: 3.3735 },
  primary_entrance: null,
  verification_state: 'VERIFIED',
  aliases: [],
  is_active: true,
};

/**
 * Pure transition engine mirroring LocationPicker logic
 */
function applySelectPlace(
  current: ReportFormData['incident_location'],
  place: CampusPlace,
): ReportFormData['incident_location'] {
  const updates: Partial<ReportFormData['incident_location']> = {
    yct_map_place_id: place.id,
    place_name_snapshot: place.name,
  };

  if (current.coordinates_provenance === null || current.coordinates_provenance === 'MAP_PLACE') {
    updates.latitude = place.coordinates.latitude;
    updates.longitude = place.coordinates.longitude;
    updates.accuracy = null;
    updates.captured_at = null;
    updates.coordinates_provenance = 'MAP_PLACE';
  }

  return { ...current, ...updates };
}

function applyClearPlace(
  current: ReportFormData['incident_location'],
): ReportFormData['incident_location'] {
  const updates: Partial<ReportFormData['incident_location']> = {
    yct_map_place_id: null,
    place_name_snapshot: null,
  };

  if (current.coordinates_provenance === 'MAP_PLACE') {
    updates.latitude = null;
    updates.longitude = null;
    updates.accuracy = null;
    updates.captured_at = null;
    updates.coordinates_provenance = null;
  }

  return { ...current, ...updates };
}

function applyAcquireGps(
  current: ReportFormData['incident_location'],
  gpsFix: { latitude: number; longitude: number; accuracy: number; capturedAt: string },
): ReportFormData['incident_location'] {
  return {
    ...current,
    latitude: gpsFix.latitude,
    longitude: gpsFix.longitude,
    accuracy: gpsFix.accuracy,
    captured_at: gpsFix.capturedAt,
    coordinates_provenance: 'DEVICE_GPS',
  };
}

test('Coordinate Provenance & Transition Engine Suite (G3.2C)', async (t) => {
  const baseLocation: ReportFormData['incident_location'] = {
    latitude: null,
    longitude: null,
    accuracy: null,
    captured_at: null,
    coordinates_provenance: null,
    source: 'MANUAL_POINT',
    yct_map_place_id: null,
    place_name_snapshot: null,
    landmark_description: '',
  };

  await t.test('Rule 1: Selecting a place without coordinates inherits place centroid and sets MAP_PLACE', () => {
    const next = applySelectPlace(baseLocation, MOCK_PLACE_1);

    assert.equal(next.yct_map_place_id, MOCK_PLACE_1.id);
    assert.equal(next.place_name_snapshot, MOCK_PLACE_1.name);
    assert.equal(next.latitude, 6.5186);
    assert.equal(next.longitude, 3.3729);
    assert.equal(next.coordinates_provenance, 'MAP_PLACE');
    assert.equal(deriveLocationSource(next), 'MAP_PLACE');
  });

  await t.test('Rule 2: Selecting a place when GPS coordinates already exist preserves GPS coordinates and provenance', () => {
    const withGps: ReportFormData['incident_location'] = {
      ...baseLocation,
      latitude: 6.518111,
      longitude: 3.372222,
      accuracy: 12,
      captured_at: '2026-11-14T08:00:00.000Z',
      coordinates_provenance: 'DEVICE_GPS',
    };

    const next = applySelectPlace(withGps, MOCK_PLACE_1);

    assert.equal(next.yct_map_place_id, MOCK_PLACE_1.id);
    assert.equal(next.place_name_snapshot, MOCK_PLACE_1.name);
    // GPS coordinates must be preserved intact!
    assert.equal(next.latitude, 6.518111);
    assert.equal(next.longitude, 3.372222);
    assert.equal(next.accuracy, 12);
    assert.equal(next.coordinates_provenance, 'DEVICE_GPS');
    // Source derivation must remain DEVICE_GPS even though place is attached
    assert.equal(deriveLocationSource(next), 'DEVICE_GPS');
  });

  await t.test('Rule 3: Selecting a place when MANUAL coordinates exist preserves manual coordinates', () => {
    const withManual: ReportFormData['incident_location'] = {
      ...baseLocation,
      latitude: 6.5175,
      longitude: 3.3715,
      coordinates_provenance: 'MANUAL_POINT',
    };

    const next = applySelectPlace(withManual, MOCK_PLACE_1);

    assert.equal(next.yct_map_place_id, MOCK_PLACE_1.id);
    assert.equal(next.latitude, 6.5175);
    assert.equal(next.longitude, 3.3715);
    assert.equal(next.coordinates_provenance, 'MANUAL_POINT');
    assert.equal(deriveLocationSource(next), 'MANUAL_POINT');
  });

  await t.test('Rule 4: Changing place when coordinates_provenance is MAP_PLACE updates centroid to new place', () => {
    const afterPlace1 = applySelectPlace(baseLocation, MOCK_PLACE_1);
    assert.equal(afterPlace1.latitude, 6.5186);

    const afterPlace2 = applySelectPlace(afterPlace1, MOCK_PLACE_2);
    assert.equal(afterPlace2.yct_map_place_id, MOCK_PLACE_2.id);
    assert.equal(afterPlace2.latitude, 6.5195);
    assert.equal(afterPlace2.longitude, 3.3735);
    assert.equal(afterPlace2.coordinates_provenance, 'MAP_PLACE');
    assert.equal(deriveLocationSource(afterPlace2), 'MAP_PLACE');
  });

  await t.test('Rule 5: Clearing a place when coordinates_provenance is MAP_PLACE clears inherited coordinates', () => {
    const withPlace = applySelectPlace(baseLocation, MOCK_PLACE_1);
    assert.equal(withPlace.latitude, 6.5186);

    const cleared = applyClearPlace(withPlace);
    assert.equal(cleared.yct_map_place_id, null);
    assert.equal(cleared.place_name_snapshot, null);
    assert.equal(cleared.latitude, null);
    assert.equal(cleared.longitude, null);
    assert.equal(cleared.coordinates_provenance, null);
  });

  await t.test('Rule 6: Clearing a place when coordinates_provenance is DEVICE_GPS preserves GPS coordinates', () => {
    const withPlaceAndGps: ReportFormData['incident_location'] = {
      ...baseLocation,
      yct_map_place_id: MOCK_PLACE_1.id,
      place_name_snapshot: MOCK_PLACE_1.name,
      latitude: 6.518111,
      longitude: 3.372222,
      accuracy: 10,
      captured_at: '2026-11-14T08:00:00.000Z',
      coordinates_provenance: 'DEVICE_GPS',
    };

    const cleared = applyClearPlace(withPlaceAndGps);
    assert.equal(cleared.yct_map_place_id, null);
    assert.equal(cleared.place_name_snapshot, null);
    assert.equal(cleared.latitude, 6.518111);
    assert.equal(cleared.longitude, 3.372222);
    assert.equal(cleared.accuracy, 10);
    assert.equal(cleared.coordinates_provenance, 'DEVICE_GPS');
    assert.equal(deriveLocationSource(cleared), 'DEVICE_GPS');
  });

  await t.test('Rule 7: Acquiring GPS replaces MAP_PLACE coordinates and preserves place identity', () => {
    const withPlace = applySelectPlace(baseLocation, MOCK_PLACE_1);
    assert.equal(withPlace.coordinates_provenance, 'MAP_PLACE');

    const next = applyAcquireGps(withPlace, {
      latitude: 6.518333,
      longitude: 3.372444,
      accuracy: 8,
      capturedAt: '2026-11-14T08:05:00.000Z',
    });

    assert.equal(next.yct_map_place_id, MOCK_PLACE_1.id);
    assert.equal(next.place_name_snapshot, MOCK_PLACE_1.name);
    assert.equal(next.latitude, 6.518333);
    assert.equal(next.longitude, 3.372444);
    assert.equal(next.accuracy, 8);
    assert.equal(next.coordinates_provenance, 'DEVICE_GPS');
    assert.equal(deriveLocationSource(next), 'DEVICE_GPS');
  });

  await t.test('Submission Source Derivation: Strictly enforces all 6 priority tiers', () => {
    // Priority 1: DEVICE_GPS provenance
    assert.equal(
      deriveLocationSource({
        ...baseLocation,
        latitude: 6.518,
        longitude: 3.372,
        coordinates_provenance: 'DEVICE_GPS',
        yct_map_place_id: MOCK_PLACE_1.id,
      }),
      'DEVICE_GPS',
    );

    // Priority 2: MAP_PLACE provenance
    assert.equal(
      deriveLocationSource({
        ...baseLocation,
        latitude: 6.518,
        longitude: 3.372,
        coordinates_provenance: 'MAP_PLACE',
        yct_map_place_id: MOCK_PLACE_1.id,
      }),
      'MAP_PLACE',
    );

    // Priority 3: MANUAL_POINT provenance
    assert.equal(
      deriveLocationSource({
        ...baseLocation,
        latitude: 6.518,
        longitude: 3.372,
        coordinates_provenance: 'MANUAL_POINT',
      }),
      'MANUAL_POINT',
    );

    // Priority 4: yct_map_place_id without coordinates
    assert.equal(
      deriveLocationSource({
        ...baseLocation,
        yct_map_place_id: MOCK_PLACE_1.id,
        coordinates_provenance: null,
      }),
      'MAP_PLACE',
    );

    // Priority 5: TEXT_ONLY landmark description without place or coordinates
    assert.equal(
      deriveLocationSource({
        ...baseLocation,
        landmark_description: 'Near North Gate ATM',
        coordinates_provenance: null,
      }),
      'TEXT_ONLY',
    );

    // Priority 6: Default fallback
    assert.equal(
      deriveLocationSource({
        ...baseLocation,
        coordinates_provenance: null,
      }),
      'MANUAL_POINT',
    );
  });
});
