import { z } from 'zod';
import { IncidentCategorySchema } from './taxonomy.js';

export const LOCATION_SOURCES = ['MANUAL_POINT', 'MAP_PLACE', 'DEVICE_GPS', 'TEXT_ONLY'] as const;

export type LocationSource = (typeof LOCATION_SOURCES)[number];
export const LocationSourceSchema = z.enum(LOCATION_SOURCES);

export const IncidentLocationInputSchema = z
  .object({
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    source: LocationSourceSchema.default('MANUAL_POINT'),
    yct_map_place_id: z.string().uuid().nullable().optional(),
    place_name_snapshot: z.string().max(160).nullable().optional(),
    landmark_description: z.string().max(300).nullable().optional(),
  })
  .refine(
    (loc) => {
      // Must provide either valid coordinates OR a textual landmark description
      const hasCoords = typeof loc.latitude === 'number' && typeof loc.longitude === 'number';
      const hasText = !!loc.landmark_description && loc.landmark_description.trim().length > 0;
      const hasPlace = !!loc.yct_map_place_id;
      return hasCoords || hasText || hasPlace;
    },
    {
      message:
        'You must provide either map coordinates, a campus landmark description, or select a campus location.',
      path: ['landmark_description'],
    },
  );

export type IncidentLocationInput = z.infer<typeof IncidentLocationInputSchema>;

export const CreateReportRequestSchema = z.object({
  category_code: IncidentCategorySchema,
  description: z
    .string()
    .trim()
    .min(5, 'Description must be at least 5 characters')
    .max(1000, 'Description cannot exceed 1000 characters'),
  incident_location: IncidentLocationInputSchema,
  website_url: z.string().max(0, 'Honeypot filled').optional(), // Honeypot field: must be empty
});

export type CreateReportRequest = z.infer<typeof CreateReportRequestSchema>;

export const CreateReportResponseSchema = z.object({
  receipt_id: z.string(),
  receipt_token: z.string(), // One-time CSPRNG bearer token
  reference_number: z.string().optional(),
  delivery_status: z.literal('RECEIVED'),
  received_at: z.string().datetime(),
  message: z.string(),
});

export type CreateReportResponse = z.infer<typeof CreateReportResponseSchema>;

export const REPORT_LIFECYCLE_STATUSES = [
  'RECEIVED',
  'UNDER_REVIEW',
  'PUBLISHED',
  'RESOLVED',
  'REJECTED',
] as const;

export type ReportLifecycleStatus = (typeof REPORT_LIFECYCLE_STATUSES)[number];
export const ReportLifecycleStatusSchema = z.enum(REPORT_LIFECYCLE_STATUSES);

export const ReceiptStatusResponseSchema = z.object({
  receipt_id: z.string(),
  delivery_status: ReportLifecycleStatusSchema,
  category: IncidentCategorySchema,
  received_at: z.string().datetime(),
  public_advisory_id: z.string().nullable(),
  status_message: z.string().optional(),
});

export type ReceiptStatusResponse = z.infer<typeof ReceiptStatusResponseSchema>;
