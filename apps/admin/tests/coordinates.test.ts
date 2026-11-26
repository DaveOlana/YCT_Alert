import test from 'node:test';
import assert from 'node:assert/strict';
import { safeCoordinate, formatCoordinates } from '../src/utils/coordinates.js';

test('Coordinate Parsing & Defensive Formatting Suite', async (t) => {
  await t.test('Numeric coordinates are formatted with exact precision', () => {
    const lat = 6.519818;
    const lon = 3.374608;

    assert.equal(safeCoordinate(lat), 6.519818);
    assert.equal(safeCoordinate(lon), 3.374608);
    assert.equal(formatCoordinates(lat, lon), '6.519818, 3.374608');
    assert.equal(formatCoordinates(lat, lon, 4), '6.5198, 3.3746');
  });

  await t.test(
    'Numeric-string coordinates from PostgreSQL NUMERIC are safely parsed and formatted',
    () => {
      const strLat = '6.519818';
      const strLon = '3.374608';

      assert.equal(safeCoordinate(strLat), 6.519818);
      assert.equal(safeCoordinate(strLon), 3.374608);
      assert.equal(formatCoordinates(strLat, strLon), '6.519818, 3.374608');
    },
  );

  await t.test('Null or undefined coordinates return null without throwing', () => {
    assert.equal(safeCoordinate(null), null);
    assert.equal(safeCoordinate(undefined), null);

    assert.equal(formatCoordinates(null, null), null);
    assert.equal(formatCoordinates(undefined, undefined), null);
    assert.equal(formatCoordinates(6.519818, null), null);
    assert.equal(formatCoordinates(null, 3.374608), null);
    assert.equal(formatCoordinates(undefined, 3.374608), null);
  });

  await t.test('Missing coordinates are NEVER converted into zero', () => {
    assert.notEqual(safeCoordinate(null), 0);
    assert.notEqual(safeCoordinate(undefined), 0);
    assert.notEqual(safeCoordinate(''), 0);
    assert.equal(safeCoordinate(null), null);

    // Genuine 0 is preserved
    assert.equal(safeCoordinate(0), 0);
    assert.equal(safeCoordinate('0'), 0);
  });

  await t.test('Malformed or invalid coordinate values return null safely', () => {
    assert.equal(safeCoordinate('not-a-number'), null);
    assert.equal(safeCoordinate('   '), null);
    assert.equal(safeCoordinate(NaN), null);
    assert.equal(safeCoordinate(Infinity), null);
    assert.equal(safeCoordinate(-Infinity), null);
    assert.equal(safeCoordinate({}), null);
    assert.equal(safeCoordinate([]), null);

    assert.equal(formatCoordinates('invalid', 'malformed'), null);
    assert.equal(formatCoordinates(6.51, 'invalid'), null);
    assert.equal(formatCoordinates('invalid', 3.37), null);
  });
});
