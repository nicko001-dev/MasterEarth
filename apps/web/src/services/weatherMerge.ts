/**
 * Fusion des points météo locaux (base de données) et mondiaux (emprise visible).
 *
 * La couverture météo est désormais mondiale : le globe et la carte 2D
 * demandent un échantillonnage à la demande pour la zone regardée. Cette fusion
 * évite les doublons visuels et garde la priorité aux données historisées par
 * l'API (source de vérité) quand les deux se recouvrent.
 */
import type { WeatherItem } from "./api";

const GRID_DEGREES = 0.05;

function keyOf(item: Pick<WeatherItem, "lat" | "lon">): string {
  const lat = Math.round(item.lat / GRID_DEGREES);
  const lon = Math.round(item.lon / GRID_DEGREES);
  return `${lat}:${lon}`;
}

const intensityOf = (item: WeatherItem) =>
  item.observed_precip_mm_h ?? item.modeled_precip_mm_h ?? 0;

/**
 * Concatène les points en écartant les doublons géographiques (≈ 5,5 km).
 * Les points `base` sont conservés en priorité, puis les points `extra` sont
 * ajoutés du plus intense au moins intense, dans la limite de `limit`.
 */
export function mergeWeather(
  base: readonly WeatherItem[],
  extra: readonly WeatherItem[],
  limit = 260,
): WeatherItem[] {
  const seen = new Set<string>();
  const merged: WeatherItem[] = [];
  for (const item of base) {
    if (!Number.isFinite(item?.lat) || !Number.isFinite(item?.lon)) continue;
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= limit) return merged;
  }
  const sortedExtra = [...extra]
    .filter((item) => Number.isFinite(item?.lat) && Number.isFinite(item?.lon))
    .sort((a, b) => intensityOf(b) - intensityOf(a));
  for (const item of sortedExtra) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= limit) break;
  }
  return merged;
}

const EARTH_RADIUS_KM = 6371.0088;

/**
 * Surface d'une emprise géographique sur la sphère, en km².
 *
 * Une approximation rectangulaire surestime fortement les vues englobant les
 * hautes latitudes (une vue mondiale dépassait 750 millions de km²). La formule
 * sphérique reste exacte pour une emprise alignée sur les parallèles et permet
 * d'accepter la vue mondiale sans élargir artificiellement la limite.
 */
export function boundsAreaKm2(bounds: {
  west: number;
  south: number;
  east: number;
  north: number;
}): number {
  const south = (Math.max(-90, Math.min(90, bounds.south)) * Math.PI) / 180;
  const north = (Math.max(-90, Math.min(90, bounds.north)) * Math.PI) / 180;
  const west = (Math.max(-180, Math.min(180, bounds.west)) * Math.PI) / 180;
  const east = (Math.max(-180, Math.min(180, bounds.east)) * Math.PI) / 180;
  return Math.abs(
    EARTH_RADIUS_KM ** 2
      * (Math.sin(north) - Math.sin(south))
      * (east - west),
  );
}
