import { z } from 'zod';
import { IncidentCategorySchema } from './taxonomy.js';

export const INCIDENT_STATUSES = [
  'PENDING',
  'UNDER_REVIEW',
  'ACTIVE',
  'RESOLVED',
  'REJECTED',
] as const;

export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
export const IncidentStatusSchema = z.enum(INCIDENT_STATUSES);

// GeoJSON Point coordinates RFC 7946: [longitude, latitude]
export const GeoJSONCoordinatesSchema = z.tuple([
  z.number().min(-180).max(180), // Longitude
  z.number().min(-90).max(90), // Latitude
]);

export const PublicVerificationStatusSchema = z.enum(['UNVERIFIED', 'VERIFIED']);
export type PublicVerificationStatus = z.infer<typeof PublicVerificationStatusSchema>;

export const PublicIncidentFeaturePropertiesSchema = z.object({
  public_id: z.string(),
  category: IncidentCategorySchema,
  status: z.literal('ACTIVE'),
  verification_status: PublicVerificationStatusSchema,
  summary: z.string(),
  place_name: z.string().nullable().optional(),
  published_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  public_photo_url: z.string().url().nullable().default(null),
});

export const PublicIncidentFeatureSchema = z.object({
  type: z.literal('Feature'),
  id: z.string(),
  geometry: z.object({
    type: z.literal('Point'),
    coordinates: GeoJSONCoordinatesSchema,
  }),
  properties: PublicIncidentFeaturePropertiesSchema,
});

export type PublicIncidentFeature = z.infer<typeof PublicIncidentFeatureSchema>;

export const PublicActiveIncidentsGeoJSONSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(PublicIncidentFeatureSchema),
  generated_at: z.string().datetime(),
});

export type PublicActiveIncidentsGeoJSON = z.infer<typeof PublicActiveIncidentsGeoJSONSchema>;

// Public Incident Details Schemas (G3.3B)
export const PublicIncidentLocationSchema = z.object({
  coordinates: GeoJSONCoordinatesSchema.nullable(),
  place_name: z.string().nullable(),
  landmark_description: z.string().nullable(),
  yct_map_place_id: z.string().uuid().nullable(),
});

export type PublicIncidentLocation = z.infer<typeof PublicIncidentLocationSchema>;

export const PublicIncidentTimestampsSchema = z.object({
  reported_at: z.string().datetime(),
  activated_at: z.string().datetime().nullable(),
  updated_at: z.string().datetime(),
});

export type PublicIncidentTimestamps = z.infer<typeof PublicIncidentTimestampsSchema>;

export const PublicIncidentDetailResponseSchema = z.object({
  public_id: z.string(),
  category: IncidentCategorySchema,
  status: z.literal('ACTIVE'),
  verification_status: PublicVerificationStatusSchema,
  summary: z.string(),
  location: PublicIncidentLocationSchema,
  timestamps: PublicIncidentTimestampsSchema,
  photos: z.array(z.string()).default([]),
});

export type PublicIncidentDetailResponse = z.infer<typeof PublicIncidentDetailResponseSchema>;

// Administrative transition request schemas
export const ActivateIncidentRequestSchema = z.object({
  safe_summary: z
    .string()
    .trim()
    .min(10, 'Safe summary must be at least 10 characters')
    .max(500, 'Safe summary cannot exceed 500 characters'),
  display_latitude: z.number().min(-90).max(90).optional(),
  display_longitude: z.number().min(-180).max(180).optional(),
  safe_location_id: z.string().uuid().optional(),
  approve_photo: z.boolean().default(false),
  reason: z.string().max(300).optional(),
});

export type ActivateIncidentRequest = z.infer<typeof ActivateIncidentRequestSchema>;

export const ResolveIncidentRequestSchema = z.object({
  resolution_reason: z.string().trim().min(3, 'Resolution reason is required').max(500),
});

export type ResolveIncidentRequest = z.infer<typeof ResolveIncidentRequestSchema>;

export const RejectIncidentRequestSchema = z.object({
  rejection_reason: z.string().trim().min(3, 'Rejection reason is required').max(500),
});

export type RejectIncidentRequest = z.infer<typeof RejectIncidentRequestSchema>;

export const RetentionHoldRequestSchema = z.object({
  retention_hold: z.boolean(),
  reason: z.string().trim().min(5, 'Retention hold reason must be at least 5 characters').max(500),
});

export type RetentionHoldRequest = z.infer<typeof RetentionHoldRequestSchema>;

// G2.3: Safe Public-Summary Revision & Report Management Schemas
export const ReviseIncidentSummaryRequestSchema = z.object({
  safe_summary: z
    .string()
    .trim()
    .min(10, 'Safe summary must be at least 10 characters')
    .max(500, 'Safe summary cannot exceed 500 characters'),
  reason: z
    .string()
    .trim()
    .min(3, 'Administrative reason must be at least 3 characters')
    .max(500, 'Administrative reason cannot exceed 500 characters'),
  expected_version: z.number().int().min(1, 'Expected version must be a positive integer'),
});

export type ReviseIncidentSummaryRequest = z.infer<typeof ReviseIncidentSummaryRequestSchema>;

export const UnlinkReportRequestSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, 'Administrative reason must be at least 3 characters')
    .max(500, 'Administrative reason cannot exceed 500 characters'),
  expected_version: z.number().int().min(1, 'Expected version must be a positive integer'),
});

export type UnlinkReportRequest = z.infer<typeof UnlinkReportRequestSchema>;

export const MergeReportRequestSchema = z.object({
  report_id: z.string().uuid('Report ID must be a valid UUID'),
  reason: z
    .string()
    .trim()
    .min(3, 'Administrative reason must be at least 3 characters')
    .max(500, 'Administrative reason cannot exceed 500 characters'),
  expected_version: z.number().int().min(1, 'Expected target version must be a positive integer'),
  source_expected_version: z
    .number()
    .int()
    .min(1, 'Expected source version must be a positive integer'),
});

export type MergeReportRequest = z.infer<typeof MergeReportRequestSchema>;

export const OverrideIncidentCoordinatesRequestSchema = z.object({
  latitude: z
    .number()
    .min(-90, 'Latitude must be between -90 and 90')
    .max(90, 'Latitude must be between -90 and 90'),
  longitude: z
    .number()
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180'),
  reason: z
    .string()
    .trim()
    .min(3, 'Administrative reason must be at least 3 characters')
    .max(500, 'Administrative reason cannot exceed 500 characters'),
  expected_version: z.number().int().min(1, 'Expected version must be a positive integer'),
});

export type OverrideIncidentCoordinatesRequest = z.infer<
  typeof OverrideIncidentCoordinatesRequestSchema
>;
