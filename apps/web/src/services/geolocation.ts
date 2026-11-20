/**
 * Localisation de l'utilisateur — consentement, stockage local, calculs et
 * formatage.
 *
 * Module volontairement sans effet de bord au chargement : la position est
 * utilisée par la carte 2D (Leaflet) comme par le globe 3D (Cesium), et reste
 * exclusivement dans le navigateur. Aucune coordonnée de l'utilisateur n'est
 * envoyée à l'API ni à un fournisseur IA.
 */

export type UserPosition = {
  lat: number;
  lon: number;
  accuracyM: number;
  timestamp: number;
};

export type StoredConsent = "granted" | "denied";

export type GeolocationStatus =
  | "unsupported"
  | "idle"
  | "asking"
  | "locating"
  | "ready"
  | "denied"
  | "error";

export const GEOLOCATION_STORAGE_KEY = "intelliflood.geolocation.v1";

/** Écarte NaN, Infinity et les valeurs hors du domaine géographique. */
export function isValidLatLon(lat: unknown, lon: unknown): boolean {
  return (
    typeof lat === "number"
    && typeof lon === "number"
    && Number.isFinite(lat)
    && Number.isFinite(lon)
    && lat >= -90
    && lat <= 90
    && lon >= -180
    && lon <= 180
  );
}

/** Convertit un évènement `GeolocationPosition` en position sûre, ou null. */
export function normalizePosition(raw: unknown): UserPosition | null {
  if (!raw || typeof raw !== "object") return null;
  const coords = (raw as { coords?: unknown }).coords;
  if (!coords || typeof coords !== "object") return null;
  const { latitude, longitude, accuracy } = coords as {
    latitude?: unknown;
    longitude?: unknown;
    accuracy?: unknown;
  };
  if (!isValidLatLon(latitude, longitude)) return null;
  const accuracyM = typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy >= 0
    ? accuracy
    : 0;
  const timestamp = (raw as { timestamp?: unknown }).timestamp;
  return {
    lat: latitude as number,
    lon: longitude as number,
    accuracyM,
    timestamp: typeof timestamp === "number" && Number.isFinite(timestamp) ? timestamp : Date.now(),
  };
}

const EARTH_RADIUS_M = 6_371_008.8;

/** Distance orthodromique en mètres (formule de haversine). */
export function distanceMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Latitude lisible : `5,36° N` / `33,87° S`. */
export function formatLatitude(lat: number): string {
  if (!Number.isFinite(lat)) return "—";
  const hemisphere = lat >= 0 ? "N" : "S";
  return `${Math.abs(lat).toFixed(2).replace(".", ",")}° ${hemisphere}`;
}

/** Longitude lisible (repère français) : `4,01° O` / `139,69° E`. */
export function formatLongitude(lon: number): string {
  if (!Number.isFinite(lon)) return "—";
  const hemisphere = lon >= 0 ? "E" : "O";
  return `${Math.abs(lon).toFixed(2).replace(".", ",")}° ${hemisphere}`;
}

export function formatCoordinates(lat: number, lon: number): string {
  return `${formatLatitude(lat)} · ${formatLongitude(lon)}`;
}

/** Précision lisible : « ± 12 m », « ± 1,4 km ». */
export function formatAccuracy(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return "précision inconnue";
  if (meters < 1_000) return `± ${Math.round(meters)} m`;
  return `± ${(meters / 1_000).toFixed(1).replace(".", ",")} km`;
}

/** Distance lisible : « 850 m », « 12,4 km », « 3 200 km ». */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "—";
  if (meters < 1_000) return `${Math.round(meters)} m`;
  if (meters < 100_000) return `${(meters / 1_000).toFixed(1).replace(".", ",")} km`;
  return `${Math.round(meters / 1_000).toLocaleString("fr-FR")} km`;
}

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function readConsent(storage: Storage | null = safeStorage()): StoredConsent | null {
  try {
    const value = storage?.getItem(GEOLOCATION_STORAGE_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

export function writeConsent(value: StoredConsent | null, storage: Storage | null = safeStorage()): void {
  try {
    if (!storage) return;
    if (value === null) storage.removeItem(GEOLOCATION_STORAGE_KEY);
    else storage.setItem(GEOLOCATION_STORAGE_KEY, value);
  } catch {
    // Stockage désactivé (navigation privée) : le consentement reste valable
    // pour la session en cours uniquement.
  }
}

export function geolocationSupported(): boolean {
  return typeof navigator !== "undefined" && "geolocation" in navigator && navigator.geolocation != null;
}

/** Options communes aux deux cartes : précision métrique, sans blocage long. */
export const POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 20_000,
  maximumAge: 20_000,
};

/** Message utilisateur pour chaque code d'erreur `GeolocationPositionError`. */
export function describeGeolocationError(error: { code?: number } | null | undefined): string {
  switch (error?.code) {
    case 1:
      return "Localisation refusée. Activez-la dans les réglages du navigateur pour voir votre position.";
    case 2:
      return "Position indisponible : le GPS ou le réseau n'a pas fourni de coordonnées.";
    case 3:
      return "La localisation a expiré. Réessayez depuis le bouton « Ma position ».";
    default:
      return "Impossible d'obtenir votre position pour le moment.";
  }
}

/**
 * État de l'autorisation navigateur, quand l'API Permissions est disponible
 * (Chrome, Edge, Safari récents). Retourne `null` si elle ne peut pas répondre.
 */
export async function queryPermissionState(): Promise<PermissionState | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return null;
    const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return status.state;
  } catch {
    return null;
  }
}
