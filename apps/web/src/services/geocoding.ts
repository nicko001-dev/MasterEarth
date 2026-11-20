import { config } from "../config";

export type PlaceKind =
  | "city"
  | "district"
  | "region"
  | "country"
  | "address"
  | "other";

export interface Place {
  name: string;
  lat: number;
  lon: number;
  type: PlaceKind;
  country?: string;
  state?: string;
  city?: string;
  postcode?: string;
}

export interface PlaceSearchResponse {
  places: Place[];
  /** `true` quand le serveur s'est rabattu sur sa liste locale (Photon injoignable). */
  degraded: boolean;
  source: "photon" | "local";
  attribution: string;
  attribution_url?: string;
  license?: string;
  limitations?: string[];
}

/**
 * Recherche de lieux dans le monde entier.
 *
 * L'interface utilise la recherche instantanée embarquée (`/geo/places.json`,
 * GeoNames) ; ce service sert les appels authentifiés à l'API, qui interroge
 * Photon (OpenStreetMap) avec repli local.
 */
export async function searchPlaces(
  token: string,
  query: string,
  limit = 10,
  lang = "fr",
): Promise<PlaceSearchResponse> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    lang,
  });
  const response = await fetch(
    `${config.apiBaseUrl}/api/v1/geocoding/search?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error(`Recherche lieux : ${response.status}`);
  const payload = (await response.json()) as PlaceSearchResponse;
  return {
    ...payload,
    places: Array.isArray(payload.places) ? payload.places : [],
    degraded: Boolean(payload.degraded),
  };
}

export async function reverseGeocode(
  token: string,
  lat: number,
  lon: number,
  lang = "fr",
): Promise<{ place: Place; distance_km: number }> {
  const params = new URLSearchParams({
    lat: lat.toFixed(5),
    lon: lon.toFixed(5),
    lang,
  });
  const response = await fetch(
    `${config.apiBaseUrl}/api/v1/geocoding/reverse?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error(`Géocodage inverse : ${response.status}`);
  return response.json();
}
