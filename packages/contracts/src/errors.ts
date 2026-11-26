import { z } from 'zod';

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'IDEMPOTENCY_KEY_REUSED',
  'VERSION_CONFLICT',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const ErrorDetailSchema = z.object({
  field: z.string().optional(),
  message: z.string(),
});

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    request_id: z.string(),
    details: z.array(ErrorDetailSchema).optional(),
  }),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;
