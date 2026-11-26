import { z } from 'zod';

export const CampusEntranceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export type CampusEntrance = z.infer<typeof CampusEntranceSchema>;

export const CampusPlaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  category_slug: z.string(),
  category_name: z.string(),
  coordinates: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  primary_entrance: CampusEntranceSchema.nullable().optional(),
  verification_state: z.string(),
  aliases: z.array(z.string()).optional().default([]),
  is_active: z.boolean().default(true),
});

export type CampusPlace = z.infer<typeof CampusPlaceSchema>;

export const SYNC_STATUSES = ['HEALTHY', 'DEGRADED', 'STALE', 'FAILED'] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];
export const SyncStatusSchema = z.enum(SYNC_STATUSES);

export const CampusPlacesListResponseSchema = z.object({
  places: z.array(CampusPlaceSchema),
  total: z.number().int().nonnegative(),
  snapshot_age_seconds: z.number().int().nonnegative(),
  sync_status: SyncStatusSchema,
});

export type CampusPlacesListResponse = z.infer<typeof CampusPlacesListResponseSchema>;

export const CampusPlacesQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.string().trim().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type CampusPlacesQuery = z.infer<typeof CampusPlacesQuerySchema>;

export const GeographySyncMetaSchema = z.object({
  last_sync_attempt_at: z.string().datetime(),
  last_successful_sync_at: z.string().datetime().nullable(),
  upstream_etag: z.string().nullable(),
  record_count: z.number().int().nonnegative(),
  sync_status: SyncStatusSchema,
});

export type GeographySyncMeta = z.infer<typeof GeographySyncMetaSchema>;

/**
 * Upstream YCT Map GeoJSON Feature Properties Schema
 * Validates the raw JSON emitted by YCT Map at GET /api/locations/
 */
export const YctMapFeaturePropertiesSchema = z.object({
  id: z.string().uuid(),
  destination_key: z.string().optional(),
  destination_type: z.string().optional(),
  name: z.string().min(1),
  category: z.string().min(1),
  category_label: z.string().min(1),
  description: z.string().nullable().optional(),
  verification_state: z.string().optional().default('UNVERIFIED'),
  verification_label: z.string().optional(),
  is_checkpoint: z.boolean().optional(),
  aliases: z.array(z.string()).optional().default([]),
  categories: z.array(z.object({ slug: z.string(), name: z.string() })).optional(),
  place_type: z.string().optional(),
  place_type_label: z.string().optional(),
  routing_available: z.boolean().optional(),
  routing_unavailable_reason: z.string().nullable().optional(),
  places_inside_count: z.number().int().optional(),
});

export type YctMapFeatureProperties = z.infer<typeof YctMapFeaturePropertiesSchema>;

export const YctMapFeatureSchema = z.object({
  type: z.literal('Feature'),
  id: z.string().uuid(),
  geometry: z.object({
    type: z.literal('Point'),
    // RFC 7946 GeoJSON format: [longitude, latitude]
    coordinates: z.tuple([
      z.number().min(-180).max(180),
      z.number().min(-90).max(90),
    ]),
  }),
  properties: YctMapFeaturePropertiesSchema,
});

export type YctMapFeature = z.infer<typeof YctMapFeatureSchema>;

export const YctMapLocationsUpstreamSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(YctMapFeatureSchema),
  meta: z
    .object({
      count: z.number().int().nonnegative().optional(),
      query: z.string().optional(),
      category: z.string().optional(),
    })
    .optional(),
});

export type YctMapLocationsUpstream = z.infer<typeof YctMapLocationsUpstreamSchema>;

/**
 * Normalizes an upstream YCT Map GeoJSON feature into YCT Alert's internal CampusPlace contract.
 */
export function normalizeUpstreamPlace(feature: YctMapFeature): CampusPlace {
  return {
    id: feature.properties.id || feature.id,
    name: feature.properties.name.trim(),
    category_slug: feature.properties.category,
    category_name: feature.properties.category_label,
    coordinates: {
      latitude: feature.geometry.coordinates[1],
      longitude: feature.geometry.coordinates[0],
    },
    primary_entrance: null,
    verification_state: feature.properties.verification_state || 'UNVERIFIED',
    aliases: Array.isArray(feature.properties.aliases) ? feature.properties.aliases : [],
    is_active: true,
  };
}

