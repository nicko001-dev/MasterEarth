/**
 * Localisation de l'utilisateur pour IntelliFlood World.
 *
 * Le consentement est explicite et mémorisé localement. La position reste dans
 * le navigateur : elle n'est envoyée ni au relais API, ni à un fournisseur IA.
 * Ce module est sans effet de bord au chargement pour rester testable.
 */

export const WORLD_LOCATION_CONSENT_KEY = 'intelliflood.world.location.v1';

/** Options communes aux deux vues : précision métrique, sans blocage long. */
export const WORLD_LOCATION_OPTIONS = Object.freeze({
  enableHighAccuracy: true,
  timeout: 20_000,
  maximumAge: 20_000,
});

export const WORLD_RECENTER_HEIGHT_M = 12_000;
export const WORLD_FIRST_VIEW_HEIGHT_M = 900_000;

/** Écarte NaN, Infinity et les valeurs hors du domaine géographique. */
export function isValidLatLon(lat, lon) {
  return (
    typeof lat === 'number'
    && typeof lon === 'number'
    && Number.isFinite(lat)
    && Number.isFinite(lon)
    && lat >= -90
    && lat <= 90
    && lon >= -180
    && lon <= 180
  );
}

/** Convertit un évènement `GeolocationPosition` en position sûre, ou null. */
export function normalizeLocationPosition(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const coords = raw.coords;
  if (!coords || typeof coords !== 'object') return null;
  const { latitude, longitude, accuracy } = coords;
  if (!isValidLatLon(latitude, longitude)) return null;
  const accuracyM = typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0
    ? accuracy
    : 0;
  const timestamp = raw.timestamp;
  return {
    lat: latitude,
    lon: longitude,
    accuracyM,
    timestamp: typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : Date.now(),
  };
}

/** Latitude lisible : `5,36° N` / `33,87° S`. */
export function formatLatitude(lat) {
  if (!Number.isFinite(lat)) return '—';
  const hemisphere = lat >= 0 ? 'N' : 'S';
  return `${Math.abs(lat).toFixed(2).replace('.', ',')}° ${hemisphere}`;
}

/** Longitude lisible (repère français) : `4,01° O` / `139,69° E`. */
export function formatLongitude(lon) {
  if (!Number.isFinite(lon)) return '—';
  const hemisphere = lon >= 0 ? 'E' : 'O';
  return `${Math.abs(lon).toFixed(2).replace('.', ',')}° ${hemisphere}`;
}

export function formatWorldCoordinates(lat, lon) {
  return `${formatLatitude(lat)} · ${formatLongitude(lon)}`;
}

/** Précision lisible : « ± 12 m », « ± 1,4 km ». */
export function formatWorldAccuracy(meters) {
  if (!Number.isFinite(meters) || meters <= 0) return 'précision inconnue';
  if (meters < 1_000) return `± ${Math.round(meters)} m`;
  return `± ${(meters / 1_000).toFixed(1).replace('.', ',')} km`;
}

/** Message utilisateur pour chaque code d'erreur `GeolocationPositionError`. */
export function describeWorldLocationError(error) {
  switch (error?.code) {
    case 1:
      return 'Localisation refusée. Activez-la dans les réglages du navigateur pour voir votre position.';
    case 2:
      return 'Position indisponible : le GPS ou le réseau n’a pas fourni de coordonnées.';
    case 3:
      return 'La localisation a expiré. Réessayez depuis le bouton « Ma position ».';
    default:
      return 'Impossible d’obtenir votre position pour le moment.';
  }
}

export function worldGeolocationSupported(nav = globalThis.navigator) {
  return Boolean(nav && 'geolocation' in nav && nav.geolocation);
}

/** Consentement mémorisé : `granted`, `denied`, ou null si aucun choix. */
export function readWorldLocationConsent(storage = safeStorage()) {
  try {
    const value = storage?.getItem(WORLD_LOCATION_CONSENT_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
}

export function writeWorldLocationConsent(value, storage = safeStorage()) {
  try {
    if (!storage) return;
    if (value === 'granted' || value === 'denied') {
      storage.setItem(WORLD_LOCATION_CONSENT_KEY, value);
    } else {
      storage.removeItem(WORLD_LOCATION_CONSENT_KEY);
    }
  } catch {
    // Stockage désactivé (navigation privée) : le choix reste valable pour la session.
  }
}

/**
 * État de l'autorisation navigateur, quand l'API Permissions est disponible.
 * Retourne `null` si elle ne peut pas répondre.
 */
export async function queryWorldLocationPermission(nav = globalThis.navigator) {
  try {
    if (!nav?.permissions?.query) return null;
    const status = await nav.permissions.query({ name: 'geolocation' });
    return status.state;
  } catch {
    return null;
  }
}

function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
