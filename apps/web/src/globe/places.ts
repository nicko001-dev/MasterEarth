/**
 * Lieux mondiaux du globe 3D.
 *
 * Le fichier `/geo/places.json` est produit par `scripts/build_geo_data.py`
 * (GeoNames `cities15000`, CC BY 4.0) : villes, capitales et métropoles du
 * monde entier, classées par population. Le globe n'en affiche qu'un
 * sous-ensemble selon la hauteur de caméra (niveau de détail), pour rester
 * lisible et fluide sans jamais dépendre d'un service de tuiles externe.
 */
import { distanceMeters } from "../services/geolocation";

export type Place = {
  name: string;
  lat: number;
  lon: number;
  population: number;
  countryCode: string;
  country: string;
  admin1: string;
  capital: boolean;
};

export type PlacesDataset = {
  places: Place[];
  attribution: string;
  generated: string;
};

export const PLACES_URL = "/geo/places.json";

type RawRow = unknown[];

function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Valide et convertit le JSON de lieux ; les lignes invalides sont ignorées. */
export function parsePlacesDataset(payload: unknown): PlacesDataset {
  const root = payload as {
    places?: unknown;
    attribution?: unknown;
    generated?: unknown;
  } | null;
  const rows = Array.isArray(root?.places) ? root.places : [];
  const places: Place[] = [];
  for (const row of rows as RawRow[]) {
    if (!Array.isArray(row) || row.length < 4) continue;
    const name = toString(row[0]).trim();
    const lat = toNumber(row[1], Number.NaN);
    const lon = toNumber(row[2], Number.NaN);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    places.push({
      name,
      lat,
      lon,
      population: Math.max(0, Math.round(toNumber(row[3]))),
      countryCode: toString(row[4]),
      country: toString(row[5]),
      admin1: toString(row[6]),
      capital: row[7] === true,
    });
  }
  return {
    places,
    attribution: toString(root?.attribution) || "GeoNames (CC BY 4.0)",
    generated: toString(root?.generated),
  };
}

let cache: Promise<PlacesDataset> | null = null;

/** Charge les lieux une seule fois (mise en cache HTTP + mémoire). */
export async function loadPlaces(fetcher: typeof fetch = fetch): Promise<PlacesDataset> {
  if (!cache) {
    cache = fetcher(PLACES_URL, { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Lieux indisponibles (${response.status}).`);
        return parsePlacesDataset(await response.json());
      })
      .catch((error: unknown) => {
        cache = null;
        throw error;
      });
  }
  return cache;
}

/** Réinitialise le cache mémoire (tests et changements de source). */
export function resetPlacesCache(): void {
  cache = null;
}

/**
 * Seuil de population minimal selon la hauteur de caméra (mètres).
 * Plus la caméra est haute, moins on affiche de lieux.
 */
export function populationFloor(heightM: number): number {
  if (!Number.isFinite(heightM)) return 8_000_000;
  if (heightM >= 12_000_000) return 12_000_000;
  if (heightM >= 6_000_000) return 5_000_000;
  if (heightM >= 3_000_000) return 2_000_000;
  if (heightM >= 1_500_000) return 500_000;
  if (heightM >= 700_000) return 150_000;
  if (heightM >= 300_000) return 40_000;
  if (heightM >= 120_000) return 10_000;
  return 0;
}

/** Nombre maximal de libellés simultanés selon la hauteur de caméra. */
export function labelBudget(heightM: number): number {
  if (!Number.isFinite(heightM)) return 45;
  if (heightM >= 12_000_000) return 40;
  if (heightM >= 6_000_000) return 60;
  if (heightM >= 3_000_000) return 110;
  if (heightM >= 1_500_000) return 200;
  if (heightM >= 700_000) return 280;
  if (heightM >= 300_000) return 380;
  if (heightM >= 120_000) return 450;
  return 600;
}

export type PlaceDetail = "capital" | "major" | "city" | "town";

export function placeDetail(place: Place): PlaceDetail {
  if (place.capital) return "capital";
  if (place.population >= 1_000_000) return "major";
  if (place.population >= 100_000) return "city";
  return "town";
}

/** Quartiers administratifs (arrondissements) qui doublonnent leur ville mère. */
const ARRONDISSEMENT = /\barrondissement\b|^(?:paris|lyon|marseille)\s+\d{1,2}\b/;

function isArrondissement(place: Place): boolean {
  return ARRONDISSEMENT.test(normalizePlaceName(place.name));
}

/**
 * Sélectionne les lieux visibles pour une hauteur de caméra donnée.
 * Les capitales et les plus grandes villes restent prioritaires ; le résultat
 * est trié par population décroissante pour stabiliser le rendu. Les
 * arrondissements (« Paris 04 Hôtel-de-Ville ») sont écartés tant que la vue
 * n'est pas au niveau du quartier : ils masquaient le nom de leur ville.
 */
export function selectVisiblePlaces(
  places: readonly Place[],
  heightM: number,
  limit = labelBudget(heightM),
): Place[] {
  const floor = populationFloor(heightM);
  const showArrondissements = heightM < 60_000;
  const selected = places.filter(
    (place) => (place.capital || place.population >= floor)
      && (showArrondissements || !isArrondissement(place)),
  );
  selected.sort((a, b) => {
    if (a.capital !== b.capital) return a.capital ? -1 : 1;
    return b.population - a.population;
  });
  return selected.slice(0, Math.max(0, limit));
}

/** Taille du libellé (px) selon la hauteur de caméra et l'importance du lieu. */
export function labelFontSize(place: Place, heightM: number): number {
  const detail = placeDetail(place);
  const base = detail === "capital" ? 15 : detail === "major" ? 14 : detail === "city" ? 13 : 12;
  if (!Number.isFinite(heightM)) return base;
  if (heightM > 4_000_000) return Math.max(11, base - 2);
  if (heightM > 1_000_000) return Math.max(11, base - 1);
  return base;
}

/** Distance maximale d'affichage du libellé, en mètres, selon le niveau. */
export function labelDistanceLimit(place: Place, heightM: number): number {
  const detail = placeDetail(place);
  const span = Math.max(60_000, heightM * 0.55);
  if (detail === "capital") return Math.min(1.6e7, span * 3.2);
  if (detail === "major") return Math.min(9e6, span * 2.4);
  if (detail === "city") return Math.min(3.2e6, span * 1.6);
  return Math.min(1.1e6, span);
}

const ACCENTS = /[\u0300-\u036f]/g;

/** Normalise pour la recherche : minuscules, sans accents, sans ponctuation. */
export function normalizePlaceName(value: string): string {
  return value
    .normalize("NFD")
    .replace(ACCENTS, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Recherche locale d'un lieu (utilisée par les commandes vocales « va à … »
 * et par l'assistant hors ligne). Le score privilégie la correspondance exacte,
 * puis le préfixe, puis la population.
 */
export function findPlace(
  places: readonly Place[],
  query: string,
  options: { preferCountry?: string } = {},
): Place | null {
  const needle = normalizePlaceName(query);
  if (!needle) return null;
  let best: Place | null = null;
  let bestScore = 0;
  for (const place of places) {
    const haystack = normalizePlaceName(place.name);
    if (!haystack) continue;
    let score = 0;
    if (haystack === needle) score = 1_000;
    else if (haystack.startsWith(needle)) score = 700 - Math.min(300, (haystack.length - needle.length) * 8);
    else if (haystack.includes(needle)) score = 400 - Math.min(200, (haystack.length - needle.length) * 4);
    else continue;
    if (options.preferCountry && place.countryCode === options.preferCountry) score += 60;
    score += Math.min(120, Math.log10(place.population + 10) * 18);
    if (score > bestScore) {
      bestScore = score;
      best = place;
    }
  }
  return best;
}

/**
 * Recherche locale de plusieurs lieux (barre de recherche de la carte).
 * Les correspondances exactes et les préfixes passent avant les simples
 * inclusions ; à pertinence égale, la population tranche. Le nom français des
 * exonymes est cherché en même temps que le nom GeoNames.
 */
export function searchPlaceList(
  places: readonly Place[],
  query: string,
  limit = 10,
): Place[] {
  const needle = normalizePlaceName(query);
  if (!needle) return [];
  const ranked: Array<{ place: Place; score: number }> = [];
  for (const place of places) {
    const candidates = [
      normalizePlaceName(place.name),
      normalizePlaceName(displayPlaceName(place)),
    ].filter(Boolean);
    let score = 0;
    for (const name of candidates) {
      if (name === needle) score = Math.max(score, 1_200);
      else if (name.startsWith(needle)) score = Math.max(score, 900);
      else if (name.split(" ").some((part) => part.startsWith(needle))) score = Math.max(score, 720);
      else if (name.includes(needle)) score = Math.max(score, 520);
    }
    if (!score) {
      const country = normalizePlaceName(place.country);
      const admin = normalizePlaceName(place.admin1);
      if (country === needle || admin === needle) score = 420;
      else if (country.startsWith(needle) || admin.startsWith(needle)) score = 320;
      else continue;
    }
    score += Math.min(140, Math.log10(place.population + 10) * 20);
    ranked.push({ place, score });
  }
  ranked.sort((a, b) =>
    b.score - a.score
    || b.place.population - a.place.population
    || a.place.name.localeCompare(b.place.name, "fr"));
  return ranked.slice(0, Math.max(1, limit)).map((entry) => entry.place);
}

/**
 * Lieu habité le plus proche d'une position (pour « où suis-je ? »).
 *
 * Un arrondissement ou un hameau peut être plus proche que la ville : quand
 * plusieurs lieux sont à distance comparable, la population la plus élevée est
 * retenue pour donner une réponse utile (« vous êtes à Paris »).
 */
export function nearestPlace(
  places: readonly Place[],
  position: { lat: number; lon: number },
): { place: Place; distanceM: number } | null {
  let closest: { place: Place; distanceM: number } | null = null;
  for (const place of places) {
    const distance = distanceMeters(position, place);
    if (!closest || distance < closest.distanceM) closest = { place, distanceM: distance };
  }
  if (!closest) return null;
  const tolerance = closest.distanceM * 1.6 + 2_000;
  let best = closest;
  for (const place of places) {
    if (place.population <= best.place.population) continue;
    const distance = distanceMeters(position, place);
    if (distance <= tolerance) {
      best = { place, distanceM: distance };
    }
  }
  return best;
}

/** Sous-titre lisible du lieu : « Côte d'Ivoire · Abidjan ». */
export function placeSubtitle(place: Place): string {
  return [place.country, place.admin1].filter((part) => part && part !== place.name).join(" · ");
}

/**
 * Exonymes français des grandes villes dont GeoNames ne fournit que le nom
 * anglais. Liste volontairement courte et limitée aux libellés les plus
 * visibles à l'échelle mondiale ; les autres noms sont affichés tels quels.
 */
export const FRENCH_CITY_EXONYMS: Readonly<Record<string, string>> = {
  "Brussels": "Bruxelles",
  "London": "Londres",
  "Moscow": "Moscou",
  "Cairo": "Le Caire",
  "Algiers": "Alger",
  "Vienna": "Vienne",
  "Warsaw": "Varsovie",
  "Lisbon": "Lisbonne",
  "Copenhagen": "Copenhague",
  "Geneva": "Genève",
  "Zurich": "Zurich",
  "Munich": "Munich",
  "Cologne": "Cologne",
  "Frankfurt am Main": "Francfort",
  "The Hague": "La Haye",
  "Athens": "Athènes",
  "Bucharest": "Bucarest",
  "Sofia": "Sofia",
  "Kyiv": "Kyiv",
  "Kiev": "Kyiv",
  "Minsk": "Minsk",
  "Beijing": "Pékin",
  "Shanghai": "Shanghai",
  "Seoul": "Séoul",
  "Pyongyang": "Pyongyang",
  "New Delhi": "New Delhi",
  "Riyadh": "Riyad",
  "Mecca": "La Mecque",
  "Tehran": "Téhéran",
  "Baghdad": "Bagdad",
  "Damascus": "Damas",
  "Beirut": "Beyrouth",
  "Amman": "Amman",
  "Jerusalem": "Jérusalem",
  "Kuwait City": "Koweït",
  "Addis Ababa": "Addis-Abeba",
  "Nairobi": "Nairobi",
  "Dar es Salaam": "Dar es Salam",
  "Johannesburg": "Johannesburg",
  "Cape Town": "Le Cap",
  "Mexico City": "Mexico",
  "Havana": "La Havane",
  "Brasília": "Brasilia",
  "Brasilia": "Brasilia",
  "Sao Paulo": "São Paulo",
  "São Paulo": "São Paulo",
  "Rio de Janeiro": "Rio de Janeiro",
  "Buenos Aires": "Buenos Aires",
  "New York City": "New York",
  "Washington, D.C.": "Washington",
  "Washington DC": "Washington",
  "Los Angeles": "Los Angeles",
  "San Francisco": "San Francisco",
  "Rome": "Rome",
  "Milan": "Milan",
  "Naples": "Naples",
  "Florence": "Florence",
  "Venice": "Venise",
  "Turin": "Turin",
  "Barcelona": "Barcelone",
  "Seville": "Séville",
  "Valencia": "Valence",
  "Marrakesh": "Marrakech",
  "Casablanca": "Casablanca",
  "Tunis": "Tunis",
  "Tripoli": "Tripoli",
  "Khartoum": "Khartoum",
  "Juba": "Djouba",
  "Brazzaville": "Brazzaville",
  "Kinshasa": "Kinshasa",
  "Bangkok": "Bangkok",
  "Jakarta": "Jakarta",
  "Manila": "Manille",
  "Singapore": "Singapour",
  "Kuala Lumpur": "Kuala Lumpur",
  "Sydney": "Sydney",
  "Melbourne": "Melbourne",
  "Wellington": "Wellington",
  "Reykjavík": "Reykjavik",
  "Reykjavik": "Reykjavik",
};

/** Nom affiché d'un lieu (nom français quand un exonyme est connu). */
export function displayPlaceName(place: Pick<Place, "name">): string {
  return FRENCH_CITY_EXONYMS[place.name] ?? place.name;
}
