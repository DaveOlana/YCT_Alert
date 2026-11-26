import { Capacitor } from '@capacitor/core';
import { Geolocation, type Position } from '@capacitor/geolocation';

export interface GeolocationProvider {
  checkPermissions: typeof Geolocation.checkPermissions;
  requestPermissions: typeof Geolocation.requestPermissions;
  getCurrentPosition: typeof Geolocation.getCurrentPosition;
  watchPosition: typeof Geolocation.watchPosition;
  clearWatch: typeof Geolocation.clearWatch;
}

let nativeGeolocationProvider: GeolocationProvider = Geolocation;

export function _setNativeGeolocationProvider(provider: GeolocationProvider | null): void {
  nativeGeolocationProvider = provider ?? Geolocation;
}

export interface DeviceLocationResult {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
}

export type LocationErrorCode =
  | 'PERMISSION_DENIED'
  | 'POSITION_UNAVAILABLE'
  | 'TIMEOUT'
  | 'SERVICES_DISABLED'
  | 'NOT_SUPPORTED'
  | 'ACQUISITION_CANCELLED';

export class LocationServiceError extends Error {
  constructor(
    public readonly code: LocationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LocationServiceError';
  }
}

export interface AcquireLocationOptions {
  signal?: AbortSignal;
  initialTimeoutMs?: number;
  watchTimeoutMs?: number;
}

export const DEFAULT_INITIAL_TIMEOUT_MS = 5000;
export const DEFAULT_WATCH_TIMEOUT_MS = 22000;

/**
 * Maps native and web Geolocation error objects and codes to LocationServiceError.
 * Inspects numeric and string error codes before falling back to message parsing.
 */
export function mapLocationError(err: unknown): LocationServiceError {
  if (err instanceof LocationServiceError) {
    return err;
  }

  const errObj = (typeof err === 'object' && err !== null ? err : {}) as {
    code?: number | string;
    message?: string;
  };

  const code = errObj.code;
  const msg = typeof errObj.message === 'string' ? errObj.message : String(err ?? '');
  const lowerMsg = msg.toLowerCase();

  // 1. Inspect error code values first
  if (
    code === 1 ||
    code === '1' ||
    code === 'PERMISSION_DENIED' ||
    code === 'LOCATION_PERMISSION_DENIED'
  ) {
    return new LocationServiceError(
      'PERMISSION_DENIED',
      'Location permission was denied. You can provide a landmark description instead.',
    );
  }

  if (
    code === 'SERVICES_DISABLED' ||
    code === 'LOCATION_SERVICES_DISABLED' ||
    code === 'GPS_DISABLED'
  ) {
    return new LocationServiceError(
      'SERVICES_DISABLED',
      'Location services appear to be disabled on this device. You can provide a landmark description instead.',
    );
  }

  if (code === 3 || code === '3' || code === 'TIMEOUT') {
    return new LocationServiceError(
      'TIMEOUT',
      'Device location request timed out. Please enter a landmark description or select a campus location.',
    );
  }

  if (code === 2 || code === '2' || code === 'POSITION_UNAVAILABLE' || code === 'UNAVAILABLE') {
    return new LocationServiceError(
      'POSITION_UNAVAILABLE',
      'Could not obtain location signal. Please provide a landmark description instead.',
    );
  }

  // 2. Fallback to message text patterns
  if (lowerMsg.includes('denied') || lowerMsg.includes('permission')) {
    return new LocationServiceError(
      'PERMISSION_DENIED',
      'Location permission was denied. You can provide a landmark description instead.',
    );
  }

  if (
    lowerMsg.includes('disabled') ||
    lowerMsg.includes('provider') ||
    lowerMsg.includes('service') ||
    lowerMsg.includes('location services are not enabled')
  ) {
    return new LocationServiceError(
      'SERVICES_DISABLED',
      'Location services appear to be disabled on this device. You can provide a landmark description instead.',
    );
  }

  if (lowerMsg.includes('timeout') || lowerMsg.includes('timed out')) {
    return new LocationServiceError(
      'TIMEOUT',
      'Device location request timed out. Please enter a landmark description or select a campus location.',
    );
  }

  if (lowerMsg.includes('abort') || lowerMsg.includes('cancel')) {
    return new LocationServiceError('ACQUISITION_CANCELLED', 'Location acquisition was cancelled.');
  }

  return new LocationServiceError(
    'POSITION_UNAVAILABLE',
    'Could not obtain location signal. Please provide a landmark description instead.',
  );
}

export function formatPosition(pos: Position | GeolocationPosition): DeviceLocationResult {
  return {
    latitude: Number(pos.coords.latitude.toFixed(6)),
    longitude: Number(pos.coords.longitude.toFixed(6)),
    accuracy: Math.round(pos.coords.accuracy),
    capturedAt: new Date(pos.timestamp).toISOString(),
  };
}

interface ActiveAcquisitionState {
  promise: Promise<DeviceLocationResult>;
  abortController: AbortController;
}

let activeAcquisition: ActiveAcquisitionState | null = null;

/**
 * Resets internal acquisition state (primarily for test harness isolation).
 */
export function _resetLocationAcquisitionState(): void {
  activeAcquisition = null;
  nativeGeolocationProvider = Geolocation;
}

/**
 * Explicitly cancels any currently in-flight device location acquisition.
 */
export function cancelDeviceLocationAcquisition(
  reason = 'Location acquisition was cancelled.',
): void {
  if (activeAcquisition) {
    activeAcquisition.abortController.abort(
      new LocationServiceError('ACQUISITION_CANCELLED', reason),
    );
  }
}

/**
 * Bounded location acquisition on Capacitor Native platform.
 * 1. Checks permissions.
 * 2. Attempts single-shot getCurrentPosition (allowing recent cache).
 * 3. Falls back to temporary watchPosition bounded to ~20-25 seconds.
 * 4. Ensures watch is cleared on success, timeout, cancellation or terminal error.
 */
export async function acquireNativeLocation(
  options: AcquireLocationOptions,
): Promise<DeviceLocationResult> {
  const permStatus = await nativeGeolocationProvider.checkPermissions();
  if (permStatus.location !== 'granted' && permStatus.coarseLocation !== 'granted') {
    const req = await nativeGeolocationProvider.requestPermissions({
      permissions: ['location', 'coarseLocation'],
    });
    if (req.location !== 'granted' && req.coarseLocation !== 'granted') {
      throw new LocationServiceError(
        'PERMISSION_DENIED',
        'Location permission was denied. You can provide a landmark description instead.',
      );
    }
  }

  if (options.signal?.aborted) {
    throw new LocationServiceError('ACQUISITION_CANCELLED', 'Location acquisition was cancelled.');
  }

  const initialTimeout = options.initialTimeoutMs ?? DEFAULT_INITIAL_TIMEOUT_MS;
  const watchTimeout = options.watchTimeoutMs ?? DEFAULT_WATCH_TIMEOUT_MS;

  // Step 1: Attempt a recent location fix
  try {
    const pos = await nativeGeolocationProvider.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: initialTimeout,
      maximumAge: 30000,
    });
    return formatPosition(pos);
  } catch (err) {
    const mapped = mapLocationError(err);
    if (mapped.code === 'PERMISSION_DENIED' || mapped.code === 'SERVICES_DISABLED') {
      throw mapped;
    }
    // Eligible for temporary bounded watch fallback
  }

  if (options.signal?.aborted) {
    throw new LocationServiceError('ACQUISITION_CANCELLED', 'Location acquisition was cancelled.');
  }

  // Step 2: Temporary watchPosition bounded to approximately 20-25 seconds
  return new Promise<DeviceLocationResult>((resolve, reject) => {
    let watchId: string | null = null;
    let timer: NodeJS.Timeout | null = null;
    let isSettled = false;

    const cleanup = async () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (watchId !== null) {
        const idToClear = watchId;
        watchId = null;
        try {
          await nativeGeolocationProvider.clearWatch({ id: idToClear });
        } catch {
          // Ignore clearWatch error
        }
      }
    };

    const handleAbort = async () => {
      if (isSettled) return;
      isSettled = true;
      await cleanup();
      reject(
        new LocationServiceError('ACQUISITION_CANCELLED', 'Location acquisition was cancelled.'),
      );
    };

    if (options.signal) {
      if (options.signal.aborted) {
        handleAbort();
        return;
      }
      options.signal.addEventListener('abort', handleAbort, { once: true });
    }

    timer = setTimeout(async () => {
      if (isSettled) return;
      isSettled = true;
      await cleanup();
      reject(
        new LocationServiceError(
          'TIMEOUT',
          'Device location request timed out. Please enter a landmark description or select a campus location.',
        ),
      );
    }, watchTimeout);

    nativeGeolocationProvider
      .watchPosition(
        {
          enableHighAccuracy: true,
          timeout: watchTimeout,
          maximumAge: 0,
        },
        async (pos, err) => {
          if (isSettled) return;

          if (err) {
            const mapped = mapLocationError(err);
            if (mapped.code === 'PERMISSION_DENIED' || mapped.code === 'SERVICES_DISABLED') {
              isSettled = true;
              await cleanup();
              reject(mapped);
            }
            return;
          }

          if (
            pos &&
            pos.coords &&
            typeof pos.coords.latitude === 'number' &&
            typeof pos.coords.longitude === 'number'
          ) {
            isSettled = true;
            await cleanup();
            resolve(formatPosition(pos));
          }
        },
      )
      .then((id) => {
        if (isSettled) {
          nativeGeolocationProvider.clearWatch({ id }).catch(() => {});
        } else {
          watchId = id;
        }
      })
      .catch(async (watchErr) => {
        if (isSettled) return;
        isSettled = true;
        await cleanup();
        reject(mapLocationError(watchErr));
      });
  });
}

/**
 * Bounded location acquisition on standard Web Browser platform.
 */
export async function acquireWebLocation(
  options: AcquireLocationOptions,
): Promise<DeviceLocationResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new LocationServiceError(
      'NOT_SUPPORTED',
      'Geolocation is not supported by your browser. Please provide a landmark description instead.',
    );
  }

  if (options.signal?.aborted) {
    throw new LocationServiceError('ACQUISITION_CANCELLED', 'Location acquisition was cancelled.');
  }

  const initialTimeout = options.initialTimeoutMs ?? DEFAULT_INITIAL_TIMEOUT_MS;
  const watchTimeout = options.watchTimeoutMs ?? DEFAULT_WATCH_TIMEOUT_MS;

  // Step 1: Attempt recent location fix
  const singleShotResult = await new Promise<DeviceLocationResult | null>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(formatPosition(pos)),
      (err) => {
        const mapped = mapLocationError(err);
        if (mapped.code === 'PERMISSION_DENIED' || mapped.code === 'SERVICES_DISABLED') {
          reject(mapped);
        } else {
          resolve(null);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: initialTimeout,
        maximumAge: 30000,
      },
    );
  });

  if (singleShotResult) {
    return singleShotResult;
  }

  if (options.signal?.aborted) {
    throw new LocationServiceError('ACQUISITION_CANCELLED', 'Location acquisition was cancelled.');
  }

  // Step 2: Temporary watchPosition bounded to approximately 20-25 seconds
  return new Promise<DeviceLocationResult>((resolve, reject) => {
    let watchId: number | null = null;
    let timer: NodeJS.Timeout | null = null;
    let isSettled = false;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
    };

    const handleAbort = () => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      reject(
        new LocationServiceError('ACQUISITION_CANCELLED', 'Location acquisition was cancelled.'),
      );
    };

    if (options.signal) {
      if (options.signal.aborted) {
        handleAbort();
        return;
      }
      options.signal.addEventListener('abort', handleAbort, { once: true });
    }

    timer = setTimeout(() => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      reject(
        new LocationServiceError(
          'TIMEOUT',
          'Location request timed out. Please enter a landmark description or select a campus location.',
        ),
      );
    }, watchTimeout);

    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (isSettled) return;
          if (
            pos &&
            pos.coords &&
            typeof pos.coords.latitude === 'number' &&
            typeof pos.coords.longitude === 'number'
          ) {
            isSettled = true;
            cleanup();
            resolve(formatPosition(pos));
          }
        },
        (err) => {
          if (isSettled) return;
          const mapped = mapLocationError(err);
          if (mapped.code === 'PERMISSION_DENIED' || mapped.code === 'SERVICES_DISABLED') {
            isSettled = true;
            cleanup();
            reject(mapped);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: watchTimeout,
          maximumAge: 0,
        },
      );
    } catch (e) {
      if (!isSettled) {
        isSettled = true;
        cleanup();
        reject(mapLocationError(e));
      }
    }
  });
}

/**
 * Acquire device coordinates on explicit user interaction.
 * Never performs background polling or continuous tracking.
 * Concurrency-safe: returns active in-flight promise if tapped repeatedly.
 */
export function acquireDeviceLocation(
  options: AcquireLocationOptions = {},
): Promise<DeviceLocationResult> {
  // Prevent duplicate concurrent watches and watch leaks
  if (activeAcquisition) {
    if (options.signal) {
      options.signal.addEventListener(
        'abort',
        () => {
          cancelDeviceLocationAcquisition();
        },
        { once: true },
      );
    }
    return activeAcquisition.promise;
  }

  const internalController = new AbortController();

  if (options.signal) {
    if (options.signal.aborted) {
      internalController.abort();
    } else {
      options.signal.addEventListener('abort', () => internalController.abort(), { once: true });
    }
  }

  const mergedOptions: AcquireLocationOptions = {
    ...options,
    signal: internalController.signal,
  };

  const promise = (async () => {
    try {
      const isNative = Capacitor.isNativePlatform();
      if (isNative) {
        return await acquireNativeLocation(mergedOptions);
      } else {
        return await acquireWebLocation(mergedOptions);
      }
    } finally {
      activeAcquisition = null;
    }
  })();

  activeAcquisition = {
    promise,
    abortController: internalController,
  };

  return promise;
}
