import { config } from "../config";

export type FloodMode = "rain" | "level" | "sensor";

export interface FloodInput {
  mode: FloodMode;
  lat?: number;
  lon?: number;
  sensor_code?: string;
  rise_m?: number;
  rain_mm_h?: number;
  hours?: number;
  radius_m: number;
  cells: number;
  steps: number;
}

export interface FloodFrame {
  fraction: number;
  depth_cm_b64: string;
  max_depth_m: number;
  area_km2: number;
}

export interface FloodBBox { south: number; west: number; north: number; east: number }

export interface FloodSimulation {
  id: number;
  bbox: FloodBBox;
  rows: number;
  cols: number;
  cell_m: number;
  depth_cm_b64: string;
  possible_b64: string;
  stats: {
    max_depth_m: number;
    area_km2: number;
    volume_m3: number;
    surface_level_m: number;
    possible_area_km2: number;
  };
  assumptions: string[];
  frames: FloodFrame[];
  disclaimer: string;
  center: { lat: number; lon: number };
}

export interface FloodRun {
  result: FloodSimulation;
  input: FloodInput;
}

export async function runFloodSimulation(token: string, input: FloodInput): Promise<FloodSimulation> {
  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}/api/v1/simulations/flood`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: ["Bearer", token].join(" "),
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Serveur de simulation injoignable. Vérifiez votre connexion, puis réessayez.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      data?.error?.message ??
        data?.detail?.[0]?.msg ??
        `La simulation a échoué (${response.status}).`,
    );
  }
  return data as FloodSimulation;
}

export function decodeDepthCm(encoded: string): Uint16Array {
  const binary = atob(encoded);
  if (binary.length % 2 !== 0) throw new Error("Grille de profondeur invalide.");
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  return Uint16Array.from({ length: bytes.length / 2 }, (_, index) => view.getUint16(index * 2, true));
}

export function decodePossible(encoded: string): Uint8Array {
  const binary = atob(encoded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Classes de hauteur d'eau alignées sur la légende de la carte et du globe. */
export interface DepthClass {
  key: string;
  label: string;
  range: string;
  minCm: number;
  maxCm: number;
  color: string;
}

export const DEPTH_CLASSES: readonly DepthClass[] = [
  { key: "trace", label: "Trace", range: "< 0,05 m", minCm: 0, maxCm: 5, color: "#8ed8ea" },
  { key: "low", label: "Faible", range: "0,05 – 0,20 m", minCm: 5, maxCm: 20, color: "#1fb5d9" },
  { key: "moderate", label: "Modéré", range: "0,20 – 0,50 m", minCm: 20, maxCm: 50, color: "#ffd166" },
  { key: "high", label: "Élevé", range: "0,50 – 1,00 m", minCm: 50, maxCm: 100, color: "#ff9f1c" },
  { key: "very-high", label: "Très élevé", range: "1,00 – 1,50 m", minCm: 100, maxCm: 150, color: "#ff4d4d" },
  { key: "critical", label: "Critique", range: "> 1,50 m", minCm: 150, maxCm: Number.POSITIVE_INFINITY, color: "#c04cff" },
] as const;

const DEPTH_COLORS: ReadonlyArray<{ maxCm: number; rgba: readonly [number, number, number, number] }> = [
  { maxCm: 5, rgba: [142, 216, 234, 150] },
  { maxCm: 20, rgba: [31, 181, 217, 165] },
  { maxCm: 50, rgba: [255, 215, 0, 190] },
  { maxCm: 100, rgba: [255, 155, 0, 205] },
  { maxCm: 150, rgba: [245, 60, 45, 220] },
  { maxCm: Number.POSITIVE_INFINITY, rgba: [170, 20, 180, 230] },
];

export function buildFloodPixels(
  depthCm: Uint16Array,
  possible: Uint8Array,
  rows: number,
  cols: number,
  northUp: boolean,
): Uint8ClampedArray {
  if (depthCm.length !== rows * cols || possible.length !== rows * cols) {
    throw new Error("La grille de simulation ne correspond pas à ses dimensions.");
  }
  const rgba = new Uint8ClampedArray(rows * cols * 4);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const source = row * cols + col;
      const destRow = northUp ? rows - 1 - row : row;
      const dest = (destRow * cols + col) * 4;
      const color =
        depthCm[source] > 0
          ? DEPTH_COLORS.find(({ maxCm }) => depthCm[source] <= maxCm)?.rgba
          : possible[source]
            ? ([255, 205, 70, 65] as const)
            : undefined;
      if (!color) continue;
      rgba[dest] = color[0];
      rgba[dest + 1] = color[1];
      rgba[dest + 2] = color[2];
      rgba[dest + 3] = color[3];
    }
  }
  return rgba;
}

/** Surface de l'emprise simulée en km² (approximation locale de la sphère). */
export function bboxAreaKm2({ south, west, north, east }: FloodBBox): number {
  const meanLat = ((south + north) / 2) * (Math.PI / 180);
  const heightKm = Math.abs(north - south) * 111.32;
  const widthKm = Math.abs(east - west) * 111.32 * Math.max(0.05, Math.cos(meanLat));
  return heightKm * widthKm;
}

/** Répartition de la surface inondée par classe de profondeur, calculée sur la grille du MNT. */
export interface DepthClassArea extends DepthClass {
  areaKm2: number;
  /** Part de l'emprise simulée (0..1). */
  share: number;
  cells: number;
}

export function depthClassAreas(run: FloodSimulation, frameIndex: number): DepthClassArea[] {
  const frame = run.frames[frameIndex];
  const depth = decodeDepthCm(frame?.depth_cm_b64 ?? run.depth_cm_b64);
  if (depth.length !== run.rows * run.cols) {
    throw new Error("La grille de simulation ne correspond pas à ses dimensions.");
  }
  const cellKm2 = (run.cell_m ** 2) / 1_000_000;
  const totalKm2 = bboxAreaKm2(run.bbox);
  return DEPTH_CLASSES.map((depthClass) => {
    let cells = 0;
    for (const value of depth) {
      if (value > 0 && value >= depthClass.minCm && value < depthClass.maxCm) cells++;
    }
    const areaKm2 = cells * cellKm2;
    return {
      ...depthClass,
      cells,
      areaKm2,
      share: totalKm2 > 0 ? areaKm2 / totalKm2 : 0,
    };
  });
}

export function floodedAreaKm2(run: FloodSimulation, frameIndex: number): number {
  return run.frames[frameIndex]?.area_km2 ?? run.stats.area_km2;
}

export function floodedAreaShare(run: FloodSimulation, frameIndex: number): number {
  const total = bboxAreaKm2(run.bbox);
  return total > 0 ? floodedAreaKm2(run, frameIndex) / total : 0;
}

export function frameMaxDepth(run: FloodSimulation, frameIndex: number): number {
  return run.frames[frameIndex]?.max_depth_m ?? run.stats.max_depth_m;
}

/** Durée totale représentée par les images, si le scénario pluie la fournit. */
export function simulationDurationMinutes(run: FloodRun | null): number | null {
  if (!run) return null;
  if (run.input.mode === "rain" && run.input.hours) return Math.round(run.input.hours * 60);
  return null;
}

export function frameLabel(fraction: number, totalMinutes: number | null): string {
  if (totalMinutes == null) return `${Math.round(fraction * 100)} %`;
  const minutes = Math.round(fraction * totalMinutes);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`;
}

export function scenarioLabel(input: FloodInput): string {
  if (input.mode === "rain") {
    return `Pluie ${Math.round(input.rain_mm_h ?? 0)} mm/h · ${input.hours ?? 0} h`;
  }
  if (input.mode === "level") return `Montée ${(input.rise_m ?? 0).toFixed(1)} m`;
  return `Capteur ${input.sensor_code ?? "—"}`;
}

export function createFloodCanvas(
  run: FloodSimulation,
  frameIndex: number,
  northUp: boolean,
  scale = 1,
): HTMLCanvasElement {
  const frame = run.frames[frameIndex];
  const depthCm = decodeDepthCm(frame?.depth_cm_b64 ?? run.depth_cm_b64);
  const possible = decodePossible(run.possible_b64);
  const pixels = buildFloodPixels(depthCm, possible, run.rows, run.cols, northUp);
  const factor = Math.max(1, Math.round(scale));
  const canvas = document.createElement("canvas");
  canvas.width = run.cols * factor;
  canvas.height = run.rows * factor;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Le navigateur ne permet pas de préparer la couche de simulation.");
  const image = context.createImageData(run.cols, run.rows);
  image.data.set(pixels);
  if (factor === 1) {
    context.putImageData(image, 0, 0);
    return canvas;
  }
  const source = document.createElement("canvas");
  source.width = run.cols;
  source.height = run.rows;
  const sourceContext = source.getContext("2d");
  if (!sourceContext) throw new Error("Le navigateur ne permet pas de préparer la couche de simulation.");
  sourceContext.putImageData(image, 0, 0);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}
