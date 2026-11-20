/**
 * Délimitations mondiales du globe 3D : frontières des pays et limites
 * administratives de premier niveau (régions, provinces, États).
 *
 * Les fichiers `/geo/countries.geojson` et `/geo/admin1.geojson` sont produits
 * par `scripts/build_geo_data.py` à partir de Natural Earth (domaine public).
 * Ils sont chargés à la demande, simplifiés pour le rendu, puis dessinés en
 * polylignes vectorielles : le tracé reste net à tous les niveaux de zoom,
 * contrairement à un fond raster ou à un libellé incrusté dans une tuile.
 */

export type Ring = [number, number][];

export type Bounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type GeoFeature = {
  name: string;
  country: string;
  rings: Ring[];
  bounds: Bounds;
  /** Aire approximative en degrés carrés, pour choisir le polygone principal. */
  area: number;
  anchor: [number, number];
};

export const COUNTRIES_URL = "/geo/countries.geojson";
export const ADMIN1_URL = "/geo/admin1.geojson";

export type Geometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] }
  | { type: string; coordinates: unknown };

type RawFeature = {
  type?: string;
  properties?: Record<string, unknown> | null;
  geometry?: Geometry | null;
};

function isPosition(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length >= 2
    && typeof value[0] === "number"
    && typeof value[1] === "number"
    && Number.isFinite(value[0])
    && Number.isFinite(value[1]);
}

function ringArea(ring: Ring): number {
  let sum = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** Centroïde d'un anneau (moyenne pondérée par l'aire, approximation planaire). */
function ringCentroid(ring: Ring): [number, number] {
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(twiceArea) < 1e-9) {
    const lon = ring.reduce((sum, point) => sum + point[0], 0) / Math.max(1, ring.length);
    const lat = ring.reduce((sum, point) => sum + point[1], 0) / Math.max(1, ring.length);
    return [lon, lat];
  }
  return [cx / (3 * twiceArea), cy / (3 * twiceArea)];
}

function computeBounds(rings: Ring[]): Bounds {
  let west = 180;
  let south = 90;
  let east = -180;
  let north = -90;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lon < west) west = lon;
      if (lon > east) east = lon;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }
  return { west, south, east, north };
}

function geometryRings(geometry: Geometry | null | undefined): Ring[] {
  if (!geometry || !Array.isArray(geometry.coordinates)) return [];
  const rings: Ring[] = [];
  const pushRing = (candidate: unknown) => {
    if (!Array.isArray(candidate)) return;
    const ring: Ring = candidate.filter(isPosition).map((point) => [point[0], point[1]]);
    if (ring.length >= 3) rings.push(ring);
  };
  if (geometry.type === "Polygon") {
    for (const ring of (geometry.coordinates as unknown[][])) pushRing(ring);
  } else if (geometry.type === "MultiPolygon") {
    for (const polygon of (geometry.coordinates as unknown[][])) {
      if (!Array.isArray(polygon)) continue;
      // Seul l'anneau extérieur est dessiné : les trous n'apportent rien au
      // trait de frontière et coûtent des sommets.
      pushRing(polygon[0]);
    }
  }
  return rings;
}

/** Convertit un GeoJSON en frontières exploitables ; les entrées invalides sont exclues. */
export function parseBorderFeatures(
  payload: unknown,
  options: { nameKey?: string; countryKey?: string } = {},
): GeoFeature[] {
  const root = payload as { features?: unknown } | null;
  if (!root || !Array.isArray(root.features)) return [];
  const nameKey = options.nameKey ?? "name";
  const countryKey = options.countryKey ?? "country";
  const features: GeoFeature[] = [];
  for (const raw of root.features as RawFeature[]) {
    if (!raw || typeof raw !== "object") continue;
    const properties = raw.properties ?? {};
    const name = typeof properties[nameKey] === "string" ? String(properties[nameKey]) : "";
    if (!name) continue;
    const rings = geometryRings(raw.geometry);
    if (!rings.length) continue;
    const area = rings.reduce((total, ring) => total + ringArea(ring), 0);
    if (area <= 0) continue;
    const mainRing = rings.reduce((best, ring) => (ringArea(ring) > ringArea(best) ? ring : best), rings[0]);
    const country = typeof properties[countryKey] === "string" ? String(properties[countryKey]) : "";
    features.push({
      name,
      country,
      rings,
      bounds: computeBounds(rings),
      area,
      anchor: ringCentroid(mainRing),
    });
  }
  return features;
}

let countriesCache: Promise<GeoFeature[]> | null = null;
let admin1Cache: Promise<GeoFeature[]> | null = null;

async function loadGeoJson(
  url: string,
  fetcher: typeof fetch,
  options: { nameKey: string; countryKey: string },
): Promise<GeoFeature[]> {
  const response = await fetcher(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`Délimitations indisponibles (${response.status}).`);
  return parseBorderFeatures(await response.json(), options);
}

export function loadCountries(fetcher: typeof fetch = fetch): Promise<GeoFeature[]> {
  if (!countriesCache) {
    countriesCache = loadGeoJson(COUNTRIES_URL, fetcher, {
      nameKey: "name",
      countryKey: "iso_a2",
    }).catch((error: unknown) => {
      countriesCache = null;
      throw error;
    });
  }
  return countriesCache;
}

export function loadAdmin1(fetcher: typeof fetch = fetch): Promise<GeoFeature[]> {
  if (!admin1Cache) {
    admin1Cache = loadGeoJson(ADMIN1_URL, fetcher, {
      nameKey: "name",
      countryKey: "country",
    }).catch((error: unknown) => {
      admin1Cache = null;
      throw error;
    });
  }
  return admin1Cache;
}

export function resetBorderCaches(): void {
  countriesCache = null;
  admin1Cache = null;
}

/** Deux emprises se chevauchent-elles ? Gère le passage de l'antiméridien. */
export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  const latitudeOverlap = a.south <= b.north && a.north >= b.south;
  if (!latitudeOverlap) return false;
  const aCrosses = a.west > a.east;
  const bCrosses = b.west > b.east;
  const lonOverlap = (start1: number, end1: number, start2: number, end2: number) =>
    Math.max(start1, start2) <= Math.min(end1, end2);
  if (!aCrosses && !bCrosses) return lonOverlap(a.west, a.east, b.west, b.east);
  if (aCrosses && bCrosses) return true;
  const crossing = aCrosses ? a : b;
  const normal = aCrosses ? b : a;
  return lonOverlap(crossing.west, 180, normal.west, normal.east)
    || lonOverlap(-180, crossing.east, normal.west, normal.east);
}

/** Réduit un anneau à `maxPoints` sommets en conservant sa forme générale. */
export function decimateRing(ring: Ring, maxPoints: number): Ring {
  if (ring.length <= maxPoints || maxPoints < 3) return ring;
  const stride = Math.ceil(ring.length / maxPoints);
  const result: Ring = [];
  for (let index = 0; index < ring.length; index += stride) result.push(ring[index]);
  const last = ring[ring.length - 1];
  if (result[result.length - 1] !== last) result.push(last);
  return result;
}

export type BorderSelection = {
  countries: GeoFeature[];
  admin1: GeoFeature[];
};

/**
 * Choisit les frontières à dessiner selon la hauteur de caméra et l'emprise
 * visible. Les limites administratives n'apparaissent qu'en vue rapprochée et
 * sont plafonnées pour préserver la fluidité du rendu.
 */
export function selectBorders(
  heightM: number,
  view: Bounds | null,
  data: { countries: GeoFeature[]; admin1: GeoFeature[] },
  options: { admin1Limit?: number } = {},
): BorderSelection {
  const admin1Budget = options.admin1Limit ?? 900;
  const showCountries = heightM < 14_000_000;
  const showAdmin1 = heightM < 2_200_000;
  const inView = (feature: GeoFeature) => !view || boundsIntersect(feature.bounds, view);
  const countries = showCountries
    ? data.countries.filter(inView)
    : [];
  let admin1: GeoFeature[] = [];
  if (showAdmin1) {
    const candidates = data.admin1.filter(inView);
    // Les plus grandes régions d'abord : ce sont celles qui structurent la carte.
    candidates.sort((a, b) => b.area - a.area);
    admin1 = candidates.slice(0, admin1Budget);
  }
  const pointBudget = 45_000;
  let points = 0;
  const cap = (features: GeoFeature[], maxRingPoints: number) => features.filter((feature) => {
    if (points > pointBudget) return false;
    points += feature.rings.reduce((total, ring) => total + Math.min(ring.length, maxRingPoints), 0);
    return true;
  });
  return {
    countries: cap(countries, 900),
    admin1: cap(admin1, 400),
  };
}

/** Points d'ancrage des libellés de pays (un par pays, au centre du territoire). */
export function countryLabelAnchors(features: readonly GeoFeature[]): GeoFeature[] {
  return features.filter((feature) => feature.area > 0.02 && Math.abs(feature.anchor[1]) < 85);
}
