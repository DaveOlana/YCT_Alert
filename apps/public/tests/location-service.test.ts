import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  acquireDeviceLocation,
  acquireWebLocation,
  acquireNativeLocation,
  cancelDeviceLocationAcquisition,
  mapLocationError,
  LocationServiceError,
  _resetLocationAcquisitionState,
  _setNativeGeolocationProvider,
  type DeviceLocationResult,
} from '../src/services/locationService.js';

test('Bounded Location Acquisition & Safeguards Suite', async (t) => {
  let originalGeolocation: typeof navigator.geolocation;

  beforeEach(() => {
    _resetLocationAcquisitionState();
    originalGeolocation = globalThis.navigator?.geolocation;
  });

  afterEach(() => {
    _resetLocationAcquisitionState();
    if (globalThis.navigator) {
      Object.defineProperty(globalThis.navigator, 'geolocation', {
        value: originalGeolocation,
        configurable: true,
        writable: true,
      });
    }
  });

  await t.test('Successful initial location acquisition via single-shot fix', async () => {
    let watchCalled = false;
    const mockPos = {
      coords: {
        latitude: 6.51842,
        longitude: 3.37215,
        accuracy: 15,
      },
      timestamp: Date.now(),
    };

    const mockGeo = {
      getCurrentPosition: (success: (pos: typeof mockPos) => void) => {
        setTimeout(() => success(mockPos), 10);
      },
      watchPosition: () => {
        watchCalled = true;
        return 101;
      },
      clearWatch: () => {},
    };

    Object.defineProperty(globalThis.navigator, 'geolocation', {
      value: mockGeo,
      configurable: true,
      writable: true,
    });

    const res: DeviceLocationResult = await acquireWebLocation({
      initialTimeoutMs: 100,
      watchTimeoutMs: 200,
    });

    assert.equal(res.latitude, 6.51842);
    assert.equal(res.longitude, 3.37215);
    assert.equal(res.accuracy, 15);
    assert.ok(res.capturedAt);
    assert.equal(watchCalled, false, 'Watch should not be started when single-shot succeeds');
  });

  await t.test('Initial timeout followed by successful temporary watch acquisition', async () => {
    let watchStarted = false;
    let watchCleared = false;
    let clearWatchId: number | null = null;

    const mockPos = {
      coords: {
        latitude: 6.5199,
        longitude: 3.3745,
        accuracy: 25,
      },
      timestamp: Date.now(),
    };

    const mockGeo = {
      getCurrentPosition: (
        _success: unknown,
        error: (err: { code: number; message: string }) => void,
      ) => {
        // Simulate initial timeout
        setTimeout(() => error({ code: 3, message: 'Timeout expired' }), 10);
      },
      watchPosition: (success: (pos: typeof mockPos) => void) => {
        watchStarted = true;
        // Watch delivers position after short delay
        setTimeout(() => success(mockPos), 20);
        return 999;
      },
      clearWatch: (id: number) => {
        watchCleared = true;
        clearWatchId = id;
      },
    };

    Object.defineProperty(globalThis.navigator, 'geolocation', {
      value: mockGeo,
      configurable: true,
      writable: true,
    });

    const res = await acquireWebLocation({
      initialTimeoutMs: 50,
      watchTimeoutMs: 200,
    });

    assert.equal(watchStarted, true, 'Watch should be initiated after initial timeout');
    assert.equal(watchCleared, true, 'Watch should be cleared immediately after acquiring fix');
    assert.equal(clearWatchId, 999);
    assert.equal(res.latitude, 6.5199);
    assert.equal(res.longitude, 3.3745);
    assert.equal(res.accuracy, 25);
  });

  await t.test('Watch timeout: Cleans up watch and rejects with TIMEOUT error', async () => {
    let watchCleared = false;
    let clearWatchId: number | null = null;

    const mockGeo = {
      getCurrentPosition: (
        _success: unknown,
        error: (err: { code: number; message: string }) => void,
      ) => {
        setTimeout(() => error({ code: 3, message: 'Initial timeout' }), 10);
      },
      watchPosition: () => {
        // Does not return any position update
        return 777;
      },
      clearWatch: (id: number) => {
        watchCleared = true;
        clearWatchId = id;
      },
    };

    Object.defineProperty(globalThis.navigator, 'geolocation', {
      value: mockGeo,
      configurable: true,
      writable: true,
    });

    try {
      await acquireWebLocation({
        initialTimeoutMs: 20,
        watchTimeoutMs: 50,
      });
      assert.fail('Should have timed out');
    } catch (err) {
      assert.ok(err instanceof LocationServiceError);
      assert.equal((err as LocationServiceError).code, 'TIMEOUT');
      assert.equal(watchCleared, true, 'clearWatch must be called on watch timeout');
      assert.equal(clearWatchId, 777);
    }
  });

  await t.test('Permission denial: Terminal failure does not start watchPosition', async () => {
    let watchCalled = false;

    const mockGeo = {
      getCurrentPosition: (
        _success: unknown,
        error: (err: { code: number; message: string }) => void,
      ) => {
        setTimeout(() => error({ code: 1, message: 'User denied Geolocation' }), 10);
      },
      watchPosition: () => {
        watchCalled = true;
        return 123;
      },
      clearWatch: () => {},
    };

    Object.defineProperty(globalThis.navigator, 'geolocation', {
      value: mockGeo,
      configurable: true,
      writable: true,
    });

    try {
      await acquireWebLocation({
        initialTimeoutMs: 50,
        watchTimeoutMs: 100,
      });
      assert.fail('Should have thrown PERMISSION_DENIED');
    } catch (err) {
      assert.ok(err instanceof LocationServiceError);
      assert.equal((err as LocationServiceError).code, 'PERMISSION_DENIED');
      assert.equal(watchCalled, false, 'Watch must NOT be started when permission is denied');
    }
  });

  await t.test(
    'Position unavailable: Falls back to temporary watch and succeeds if signal is recovered',
    async () => {
      let watchStarted = false;
      const mockPos = {
        coords: {
          latitude: 6.52,
          longitude: 3.37,
          accuracy: 50,
        },
        timestamp: Date.now(),
      };

      const mockGeo = {
        getCurrentPosition: (
          _success: unknown,
          error: (err: { code: number; message: string }) => void,
        ) => {
          setTimeout(() => error({ code: 2, message: 'Position unavailable' }), 10);
        },
        watchPosition: (success: (pos: typeof mockPos) => void) => {
          watchStarted = true;
          setTimeout(() => success(mockPos), 20);
          return 555;
        },
        clearWatch: () => {},
      };

      Object.defineProperty(globalThis.navigator, 'geolocation', {
        value: mockGeo,
        configurable: true,
        writable: true,
      });

      const res = await acquireWebLocation({
        initialTimeoutMs: 30,
        watchTimeoutMs: 100,
      });

      assert.equal(watchStarted, true);
      assert.equal(res.latitude, 6.52);
    },
  );

  await t.test(
    'Accuracy above 100 metres is honestly accepted and preserved without rejection',
    async () => {
      const mockPos = {
        coords: {
          latitude: 6.518,
          longitude: 3.372,
          accuracy: 285, // Broad accuracy > 100m
        },
        timestamp: Date.now(),
      };

      const mockGeo = {
        getCurrentPosition: (success: (pos: typeof mockPos) => void) => {
          setTimeout(() => success(mockPos), 10);
        },
        watchPosition: () => 1,
        clearWatch: () => {},
      };

      Object.defineProperty(globalThis.navigator, 'geolocation', {
        value: mockGeo,
        configurable: true,
        writable: true,
      });

      const res = await acquireWebLocation({
        initialTimeoutMs: 100,
        watchTimeoutMs: 200,
      });

      assert.equal(res.accuracy, 285, 'Broad accuracy must be honestly preserved');
    },
  );

  await t.test(
    'Repeated taps: Prevents concurrent acquisition requests and reuses active promise',
    async () => {
      let currentPositionCalls = 0;
      const mockPos = {
        coords: { latitude: 6.518, longitude: 3.372, accuracy: 20 },
        timestamp: Date.now(),
      };

      const mockGeo = {
        getCurrentPosition: (success: (pos: typeof mockPos) => void) => {
          currentPositionCalls++;
          setTimeout(() => success(mockPos), 40);
        },
        watchPosition: () => 1,
        clearWatch: () => {},
      };

      Object.defineProperty(globalThis.navigator, 'geolocation', {
        value: mockGeo,
        configurable: true,
        writable: true,
      });

      // Simulate 3 rapid taps
      const p1 = acquireDeviceLocation({ initialTimeoutMs: 100 });
      const p2 = acquireDeviceLocation({ initialTimeoutMs: 100 });
      const p3 = acquireDeviceLocation({ initialTimeoutMs: 100 });

      assert.equal(p1, p2, 'Second tap must reuse active promise');
      assert.equal(p2, p3, 'Third tap must reuse active promise');

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
      assert.equal(r1.latitude, 6.518);
      assert.equal(r2.latitude, 6.518);
      assert.equal(r3.latitude, 6.518);
      assert.equal(currentPositionCalls, 1, 'Only one native call should be made');
    },
  );

  await t.test(
    'Cancellation / AbortSignal: Cleans up watch and aborts in-flight acquisition',
    async () => {
      let watchCleared = false;
      let clearWatchId: number | null = null;

      const mockGeo = {
        getCurrentPosition: (
          _success: unknown,
          error: (err: { code: number; message: string }) => void,
        ) => {
          setTimeout(() => error({ code: 3, message: 'Initial timeout' }), 10);
        },
        watchPosition: () => 888,
        clearWatch: (id: number) => {
          watchCleared = true;
          clearWatchId = id;
        },
      };

      Object.defineProperty(globalThis.navigator, 'geolocation', {
        value: mockGeo,
        configurable: true,
        writable: true,
      });

      const abortController = new AbortController();
      const acquisitionPromise = acquireDeviceLocation({
        signal: abortController.signal,
        initialTimeoutMs: 20,
        watchTimeoutMs: 500,
      });

      // Abort midway through watch
      setTimeout(() => {
        abortController.abort();
      }, 35);

      try {
        await acquisitionPromise;
        assert.fail('Should have aborted');
      } catch (err) {
        assert.ok(err instanceof LocationServiceError);
        assert.equal((err as LocationServiceError).code, 'ACQUISITION_CANCELLED');
        assert.equal(watchCleared, true, 'Watch must be cleared when aborted');
        assert.equal(clearWatchId, 888);
      }
    },
  );

  await t.test('cancelDeviceLocationAcquisition helper terminates active acquisition', async () => {
    const mockGeo = {
      getCurrentPosition: (
        _success: unknown,
        error: (err: { code: number; message: string }) => void,
      ) => {
        setTimeout(() => error({ code: 3, message: 'Initial timeout' }), 10);
      },
      watchPosition: () => 999,
      clearWatch: () => {},
    };

    Object.defineProperty(globalThis.navigator, 'geolocation', {
      value: mockGeo,
      configurable: true,
      writable: true,
    });

    const acquisitionPromise = acquireDeviceLocation({
      initialTimeoutMs: 20,
      watchTimeoutMs: 500,
    });

    setTimeout(() => {
      cancelDeviceLocationAcquisition('Explicit test cancellation');
    }, 30);

    try {
      await acquisitionPromise;
      assert.fail('Should have been cancelled');
    } catch (err) {
      assert.ok(err instanceof LocationServiceError);
      assert.equal((err as LocationServiceError).code, 'ACQUISITION_CANCELLED');
    }
  });

  await t.test(
    'Capacitor Native Plugin: Single-shot success and watch fallback verification',
    async () => {
      try {
        let nativeWatchCleared = false;
        const mockNativeProvider = {
          checkPermissions: async () => ({
            location: 'granted' as const,
            coarseLocation: 'granted' as const,
          }),
          requestPermissions: async () => ({
            location: 'granted' as const,
            coarseLocation: 'granted' as const,
          }),
          getCurrentPosition: async () => ({
            timestamp: Date.now(),
            coords: {
              latitude: 6.51888,
              longitude: 3.37222,
              accuracy: 12,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
          }),
          watchPosition: async () => 'native-watch-id-1',
          clearWatch: async (opts: { id: string }) => {
            if (opts.id === 'native-watch-id-1') {
              nativeWatchCleared = true;
            }
          },
        };

        _setNativeGeolocationProvider(mockNativeProvider);

        // 1. Single-shot success
        const nativeRes = await acquireNativeLocation({
          initialTimeoutMs: 100,
          watchTimeoutMs: 200,
        });
        assert.equal(nativeRes.latitude, 6.51888);

        // 2. Initial failure falls back to native watch
        mockNativeProvider.getCurrentPosition = async () => {
          throw { code: 3, message: 'Timeout' };
        };
        mockNativeProvider.watchPosition = async (_opts, callback) => {
          setTimeout(() => {
            callback(
              {
                timestamp: Date.now(),
                coords: {
                  latitude: 6.51999,
                  longitude: 3.37333,
                  accuracy: 18,
                  altitude: null,
                  altitudeAccuracy: null,
                  heading: null,
                  speed: null,
                },
              },
              undefined,
            );
          }, 20);
          return 'native-watch-id-1';
        };

        const watchRes = await acquireNativeLocation({
          initialTimeoutMs: 30,
          watchTimeoutMs: 200,
        });
        assert.equal(watchRes.latitude, 6.51999);
        assert.equal(nativeWatchCleared, true, 'Native clearWatch must be called on success');
      } finally {
        _setNativeGeolocationProvider(null);
      }
    },
  );

  await t.test('Capacitor Plugin error code mapping (Requirement 7)', () => {
    // Numeric codes
    assert.equal(mapLocationError({ code: 1 }).code, 'PERMISSION_DENIED');
    assert.equal(mapLocationError({ code: 2 }).code, 'POSITION_UNAVAILABLE');
    assert.equal(mapLocationError({ code: 3 }).code, 'TIMEOUT');

    // String codes
    assert.equal(mapLocationError({ code: 'PERMISSION_DENIED' }).code, 'PERMISSION_DENIED');
    assert.equal(
      mapLocationError({ code: 'LOCATION_PERMISSION_DENIED' }).code,
      'PERMISSION_DENIED',
    );
    assert.equal(mapLocationError({ code: 'SERVICES_DISABLED' }).code, 'SERVICES_DISABLED');
    assert.equal(
      mapLocationError({ code: 'LOCATION_SERVICES_DISABLED' }).code,
      'SERVICES_DISABLED',
    );
    assert.equal(mapLocationError({ code: 'TIMEOUT' }).code, 'TIMEOUT');
    assert.equal(mapLocationError({ code: 'POSITION_UNAVAILABLE' }).code, 'POSITION_UNAVAILABLE');

    // String messages
    assert.equal(
      mapLocationError(new Error('Location services are not enabled')).code,
      'SERVICES_DISABLED',
    );
    assert.equal(mapLocationError(new Error('User denied Geolocation')).code, 'PERMISSION_DENIED');
  });
});
