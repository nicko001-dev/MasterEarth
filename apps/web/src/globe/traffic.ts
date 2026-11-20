/**
 * Trafic animé en temps réel (véhicules routiers et maritimes).
 *
 * Ce module ne contient aucune donnée « observée » : il transforme la
 * **géométrie réelle** des rues (OpenStreetMap, via l'API IntelliFlood) et des
 * routes maritimes entre ports en un flux de véhicules dont la position est une
 * fonction pure de l'heure courante. Deux conséquences :
 *
 *  - le mouvement est continu, y compris sans nouvelle requête réseau ;
 *  - deux onglets ouverts à la même heure affichent les mêmes positions.
 *
 * Le mouvement est un **modèle** (vitesse par classe de voie, espacement,
 * sens de circulation). Il ne représente ni embouteillage, ni incident, et
 * l'interface le dit explicitement : IntelliFlood n'invente pas d'observation
 * de trafic.
 */

export type RoadClass =
  | "motorway"
  | "trunk"
  | "primary"
  | "secondary"
  | "tertiary"
  | "residential"
  | "unclassified"
  | "living_street";

export type Road = {
  id: string;
  roadClass: RoadClass;
  /** 0 : double sens, 1 : sens du tracé, -1 : sens inverse. */
  oneway: number;
  maxSpeedKmh: number | null;
  /** Polyligne [lon, lat]. */
  points: Array<[number, number]>;
};

export type TrafficKind = "car" | "taxi" | "moto" | "truck" | "bus";

export type Vehicle = {
  id: string;
  kind: TrafficKind;
  lon: number;
  lat: number;
  /** Cap en degrés depuis le nord (0-360). */
  headingDeg: number;
  speedKmh: number;
};

export type Vessel = {
  id: string;
  lon: number;
  lat: number;
  headingDeg: number;
  /** Nom du port de départ, pour l'infobulle. */
  from: string;
  to: string;
};

const EARTH_RADIUS_M = 6_371_008.8;

/** Vitesse de croisière retenue par classe de voie, en km/h. */
const CRUISE_KMH: Record<RoadClass, number> = {
  motorway: 96,
  trunk: 78,
  primary: 58,
  secondary: 48,
  tertiary: 40,
  residential: 26,
  unclassified: 32,
  living_street: 16,
};

/** Espacement moyen entre deux véhicules, en mètres (densité visuelle). */
const SPACING_M: Record<RoadClass, number> = {
  motorway: 260,
  trunk: 230,
  primary: 190,
  secondary: 165,
  tertiary: 140,
  residential: 105,
  unclassified: 120,
  living_street: 90,
};

/** Répartition des véhicules, pondérée par classe de voie. */
const MIX_CITY: Array<[TrafficKind, number]> = [
  ["car", 0.52],
  ["taxi", 0.16],
  ["moto", 0.16],
  ["truck", 0.08],
  ["bus", 0.08],
];

const MIX_HIGHWAY: Array<[TrafficKind, number]> = [
  ["car", 0.58],
  ["truck", 0.3],
  ["bus", 0.06],
  ["taxi", 0.04],
  ["moto", 0.02],
];

/** Hachage FNV-1a : un identifiant de voie donne toujours le même décalage. */
export function hashString(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash >>> 0;
}

/** Nombre pseudo-aléatoire reproductible dans [0, 1). */
export function seededUnit(seed: number): number {
  let value = (seed + 0x6d2b79f5) >>> 0;
  value = Math.imul(value ^ (value >>> 15), value | 1) >>> 0;
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
}

export function distanceMeters(a: [number, number], b: [number, number]): number {
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDegrees(a: [number, number], b: [number, number]): number {
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export type PreparedRoad = {
  road: Road;
  /** Abscisse cumulée de chaque point, en mètres. */
  cumulative: number[];
  length: number;
  /** Nombre de véhicules visés sur cette voie. */
  vehicles: number;
  cruiseMs: number;
};

/**
 * Cache des voies préparées : la géométrie ne change pas entre deux images,
 * seules les positions avancent. Sans ce cache, chaque image recalculerait des
 * milliers de distances.
 */
const preparedCache = new WeakMap<Road, PreparedRoad>();

/** Prépare une voie une seule fois : distances, longueur et densité. */
export function prepareRoad(road: Road): PreparedRoad {
  const cached = preparedCache.get(road);
  if (cached) return cached;
  const cumulative = [0];
  for (let index = 1; index < road.points.length; index += 1) {
    cumulative.push(cumulative[index - 1] + distanceMeters(road.points[index - 1], road.points[index]));
  }
  const length = cumulative[cumulative.length - 1] ?? 0;
  const spacing = SPACING_M[road.roadClass] ?? 120;
  const cruiseKmh = Math.min(
    road.maxSpeedKmh ?? CRUISE_KMH[road.roadClass] ?? 40,
    (CRUISE_KMH[road.roadClass] ?? 40) * 1.35,
  );
  const prepared: PreparedRoad = {
    road,
    cumulative,
    length,
    vehicles: length < 25 ? 0 : Math.max(1, Math.round(length / spacing)),
    cruiseMs: (cruiseKmh * 1000) / 3600,
  };
  preparedCache.set(road, prepared);
  return prepared;
}

/** Point et cap à une abscisse donnée le long d'une voie préparée. */
export function pointAlong(prepared: PreparedRoad, distance: number): { lon: number; lat: number; headingDeg: number } {
  const { road, cumulative, length } = prepared;
  if (road.points.length === 0) return { lon: 0, lat: 0, headingDeg: 0 };
  if (road.points.length === 1 || length <= 0) {
    const [lon, lat] = road.points[0];
    return { lon, lat, headingDeg: 0 };
  }
  const target = Math.min(Math.max(0, distance), length);
  let index = 1;
  while (index < cumulative.length - 1 && cumulative[index] < target) index += 1;
  const start = road.points[index - 1];
  const end = road.points[index];
  const span = cumulative[index] - cumulative[index - 1] || 1;
  const ratio = Math.min(1, Math.max(0, (target - cumulative[index - 1]) / span));
  return {
    lon: start[0] + (end[0] - start[0]) * ratio,
    lat: start[1] + (end[1] - start[1]) * ratio,
    headingDeg: (bearingDegrees(start, end) + 360) % 360,
  };
}

function pickKind(seed: number, mix: Array<[TrafficKind, number]>): TrafficKind {
  const value = seededUnit(seed);
  let cumulative = 0;
  for (const [kind, weight] of mix) {
    cumulative += weight;
    if (value < cumulative) return kind;
  }
  return mix[0][0];
}

export type TrafficOptions = {
  /** Nombre maximal de véhicules produits (protection du rendu). */
  budget?: number;
  /** Hauteur de caméra : la densité baisse quand on s'éloigne. */
  cameraHeightM?: number;
};

/**
 * Construit les véhicules visibles à l'instant `nowMs`.
 *
 * La position est calculée à partir de l'heure absolue : le flux avance en
 * continu, sans accumulation d'erreur ni saut lors d'un rafraîchissement.
 */
export function buildTraffic(roads: Road[], nowMs: number, options: TrafficOptions = {}): Vehicle[] {
  const budget = options.budget ?? 700;
  if (!roads.length || budget <= 0) return [];
  const seconds = nowMs / 1000;
  const vehicles: Vehicle[] = [];

  for (const road of roads) {
    if (vehicles.length >= budget) break;
    const prepared = prepareRoad(road);
    if (!prepared.vehicles || prepared.length <= 0) continue;
    const mix = road.roadClass === "motorway" || road.roadClass === "trunk" ? MIX_HIGHWAY : MIX_CITY;
    const base = hashString(road.id);
    const spacing = prepared.length / prepared.vehicles;

    for (let index = 0; index < prepared.vehicles; index += 1) {
      if (vehicles.length >= budget) break;
      const seed = (base + index * 2_654_435_761) >>> 0;
      const jitter = 0.72 + seededUnit(seed) * 0.5;
      const speedMs = prepared.cruiseMs * jitter;
      const reverse = road.oneway === 0 ? index % 2 === 1 : road.oneway === -1;
      // Chaque véhicule démarre à sa place dans le flux, puis avance avec l'heure.
      const travel = (index * spacing + speedMs * seconds) % prepared.length;
      const distance = reverse ? prepared.length - travel : travel;
      const point = pointAlong(prepared, distance);
      vehicles.push({
        id: `${road.id}-${index}`,
        kind: pickKind(seed, mix),
        lon: point.lon,
        lat: point.lat,
        headingDeg: (point.headingDeg + (reverse ? 180 : 0)) % 360,
        speedKmh: Math.round(speedMs * 3.6),
      });
    }
  }
  return vehicles;
}

/** Opacité et activation du trafic routier selon l'altitude de la caméra. */
export function trafficVisibility(heightM: number): number {
  if (!Number.isFinite(heightM) || heightM <= 0) return 0;
  if (heightM <= 45_000) return 1;
  if (heightM >= 650_000) return 0;
  return 1 - (heightM - 45_000) / (650_000 - 45_000);
}

/**
 * Ports retenus pour le trafic maritime modélisé.
 *
 * Ce sont de vrais ports, avec leurs coordonnées publiques. Les liaisons
 * relient chaque port à son voisin le plus proche : la forme des routes suit
 * donc la géographie réelle des bassins maritimes.
 */
export const PORTS: Array<{ name: string; lon: number; lat: number }> = [
  { name: "Abidjan", lon: -4.02, lat: 5.3 },
  { name: "Tema", lon: 0.02, lat: 5.63 },
  { name: "Lagos", lon: 3.39, lat: 6.45 },
  { name: "Douala", lon: 9.7, lat: 4.05 },
  { name: "Dakar", lon: -17.43, lat: 14.68 },
  { name: "Casablanca", lon: -7.62, lat: 33.6 },
  { name: "Tanger Med", lon: -5.5, lat: 35.88 },
  { name: "Alger", lon: 3.06, lat: 36.77 },
  { name: "Tunis", lon: 10.3, lat: 36.8 },
  { name: "Alexandrie", lon: 29.88, lat: 31.2 },
  { name: "Port-Saïd", lon: 32.3, lat: 31.26 },
  { name: "Djeddah", lon: 39.18, lat: 21.48 },
  { name: "Djibouti", lon: 43.15, lat: 11.6 },
  { name: "Mombasa", lon: 39.65, lat: -4.06 },
  { name: "Durban", lon: 31.03, lat: -29.87 },
  { name: "Le Cap", lon: 18.43, lat: -33.91 },
  { name: "Dubaï", lon: 55.3, lat: 25.27 },
  { name: "Mascate", lon: 58.56, lat: 23.62 },
  { name: "Karachi", lon: 66.99, lat: 24.86 },
  { name: "Mumbai", lon: 72.84, lat: 18.94 },
  { name: "Colombo", lon: 79.85, lat: 6.95 },
  { name: "Singapour", lon: 103.84, lat: 1.26 },
  { name: "Port Klang", lon: 101.36, lat: 3.0 },
  { name: "Jakarta", lon: 106.88, lat: -6.1 },
  { name: "Manille", lon: 120.98, lat: 14.59 },
  { name: "Hong Kong", lon: 114.17, lat: 22.3 },
  { name: "Shanghai", lon: 121.49, lat: 31.23 },
  { name: "Busan", lon: 129.04, lat: 35.1 },
  { name: "Tokyo", lon: 139.79, lat: 35.62 },
  { name: "Sydney", lon: 151.21, lat: -33.86 },
  { name: "Melbourne", lon: 144.92, lat: -37.84 },
  { name: "Auckland", lon: 174.77, lat: -36.84 },
  { name: "Los Angeles", lon: -118.27, lat: 33.74 },
  { name: "Oakland", lon: -122.28, lat: 37.79 },
  { name: "Seattle", lon: -122.33, lat: 47.6 },
  { name: "Vancouver", lon: -123.11, lat: 49.29 },
  { name: "New York", lon: -74.04, lat: 40.67 },
  { name: "Savannah", lon: -81.09, lat: 32.08 },
  { name: "Miami", lon: -80.18, lat: 25.77 },
  { name: "Houston", lon: -95.27, lat: 29.73 },
  { name: "Veracruz", lon: -96.13, lat: 19.2 },
  { name: "Carthagène", lon: -75.53, lat: 10.39 },
  { name: "Callao", lon: -77.15, lat: -12.05 },
  { name: "Valparaiso", lon: -71.62, lat: -33.03 },
  { name: "Santos", lon: -46.31, lat: -23.96 },
  { name: "Rio de Janeiro", lon: -43.17, lat: -22.9 },
  { name: "Buenos Aires", lon: -58.37, lat: -34.6 },
  { name: "Montevideo", lon: -56.21, lat: -34.9 },
  { name: "Rotterdam", lon: 4.14, lat: 51.95 },
  { name: "Anvers", lon: 4.4, lat: 51.26 },
  { name: "Hambourg", lon: 9.98, lat: 53.54 },
  { name: "Le Havre", lon: 0.11, lat: 49.48 },
  { name: "Londres", lon: 0.05, lat: 51.5 },
  { name: "Lisbonne", lon: -9.42, lat: 38.7 },
  { name: "Gênes", lon: 8.93, lat: 44.41 },
  { name: "Marseille", lon: 5.37, lat: 43.3 },
  { name: "Barcelone", lon: 2.17, lat: 41.35 },
  { name: "Valence", lon: -0.32, lat: 39.45 },
  { name: "Le Pirée", lon: 23.63, lat: 37.94 },
  { name: "Istanbul", lon: 28.97, lat: 41.02 },
  { name: "Odessa", lon: 30.73, lat: 46.48 },
  { name: "Reykjavik", lon: -21.94, lat: 64.15 },
  { name: "Las Palmas", lon: -15.42, lat: 28.13 },
];

type Lane = { from: number; to: number; lengthM: number; boats: number };

let laneCache: Lane[] | null = null;

/** Relie chaque port à son voisin le plus proche (liaisons symétriques). */
function lanes(): Lane[] {
  if (laneCache) return laneCache;
  const pairs = new Map<string, Lane>();
  PORTS.forEach((port, index) => {
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    PORTS.forEach((other, otherIndex) => {
      if (otherIndex === index) return;
      const distance = distanceMeters([port.lon, port.lat], [other.lon, other.lat]);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = otherIndex;
      }
    });
    if (best < 0 || bestDistance < 80_000) return;
    const key = index < best ? `${index}-${best}` : `${best}-${index}`;
    if (pairs.has(key)) return;
    pairs.set(key, {
      from: Math.min(index, best),
      to: Math.max(index, best),
      lengthM: bestDistance,
      boats: Math.max(1, Math.min(5, Math.round(bestDistance / 260_000))),
    });
  });
  laneCache = [...pairs.values()];
  return laneCache;
}

/** Réinitialise le cache des liaisons (tests uniquement). */
export function resetLanes(): void {
  laneCache = null;
}

/**
 * Bateaux modélisés : ils font la navette entre deux ports voisins.
 * Vitesse de croisière réaliste (12 nœuds), position fonction de l'heure.
 */
export function buildSeaTraffic(nowMs: number, budget = 260): Vessel[] {
  const seconds = nowMs / 1000;
  const vessels: Vessel[] = [];
  for (const lane of lanes()) {
    const start = PORTS[lane.from];
    const end = PORTS[lane.to];
    const speedMs = 6.2;
    const crossing = lane.lengthM / speedMs;
    for (let index = 0; index < lane.boats; index += 1) {
      if (vessels.length >= budget) return vessels;
      const seed = hashString(`${start.name}-${end.name}-${index}`);
      const offset = seededUnit(seed) * crossing;
      const phase = ((seconds + offset) % (crossing * 2)) / crossing;
      const forward = phase < 1;
      const ratio = forward ? phase : 2 - phase;
      // Léger décalage latéral pour que les bateaux ne se superposent pas.
      const lateral = (seededUnit(seed + 7) - 0.5) * 0.045;
      const lon = start.lon + (end.lon - start.lon) * ratio + lateral;
      const lat = start.lat + (end.lat - start.lat) * ratio + lateral * 0.5;
      vessels.push({
        id: `navire-${lane.from}-${lane.to}-${index}`,
        lon,
        lat,
        headingDeg: (bearingDegrees(
          [start.lon, start.lat],
          [end.lon, end.lat],
        ) + (forward ? 0 : 180) + 360) % 360,
        from: forward ? start.name : end.name,
        to: forward ? end.name : start.name,
      });
    }
  }
  return vessels;
}

/**
 * Visibilité des navires.
 *
 * Ils restent visibles en vue mondiale : à l'ouverture du globe, ce sont avec
 * les avions et les flux les seuls objets réellement animés. On réduit juste
 * leur opacité pour ne pas surcharger la lecture des continents.
 */
export function seaTrafficVisibility(heightM: number): number {
  if (!Number.isFinite(heightM) || heightM <= 0) return 0.6;
  if (heightM <= 900_000) return 1;
  if (heightM >= 4_000_000) return 0.62;
  return 1 - ((heightM - 900_000) / (4_000_000 - 900_000)) * 0.38;
}

/**
 * Métropoles réelles servant de nœuds aux flux de la vue mondiale.
 *
 * Ce ne sont pas des routes observées : à l'échelle du globe, un véhicule est
 * invisible et aucun fournisseur ne donne un trafic routier mondial en direct.
 * Les liaisons relient des villes réelles et l'animation est **un modèle
 * accéléré**, explicitement signalé dans l'interface. Dès que la caméra
 * descend, ce calque laisse la place aux véhicules sur les vraies rues OSM.
 */
export const GLOBAL_HUBS: Array<{ name: string; lon: number; lat: number }> = [
  { name: "Paris", lon: 2.35, lat: 48.86 },
  { name: "Londres", lon: -0.13, lat: 51.51 },
  { name: "Madrid", lon: -3.7, lat: 40.42 },
  { name: "Berlin", lon: 13.4, lat: 52.52 },
  { name: "Rome", lon: 12.5, lat: 41.9 },
  { name: "Istanbul", lon: 28.98, lat: 41.01 },
  { name: "Moscou", lon: 37.62, lat: 55.75 },
  { name: "Le Caire", lon: 31.24, lat: 30.04 },
  { name: "Lagos", lon: 3.38, lat: 6.52 },
  { name: "Abidjan", lon: -4.01, lat: 5.36 },
  { name: "Nairobi", lon: 36.82, lat: -1.29 },
  { name: "Johannesburg", lon: 28.05, lat: -26.2 },
  { name: "Casablanca", lon: -7.59, lat: 33.57 },
  { name: "Dubai", lon: 55.27, lat: 25.2 },
  { name: "Riyad", lon: 46.72, lat: 24.71 },
  { name: "Téhéran", lon: 51.39, lat: 35.69 },
  { name: "Mumbai", lon: 72.88, lat: 19.08 },
  { name: "Delhi", lon: 77.21, lat: 28.61 },
  { name: "Bangkok", lon: 100.5, lat: 13.76 },
  { name: "Singapour", lon: 103.82, lat: 1.35 },
  { name: "Jakarta", lon: 106.85, lat: -6.21 },
  { name: "Hong Kong", lon: 114.17, lat: 22.32 },
  { name: "Shanghai", lon: 121.47, lat: 31.23 },
  { name: "Pékin", lon: 116.4, lat: 39.9 },
  { name: "Séoul", lon: 126.98, lat: 37.57 },
  { name: "Tokyo", lon: 139.69, lat: 35.68 },
  { name: "Sydney", lon: 151.21, lat: -33.87 },
  { name: "Melbourne", lon: 144.96, lat: -37.81 },
  { name: "Auckland", lon: 174.76, lat: -36.85 },
  { name: "New York", lon: -74.01, lat: 40.71 },
  { name: "Toronto", lon: -79.38, lat: 43.65 },
  { name: "Chicago", lon: -87.63, lat: 41.88 },
  { name: "Los Angeles", lon: -118.24, lat: 34.05 },
  { name: "San Francisco", lon: -122.42, lat: 37.77 },
  { name: "Mexico", lon: -99.13, lat: 19.43 },
  { name: "Bogota", lon: -74.07, lat: 4.71 },
  { name: "Lima", lon: -77.04, lat: -12.05 },
  { name: "Santiago", lon: -70.67, lat: -33.45 },
  { name: "Buenos Aires", lon: -58.38, lat: -34.6 },
  { name: "São Paulo", lon: -46.63, lat: -23.55 },
  { name: "Rio", lon: -43.2, lat: -22.91 },
];

export type WorldFlowPoint = {
  id: string;
  kind: TrafficKind;
  lon: number;
  lat: number;
  headingDeg: number;
  from: string;
  to: string;
};

type Corridor = { from: number; to: number; lengthM: number };

let corridorCache: Corridor[] | null = null;

/** Deux voisins proches par ville, sans franchissement d'antiméridien. */
export function globalCorridors(): Corridor[] {
  if (corridorCache) return corridorCache;
  const pairs = new Map<string, Corridor>();
  GLOBAL_HUBS.forEach((hub, index) => {
    const neighbours = GLOBAL_HUBS
      .map((other, otherIndex) => ({
        otherIndex,
        distance: distanceMeters([hub.lon, hub.lat], [other.lon, other.lat]),
        lonGap: Math.abs(hub.lon - other.lon),
      }))
      .filter((candidate) =>
        candidate.otherIndex !== index
        && candidate.distance > 120_000
        && candidate.distance < 4_200_000
        && candidate.lonGap < 120,
      )
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 2);
    for (const neighbour of neighbours) {
      const key = index < neighbour.otherIndex
        ? `${index}-${neighbour.otherIndex}`
        : `${neighbour.otherIndex}-${index}`;
      if (pairs.has(key)) continue;
      pairs.set(key, {
        from: Math.min(index, neighbour.otherIndex),
        to: Math.max(index, neighbour.otherIndex),
        lengthM: neighbour.distance,
      });
    }
  });
  corridorCache = [...pairs.values()];
  return corridorCache;
}

/** Réinitialise le cache des corridors (tests uniquement). */
export function resetCorridors(): void {
  corridorCache = null;
}

/**
 * Flux animés de la vue mondiale : position fonction pure de l'heure.
 *
 * La vitesse est accélérée pour que le déplacement soit perceptible à
 * l'échelle d'un continent ; ce n'est ni une observation ni une prévision de
 * trafic, et l'interface le dit explicitement.
 */
export function buildWorldFlow(nowMs: number, budget = 320): WorldFlowPoint[] {
  const seconds = nowMs / 1000;
  const kinds: TrafficKind[] = ["car", "taxi", "truck", "bus", "moto"];
  const flow: WorldFlowPoint[] = [];
  for (const corridor of globalCorridors()) {
    const start = GLOBAL_HUBS[corridor.from];
    const end = GLOBAL_HUBS[corridor.to];
    // ~1 100 km/h visuels : une liaison de 1 000 km est parcourue en ~55 min.
    const speedMs = 305;
    const crossing = Math.max(60, corridor.lengthM / speedMs);
    const count = Math.max(2, Math.min(7, Math.round(corridor.lengthM / 420_000)));
    for (let index = 0; index < count; index += 1) {
      if (flow.length >= budget) return flow;
      const seed = hashString(`${start.name}-${end.name}-${index}`);
      const offset = seededUnit(seed) * crossing;
      const phase = ((seconds + offset) % (crossing * 2)) / crossing;
      const forward = phase < 1;
      const ratio = forward ? phase : 2 - phase;
      const lateral = (seededUnit(seed + 11) - 0.5) * 0.9;
      flow.push({
        id: `flux-${corridor.from}-${corridor.to}-${index}`,
        kind: kinds[Math.floor(seededUnit(seed + 3) * kinds.length) % kinds.length],
        lon: start.lon + (end.lon - start.lon) * ratio + lateral,
        lat: start.lat + (end.lat - start.lat) * ratio + lateral * 0.45,
        headingDeg: (bearingDegrees(
          [start.lon, start.lat],
          [end.lon, end.lat],
        ) + (forward ? 0 : 180) + 360) % 360,
        from: forward ? start.name : end.name,
        to: forward ? end.name : start.name,
      });
    }
  }
  return flow;
}

/** Le flux mondial prend le relais quand les rues OSM ne sont plus lisibles. */
export function worldFlowVisibility(heightM: number): number {
  if (!Number.isFinite(heightM) || heightM <= 0) return 0;
  if (heightM <= 650_000) return 0;
  if (heightM >= 2_500_000) return 0.9;
  return ((heightM - 650_000) / (2_500_000 - 650_000)) * 0.9;
}

/** Charge utile de l'API → voies exploitables. */
export function parseRoadsPayload(payload: unknown): Road[] {
  if (!payload || typeof payload !== "object") return [];
  const raw = (payload as { roads?: unknown }).roads;
  if (!Array.isArray(raw)) return [];
  const roads: Road[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as { id?: unknown; class?: unknown; oneway?: unknown; max_speed_kmh?: unknown; points?: unknown };
    const roadClass = typeof record.class === "string" ? (record.class as RoadClass) : null;
    if (!roadClass || !(roadClass in CRUISE_KMH)) continue;
    if (!Array.isArray(record.points)) continue;
    const points: Array<[number, number]> = [];
    for (const point of record.points) {
      if (!Array.isArray(point) || point.length < 2) continue;
      const lon = Number(point[0]);
      const lat = Number(point[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      points.push([lon, lat]);
    }
    if (points.length < 2) continue;
    const onewayRaw = Number(record.oneway);
    roads.push({
      id: typeof record.id === "string" ? record.id : String(roads.length),
      roadClass,
      oneway: onewayRaw === 1 ? 1 : onewayRaw === -1 ? -1 : 0,
      maxSpeedKmh: Number.isFinite(Number(record.max_speed_kmh)) ? Number(record.max_speed_kmh) : null,
      points,
    });
  }
  return roads;
}

/** Couleurs des véhicules, partagées par le globe 3D et la carte 2D. */
export const TRAFFIC_COLORS: Record<TrafficKind, string> = {
  car: "#ffd166",
  taxi: "#ffe08a",
  moto: "#b39ddb",
  truck: "#ff8a65",
  bus: "#4fc3f7",
};

/** Sprite SVG d'un véhicule vu du dessus, pointe vers le nord. */
export function vehicleSprite(kind: TrafficKind): string {
  const color = TRAFFIC_COLORS[kind];
  const body = kind === "truck"
    ? '<rect x="5" y="1" width="6" height="7" rx="1"/><rect x="4" y="8.5" width="8" height="5" rx="1"/>'
    : kind === "bus"
      ? '<rect x="4" y="1" width="8" height="13" rx="2"/>'
      : kind === "moto"
        ? '<ellipse cx="8" cy="8" rx="1.6" ry="3.2"/>'
        : '<rect x="5" y="1.5" width="6" height="12" rx="2.4"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
<g fill="${color}" stroke="rgba(4,14,24,0.85)" stroke-width="1">${body}</g>
<circle cx="8" cy="${kind === "moto" ? 5.4 : 4.2}" r="1" fill="rgba(4,14,24,0.55)"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Sprite SVG d'un navire vu du dessus, pointe vers le nord. */
export function vesselSprite(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
<path d="M9 1.2 L13.4 12 L9 15.6 L4.6 12 Z" fill="#4dd0e1" stroke="rgba(4,14,24,0.85)" stroke-width="1"/>
<path d="M9 16.6 L9 17.4" stroke="#4dd0e1" stroke-width="1.4" stroke-linecap="round" opacity="0.75"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
