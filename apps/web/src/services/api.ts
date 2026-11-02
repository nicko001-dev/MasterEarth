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
  lon: number;
  lat: number;
  status: string;
  alert_level: AlertLevel;
  water_level_cm: number | null;
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
  accumulated_24h_mm: number;
  level: AlertLevel;
}

export const fetchWeather = () => getJson<WeatherItem[]>("/api/v1/weather");
