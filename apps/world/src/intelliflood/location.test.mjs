import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WORLD_LOCATION_CONSENT_KEY,
  WORLD_LOCATION_OPTIONS,
  WORLD_RECENTER_HEIGHT_M,
  describeWorldLocationError,
  formatWorldAccuracy,
  formatWorldCoordinates,
  isValidLatLon,
  normalizeLocationPosition,
  queryWorldLocationPermission,
  readWorldLocationConsent,
  worldGeolocationSupported,
  writeWorldLocationConsent,
} from './location.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test('isValidLatLon accepts the geographic domain and rejects unsafe values', () => {
  assert.equal(isValidLatLon(0, 0), true);
  assert.equal(isValidLatLon(90, 180), true);
  assert.equal(isValidLatLon(-90, -180), true);
  assert.equal(isValidLatLon(90.1, 0), false);
  assert.equal(isValidLatLon(0, 180.1), false);
  assert.equal(isValidLatLon(Number.NaN, 0), false);
  assert.equal(isValidLatLon(0, Number.POSITIVE_INFINITY), false);
  assert.equal(isValidLatLon('5', '0'), false);
  assert.equal(isValidLatLon(undefined, undefined), false);
});

test('normalizeLocationPosition keeps only validated coordinates', () => {
  const position = normalizeLocationPosition({
    coords: { latitude: 5.36, longitude: -4.01, accuracy: 12 },
    timestamp: 1_700_000_000_000,
  });
  assert.deepEqual(position, {
    lat: 5.36,
    lon: -4.01,
    accuracyM: 12,
    timestamp: 1_700_000_000_000,
  });
});

test('normalizeLocationPosition rejects malformed events and defaults accuracy', () => {
  assert.equal(normalizeLocationPosition(null), null);
  assert.equal(normalizeLocationPosition({}), null);
  assert.equal(normalizeLocationPosition({ coords: {} }), null);
  assert.equal(normalizeLocationPosition({ coords: { latitude: 200, longitude: 0 } }), null);
  const fallback = normalizeLocationPosition({ coords: { latitude: 5, longitude: 4, accuracy: -3 } });
  assert.equal(fallback?.accuracyM, 0);
  assert.equal(typeof fallback?.timestamp, 'number');
});

test('consent is stored, read and cleared with a dedicated key', () => {
  const storage = memoryStorage();
  assert.equal(readWorldLocationConsent(storage), null);
  writeWorldLocationConsent('granted', storage);
  assert.equal(storage.getItem(WORLD_LOCATION_CONSENT_KEY), 'granted');
  assert.equal(readWorldLocationConsent(storage), 'granted');
  writeWorldLocationConsent('denied', storage);
  assert.equal(readWorldLocationConsent(storage), 'denied');
  writeWorldLocationConsent(null, storage);
  assert.equal(readWorldLocationConsent(storage), null);
});

test('an unknown stored value is ignored', () => {
  const storage = memoryStorage({ [WORLD_LOCATION_CONSENT_KEY]: 'maybe' });
  assert.equal(readWorldLocationConsent(storage), null);
});

test('storage failures degrade to no stored consent', () => {
  const broken = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  assert.equal(readWorldLocationConsent(broken), null);
  assert.doesNotThrow(() => writeWorldLocationConsent('granted', broken));
  assert.doesNotThrow(() => writeWorldLocationConsent(null, null));
});

test('geolocation support follows navigator.geolocation', () => {
  assert.equal(worldGeolocationSupported({ geolocation: {} }), true);
  assert.equal(worldGeolocationSupported({}), false);
  assert.equal(worldGeolocationSupported(null), false);
});

test('permission query returns null when the API is unavailable or fails', async () => {
  assert.equal(await queryWorldLocationPermission({}), null);
  const failing = { permissions: { query: async () => { throw new Error('unsupported'); } } };
  assert.equal(await queryWorldLocationPermission(failing), null);
  const granted = { permissions: { query: async () => ({ state: 'granted' }) } };
  assert.equal(await queryWorldLocationPermission(granted), 'granted');
});

test('user-facing error messages cover every geolocation code', () => {
  assert.match(describeWorldLocationError({ code: 1 }), /refusée/);
  assert.match(describeWorldLocationError({ code: 2 }), /indisponible/);
  assert.match(describeWorldLocationError({ code: 3 }), /expiré/);
  assert.match(describeWorldLocationError({}), /Impossible/);
});

test('coordinates and accuracy are formatted for the French interface', () => {
  assert.equal(formatWorldCoordinates(5.36, -4.01), '5,36° N · 4,01° O');
  assert.equal(formatWorldCoordinates(-33.87, 151.21), '33,87° S · 151,21° E');
  assert.equal(formatWorldAccuracy(12), '± 12 m');
  assert.equal(formatWorldAccuracy(1_400), '± 1,4 km');
  assert.equal(formatWorldAccuracy(0), 'précision inconnue');
});

test('recenter options stay bounded', () => {
  assert.equal(WORLD_RECENTER_HEIGHT_M, 12_000);
  assert.equal(WORLD_LOCATION_OPTIONS.enableHighAccuracy, true);
  assert.ok(WORLD_LOCATION_OPTIONS.timeout > 0);
});
