import { config } from "../config";

export interface Place {
  name: string;
  lat: number;
  lon: number;
  type: "city" | "district";
}

export async function searchPlaces(token: string, query: string, limit = 10): Promise<Place[]> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/geocoding/search?q=${encodeURIComponent(query)}&limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Recherche lieux : ${response.status}`);
  return response.json();
}

export async function reverseGeocode(token: string, lat: number, lon: number): Promise<{ place: Place; distance_km: number }> {
  const response = await fetch(`${config.apiBaseUrl}/api/v1/geocoding/reverse?lat=${lat}&lon=${lon}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Géocodage inverse : ${response.status}`);
  return response.json();
}