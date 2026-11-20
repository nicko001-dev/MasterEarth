/** API client service for communicating with the IntelliFlood backend.
 *
 * Encapsulates HTTP calls to technical endpoints using the configured
 * API base URL without hardcoding URLs into UI components.
 */

import { config } from "../config";

export interface HealthResponse {
  status: string;
  service: string;
}

export interface ApiRootResponse {
  name: string;
  version: string;
  status: string;
  app_env: string;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${config.apiBaseUrl}/health`);
  if (!response.ok) {
    throw new Error(`Failed to fetch health: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchApiRoot(): Promise<ApiRootResponse> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1`);
  if (!response.ok) {
    throw new Error(`Failed to fetch API root: ${response.statusText}`);
  }
  return response.json();
}

export type AlertLevel = "green" | "orange" | "red";
export type SensorHealthStatus = "never_reported" | "online" | "stale" | "clock_skew";

export interface SensorState {
  code: string;
  name: string;
  kind?: "water_level" | "rain_gauge";
  lon: number;
  lat: number;
  status: string;
  alert_level: AlertLevel;
  water_level_cm: number | null;
  rain_mm_h?: number | null;
  last_measured_at: string | null;
  health_status: SensorHealthStatus;
  minutes_since_last_reading: number | null;
}

export interface SensorReading {
  measured_at: string;
  water_level_cm: number;
  rise_cm_min: number;
  level: AlertLevel;
}

export interface AlertItem {
  id: number;
  sensor_code: string;
  level: AlertLevel;
  water_level_cm: number;
  triggered_at: string;
  message: string;
}

export type ObservationStatus = "new" | "in_review" | "verified" | "rejected";

export interface FieldObservation {
  id: number;
  observation_type: string;
  description: string;
  observed_at: string;
  lon: number;
  lat: number;
  source: string;
  status: ObservationStatus;
  created_by_user_id: number | null;
  organization_id: number | null;
  created_at: string;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${config.apiBaseUrl}${path}`);
  if (!response.ok) throw new Error(`${path} : ${response.status}`);
  return response.json();
}

export const fetchSensors = () => getJson<SensorState[]>("/api/v1/sensors");
export const fetchAlerts = () => getJson<AlertItem[]>("/api/v1/alerts?limit=50");
export const fetchReadings = (code: string) =>
  getJson<SensorReading[]>(`/api/v1/sensors/${encodeURIComponent(code)}/readings?limit=100`);

export async function fetchObservations(token?: string): Promise<FieldObservation[]> {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const response = await fetch(`${config.apiBaseUrl}/api/v1/observations`, { headers });
  if (!response.ok) throw new Error(`Observations : ${response.status}`);
  return response.json();
}

export interface WeatherItem {
  name: string;
  source: string;
  lat: number;
  lon: number;
  updated_at: string;
  intensity_3h_mm_h: number;
  forecast_intensity_3h_mm_h?: number;
  observed_precip_mm_h?: number | null;
  observed_at?: string | null;
  observed_24h_mm?: number;
  observed_level?: AlertLevel | null;
  modeled_precip_mm_h?: number | null;
  modeled_at?: string | null;
  modeled_24h_mm?: number;
  forecast_level?: AlertLevel;
  source_kind?: "weather_model" | "provider_report" | "iot_gauge" | "bulletin";
  accumulated_24h_mm: number;
  level: AlertLevel;
}

export type WeatherSourceStatus = "disabled" | "no_data" | "current" | "stale";

export interface WeatherProviderStatus {
  source: string;
  enabled: boolean;
  status: WeatherSourceStatus;
  last_success_at: string | null;
}

export interface WeatherStatus {
  refresh_interval_minutes: number;
  providers: WeatherProviderStatus[];
  supplemental_sources: string[];
}

export const fetchWeather = () => getJson<WeatherItem[]>("/api/v1/weather");
export const fetchWeatherStatus = () => getJson<WeatherStatus>("/api/v1/weather/status");

/** Couverture météo mondiale calculée à la demande pour l'emprise visible. */
export interface WeatherViewportResponse {
  generated_at: string;
  bbox: { west: number; south: number; east: number; north: number };
  spacing_km: number;
  points: WeatherItem[];
  degraded: boolean;
  failed_points?: number;
  attribution: string;
  limitations: string[];
}

export async function fetchWeatherViewport(bounds: {
  west: number;
  south: number;
  east: number;
  north: number;
}): Promise<WeatherViewportResponse> {
  const params = new URLSearchParams({
    west: bounds.west.toFixed(3),
    south: bounds.south.toFixed(3),
    east: bounds.east.toFixed(3),
    north: bounds.north.toFixed(3),
  });
  const response = await fetch(`${config.apiBaseUrl}/api/v1/weather/viewport?${params.toString()}`);
  if (!response.ok) throw new Error(`Couverture météo mondiale indisponible (${response.status}).`);
  const payload = (await response.json()) as WeatherViewportResponse;
  return { ...payload, points: Array.isArray(payload.points) ? payload.points : [] };
}

/**
 * Scan des précipitations courantes sur des points répartis dans le monde entier.
 *
 * ``available`` distingue une donnée manquante d'un vrai zéro : quand le
 * fournisseur échoue, ``rain_points`` vaut null et l'interface doit afficher
 * « indisponible » plutôt que « 0 point en pluie ».
 */
export interface GlobalRainPlace {
  name: string;
  detail: string;
  street: string | null;
  city: string | null;
  country: string | null;
  lat: number;
  lon: number;
  precip_mm_h: number;
  /** Niveau de risque déterministe, valable partout dans le monde. */
  risk_level?: "green" | "orange" | "red";
  precision: "street" | "district" | "locality" | "coordinates";
  distance_km: number | null;
  named: boolean;
  attribution?: string;
}

export interface GlobalRainResponse {
  generated_at: string;
  scope: "worldwide";
  available: boolean;
  /** Dernière mesure valide servie faute de donnée fraîche (jamais inventée). */
  stale?: boolean;
  /** Âge en secondes de la mesure au moment de la réponse. */
  age_seconds?: number;
  /** Provenance du scan (hôte principal ou de repli Open-Meteo). */
  source?: string | null;
  sampled_points: number;
  valid_points: number;
  failed_points: number;
  rain_points: number | null;
  rain_fraction: number | null;
  max_precip_mm_h: number | null;
  wettest: Array<{ name: string; lat: number; lon: number; precip_mm_h: number }>;
  /** Zones arrosées affinées puis nommées (rue / quartier / localité). */
  rain_places?: GlobalRainPlace[];
  degraded: boolean;
  attribution: string;
  attribution_url?: string;
  license?: string;
  limitations: string[];
}

export async function fetchGlobalRain(
  fetcher: typeof fetch = fetch,
): Promise<GlobalRainResponse> {
  // `fetcher` est injectable pour les tests et les diagnostics hors navigateur.
  const response = await fetcher(`${config.apiBaseUrl}/api/v1/weather/global-rain`);
  if (!response.ok) throw new Error(`Scan de pluie mondial indisponible (${response.status}).`);
  return (await response.json()) as GlobalRainResponse;
}
