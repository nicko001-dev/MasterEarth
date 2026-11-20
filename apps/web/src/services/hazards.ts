/**
 * Contrat client des aléas naturels réels (MasterEarth).
 *
 * Le serveur agrège des publications officielles (USGS, GDACS, NASA EONET,
 * NOAA) sans fabriquer d'événement. Ce module ne fait que transporter et
 * présenter ces données : aucune sévérité, position ou statistique n'est
 * inventée côté interface. Lorsqu'une source ne publie pas de lieu, on peut
 * afficher le lieu habité réel le plus proche (GeoNames) en le signalant
 * explicitement comme approximation.
 */

import { config } from "../config";
import { distanceMeters } from "./geolocation";
import { nearestPlace, Place } from "../globe/places";

export type HazardId =
  | "earthquake"
  | "tsunami"
  | "volcano"
  | "hurricane"
  | "flood"
  | "wildfire"
  | "drought"
  | "landslide"
  | "sandstorm"
  | "blizzard"
  | "heatwave"
  | "tornado"
  | "storm";

export type HazardSeverity = "low" | "moderate" | "high" | "extreme" | "unknown";
export type HazardSourceStatus = "ok" | "unavailable";

export interface HazardMetric {
  key: string;
  label: string;
  value: number | string | null;
  unit: string;
  basis?: string;
}

export interface HazardEvent {
  id: string;
  source: string;
  source_id: string;
  hazard: HazardId;
  title: string;
  place: string | null;
  lat: number;
  lon: number;
  time: string;
  updated: string | null;
  severity: HazardSeverity;
  severity_label: string;
  data_kind: string;
  description: string | null;
  country: string | null;
  url: string | null;
  metrics: HazardMetric[];
  also_reported_by: string[];
  attribution: string;
}

export interface HazardSourceState {
  id: string;
  name: string;
  status: HazardSourceStatus;
  count: number;
  fetched_at: string;
  attribution: string;
  attribution_url: string;
  license: string;
  error: string | null;
  warnings: string[];
}

export interface HazardSnapshot {
  generated_at: string;
  scope: "worldwide";
  available: boolean;
  stale: boolean;
  degraded: boolean;
  age_seconds: number;
  total_events: number;
  counts_by_type: Record<HazardId, number>;
  counts_by_severity: Record<HazardSeverity, number>;
  events: HazardEvent[];
  sources: HazardSourceState[];
  attribution: string;
  attribution_url: string;
  license: string;
  limitations: string[];
}

export interface HazardSimulationField {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface HazardCatalogItem {
  id: HazardId;
  label: string;
  label_en: string;
  color: string;
  description: string;
  sources: string[];
  metrics: string[];
  simulation_fields: HazardSimulationField[];
}

export interface HazardCatalog {
  hazards: HazardCatalogItem[];
  count: number;
  attribution: string;
  disclaimer: string;
}

export interface HazardSimulationInput {
  hazard: HazardId;
  lat: number;
  lon: number;
  name?: string | null;
  inputs: Record<string, number>;
}

export interface HazardSimulationTimelinePoint {
  fraction: number;
  hour: number;
  intensity_index: number;
  label: string;
}

export interface HazardSimulation {
  hazard: HazardId;
  label: string;
  model: string;
  generated_at: string;
  center: { lat: number; lon: number; name: string | null };
  radius_km: number;
  intensity_index: number;
  severity: Exclude<HazardSeverity, "unknown">;
  severity_label: string;
  metrics: HazardMetric[];
  timeline: HazardSimulationTimelinePoint[];
  statements: string[];
  input: Record<string, unknown>;
  assumptions: string[];
  limitations: string[];
  disclaimer: string;
}

export interface HazardVisualMeta {
  label: string;
  short: string;
  color: string;
  glyph: string;
}

/** Libellés et couleurs de repli, alignés sur le catalogue serveur. */
export const HAZARD_META: Record<HazardId, HazardVisualMeta> = {
  earthquake: { label: "Séismes", short: "Séisme", color: "#ff6b6b", glyph: "◉" },
  tsunami: { label: "Tsunamis", short: "Tsunami", color: "#26c8ff", glyph: "≈" },
  volcano: { label: "Volcans", short: "Volcan", color: "#ff9f43", glyph: "▲" },
  hurricane: { label: "Cyclones", short: "Cyclone", color: "#c06bff", glyph: "🌀" },
  flood: { label: "Inondations", short: "Inondation", color: "#4f9dff", glyph: "≋" },
  wildfire: { label: "Feux de forêt", short: "Feu", color: "#ff7a45", glyph: "🔥" },
  drought: { label: "Sécheresses", short: "Sécheresse", color: "#e0b24b", glyph: "☀" },
  landslide: { label: "Glissements", short: "Glissement", color: "#a68a6b", glyph: "⛰" },
  sandstorm: { label: "Tempêtes de sable", short: "Sable", color: "#e8c27a", glyph: "〰" },
  blizzard: { label: "Blizzards", short: "Blizzard", color: "#8fd7ff", glyph: "❄" },
  heatwave: { label: "Canicules", short: "Canicule", color: "#ff5f8f", glyph: "☼" },
  tornado: { label: "Tornades", short: "Tornade", color: "#b6c6d6", glyph: "ϟ" },
  storm: { label: "Orages violents", short: "Orage", color: "#b6c6d6", glyph: "⚡" },
};

export const HAZARD_IDS = Object.keys(HAZARD_META) as HazardId[];

export const SEVERITY_ORDER: Record<HazardSeverity, number> = {
  extreme: 5,
  high: 4,
  moderate: 3,
  low: 2,
  unknown: 1,
};

export const SEVERITY_COLOR: Record<HazardSeverity, string> = {
  extreme: "#ff3b4e",
  high: "#ff8b3d",
  moderate: "#f4c95d",
  low: "#56d6a0",
  unknown: "#8daec6",
};

export function hazardLabel(id: HazardId): string {
  return HAZARD_META[id]?.short ?? id;
}

export function hazardColor(id: HazardId): string {
  return HAZARD_META[id]?.color ?? "#8daec6";
}

export function isHazardId(value: string): value is HazardId {
  return Object.prototype.hasOwnProperty.call(HAZARD_META, value);
}

export async function fetchHazards(signal?: AbortSignal): Promise<HazardSnapshot> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/hazards`, { signal });
  if (!response.ok) {
    throw new Error(`Aléas indisponibles (${response.status})`);
  }
  return response.json();
}

export async function fetchHazardCatalog(signal?: AbortSignal): Promise<HazardCatalog> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/hazards/catalog`, { signal });
  if (!response.ok) {
    throw new Error(`Catalogue des aléas indisponible (${response.status})`);
  }
  return response.json();
}

export async function runHazardSimulation(
  input: HazardSimulationInput,
  token: string,
  signal?: AbortSignal,
): Promise<HazardSimulation> {
  // L'API accepte les paramètres à plat (`magnitude`, `wind_kmh`…), tandis que
  // le formulaire les regroupe dans `inputs` pour rester générique.
  const { inputs, ...center } = input;
  const response = await fetch(`${config.apiBaseUrl}/api/v1/simulations/hazard`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...center, ...inputs }),
    signal,
  });
  if (!response.ok) {
    let detail = `Simulation indisponible (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // Le serveur peut répondre sans JSON : on conserve le statut.
    }
    throw new Error(detail);
  }
  return response.json();
}

/** Tri stable : gravité publiée d'abord, puis événement le plus récent. */
export function sortHazards(events: readonly HazardEvent[]): HazardEvent[] {
  return [...events].sort((a, b) => {
    const severity = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
    if (severity !== 0) return severity;
    return new Date(b.time).getTime() - new Date(a.time).getTime();
  });
}

export type ResolvedHazardPlace = {
  label: string;
  approximate: boolean;
  source: "event" | "country" | "nearest" | "coordinates";
  distanceM?: number;
};

/**
 * Résout un libellé de lieu réel sans jamais inventer de toponyme.
 *
 * - le lieu publié par la source est prioritaire ;
 * - sinon le pays publié ;
 * - sinon la ville GeoNames la plus proche, signalée « près de » ;
 * - en dernier recours, les coordonnées exactes.
 */
export function resolveHazardPlace(
  event: Pick<HazardEvent, "place" | "country" | "lat" | "lon">,
  places: readonly Place[] = [],
): ResolvedHazardPlace {
  const published = event.place?.trim();
  if (published) {
    return { label: published, approximate: false, source: "event" };
  }
  if (places.length) {
    const nearest = nearestPlace(places, { lat: event.lat, lon: event.lon });
    if (nearest) {
      return {
        label: `Près de ${nearest.place.name}${nearest.place.country ? `, ${nearest.place.country}` : ""}`,
        approximate: true,
        source: "nearest",
        distanceM: nearest.distanceM,
      };
    }
  }
  if (event.country?.trim()) {
    return { label: event.country.trim(), approximate: false, source: "country" };
  }
  return {
    label: `${event.lat.toFixed(2)}°, ${event.lon.toFixed(2)}°`,
    approximate: false,
    source: "coordinates",
  };
}

export function hazardDistanceKm(event: HazardEvent, position: { lat: number; lon: number }): number {
  return distanceMeters(position, event) / 1000;
}

/**
 * Résout les libellés de tous les événements. Seuls les événements sans lieu
 * publié déclenchent une recherche GeoNames : le coût reste faible même avec
 * des centaines d'événements, et aucun toponyme n'est créé.
 */
export function resolveHazardPlaceMap(
  events: readonly HazardEvent[],
  places: readonly Place[] = [],
): Map<string, ResolvedHazardPlace> {
  const resolved = new Map<string, ResolvedHazardPlace>();
  for (const event of events) {
    resolved.set(event.id, resolveHazardPlace(event, places));
  }
  return resolved;
}

export function metricValueLabel(metric: HazardMetric): string {
  if (metric.value == null) return "—";
  if (typeof metric.value === "number") {
    const formatted = Math.abs(metric.value) >= 100
      ? metric.value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })
      : metric.value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
    return metric.unit ? `${formatted} ${metric.unit}` : formatted;
  }
  return metric.unit ? `${metric.value} ${metric.unit}` : metric.value;
}

export function hazardSourceLabel(sourceId: string, states: readonly HazardSourceState[]): string {
  return states.find((state) => state.id === sourceId)?.name ?? sourceId;
}
