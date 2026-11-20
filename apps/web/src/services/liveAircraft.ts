/**
 * Trafic aérien mondial en direct (OpenSky Network, via le proxy IntelliFlood).
 *
 * Le serveur interroge OpenSky pour l'emprise visible, valide et met en cache
 * les observations. Ce module se contente de valider la charge utile, de la
 * borner et d'interpoler le déplacement entre deux observations.
 *
 * Une position interpolée n'est pas une nouvelle mesure : l'interface doit
 * l'indiquer. Les vols au sol, les vitesses absentes et les observations trop
 * anciennes ne sont pas prolongés au-delà d'une limite raisonnable.
 */
import { config } from "../config";

export type AircraftBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type Aircraft = {
  icao24: string;
  callsign: string;
  country: string;
  lat: number;
  lon: number;
  altitudeM: number | null;
  onGround: boolean;
  velocityMs: number | null;
  headingDeg: number | null;
  verticalRateMs: number | null;
  observedAt: number | null;
  source: string;
};

export type AircraftProduct = {
  aircraft: Aircraft[];
  generatedAt: number;
  upstreamTime: number | null;
  attribution: string;
  attributionUrl: string;
  license: string;
  degraded: boolean;
  bbox: AircraftBounds | null;
  limitations: string[];
};

export const AIRCRAFT_ATTRIBUTION = "OpenSky Network";
export const AIRCRAFT_ATTRIBUTION_URL = "https://opensky-network.org/";
/** Au-delà, l'interpolation cesse : une observation trop ancienne reste figée. */
export const MAX_EXTRAPOLATION_SECONDS = 120;
/** En dessous, on affiche la position observée sans la présenter comme interpolée. */
export const EXTRAPOLATION_NOTICE_SECONDS = 5;

function finite(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function text(value: unknown, limit = 80): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function parseBounds(value: unknown): AircraftBounds | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const west = finite(raw.west);
  const south = finite(raw.south);
  const east = finite(raw.east);
  const north = finite(raw.north);
  if (west == null || south == null || east == null || north == null) return null;
  if (west < -180 || east > 180 || south < -90 || north > 90) return null;
  if (west >= east || south >= north) return null;
  return { west, south, east, north };
}

/** Valide la charge utile de `/api/v1/live/aircraft` ; null si inexploitable. */
export function parseAircraftProduct(payload: unknown): AircraftProduct | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const rawStates = Array.isArray(root.states) ? root.states : [];
  const aircraft: Aircraft[] = [];

  for (const entry of rawStates) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const icao24 = text(row.icao24, 16).toLowerCase();
    const lat = finite(row.lat);
    const lon = finite(row.lon);
    if (!icao24 || lat == null || lon == null) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    const altitude = finite(row.altitude_m);
    const heading = finite(row.heading_deg);
    const observed = finite(row.observed_at);
    aircraft.push({
      icao24,
      callsign: text(row.callsign, 24),
      country: text(row.country, 80),
      lat,
      lon,
      altitudeM: altitude,
      onGround: row.on_ground === true,
      velocityMs: finite(row.velocity_m_s),
      headingDeg: heading == null ? null : ((heading % 360) + 360) % 360,
      verticalRateMs: finite(row.vertical_rate_m_s),
      observedAt: observed,
      source: text(row.source, 16) || "inconnue",
    });
  }

  const generated = typeof root.generated_at === "string" ? Date.parse(root.generated_at) : Number.NaN;
  const upstream = finite(root.upstream_time);
  return {
    aircraft,
    generatedAt: Number.isFinite(generated) ? generated : Date.now(),
    upstreamTime: upstream,
    attribution: text(root.attribution, 80) || AIRCRAFT_ATTRIBUTION,
    attributionUrl:
      typeof root.attribution_url === "string" && root.attribution_url.startsWith("http")
        ? root.attribution_url
        : AIRCRAFT_ATTRIBUTION_URL,
    license: text(root.license, 160),
    degraded: root.degraded === true,
    bbox: parseBounds(root.bbox),
    limitations: Array.isArray(root.limitations)
      ? root.limitations.filter((line): line is string => typeof line === "string").slice(0, 8)
      : [],
  };
}

/** URL de l'API pour la vue mondiale (aucune emprise requise). */
export function globalAircraftApiUrl(): string {
  return `${config.apiBaseUrl}/api/v1/live/aircraft/global`;
}

/**
 * Récupère un échantillon d'aéronefs répartis sur toute la planète.
 *
 * Utilisé quand l'emprise visible est trop grande pour l'endpoint régional :
 * sans cela, l'ouverture du globe n'affichait aucun avion.
 */
export async function fetchGlobalAircraft(
  fetcher: typeof fetch = fetch,
): Promise<AircraftProduct> {
  const response = await fetcher(globalAircraftApiUrl(), {
    credentials: "omit",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Trafic aérien mondial indisponible (${response.status}).`);
  const product = parseAircraftProduct(await response.json());
  if (!product) throw new Error("Réponse de trafic aérien mondial inexploitable.");
  return product;
}

/** URL de l'API pour une emprise visible. */
export function aircraftApiUrl(bounds: AircraftBounds): string {
  const query = new URLSearchParams({
    west: bounds.west.toFixed(4),
    south: bounds.south.toFixed(4),
    east: bounds.east.toFixed(4),
    north: bounds.north.toFixed(4),
  });
  return `${config.apiBaseUrl}/api/v1/live/aircraft?${query.toString()}`;
}

/** Récupère le trafic aérien ; lève une erreur si l'API est indisponible. */
export async function fetchAircraft(
  bounds: AircraftBounds,
  fetcher: typeof fetch = fetch,
): Promise<AircraftProduct> {
  const response = await fetcher(aircraftApiUrl(bounds), {
    credentials: "omit",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Trafic aérien indisponible (${response.status}).`);
  const product = parseAircraftProduct(await response.json());
  if (!product) throw new Error("Réponse de trafic aérien inexploitable.");
  return product;
}

/**
 * Position estimée à `nowMs` en prolongeant le dernier vecteur connu.
 * L'interpolation est plafonnée à deux minutes et désactivée au sol.
 */
export function extrapolateAircraft(
  aircraft: Aircraft,
  nowMs: number,
): { lat: number; lon: number; elapsedSeconds: number } {
  const observed = aircraft.observedAt;
  if (observed == null || aircraft.onGround || aircraft.velocityMs == null || aircraft.headingDeg == null) {
    return { lat: aircraft.lat, lon: aircraft.lon, elapsedSeconds: 0 };
  }
  const elapsed = Math.max(0, Math.min(MAX_EXTRAPOLATION_SECONDS, nowMs / 1000 - observed));
  if (elapsed <= 0 || aircraft.velocityMs <= 0) {
    return { lat: aircraft.lat, lon: aircraft.lon, elapsedSeconds: 0 };
  }
  const distanceM = aircraft.velocityMs * elapsed;
  const headingRad = (aircraft.headingDeg * Math.PI) / 180;
  const northM = distanceM * Math.cos(headingRad);
  const eastM = distanceM * Math.sin(headingRad);
  const lat = aircraft.lat + northM / 111_320;
  const lon = aircraft.lon + eastM / (111_320 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { lat: aircraft.lat, lon: aircraft.lon, elapsedSeconds: 0 };
  }
  return {
    lat: Math.max(-85, Math.min(85, lat)),
    lon: ((lon + 540) % 360) - 180,
    elapsedSeconds: elapsed,
  };
}

/** Icône d'avion orientée vers le nord, utilisée en 2D et en 3D. */
export function aircraftIconSvg(color = "#e8f4ff"): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${color}" d="M12 1.6 14.4 9l7.6 3.7v2.1l-7.4-2.3v5.1l2.6 2v2L12 20.2 6.8 21.6v-2l2.6-2v-5.1L2 14.8v-2.1L9.6 9Z"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Libellé court et lisible d'un vol. */
export function aircraftLabel(aircraft: Aircraft): string {
  return aircraft.callsign || aircraft.icao24.toUpperCase();
}

/** Description d'une observation, pour les infobulles. */
export function aircraftDescription(aircraft: Aircraft): string {
  const altitude = aircraft.altitudeM == null
    ? "altitude inconnue"
    : `${Math.round(aircraft.altitudeM).toLocaleString("fr-FR")} m`;
  const speed = aircraft.velocityMs == null
    ? "vitesse inconnue"
    : `${Math.round(aircraft.velocityMs * 3.6)} km/h`;
  const observed = aircraft.observedAt
    ? new Date(aircraft.observedAt * 1000).toLocaleTimeString("fr-FR")
    : "heure inconnue";
  return `${aircraftLabel(aircraft)} · ${altitude} · ${speed} · observé ${observed}${aircraft.country ? ` · ${aircraft.country}` : ""}`;
}
