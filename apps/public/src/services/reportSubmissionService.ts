import type {
  CreateReportRequest,
  CreateReportResponse,
  ReceiptStatusResponse,
  LocationSource,
} from '@yctalert/contracts';
import type { ReportFormData } from '../types/reportForm.js';

export function getApiBaseUrl(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  return 'http://localhost:4000';
}

export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback UUIDv4 generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface SubmissionError {
  isNetworkUncertain?: boolean;
  code?: string;
  message: string;
  details?: unknown;
}

export function deriveLocationSource(
  loc: ReportFormData['incident_location'],
): LocationSource {
  // Priority 1: Device GPS provenance always maps to DEVICE_GPS, even if place is attached
  if (loc.coordinates_provenance === 'DEVICE_GPS') {
    return 'DEVICE_GPS';
  }
  // Priority 2: Map Place provenance maps to MAP_PLACE
  if (loc.coordinates_provenance === 'MAP_PLACE') {
    return 'MAP_PLACE';
  }
  // Priority 3: Manual coordinates provenance
  if (loc.coordinates_provenance === 'MANUAL_POINT') {
    return 'MANUAL_POINT';
  }
  // Priority 4: Selected place without coordinates
  if (loc.yct_map_place_id) {
    return 'MAP_PLACE';
  }
  // Priority 5: Text-only landmark description
  if (loc.landmark_description && loc.landmark_description.trim().length > 0) {
    return 'TEXT_ONLY';
  }
  // Priority 6: Default fallback
  return 'MANUAL_POINT';
}

export async function submitReport(
  formData: ReportFormData,
  idempotencyKey: string,
  timeoutMs: number = 65000,
): Promise<CreateReportResponse> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/v1/reports`;

  const payload: CreateReportRequest = {
    category_code: formData.category_code!,
    description: formData.description.trim(),
    incident_location: {
      latitude: formData.incident_location.latitude,
      longitude: formData.incident_location.longitude,
      source: deriveLocationSource(formData.incident_location),
      yct_map_place_id: formData.incident_location.yct_map_place_id,
      place_name_snapshot: formData.incident_location.place_name_snapshot,
      landmark_description: formData.incident_location.landmark_description.trim() || null,
    },
    website_url: formData.website_url || undefined,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);

    const body = await res.json();

    if (res.status === 202) {
      return body as CreateReportResponse;
    }

    if (res.status === 409) {
      const err: SubmissionError = {
        code: body.error?.code || 'CONFLICT',
        message:
          body.error?.message ||
          'Report submission conflict. The idempotency key may have expired or been reused.',
      };
      throw err;
    }

    if (res.status === 429) {
      const err: SubmissionError = {
        code: 'RATE_LIMIT_EXCEEDED',
        message:
          body.message ||
          'Rate limit exceeded. Please wait a few minutes before submitting another report.',
      };
      throw err;
    }

    const err: SubmissionError = {
      code: body.error?.code || 'SUBMISSION_FAILED',
      message: body.error?.message || `Server responded with status ${res.status}.`,
      details: body.error?.details,
    };
    throw err;
  } catch (error: unknown) {
    clearTimeout(timer);
    const errObj = error as { name?: string; message?: string } | undefined;
    if (errObj?.name === 'AbortError' || errObj?.name === 'TypeError') {
      const uncertainErr: SubmissionError = {
        isNetworkUncertain: true,
        code: 'NETWORK_UNCERTAIN',
        message:
          'Network connection was interrupted before a confirmation was received. Your report may or may not have reached the server.',
      };
      throw uncertainErr;
    }
    throw error;
  }
}

export async function fetchReceiptStatus(
  receiptId: string,
  receiptToken: string,
  timeoutMs: number = 30000,
): Promise<ReceiptStatusResponse> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/v1/reports/receipts/${receiptId}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${receiptToken}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timer);
    const body = await res.json();

    if (!res.ok) {
      const err: SubmissionError = {
        code: body.error?.code || 'LOOKUP_FAILED',
        message: body.error?.message || `Status check failed with status ${res.status}.`,
      };
      throw err;
    }

    return body as ReceiptStatusResponse;
  } catch (error: unknown) {
    clearTimeout(timer);
    const errObj = error as { code?: string } | undefined;
    if (errObj?.code) throw error;
    throw {
      code: 'NETWORK_ERROR',
      message: 'Unable to connect to the safety server to check receipt status.',
    };
  }
}
