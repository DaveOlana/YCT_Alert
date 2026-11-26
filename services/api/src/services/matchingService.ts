import type { PoolClient } from 'pg';

export interface GeographicMatchResult {
  isMatch: boolean;
  distanceMeters: number | null;
  reason:
    | 'COORDINATES_WITHIN_THRESHOLD'
    | 'COORDINATES_EXCEED_THRESHOLD'
    | 'MATCHING_PLACE_ID_FALLBACK'
    | 'DIFFERENT_PLACE_IDS'
    | 'MISSING_SPATIAL_DATA';
}

export interface CandidateIncident {
  incident_id: string;
  public_id: string;
  status: string;
  category_code: string;
  first_reported_at: Date;
  last_reported_at: Date;
  row_version: number;
  candidate_lat: number | null;
  candidate_lon: number | null;
  candidate_yct_map_place_id: string | null;
}

/**
 * Safely parses coordinate values (including PostgreSQL NUMERIC string representations)
 * to finite JavaScript numbers, or null if absent, empty, or malformed.
 * Never converts missing coordinates into zero.
 */
export function parseCoordinate(val: unknown): number | null {
  if (val === null || val === undefined) {
    return null;
  }
  if (typeof val === 'number') {
    return isFinite(val) ? val : null;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '') return null;
    const num = Number(trimmed);
    return isFinite(num) ? num : null;
  }
  return null;
}

/**
 * Calculates great-circle distance between two geographic coordinates in meters
 * using the spherical Haversine formula.
 * Earth mean radius: 6,371,000 meters.
 */
export function calculateHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  if (lat1 === lat2 && lon1 === lon2) {
    return 0;
  }

  const R = 6371000; // Mean Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  // Clamp 'a' to [0, 1] to guard against floating point inaccuracies
  const clampedA = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));

  return R * c;
}

/**
 * Evaluates geographic eligibility between an incoming report and a candidate incident.
 *
 * Safeguards:
 * 1. When both reports have usable micro-location coordinates, distance determines
 *    eligibility. A shared building/place identifier must not override a failed distance check.
 * 2. When micro-location coordinates are unavailable on at least one report,
 *    falls back to canonical YCT Map place ID matching.
 * 3. Never uses public display coordinates as the authoritative spatial matching source.
 */
export function isGeographicMatch(
  inLat: number | null,
  inLon: number | null,
  inPlaceId: string | null,
  candLat: number | null,
  candLon: number | null,
  candPlaceId: string | null,
  thresholdMeters: number = 50.0,
): GeographicMatchResult {
  const incomingHasCoords = inLat !== null && inLon !== null;
  const candidateHasCoords = candLat !== null && candLon !== null;

  // Rule 1: Micro-location coordinate comparison (Haversine distance <= 50m)
  if (incomingHasCoords && candidateHasCoords) {
    const dist = calculateHaversineDistanceMeters(candLat, candLon, inLat, inLon);
    if (dist <= thresholdMeters) {
      return {
        isMatch: true,
        distanceMeters: dist,
        reason: 'COORDINATES_WITHIN_THRESHOLD',
      };
    }
    // Shared place ID must NOT override a failed distance check
    return {
      isMatch: false,
      distanceMeters: dist,
      reason: 'COORDINATES_EXCEED_THRESHOLD',
    };
  }

  // Rule 2: Canonical YCT Map place-ID fallback when micro-location is unavailable
  const normInPlace = inPlaceId ? inPlaceId.trim().toLowerCase() : null;
  const normCandPlace = candPlaceId ? candPlaceId.trim().toLowerCase() : null;

  if (normInPlace && normCandPlace) {
    if (normInPlace === normCandPlace) {
      return {
        isMatch: true,
        distanceMeters: null,
        reason: 'MATCHING_PLACE_ID_FALLBACK',
      };
    }
    return {
      isMatch: false,
      distanceMeters: null,
      reason: 'DIFFERENT_PLACE_IDS',
    };
  }

  // Micro-location coordinates unavailable and no matching place ID
  return {
    isMatch: false,
    distanceMeters: null,
    reason: 'MISSING_SPATIAL_DATA',
  };
}

/**
 * Queries candidate incidents eligible for proximity and temporal matching within a transaction.
 *
 * Filters:
 * - Identical category_code
 * - Status IN ('PENDING', 'UNDER_REVIEW', 'ACTIVE') (RESOLVED and REJECTED are excluded)
 * - Within 15 minutes of last_reported_at
 * - Matching is_test environment flag
 * - Extracts micro-location coordinates from creation report or linked reports (NOT public display_lat/display_lon)
 * - Locks candidate incident rows with FOR UPDATE OF i
 */
export async function findCandidateIncidents(
  client: PoolClient,
  categoryCode: string,
  submittedAt: Date,
  isTest: boolean,
): Promise<CandidateIncident[]> {
  const result = await client.query<{
    incident_id: string;
    public_id: string;
    status: string;
    category_code: string;
    first_reported_at: Date;
    last_reported_at: Date;
    row_version: number;
    candidate_lat: string | number | null;
    candidate_lon: string | number | null;
    candidate_yct_map_place_id: string | null;
  }>(
    `SELECT 
      i.id AS incident_id,
      i.public_id,
      i.status,
      i.category_code,
      i.first_reported_at,
      i.last_reported_at,
      i.row_version,
      COALESCE(cr.incident_lat, (
        SELECT r2.incident_lat 
        FROM incident_report_links irl2 
        JOIN incident_reports r2 ON r2.id = irl2.report_id 
        WHERE irl2.incident_id = i.id AND r2.incident_lat IS NOT NULL 
        LIMIT 1
      )) AS candidate_lat,
      COALESCE(cr.incident_lon, (
        SELECT r2.incident_lon 
        FROM incident_report_links irl2 
        JOIN incident_reports r2 ON r2.id = irl2.report_id 
        WHERE irl2.incident_id = i.id AND r2.incident_lon IS NOT NULL 
        LIMIT 1
      )) AS candidate_lon,
      COALESCE(cr.yct_map_place_id, (
        SELECT r2.yct_map_place_id 
        FROM incident_report_links irl2 
        JOIN incident_reports r2 ON r2.id = irl2.report_id 
        WHERE irl2.incident_id = i.id AND r2.yct_map_place_id IS NOT NULL 
        LIMIT 1
      )) AS candidate_yct_map_place_id
    FROM incidents i
    JOIN incident_report_links irl ON irl.incident_id = i.id AND irl.match_method = 'CREATION'
    JOIN incident_reports cr ON cr.id = irl.report_id
    WHERE i.category_code = $1
      AND i.status IN ('PENDING', 'UNDER_REVIEW', 'ACTIVE')
      AND i.last_reported_at >= ($2::timestamptz - INTERVAL '15 minutes')
      AND i.last_reported_at <= ($2::timestamptz + INTERVAL '15 minutes')
      AND cr.is_test = $3
    ORDER BY i.last_reported_at DESC
    FOR UPDATE OF i`,
    [categoryCode, submittedAt.toISOString(), isTest],
  );

  return result.rows.map((row) => ({
    incident_id: row.incident_id,
    public_id: row.public_id,
    status: row.status,
    category_code: row.category_code,
    first_reported_at: row.first_reported_at,
    last_reported_at: row.last_reported_at,
    row_version: row.row_version,
    candidate_lat: parseCoordinate(row.candidate_lat),
    candidate_lon: parseCoordinate(row.candidate_lon),
    candidate_yct_map_place_id: row.candidate_yct_map_place_id,
  }));
}

/**
 * Evaluates candidate incidents against incoming report location data.
 * Returns only candidates that strictly satisfy the geographic matching rules.
 */
export function evaluateCandidateMatches(
  incoming: {
    latitude: number | null;
    longitude: number | null;
    yct_map_place_id: string | null;
  },
  candidates: CandidateIncident[],
  thresholdMeters: number = 50.0,
): {
  matchedCandidates: CandidateIncident[];
  matchDetails: Map<string, GeographicMatchResult>;
} {
  const matchedCandidates: CandidateIncident[] = [];
  const matchDetails = new Map<string, GeographicMatchResult>();

  for (const cand of candidates) {
    const result = isGeographicMatch(
      incoming.latitude,
      incoming.longitude,
      incoming.yct_map_place_id,
      cand.candidate_lat,
      cand.candidate_lon,
      cand.candidate_yct_map_place_id,
      thresholdMeters,
    );

    matchDetails.set(cand.incident_id, result);

    if (result.isMatch) {
      matchedCandidates.push(cand);
    }
  }

  return { matchedCandidates, matchDetails };
}
