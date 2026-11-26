import type { PoolClient } from 'pg';

export const DEFAULT_CONSENSUS_THRESHOLD_METERS = 50.0;
const EARTH_RADIUS_METERS = 6371000.0;

/**
 * Calculates great-circle distance between two geographic coordinates using the Haversine formula.
 * Order: lat1, lon1, lat2, lon2 (degrees). Returns distance in meters.
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const phi1 = (lat1 * Math.PI) / 180.0;
  const phi2 = (lat2 * Math.PI) / 180.0;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180.0;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180.0;

  const a =
    Math.sin(deltaPhi / 2.0) * Math.sin(deltaPhi / 2.0) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2.0) * Math.sin(deltaLambda / 2.0);

  const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
  return EARTH_RADIUS_METERS * c;
}

export interface CandidateCoordinate {
  latitude: number;
  longitude: number;
  reportId: string;
  submittedAt: Date | string;
}

export type ConsensusConfidence = 'EXACT' | 'CONSENSUS' | 'DIVERGENT' | 'NONE';

export interface MedoidResult {
  latitude: number | null;
  longitude: number | null;
  confidence: ConsensusConfidence;
  medoidReportId: string | null;
  sampleSize: number;
  maxDistanceToMedoidMeters: number | null;
}

/**
 * Calculates the medoid from a set of reported coordinates.
 *
 * Requirements:
 * 1. Considers only valid, non-null WGS-84 coordinates.
 * 2. N=0: Returns null (NONE).
 * 3. N=1: Returns single coordinate pair (EXACT).
 * 4. N=2: Computes distance. If <= threshold, applies deterministic tie-break (CONSENSUS).
 *         If > threshold, consensus fails (DIVERGENT).
 * 5. N>=3: Computes pairwise distance sums. Selects candidate minimizing sum of distances.
 *          Deterministic tie-break: earliest submittedAt, then lexical reportId.
 *          If max distance from medoid to any point in the cluster exceeds threshold, returns null (DIVERGENT).
 */
export function calculateCoordinateMedoid(
  candidates: CandidateCoordinate[],
  thresholdMeters: number = DEFAULT_CONSENSUS_THRESHOLD_METERS,
): MedoidResult {
  const valid = candidates.filter((c) => {
    return (
      typeof c.latitude === 'number' &&
      typeof c.longitude === 'number' &&
      Number.isFinite(c.latitude) &&
      Number.isFinite(c.longitude) &&
      c.latitude >= -90.0 &&
      c.latitude <= 90.0 &&
      c.longitude >= -180.0 &&
      c.longitude <= 180.0
    );
  });

  if (valid.length === 0) {
    return {
      latitude: null,
      longitude: null,
      confidence: 'NONE',
      medoidReportId: null,
      sampleSize: 0,
      maxDistanceToMedoidMeters: null,
    };
  }

  if (valid.length === 1) {
    return {
      latitude: Number(valid[0].latitude.toFixed(6)),
      longitude: Number(valid[0].longitude.toFixed(6)),
      confidence: 'EXACT',
      medoidReportId: valid[0].reportId,
      sampleSize: 1,
      maxDistanceToMedoidMeters: 0,
    };
  }

  // Helper for deterministic tie breaking: earliest submittedAt, then reportId asc
  const compareDeterministically = (a: CandidateCoordinate, b: CandidateCoordinate) => {
    const timeA = new Date(a.submittedAt).getTime();
    const timeB = new Date(b.submittedAt).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return a.reportId.localeCompare(b.reportId);
  };

  if (valid.length === 2) {
    const dist = haversineDistanceMeters(
      valid[0].latitude,
      valid[0].longitude,
      valid[1].latitude,
      valid[1].longitude,
    );

    if (dist > thresholdMeters) {
      return {
        latitude: null,
        longitude: null,
        confidence: 'DIVERGENT',
        medoidReportId: null,
        sampleSize: 2,
        maxDistanceToMedoidMeters: dist,
      };
    }

    const picked = compareDeterministically(valid[0], valid[1]) <= 0 ? valid[0] : valid[1];
    return {
      latitude: Number(picked.latitude.toFixed(6)),
      longitude: Number(picked.longitude.toFixed(6)),
      confidence: 'CONSENSUS',
      medoidReportId: picked.reportId,
      sampleSize: 2,
      maxDistanceToMedoidMeters: dist,
    };
  }

  // N >= 3: Medoid calculation
  let bestIndex = 0;
  let bestSum = Infinity;

  const pairwiseDistances: number[][] = Array.from({ length: valid.length }, () =>
    new Array(valid.length).fill(0),
  );

  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      const d = haversineDistanceMeters(
        valid[i].latitude,
        valid[i].longitude,
        valid[j].latitude,
        valid[j].longitude,
      );
      pairwiseDistances[i][j] = d;
      pairwiseDistances[j][i] = d;
    }
  }

  for (let i = 0; i < valid.length; i++) {
    let sum = 0;
    for (let j = 0; j < valid.length; j++) {
      sum += pairwiseDistances[i][j];
    }

    if (sum < bestSum - 1e-6) {
      bestSum = sum;
      bestIndex = i;
    } else if (Math.abs(sum - bestSum) <= 1e-6) {
      // Deterministic tie break
      if (compareDeterministically(valid[i], valid[bestIndex]) < 0) {
        bestSum = sum;
        bestIndex = i;
      }
    }
  }

  const medoidCandidate = valid[bestIndex];
  let maxDist = 0;
  for (let j = 0; j < valid.length; j++) {
    const d = pairwiseDistances[bestIndex][j];
    if (d > maxDist) {
      maxDist = d;
    }
  }

  if (maxDist > thresholdMeters) {
    return {
      latitude: null,
      longitude: null,
      confidence: 'DIVERGENT',
      medoidReportId: null,
      sampleSize: valid.length,
      maxDistanceToMedoidMeters: maxDist,
    };
  }

  return {
    latitude: Number(medoidCandidate.latitude.toFixed(6)),
    longitude: Number(medoidCandidate.longitude.toFixed(6)),
    confidence: 'CONSENSUS',
    medoidReportId: medoidCandidate.reportId,
    sampleSize: valid.length,
    maxDistanceToMedoidMeters: maxDist,
  };
}

/**
 * Recomputes and persists consensus coordinates for an incident within a transaction.
 */
export async function recomputeIncidentCoordinateConsensus(
  incidentId: string,
  client: PoolClient,
  thresholdMeters: number = DEFAULT_CONSENSUS_THRESHOLD_METERS,
): Promise<MedoidResult> {
  const reportsRes = await client.query<{
    report_id: string;
    incident_lat: string | number;
    incident_lon: string | number;
    submitted_at: Date;
  }>(
    `SELECT 
      r.id AS report_id,
      r.incident_lat,
      r.incident_lon,
      r.submitted_at
    FROM incident_report_links irl
    JOIN incident_reports r ON r.id = irl.report_id
    WHERE irl.incident_id = $1
      AND r.is_test = FALSE
      AND r.incident_lat IS NOT NULL
      AND r.incident_lon IS NOT NULL
      AND r.incident_lat >= -90.0 AND r.incident_lat <= 90.0
      AND r.incident_lon >= -180.0 AND r.incident_lon <= 180.0
    ORDER BY r.submitted_at ASC, r.id ASC`,
    [incidentId],
  );

  const candidates: CandidateCoordinate[] = reportsRes.rows.map((row) => ({
    latitude: Number(row.incident_lat),
    longitude: Number(row.incident_lon),
    reportId: row.report_id,
    submittedAt: row.submitted_at,
  }));

  const medoidResult = calculateCoordinateMedoid(candidates, thresholdMeters);

  await client.query(
    `UPDATE incidents
     SET consensus_lat = $1,
         consensus_lon = $2,
         consensus_confidence = $3,
         consensus_evaluated_at = CURRENT_TIMESTAMP
     WHERE id = $4`,
    [
      medoidResult.latitude,
      medoidResult.longitude,
      medoidResult.confidence,
      incidentId,
    ],
  );

  return medoidResult;
}

export interface CoordinateResolutionInput {
  adminOverrideLat: number | null;
  adminOverrideLon: number | null;
  consensusLat: number | null;
  consensusLon: number | null;
  consensusConfidence: 'EXACT' | 'CONSENSUS' | 'DIVERGENT' | 'NONE' | string | null;
  earliestReportLat?: number | null;
  earliestReportLon?: number | null;
}

export interface ResolvedCoordinates {
  latitude: number | null;
  longitude: number | null;
  source: 'ADMIN_OVERRIDE' | 'CONSENSUS' | 'EARLIEST_REPORT' | 'NONE';
}

/**
 * Pure coordinate resolution algorithm matching the database ELIGIBLE_INCIDENTS_CTE SQL precedence.
 *
 * Precedence:
 * 1. Explicit admin override coordinates (if both lat and lon are valid non-null numbers).
 *    A valid admin override takes precedence EVEN IF underlying consensus is DIVERGENT.
 * 2. When consensus is 'DIVERGENT', do NOT fall back to arbitrary report coordinates. Return null.
 * 3. Computed consensus coordinates (if both consensus_lat and consensus_lon are valid non-null numbers).
 * 4. Fallback to earliest legitimate report coordinates ONLY when consensus has never been evaluated
 *    (consensus_confidence is null).
 * 5. Otherwise return null. Never fabricate positions and never combine lat/lon from different sources.
 */
export function resolveIncidentCoordinates(
  input: CoordinateResolutionInput,
): ResolvedCoordinates {
  // 1. Explicit admin override (valid lat and lon pair)
  if (
    input.adminOverrideLat !== null &&
    input.adminOverrideLat !== undefined &&
    input.adminOverrideLon !== null &&
    input.adminOverrideLon !== undefined &&
    Number.isFinite(input.adminOverrideLat) &&
    Number.isFinite(input.adminOverrideLon) &&
    input.adminOverrideLat >= -90.0 &&
    input.adminOverrideLat <= 90.0 &&
    input.adminOverrideLon >= -180.0 &&
    input.adminOverrideLon <= 180.0
  ) {
    return {
      latitude: Number(input.adminOverrideLat.toFixed(6)),
      longitude: Number(input.adminOverrideLon.toFixed(6)),
      source: 'ADMIN_OVERRIDE',
    };
  }

  // 2. Consensus marked DIVERGENT: strictly suppress fallback to arbitrary report coordinate
  if (input.consensusConfidence === 'DIVERGENT') {
    return {
      latitude: null,
      longitude: null,
      source: 'NONE',
    };
  }

  // 3. Valid consensus coordinates (EXACT or CONSENSUS)
  if (
    input.consensusLat !== null &&
    input.consensusLat !== undefined &&
    input.consensusLon !== null &&
    input.consensusLon !== undefined &&
    Number.isFinite(input.consensusLat) &&
    Number.isFinite(input.consensusLon) &&
    input.consensusLat >= -90.0 &&
    input.consensusLat <= 90.0 &&
    input.consensusLon >= -180.0 &&
    input.consensusLon <= 180.0
  ) {
    return {
      latitude: Number(input.consensusLat.toFixed(6)),
      longitude: Number(input.consensusLon.toFixed(6)),
      source: 'CONSENSUS',
    };
  }

  // 4. Fallback to earliest legitimate report coordinate when consensus is not divergent
  if (
    input.earliestReportLat !== null &&
    input.earliestReportLat !== undefined &&
    input.earliestReportLon !== null &&
    input.earliestReportLon !== undefined &&
    Number.isFinite(input.earliestReportLat) &&
    Number.isFinite(input.earliestReportLon) &&
    input.earliestReportLat >= -90.0 &&
    input.earliestReportLat <= 90.0 &&
    input.earliestReportLon >= -180.0 &&
    input.earliestReportLon <= 180.0
  ) {
    return {
      latitude: Number(input.earliestReportLat.toFixed(6)),
      longitude: Number(input.earliestReportLon.toFixed(6)),
      source: 'EARLIEST_REPORT',
    };
  }

  // 5. No valid coordinates available -> null location
  return {
    latitude: null,
    longitude: null,
    source: 'NONE',
  };
}
