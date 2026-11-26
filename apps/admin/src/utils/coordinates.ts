/**
 * Safely parses an unknown coordinate value into a valid finite number or null.
 * Never converts null, undefined, empty, or invalid input into zero.
 */
export function safeCoordinate(val: unknown): number | null {
  if (val === null || val === undefined) {
    return null;
  }
  if (typeof val === 'number') {
    return isFinite(val) ? val : null;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '') return null;
    const num = Number(trimmed);
    return isFinite(num) ? num : null;
  }
  return null;
}

/**
 * Formats latitude and longitude coordinates safely for presentation.
 * Returns formatted string like "6.519818, 3.374608" or null if either coordinate is absent or invalid.
 * Safe against numbers, numeric strings, null, undefined, NaN, and malformed values.
 */
export function formatCoordinates(lat: unknown, lon: unknown, precision = 6): string | null {
  const parsedLat = safeCoordinate(lat);
  const parsedLon = safeCoordinate(lon);

  if (parsedLat === null || parsedLon === null) {
    return null;
  }

  return `${parsedLat.toFixed(precision)}, ${parsedLon.toFixed(precision)}`;
}
