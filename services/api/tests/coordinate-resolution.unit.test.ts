import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCoordinateMedoid,
  resolveIncidentCoordinates,
  haversineDistanceMeters,
  type CandidateCoordinate,
} from '../src/services/coordinateConsensusService.js';

test('DEF-01: Coordinate Resolution & Consensus Provenance (Unit Suite)', async (t) => {
  await t.test('1. Divergent coordinates without admin override produce NO public coordinates', () => {
    // Two reports > 50m apart (~200m)
    const candidates: CandidateCoordinate[] = [
      { reportId: 'r1', latitude: 6.51840, longitude: 3.37210, submittedAt: '2026-11-17T09:00:00Z' },
      { reportId: 'r2', latitude: 6.52000, longitude: 3.37350, submittedAt: '2026-11-17T09:05:00Z' },
    ];

    const medoid = calculateCoordinateMedoid(candidates, 50.0);
    assert.equal(medoid.confidence, 'DIVERGENT');
    assert.equal(medoid.latitude, null);
    assert.equal(medoid.longitude, null);

    // Resolve for public feed without admin override
    const resolved = resolveIncidentCoordinates({
      adminOverrideLat: null,
      adminOverrideLon: null,
      consensusLat: medoid.latitude,
      consensusLon: medoid.longitude,
      consensusConfidence: medoid.confidence,
      earliestReportLat: candidates[0].latitude,
      earliestReportLon: candidates[0].longitude,
    });

    assert.equal(resolved.latitude, null, 'Must NOT fall back to earliest report coordinate');
    assert.equal(resolved.longitude, null, 'Must NOT fall back to earliest report coordinate');
    assert.equal(resolved.source, 'NONE');
  });

  await t.test('2. Divergent coordinates WITH valid admin override publishes override', () => {
    const candidates: CandidateCoordinate[] = [
      { reportId: 'r1', latitude: 6.51840, longitude: 3.37210, submittedAt: '2026-11-17T09:00:00Z' },
      { reportId: 'r2', latitude: 6.52500, longitude: 3.38000, submittedAt: '2026-11-17T09:05:00Z' },
    ];

    const medoid = calculateCoordinateMedoid(candidates, 50.0);
    assert.equal(medoid.confidence, 'DIVERGENT');

    // Admin sets override following ground verification
    const adminLat = 6.51920;
    const adminLon = 3.37400;

    const resolved = resolveIncidentCoordinates({
      adminOverrideLat: adminLat,
      adminOverrideLon: adminLon,
      consensusLat: medoid.latitude,
      consensusLon: medoid.longitude,
      consensusConfidence: medoid.confidence,
      earliestReportLat: candidates[0].latitude,
      earliestReportLon: candidates[0].longitude,
    });

    assert.equal(resolved.latitude, 6.51920);
    assert.equal(resolved.longitude, 3.37400);
    assert.equal(resolved.source, 'ADMIN_OVERRIDE');
  });

  await t.test('3. Valid multi-report consensus publishes computed consensus coordinate', () => {
    // 3 reports clustered within 25m
    const candidates: CandidateCoordinate[] = [
      { reportId: 'r1', latitude: 6.51840, longitude: 3.37210, submittedAt: '2026-11-17T09:00:00Z' },
      { reportId: 'r2', latitude: 6.51842, longitude: 3.37212, submittedAt: '2026-11-17T09:01:00Z' },
      { reportId: 'r3', latitude: 6.51845, longitude: 3.37215, submittedAt: '2026-11-17T09:02:00Z' },
    ];

    const medoid = calculateCoordinateMedoid(candidates, 50.0);
    assert.equal(medoid.confidence, 'CONSENSUS');
    assert.equal(medoid.latitude, 6.51842);
    assert.equal(medoid.longitude, 3.37212);

    const resolved = resolveIncidentCoordinates({
      adminOverrideLat: null,
      adminOverrideLon: null,
      consensusLat: medoid.latitude,
      consensusLon: medoid.longitude,
      consensusConfidence: medoid.confidence,
      earliestReportLat: candidates[0].latitude,
      earliestReportLon: candidates[0].longitude,
    });

    assert.equal(resolved.latitude, 6.51842);
    assert.equal(resolved.longitude, 3.37212);
    assert.equal(resolved.source, 'CONSENSUS');
  });

  await t.test('4. Single valid coordinate (EXACT) publishes correctly', () => {
    const single: CandidateCoordinate[] = [
      { reportId: 'r1', latitude: 6.51842, longitude: 3.37215, submittedAt: '2026-11-17T09:00:00Z' },
    ];

    const medoid = calculateCoordinateMedoid(single, 50.0);
    assert.equal(medoid.confidence, 'EXACT');
    assert.equal(medoid.latitude, 6.51842);
    assert.equal(medoid.longitude, 3.37215);

    const resolved = resolveIncidentCoordinates({
      adminOverrideLat: null,
      adminOverrideLon: null,
      consensusLat: medoid.latitude,
      consensusLon: medoid.longitude,
      consensusConfidence: medoid.confidence,
      earliestReportLat: single[0].latitude,
      earliestReportLon: single[0].longitude,
    });

    assert.equal(resolved.latitude, 6.51842);
    assert.equal(resolved.longitude, 3.37215);
    assert.equal(resolved.source, 'CONSENSUS');
  });

  await t.test('5. Missing coordinates do not produce fabricated positions', () => {
    const candidates: CandidateCoordinate[] = [];
    const medoid = calculateCoordinateMedoid(candidates, 50.0);
    assert.equal(medoid.confidence, 'NONE');
    assert.equal(medoid.latitude, null);
    assert.equal(medoid.longitude, null);

    const resolved = resolveIncidentCoordinates({
      adminOverrideLat: null,
      adminOverrideLon: null,
      consensusLat: null,
      consensusLon: null,
      consensusConfidence: 'NONE',
      earliestReportLat: null,
      earliestReportLon: null,
    });

    assert.equal(resolved.latitude, null);
    assert.equal(resolved.longitude, null);
    assert.equal(resolved.source, 'NONE');
  });

  await t.test('6. Coordinates are always selected atomically (never combine lat/lon from different sources)', () => {
    // If admin override is missing longitude, override must NOT be used partially
    const resolvedPartial = resolveIncidentCoordinates({
      adminOverrideLat: 6.51950,
      adminOverrideLon: null, // missing lon!
      consensusLat: 6.51840,
      consensusLon: 3.37210,
      consensusConfidence: 'CONSENSUS',
      earliestReportLat: 6.51700,
      earliestReportLon: 3.37100,
    });

    // Falls back to full consensus pair, never partial admin lat + consensus lon
    assert.equal(resolvedPartial.latitude, 6.51840);
    assert.equal(resolvedPartial.longitude, 3.37210);
    assert.equal(resolvedPartial.source, 'CONSENSUS');
  });

  await t.test('7. Legacy unevaluated row (confidence=null) preserves earliest report coordinates', () => {
    const resolvedLegacy = resolveIncidentCoordinates({
      adminOverrideLat: null,
      adminOverrideLon: null,
      consensusLat: null,
      consensusLon: null,
      consensusConfidence: null, // not yet evaluated
      earliestReportLat: 6.51842,
      earliestReportLon: 3.37521,
    });

    assert.equal(resolvedLegacy.latitude, 6.51842);
    assert.equal(resolvedLegacy.longitude, 3.37521);
    assert.equal(resolvedLegacy.source, 'EARLIEST_REPORT');
  });
});
