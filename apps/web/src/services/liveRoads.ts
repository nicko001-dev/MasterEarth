/**
 * Réseau routier mondial pour le trafic animé (OpenStreetMap, proxy IntelliFlood).
 *
 * Le serveur renvoie la géométrie réelle des rues de l'emprise visible. Ce
 * module valide la charge utile et expose un état de chargement explicite :
 * Overpass répond en quelques dizaines de secondes, l'API renvoie donc `202`
 * (« chargement en cours ») jusqu'à ce que le tracé soit disponible.
 *
 * Le mouvement des véhicules n'est pas fourni ici : il est calculé côté client
 * (`globe/traffic.ts`) à partir de l'heure courante, et reste un modèle.
 */
import { config } from "../config";
import { Bounds } from "../globe/borders";
import { parseRoadsPayload, Road } from "../globe/traffic";
import { boundsAreaKm2 } from "./weatherMerge";

export const ROADS_ATTRIBUTION = "© contributeurs OpenStreetMap";
export const ROADS_ATTRIBUTION_URL = "https://www.openstreetmap.org/copyright";
export const ROADS_LICENSE = "ODbL 1.0";
/** L'API refuse les emprises plus grandes : au-delà, le tracé n'a plus de sens. */
export const ROADS_MAX_AREA_KM2 = 2_500;
export const ROADS_MAX_SPAN_DEGREES = 6;

export type RoadsProduct = {
  roads: Road[];
  /** `pending` : le serveur charge le tracé, il faut réessayer. */
  status: "ready" | "pending";
  attribution: string;
  attributionUrl: string;
  license: string;
  degraded: boolean;
  generatedAt: number | null;
  limitations: string[];
};

/** Une emprise est-elle assez locale pour demander le réseau routier ? */
export function roadsBoundsEligible(bounds: Bounds): boolean {
  const values = [bounds.west, bounds.south, bounds.east, bounds.north];
  if (!values.every(Number.isFinite)) return false;
  return bounds.west >= -180
    && bounds.east <= 180
    && bounds.south >= -90
    && bounds.north <= 90
    && bounds.west < bounds.east
    && bounds.south < bounds.north
    && bounds.east - bounds.west <= ROADS_MAX_SPAN_DEGREES
    && bounds.north - bounds.south <= ROADS_MAX_SPAN_DEGREES
    && boundsAreaKm2(bounds) <= ROADS_MAX_AREA_KM2;
}

/** Emprise resserrée autour de son centre, pour rester sous les limites de l'API. */
export function clampRoadsBounds(bounds: Bounds): Bounds {
  const maxSpan = ROADS_MAX_SPAN_DEGREES * 0.8;
  const west = Math.max(-180, bounds.west);
  const east = Math.min(180, bounds.east);
  const south = Math.max(-85, bounds.south);
  const north = Math.min(85, bounds.north);
  const centerLon = (west + east) / 2;
  const centerLat = (south + north) / 2;
  const lonSpan = Math.min(maxSpan, east - west);
  const latSpan = Math.min(maxSpan, north - south);
  return {
    west: centerLon - lonSpan / 2,
    east: centerLon + lonSpan / 2,
    south: centerLat - latSpan / 2,
    north: centerLat + latSpan / 2,
  };
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function parseRoadsProduct(payload: unknown): RoadsProduct {
  if (!payload || typeof payload !== "object") {
    return {
      roads: [],
      status: "pending",
      attribution: ROADS_ATTRIBUTION,
      attributionUrl: ROADS_ATTRIBUTION_URL,
      license: ROADS_LICENSE,
      degraded: false,
      generatedAt: null,
      limitations: [],
    };
  }
  const raw = payload as Record<string, unknown>;
  const generated = typeof raw.generated_at === "string" ? Date.parse(raw.generated_at) : Number.NaN;
  return {
    roads: parseRoadsPayload(payload),
    status: raw.status === "ready" ? "ready" : "pending",
    attribution: text(raw.attribution, ROADS_ATTRIBUTION),
    attributionUrl: text(raw.attribution_url, ROADS_ATTRIBUTION_URL),
    license: text(raw.license, ROADS_LICENSE),
    degraded: raw.degraded === true,
    generatedAt: Number.isFinite(generated) ? generated : null,
    limitations: Array.isArray(raw.limitations)
      ? raw.limitations.filter((line): line is string => typeof line === "string")
      : [],
  };
}

function query(bounds: Bounds): string {
  const params = new URLSearchParams({
    west: bounds.west.toFixed(4),
    south: bounds.south.toFixed(4),
    east: bounds.east.toFixed(4),
    north: bounds.north.toFixed(4),
  });
  return `${config.apiBaseUrl}/api/v1/live/roads?${params.toString()}`;
}

/** Récupère le réseau routier de l'emprise ; lève une erreur si le serveur échoue. */
export async function fetchRoads(bounds: Bounds, fetcher: typeof fetch = fetch): Promise<RoadsProduct> {
  const response = await fetcher(query(bounds), { credentials: "omit", cache: "no-store" });
  if (response.status === 202) {
    return parseRoadsProduct({ status: "loading" });
  }
  if (!response.ok) {
    let detail = "Réseau routier indisponible pour le moment.";
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body?.detail === "string" && body.detail.trim()) detail = body.detail;
    } catch {
      // Réponse non JSON : le message par défaut suffit.
    }
    throw new Error(detail);
  }
  return parseRoadsProduct(await response.json());
}
