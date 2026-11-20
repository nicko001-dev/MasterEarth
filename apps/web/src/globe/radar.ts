/**
 * Radar de précipitations mondial en temps réel.
 *
 * Les images proviennent de RainViewer (composite radar mondial, deux dernières
 * heures + courte prévision). Les tuiles sont servies par l'API IntelliFlood :
 * un accès direct depuis le navigateur est bloqué par CORS et exposé aux
 * limitations de débit du fournisseur. Le serveur met en cache les images et
 * applique sa propre limitation ; le navigateur ne contacte jamais RainViewer.
 *
 * Attribution obligatoire : « Weather data by RainViewer », avec un lien.
 * Ces images sont des précipitations observées par radar, pas des mesures de
 * débit ni une prévision hydrologique.
 */
import { config } from "../config";

export type RadarFrame = {
  /** Index stable fourni par l'API, utilisé dans l'URL des tuiles. */
  index: number;
  /** Horodatage Unix (secondes). */
  time: number;
  /** Vrai pour les images de prévision (nowcast). */
  forecast: boolean;
};

export type RadarProduct = {
  frames: RadarFrame[];
  generated: number;
  attribution: string;
  attributionUrl: string;
  limitations: string[];
};

export const RADAR_ATTRIBUTION = "Weather data by RainViewer";
export const RADAR_ATTRIBUTION_URL = "https://www.rainviewer.com/";
export const RADAR_CREDIT_HTML =
  `<a href="${RADAR_ATTRIBUTION_URL}" target="_blank" rel="noopener noreferrer">${RADAR_ATTRIBUTION}</a>`;

type RawFrame = { index?: unknown; time?: unknown; forecast?: unknown };
type RawPayload = {
  generated_at?: unknown;
  frames?: unknown;
  attribution?: unknown;
  attribution_url?: unknown;
  limitations?: unknown;
};

/** Valide la liste d'images renvoyée par l'API ; les entrées invalides sont ignorées. */
export function parseRadarProduct(payload: unknown): RadarProduct | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as RawPayload;
  const frames: RadarFrame[] = [];
  if (Array.isArray(root.frames)) {
    for (const item of root.frames as RawFrame[]) {
      const index = typeof item?.index === "number" ? item.index : Number(item?.index);
      const time = typeof item?.time === "number" ? item.time : Number(item?.time);
      if (!Number.isInteger(index) || index < 0 || !Number.isFinite(time) || time <= 0) continue;
      frames.push({ index, time, forecast: item?.forecast === true });
    }
  }
  if (!frames.length) return null;
  frames.sort((a, b) => a.index - b.index);
  const generated = typeof root.generated_at === "string" ? Date.parse(root.generated_at) : Number.NaN;
  return {
    frames,
    generated: Number.isFinite(generated) ? generated : Date.now(),
    attribution: typeof root.attribution === "string" && root.attribution.trim() ? root.attribution : RADAR_ATTRIBUTION,
    attributionUrl: typeof root.attribution_url === "string" && root.attribution_url.startsWith("http")
      ? root.attribution_url
      : RADAR_ATTRIBUTION_URL,
    limitations: Array.isArray(root.limitations)
      ? root.limitations.filter((line): line is string => typeof line === "string")
      : [],
  };
}

/** Récupère la liste des images radar via l'API ; null si indisponible. */
export async function fetchRadarProduct(fetcher: typeof fetch = fetch): Promise<RadarProduct | null> {
  try {
    const response = await fetcher(`${config.apiBaseUrl}/api/v1/weather/radar/frames`, {
      credentials: "omit",
      cache: "no-store",
    });
    if (!response.ok) return null;
    return parseRadarProduct(await response.json());
  } catch {
    return null;
  }
}

/**
 * Opacité du radar selon la hauteur de caméra.
 *
 * Le radar reste lisible à l'échelle mondiale, mais **disparaît complètement**
 * en approche du sol. Les tuiles radar ont une résolution limitée : agrandies
 * au niveau des rues, elles formaient un voile flou qui masquait bâtiments et
 * voirie. En dessous de 25 km d'altitude, la couche est donc éteinte ; elle
 * remonte progressivement jusqu'à l'échelle du globe.
 */
export function radarOpacityForHeight(heightM: number): number {
  if (!Number.isFinite(heightM) || heightM <= 0) return 0.82;
  const minHeight = 25_000;
  const maxHeight = 12_000_000;
  if (heightM <= minHeight) return 0;
  if (heightM >= maxHeight) return 0.82;
  const progress = Math.log10(heightM / minHeight) / Math.log10(maxHeight / minHeight);
  // Courbe convexe : le radar s'efface vite dès qu'on descend, et ne réapparaît
  // franchement qu'en vue régionale.
  return 0.82 * Math.pow(Math.min(1, Math.max(0, progress)), 1.4);
}

/**
 * Gabarit d'URL de tuile Cesium pour une image donnée. Les tuiles sont des PNG
 * transparents qui se superposent au fond de carte sans le masquer.
 */
export function radarTileUrlTemplate(index: number): string {
  return `${config.apiBaseUrl}/api/v1/weather/radar/tiles/${index}/{z}/{x}/{y}.png`;
}

/** Libellé temporel relatif d'une image radar. */export function radarFrameLabel(frameTime: number, nowSeconds = Date.now() / 1000): string {
  const deltaMinutes = Math.round((frameTime - nowSeconds) / 60);
  if (deltaMinutes >= -1 && deltaMinutes <= 1) return "maintenant";
  if (deltaMinutes > 1) return `prévision +${deltaMinutes} min`;
  const past = Math.abs(deltaMinutes);
  if (past < 60) return `il y a ${past} min`;
  const hours = Math.floor(past / 60);
  const minutes = past % 60;
  return minutes ? `il y a ${hours} h ${minutes}` : `il y a ${hours} h`;
}

/**
 * Index de l'image active pour une animation bouclée : chaque image reste
 * affichée `frameDurationMs`, puis on passe à la suivante.
 */
export function radarFrameIndexAt(elapsedMs: number, frameCount: number, frameDurationMs: number): number {
  if (frameCount <= 0 || !Number.isFinite(elapsedMs) || elapsedMs < 0) return 0;
  if (frameDurationMs <= 0) return 0;
  return Math.floor(elapsedMs / frameDurationMs) % frameCount;
}

/** Échelle de couleurs du radar (schéma 2 « bleu universel ») pour la légende. */
export const RADAR_LEGEND_STOPS = [
  { from: 0.1, label: "faible", color: "#6ec6ff" },
  { from: 0.5, label: "modérée", color: "#2e8bff" },
  { from: 2, label: "forte", color: "#f5c542" },
  { from: 8, label: "très forte", color: "#ff5c33" },
] as const;
