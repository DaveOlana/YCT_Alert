import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchCampusPlaces,
  CampusPlacesServiceError,
} from '../src/services/campusPlacesService.js';
import { getMatchedAlias } from '../src/components/report/PlaceSearchModal.js';
import type { CampusPlace, CampusPlacesListResponse } from '@yctalert/contracts';

const MOCK_PLACE: CampusPlace = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Central Library Complex',
  category_slug: 'academic',
  category_name: 'Academic Facilities',
  coordinates: { latitude: 6.5186, longitude: 3.3729 },
  primary_entrance: null,
  verification_state: 'VERIFIED',
  aliases: ['Lib', 'Book Hall'],
  is_active: true,
};

test('Campus Places Service Suite (G3.2B)', async (t) => {
  const originalFetch = globalThis.fetch;

  t.afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  await t.test('1. fetchCampusPlaces sends correct query params and returns parsed response', async () => {
    let requestedUrl: string = '';

    globalThis.fetch = (async (url: string | URL | Request) => {
      requestedUrl = url.toString();
      const mockResponse: CampusPlacesListResponse = {
        places: [MOCK_PLACE],
        total: 1,
        snapshot_age_seconds: 15,
        sync_status: 'HEALTHY',
      };
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const result = await fetchCampusPlaces({
      q: 'library',
      category: 'academic',
      limit: 25,
    });

    assert.ok(requestedUrl.includes('/api/v1/places/'));
    assert.ok(requestedUrl.includes('q=library'));
    assert.ok(requestedUrl.includes('category=academic'));
    assert.ok(requestedUrl.includes('limit=25'));
    assert.equal(result.total, 1);
    assert.equal(result.places[0].name, 'Central Library Complex');
  });

  await t.test('2. fetchCampusPlaces handles HTTP 503 by throwing UNAVAILABLE error', async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: 'GEOGRAPHY_UNAVAILABLE',
            message: 'Catalogue uninitialized',
          },
        }),
        { status: 503 },
      );
    }) as typeof fetch;

    await assert.rejects(
      async () => {
        await fetchCampusPlaces({ q: 'hall' });
      },
      (err: unknown) => {
        assert.ok(err instanceof CampusPlacesServiceError);
        assert.equal(err.code, 'UNAVAILABLE');
        assert.equal(err.isUnavailable, true);
        return true;
      },
    );
  });

  await t.test('3. fetchCampusPlaces handles HTTP 429 by throwing RATE_LIMITED error', async () => {
    globalThis.fetch = (async () => {
      return new Response('Rate limit exceeded', { status: 429 });
    }) as typeof fetch;

    await assert.rejects(
      async () => {
        await fetchCampusPlaces();
      },
      (err: unknown) => {
        assert.ok(err instanceof CampusPlacesServiceError);
        assert.equal(err.code, 'RATE_LIMITED');
        return true;
      },
    );
  });

  await t.test('4. fetchCampusPlaces handles network failure by throwing NETWORK_ERROR', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;

    await assert.rejects(
      async () => {
        await fetchCampusPlaces();
      },
      (err: unknown) => {
        assert.ok(err instanceof CampusPlacesServiceError);
        assert.equal(err.code, 'NETWORK_ERROR');
        return true;
      },
    );
  });

  await t.test('5. fetchCampusPlaces propagates AbortError cleanly', async () => {
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
      async () => {
        await fetchCampusPlaces({ signal: controller.signal });
      },
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.name, 'AbortError');
        return true;
      },
    );
  });

  await t.test('6. getMatchedAlias: Suppresses alias tag if official name matches query', () => {
    // Official name contains "library", alias is "Lib"
    const match = getMatchedAlias(MOCK_PLACE, 'lib');
    // Because place.name "Central Library Complex" includes "lib", alias tag must NOT be displayed
    assert.equal(match, null);
  });

  await t.test('7. getMatchedAlias: Displays matched alias when official name does NOT match', () => {
    // Query is "book" -> place.name does NOT contain "book", but alias "Book Hall" does
    const match = getMatchedAlias(MOCK_PLACE, 'book');
    assert.equal(match, 'Book Hall');
  });

  await t.test('8. getMatchedAlias: Returns null when neither name nor aliases match', () => {
    const match = getMatchedAlias(MOCK_PLACE, 'engineering');
    assert.equal(match, null);
  });
});
