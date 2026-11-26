import type { CampusPlacesListResponse } from '@yctalert/contracts';
import { getApiBaseUrl } from './reportSubmissionService.js';

export interface FetchPlacesOptions {
  q?: string;
  category?: string;
  limit?: number;
  signal?: AbortSignal;
}

export class CampusPlacesServiceError extends Error {
  readonly code: 'UNAVAILABLE' | 'RATE_LIMITED' | 'NETWORK_ERROR' | 'UNKNOWN';
  readonly isUnavailable: boolean;

  constructor(
    message: string,
    code: 'UNAVAILABLE' | 'RATE_LIMITED' | 'NETWORK_ERROR' | 'UNKNOWN' = 'UNKNOWN',
  ) {
    super(message);
    this.name = 'CampusPlacesServiceError';
    this.code = code;
    this.isUnavailable = code === 'UNAVAILABLE';
  }
}

export async function fetchCampusPlaces(
  options?: FetchPlacesOptions,
): Promise<CampusPlacesListResponse> {
  const baseUrl = getApiBaseUrl();
  const url = new URL('/api/v1/places/', baseUrl);

  if (options?.q && options.q.trim().length > 0) {
    url.searchParams.set('q', options.q.trim());
  }
  if (options?.category && options.category.trim().length > 0) {
    url.searchParams.set('category', options.category.trim());
  }
  if (options?.limit && options.limit > 0) {
    url.searchParams.set('limit', String(options.limit));
  }

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: options?.signal,
    });

    if (res.status === 503) {
      throw new CampusPlacesServiceError(
        'Campus places catalogue is temporarily unavailable or initializing.',
        'UNAVAILABLE',
      );
    }

    if (res.status === 429) {
      throw new CampusPlacesServiceError(
        'Search rate limit exceeded. Please wait a moment before trying again.',
        'RATE_LIMITED',
      );
    }

    if (!res.ok) {
      throw new CampusPlacesServiceError(
        `Failed to fetch campus places: HTTP ${res.status}`,
        'UNKNOWN',
      );
    }

    const data: CampusPlacesListResponse = await res.json();
    return data;
  } catch (err: unknown) {
    if (err instanceof CampusPlacesServiceError) {
      throw err;
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new CampusPlacesServiceError(
      `Unable to load campus places: ${message}`,
      'NETWORK_ERROR',
    );
  }
}
