/**
 * Pictogrammes des aléas, communs au globe 3D et à la carte 2D.
 *
 * Chaque catégorie possède une silhouette immédiatement identifiable (anneaux
 * sismiques, vague, panache volcanique, spirale cyclonique, flamme, flocon…).
 * La couleur reste celle de la catégorie ; un point de sévérité est ajouté
 * uniquement lorsque la source publie une sévérité. Aucune icône ne suggère
 * donc une gravité qui n'existerait pas dans les données.
 *
 * Les images sont des SVG en ligne mis en cache : Cesium et Leaflet réutilisent
 * la même texture au lieu d'en créer une par événement.
 */

import type { HazardId, HazardSeverity } from "../services/hazards";
import { SEVERITY_COLOR } from "../services/hazards";

export type HazardKind = "rain" | "flood" | "compound";
export type HazardGlyph = HazardKind | HazardId;

const cache = new Map<string, string>();

const PALETTE: Record<HazardGlyph, { accent: string; ink: string }> = {
  rain: { accent: "#4fc3f7", ink: "#06202f" },
  flood: { accent: "#ef5350", ink: "#2a0507" },
  compound: { accent: "#ff4d8d", ink: "#2a0416" },
  earthquake: { accent: "#ff6b6b", ink: "#2a080b" },
  tsunami: { accent: "#26c8ff", ink: "#04222e" },
  volcano: { accent: "#ff9f43", ink: "#2b1605" },
  hurricane: { accent: "#c06bff", ink: "#1d0a2b" },
  wildfire: { accent: "#ff7a45", ink: "#2b0e05" },
  drought: { accent: "#e0b24b", ink: "#2a2107" },
  landslide: { accent: "#a68a6b", ink: "#211a13" },
  sandstorm: { accent: "#e8c27a", ink: "#2a2110" },
  blizzard: { accent: "#8fd7ff", ink: "#082231" },
  heatwave: { accent: "#ff5f8f", ink: "#2a0914" },
  tornado: { accent: "#b6c6d6", ink: "#111c25" },
  storm: { accent: "#c9d8e8", ink: "#101c27" },
};

function cloud(color: string): string {
  return `<path d="M10 20a5 5 0 0 1 .6-9.9A7 7 0 0 1 24 9.6 4.6 4.6 0 0 1 25.4 20Z" fill="${color}" stroke="rgba(3,10,18,0.85)" stroke-width="1.4"/>`;
}

function drops(color: string): string {
  return `<g stroke="${color}" stroke-width="2.2" stroke-linecap="round">
    <path d="M13 23.5 11.6 27"/>
    <path d="M18 23.5 16.6 27"/>
    <path d="M23 23.5 21.6 27"/>
  </g>`;
}

function wave(color: string): string {
  return `<path d="M5 27c2.6 0 2.6-2.4 5.2-2.4S12.8 27 15.4 27s2.6-2.4 5.2-2.4S23.2 27 25.8 27s2.6-2.4 5.2-2.4"
    fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M5 31.5c2.6 0 2.6-2.4 5.2-2.4s2.6 2.4 5.2 2.4 2.6-2.4 5.2-2.4 2.6 2.4 5.2 2.4"
    fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" opacity="0.55"/>`;
}

function earthquake(accent: string): string {
  return `<g fill="none" stroke="${accent}" stroke-linecap="round">
    <path d="M6 17c2.2-5.2 6.2-8 11-8s8.8 2.8 11 8" stroke-width="1.7" opacity="0.45"/>
    <path d="M9.5 19.5c1.7-3.7 4.5-5.7 7.5-5.7s5.8 2 7.5 5.7" stroke-width="2.1" opacity="0.75"/>
    <path d="M17 8.5 14 17l5.3 2.7-3.1 7.3 7.1-5.4-4.6-3 4.2-3.4" stroke-width="2.5"/>
  </g>`;
}

function tsunami(accent: string): string {
  return `<g fill="none" stroke="${accent}" stroke-linecap="round">
    <path d="M6 26c0-8.7 5.4-14.8 13.2-14.8 6.1 0 10.2 3.2 10.2 7.5 0 3.7-2.8 6.4-6.4 6.4-2.8 0-4.9-1.8-4.9-4.2 0-2.1 1.5-3.6 3.4-3.6" stroke-width="2.8"/>
    <path d="M6 29.5c3.4 0 3.4-2 6.8-2s3.4 2 6.8 2 3.4-2 6.8-2 3.4 2 6.8 2" stroke-width="1.7" opacity="0.65"/>
    <circle cx="25.4" cy="20.6" r="1.1" fill="${accent}" stroke="none"/>
  </g>`;
}

function volcano(accent: string): string {
  return `<path d="M4.5 27 14 10.5l5 8.1 3.5-5.4L31 27Z" fill="${accent}" fill-opacity="0.92" stroke="rgba(3,10,18,0.8)" stroke-width="1.3"/>
  <path d="M15.1 12.2c1.8 2.1 3.9 2.1 5.8 0" fill="none" stroke="#2a0507" stroke-width="1.8" stroke-linecap="round"/>
  <g fill="${accent}" opacity="0.8">
    <circle cx="17.4" cy="8.4" r="2.2"/>
    <circle cx="21.6" cy="5.6" r="1.5"/>
    <circle cx="24.2" cy="8.1" r="1.1" opacity="0.7"/>
  </g>
  <path d="M16.4 19.4 14 26h6.4l-2.6-6.6Z" fill="#2a0507" fill-opacity="0.45"/>`;
}

function hurricane(accent: string): string {
  return `<g fill="none" stroke="${accent}" stroke-linecap="round">
    <path d="M25.5 8.8c-7.4-4.5-16.8-.6-17.8 7.3-.9 7 6.3 12.7 12.7 10.2 5.2-2 6.9-8.2 2.9-11.6-3.3-2.8-8.5-1.2-9.2 3-.5 3.2 2.2 5.2 4.7 4.4" stroke-width="2.4"/>
    <circle cx="17.8" cy="18.3" r="2.1" fill="${accent}" stroke="none"/>
    <path d="M8.4 22.9c-2.7 1.5-4.1 3.6-4.6 6.4M26.8 10.1c2.3-1.5 3.5-3.4 4-5.6" stroke-width="1.5" opacity="0.5"/>
  </g>`;
}

function flood(accent: string): string {
  return `${wave(accent)}<path d="M9.5 22.5v-6l6.2-4.6 6.2 4.6v6" fill="${accent}" fill-opacity="0.24" stroke="${accent}" stroke-width="1.9" stroke-linejoin="round"/>`;
}

function wildfire(accent: string): string {
  return `<path d="M18.5 4.5c.8 5.3-4.7 6.7-3.7 11.3.7 3 3.7 3.1 3.7 6.2a4.6 4.6 0 0 1-9.2 0c0-6.2 5.1-8 5.4-12.2.2-2.6 1.9-4.6 3.8-5.3Z"
    fill="${accent}" stroke="rgba(3,10,18,0.7)" stroke-width="1.2"/>
  <path d="M22.6 14.3c.5 3.2-2.4 4.3-2 7.1.3 1.9 2.1 2.1 2.1 3.8a3.2 3.2 0 0 1-6.4 0c0-3.6 2.9-5 3.3-7.5.2-1.8 1.4-3 3-3.4Z"
    fill="${accent}" fill-opacity="0.68"/>
  <path d="M16 31.5h8" stroke="${accent}" stroke-width="1.7" stroke-linecap="round" opacity="0.55"/>`;
}

function drought(accent: string): string {
  return `<g fill="none" stroke="${accent}" stroke-linecap="round">
    <circle cx="17" cy="12.2" r="5.2" stroke-width="2.2"/>
    <path d="M17 3.2v2.2M17 19v2.2M8 12.2H5.8M28.2 12.2H26M10.6 5.8 9 4.2M23.4 5.8 25 4.2" stroke-width="1.8"/>
    <path d="M5 30.5c3-1.3 4.2-5 7.4-4.1 2.7.8 2.6 3.3 5.2 3.8 3.1.6 4.4-2.8 7.1-2 2.6.8 2.9 2.1 4.3 2.3" stroke-width="2.1"/>
    <path d="M12 26.4 10.2 29M20.7 26.2l1.7 2.3M16.6 27.4l.4 1.4" stroke-width="1.4" opacity="0.8"/>
  </g>`;
}

function landslide(accent: string): string {
  return `<path d="M5 28 19 10l4 6 3-2 3.5 14Z" fill="${accent}" fill-opacity="0.2" stroke="${accent}" stroke-width="2" stroke-linejoin="round"/>
  <g fill="${accent}">
    <circle cx="14" cy="22.5" r="2.6"/>
    <circle cx="20" cy="25" r="1.9"/>
    <circle cx="24" cy="21.5" r="1.4"/>
  </g>
  <path d="M23 9.5c2.2 2.1 3.6 4.8 4 7.8" fill="none" stroke="${accent}" stroke-width="1.7" stroke-linecap="round" stroke-dasharray="2.5 2.2"/>`;
}

function sandstorm(accent: string): string {
  return `<g fill="none" stroke="${accent}" stroke-linecap="round">
    <path d="M5 12h12.5c2.4 0 3.6-1.1 3.6-2.7 0-1.5-1.2-2.6-2.8-2.6" stroke-width="2.4"/>
    <path d="M5 18.5h18.3c2.2 0 3.3 1 3.3 2.4 0 1.4-1.1 2.4-2.7 2.4" stroke-width="2.4"/>
    <path d="M8 25h12.8c3 0 4.6 1.1 4.6 2.7" stroke-width="2" opacity="0.7"/>
    <g fill="${accent}" stroke="none">
      <circle cx="10.5" cy="8" r="1.2"/><circle cx="15" cy="6.5" r="0.9"/><circle cx="21" cy="8.5" r="1"/>
      <circle cx="13" cy="29.4" r="1"/><circle cx="19" cy="29.7" r="0.8"/>
    </g>
  </g>`;
}

function blizzard(accent: string): string {
  return `<g fill="none" stroke="${accent}" stroke-linecap="round">
    <path d="M17 4.5v25M6.2 10.8l21.6 12.4M27.8 10.8 6.2 23.2" stroke-width="1.8"/>
    <path d="M13.6 6.8 17 10l3.4-3.2M13.6 27.2 17 24l3.4 3.2M6.8 15.6l4.4.7-.7-4.4M27.2 18.4l-4.4-.7.7 4.4" stroke-width="1.5"/>
    <circle cx="17" cy="17" r="2.2" fill="${accent}" stroke="none"/>
  </g>`;
}

function heatwave(accent: string): string {
  return `<circle cx="13" cy="12.5" r="5" fill="${accent}" fill-opacity="0.25" stroke="${accent}" stroke-width="2"/>
  <g stroke="${accent}" stroke-width="1.7" stroke-linecap="round">
    <path d="M13 3.5v2.2M13 19.3v2.1M4.2 12.5H2M24 12.5h-2.2M6.8 6.3 5.2 4.7M20.8 6.3l1.6-1.6"/>
  </g>
  <path d="M23 8.5a3 3 0 0 0-3 3v10.3a5.2 5.2 0 1 0 6 0V11.5a3 3 0 0 0-3-3Z" fill="${accent}" fill-opacity="0.2" stroke="${accent}" stroke-width="1.8"/>
  <path d="M23 14v10" stroke="${accent}" stroke-width="2" stroke-linecap="round"/>
  <circle cx="23" cy="26" r="2.2" fill="${accent}"/>`;
}

function tornado(accent: string): string {
  return `<g fill="none" stroke="${accent}" stroke-linecap="round">
    <path d="M5 7.5h24" stroke-width="2.8"/>
    <path d="M7.5 12.5h19" stroke-width="2.5" opacity="0.9"/>
    <path d="M10 17.5h13.5" stroke-width="2.2" opacity="0.8"/>
    <path d="M12.5 22h9" stroke-width="1.9" opacity="0.72"/>
    <path d="M15 26.5h5" stroke-width="1.6" opacity="0.6"/>
    <path d="M17.5 30.5h2" stroke-width="1.4" opacity="0.5"/>
  </g>`;
}

function storm(accent: string): string {
  return `${cloud(accent)}
  <path d="M18 19.5 14.5 26h4l-2.3 6.5 7.2-8.5h-4.2l2-4.5Z" fill="${accent}" stroke="rgba(3,10,18,0.8)" stroke-width="1" stroke-linejoin="round"/>`;
}

function iconBody(kind: HazardGlyph, accent: string): string {
  switch (kind) {
    case "rain": return `${cloud(accent)}${drops(accent)}`;
    case "flood": return flood(accent);
    case "compound": return `${cloud(accent)}${wave(accent)}`;
    case "earthquake": return earthquake(accent);
    case "tsunami": return tsunami(accent);
    case "volcano": return volcano(accent);
    case "hurricane": return hurricane(accent);
    case "wildfire": return wildfire(accent);
    case "drought": return drought(accent);
    case "landslide": return landslide(accent);
    case "sandstorm": return sandstorm(accent);
    case "blizzard": return blizzard(accent);
    case "heatwave": return heatwave(accent);
    case "tornado": return tornado(accent);
    case "storm": return storm(accent);
  }
}

/** Sprite SVG (data URL) d'un aléa, vu du dessus. */
export function hazardSprite(kind: HazardGlyph, severity?: HazardSeverity): string {
  const cacheKey = severity ? `${kind}:${severity}` : kind;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const { accent, ink } = PALETTE[kind];
  const dot = severity
    ? `<circle cx="28.5" cy="5.5" r="3.2" fill="${SEVERITY_COLOR[severity]}" stroke="${ink}" stroke-width="1.2"/>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
<circle cx="18" cy="18" r="16" fill="${ink}" fill-opacity="0.62" stroke="${accent}" stroke-opacity="0.45" stroke-width="1"/>
<g>${iconBody(kind, accent)}</g>
${dot}
</svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  cache.set(cacheKey, url);
  return url;
}

/** Classe de risque d'un point météo ou d'un capteur, pour choisir l'icône. */
export function hazardKind(rain: boolean, flood: boolean): HazardKind | null {
  if (rain && flood) return "compound";
  if (flood) return "flood";
  if (rain) return "rain";
  return null;
}
