import type {
  PublicActiveIncidentsGeoJSON,
  PublicIncidentFeature,
  PublicIncidentDetailResponse,
  PublicVerificationStatus,
  IncidentCategory,
} from '@yctalert/contracts';
import { query } from '../db/pool.js';

export interface PublicIncidentRow {
  incident_uuid: string;
  public_id: string;
  category_code: IncidentCategory;
  status: 'ACTIVE' | 'PENDING' | 'UNDER_REVIEW';
  verification_status: PublicVerificationStatus;
  safe_public_summary: string;
  reported_at: Date | string | null;
  published_at: Date | string;
  activated_at: Date | string | null;
  updated_at: Date | string;
  place_name_snapshot: string | null;
  landmark_description: string | null;
  yct_map_place_id: string | null;
  resolved_lat: number | string | null;
  resolved_lon: number | string | null;
}

const ELIGIBLE_INCIDENTS_CTE = `
  WITH eligible_incidents AS (
    SELECT
      i.id AS incident_uuid,
      i.public_id,
      i.category_code,
      i.status,
      CASE 
        WHEN i.status = 'ACTIVE' AND i.activated_at IS NOT NULL THEN 'VERIFIED'::text
        ELSE 'UNVERIFIED'::text
      END AS verification_status,
      i.safe_public_summary,
      min_legit.earliest_submitted_at AS reported_at,
      CASE
        WHEN i.status = 'ACTIVE' AND i.activated_at IS NOT NULL THEN i.activated_at
        ELSE COALESCE(min_legit.earliest_submitted_at, i.first_reported_at)
      END AS published_at,
      CASE
        WHEN i.status = 'ACTIVE' AND i.activated_at IS NOT NULL THEN i.activated_at
        ELSE NULL
      END AS activated_at,
      i.updated_at,
      desc_report.place_name_snapshot,
      desc_report.landmark_description,
      desc_report.yct_map_place_id,
      -- Atomic coordinate-pair selection: explicit admin override -> divergent check -> valid consensus -> legitimate report fallback
      CASE 
        WHEN i.admin_override_lat IS NOT NULL AND i.admin_override_lon IS NOT NULL 
          THEN i.admin_override_lat
        WHEN i.consensus_confidence = 'DIVERGENT'
          THEN NULL
        WHEN i.consensus_lat IS NOT NULL AND i.consensus_lon IS NOT NULL 
          THEN i.consensus_lat
        WHEN coord_report.incident_lat IS NOT NULL AND coord_report.incident_lon IS NOT NULL
          THEN coord_report.incident_lat
        ELSE NULL
      END AS resolved_lat,
      CASE 
        WHEN i.admin_override_lat IS NOT NULL AND i.admin_override_lon IS NOT NULL 
          THEN i.admin_override_lon
        WHEN i.consensus_confidence = 'DIVERGENT'
          THEN NULL
        WHEN i.consensus_lat IS NOT NULL AND i.consensus_lon IS NOT NULL 
          THEN i.consensus_lon
        WHEN coord_report.incident_lat IS NOT NULL AND coord_report.incident_lon IS NOT NULL
          THEN coord_report.incident_lon
        ELSE NULL
      END AS resolved_lon
    FROM incidents i
    LEFT JOIN LATERAL (
      SELECT MIN(r.submitted_at) AS earliest_submitted_at
      FROM incident_report_links irl
      JOIN incident_reports r ON r.id = irl.report_id
      WHERE irl.incident_id = i.id 
        AND r.is_test = FALSE
    ) min_legit ON TRUE
    LEFT JOIN LATERAL (
      SELECT 
        r.id AS report_id,
        r.description,
        r.place_name_snapshot,
        r.landmark_description,
        r.yct_map_place_id
      FROM incident_report_links irl
      JOIN incident_reports r ON r.id = irl.report_id
      WHERE irl.incident_id = i.id 
        AND r.is_test = FALSE
      ORDER BY 
        CASE WHEN irl.match_method = 'CREATION' THEN 0 
             WHEN irl.match_method = 'ADMIN' THEN 1 
             ELSE 2 END ASC,
        irl.linked_at ASC,
        r.submitted_at ASC,
        r.id ASC
      LIMIT 1
    ) desc_report ON TRUE
    LEFT JOIN LATERAL (
      SELECT 
        r.incident_lat,
        r.incident_lon
      FROM incident_report_links irl
      JOIN incident_reports r ON r.id = irl.report_id
      WHERE irl.incident_id = i.id 
        AND r.is_test = FALSE
        AND r.incident_lat IS NOT NULL 
        AND r.incident_lon IS NOT NULL
        AND r.incident_lat BETWEEN -90.0 AND 90.0
        AND r.incident_lon BETWEEN -180.0 AND 180.0
      ORDER BY 
        CASE WHEN irl.match_method = 'CREATION' THEN 0 
             WHEN irl.match_method = 'ADMIN' THEN 1 
             ELSE 2 END ASC,
        irl.linked_at ASC,
        r.submitted_at ASC,
        r.id ASC
      LIMIT 1
    ) coord_report ON TRUE
    WHERE i.status IN ('PENDING', 'UNDER_REVIEW', 'ACTIVE')
      AND i.purged_at IS NULL
      AND i.safe_public_summary IS NOT NULL
      AND BTRIM(i.safe_public_summary, E' \t\r\n') <> ''
      AND EXISTS (
        SELECT 1 
        FROM incident_report_links irl_legit
        JOIN incident_reports r_legit ON r_legit.id = irl_legit.report_id
        WHERE irl_legit.incident_id = i.id 
          AND r_legit.is_test = FALSE
      )
  )
`;

export class PublicIncidentService {
  /**
   * Returns active and unverified emergency reports eligible for public map broadcast as a GeoJSON FeatureCollection.
   * Excludes text-only incidents without valid geographic coordinates.
   */
  async getActiveIncidentsGeoJSON(): Promise<PublicActiveIncidentsGeoJSON> {
    const res = await query<PublicIncidentRow>(
      `${ELIGIBLE_INCIDENTS_CTE}
       SELECT 
         incident_uuid,
         public_id,
         category_code,
         status,
         verification_status,
         safe_public_summary,
         reported_at,
         published_at,
         activated_at,
         updated_at,
         place_name_snapshot,
         landmark_description,
         yct_map_place_id,
         resolved_lat,
         resolved_lon
       FROM eligible_incidents
       WHERE resolved_lat IS NOT NULL 
         AND resolved_lon IS NOT NULL
       ORDER BY published_at DESC, incident_uuid ASC`,
    );

    const features: PublicIncidentFeature[] = res.rows.map((row) => ({
      type: 'Feature',
      id: row.public_id,
      geometry: {
        type: 'Point',
        // RFC 7946 GeoJSON coordinate order: [longitude, latitude]
        coordinates: [Number(row.resolved_lon), Number(row.resolved_lat)],
      },
      properties: {
        public_id: row.public_id,
        category: row.category_code,
        status: 'ACTIVE',
        verification_status: row.verification_status,
        summary: row.safe_public_summary,
        place_name: row.place_name_snapshot ?? null,
        published_at: new Date(row.published_at).toISOString(),
        updated_at: new Date(row.updated_at).toISOString(),
        public_photo_url: null,
      },
    }));

    return {
      type: 'FeatureCollection',
      features,
      generated_at: new Date().toISOString(),
    };
  }

  /**
   * Returns public details of an active emergency incident or unverified public report.
   * Supports text-only incidents (where coordinates is null).
   * Returns null if the incident is not found or is ineligible for public visibility.
   */
  async getPublicIncidentDetail(publicId: string): Promise<PublicIncidentDetailResponse | null> {
    const trimmedId = publicId.trim();
    if (!trimmedId) {
      return null;
    }

    const res = await query<PublicIncidentRow>(
      `${ELIGIBLE_INCIDENTS_CTE}
       SELECT 
         incident_uuid,
         public_id,
         category_code,
         status,
         verification_status,
         safe_public_summary,
         reported_at,
         published_at,
         activated_at,
         updated_at,
         place_name_snapshot,
         landmark_description,
         yct_map_place_id,
         resolved_lat,
         resolved_lon
       FROM eligible_incidents
       WHERE public_id = $1`,
      [trimmedId],
    );

    if (res.rows.length === 0) {
      return null;
    }

    const row = res.rows[0];
    const coordinates: [number, number] | null =
      row.resolved_lat !== null && row.resolved_lon !== null
        ? [Number(row.resolved_lon), Number(row.resolved_lat)]
        : null;

    const reportedAtIso = row.reported_at
      ? new Date(row.reported_at).toISOString()
      : new Date(row.published_at).toISOString();

    const activatedAtIso = row.activated_at
      ? new Date(row.activated_at).toISOString()
      : null;

    return {
      public_id: row.public_id,
      category: row.category_code,
      status: 'ACTIVE',
      verification_status: row.verification_status,
      summary: row.safe_public_summary,
      location: {
        coordinates,
        place_name: row.place_name_snapshot ?? null,
        landmark_description: row.landmark_description ?? null,
        yct_map_place_id: row.yct_map_place_id ?? null,
      },
      timestamps: {
        reported_at: reportedAtIso,
        activated_at: activatedAtIso,
        updated_at: new Date(row.updated_at).toISOString(),
      },
      photos: [],
    };
  }
}
