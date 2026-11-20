import { afterEach, describe, expect, it, vi } from "vitest";
import {
  displayPlaceName,
  findPlace,
  labelBudget,
  loadPlaces,
  nearestPlace,
  normalizePlaceName,
  parsePlacesDataset,
  Place,
  placeDetail,
  populationFloor,
  resetPlacesCache,
  searchPlaceList,
  selectVisiblePlaces,
} from "./places";

const row = (
  name: string,
  lat: number,
  lon: number,
  population: number,
  country = "France",
  admin1 = "",
  capital = false,
) => [name, lat, lon, population, "FR", country, admin1, capital] as const;

const places: Place[] = parsePlacesDataset({
  attribution: "GeoNames (CC BY 4.0)",
  generated: "2026-11-04",
  places: [
    row("Paris", 48.8566, 2.3522, 2_138_551, "France", "Île-de-France", true),
    row("Lyon", 45.764, 4.8357, 472_317, "France", "Auvergne-Rhône-Alpes"),
    row("Abidjan", 5.36, -4.01, 4_980_000, "Côte d'Ivoire", "Abidjan", true),
    row("Tokyo", 35.6895, 139.6917, 8_336_599, "Japon", "Tokyo", true),
    row("Petite-Ville", 44.1, 5.2, 900),
  ],
}).places;

afterEach(() => {
  resetPlacesCache();
  vi.unstubAllGlobals();
});

describe("lecture du jeu de lieux", () => {
  it("convertit les lignes valides et ignore les lignes invalides", () => {
    const dataset = parsePlacesDataset({
      attribution: "GeoNames (CC BY 4.0)",
      generated: "2026-11-04",
      places: [
        ["Paris", 48.8566, 2.3522, 2_138_551, "FR", "France", "Île-de-France", true],
        ["Sans coordonnées", "x", 2],
        ["Hors bornes", 99, 0, 10],
        [null, 1, 1, 1],
      ],
    });
    expect(dataset.places).toHaveLength(1);
    expect(dataset.places[0]).toMatchObject({ name: "Paris", lat: 48.8566, capital: true });
    expect(dataset.attribution).toContain("GeoNames");
  });

  it("charge une seule fois le fichier de lieux", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ places: [row("Paris", 48.85, 2.35, 2_000_000)] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const first = await loadPlaces(fetchMock as unknown as typeof fetch);
    const second = await loadPlaces(fetchMock as unknown as typeof fetch);
    expect(first.places).toHaveLength(1);
    expect(second.places).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("niveau de détail", () => {
  it("réduit le seuil de population quand la caméra descend", () => {
    expect(populationFloor(23_000_000)).toBeGreaterThan(populationFloor(1_000_000));
    expect(populationFloor(50_000)).toBe(0);
    expect(labelBudget(23_000_000)).toBeLessThan(labelBudget(200_000));
  });

  it("garde toujours les capitales, même très zoomées en arrière", () => {
    const world = selectVisiblePlaces(places, 23_000_000);
    expect(world.map((place) => place.name)).toContain("Paris");
    expect(world.map((place) => place.name)).toContain("Abidjan");
    expect(world.map((place) => place.name)).not.toContain("Petite-Ville");
  });

  it("affiche les petites villes en vue rapprochée", () => {
    const close = selectVisiblePlaces(places, 60_000);
    expect(close.map((place) => place.name)).toContain("Petite-Ville");
    expect(close.length).toBeLessThanOrEqual(labelBudget(60_000));
  });

  it("classe les lieux par importance et respecte la limite", () => {
    const selected = selectVisiblePlaces(places, 60_000, 2);
    expect(selected).toHaveLength(2);
    expect(selected[0].capital).toBe(true);
  });

  it("décrit le détail d'un lieu", () => {
    expect(placeDetail(places[0])).toBe("capital");
    expect(placeDetail(places[1])).toBe("city");
    expect(placeDetail({ ...places[1], population: 2_000_000, capital: false })).toBe("major");
  });

  it("écarte les arrondissements qui masquent leur ville", () => {
    const withArrondissements = [
      ...places,
      { ...places[0], name: "Paris 04 Hôtel-de-Ville", population: 96_000, capital: false },
      { ...places[0], name: "Lyon 03", population: 100_000, capital: false },
    ];
    const wide = selectVisiblePlaces(withArrondissements, 900_000);
    expect(wide.map((place) => place.name)).not.toContain("Paris 04 Hôtel-de-Ville");
    expect(wide.map((place) => place.name)).not.toContain("Lyon 03");
    const close = selectVisiblePlaces(withArrondissements, 20_000);
    expect(close.map((place) => place.name)).toContain("Paris 04 Hôtel-de-Ville");
  });
});

describe("recherche et proximité", () => {
  it("retrouve un lieu sans tenir compte des accents et de la casse", () => {
    expect(findPlace(places, "paris")?.name).toBe("Paris");
    expect(findPlace(places, "ABIDJAN")?.name).toBe("Abidjan");
    expect(findPlace(places, "tokyo")?.name).toBe("Tokyo");
    expect(findPlace(places, "zzz")).toBeNull();
  });

  it("privilégie la correspondance exacte", () => {
    const withPrefix = [...places, { ...places[2], name: "Abidjan-Sud", population: 9_000_000 }];
    expect(findPlace(withPrefix, "abidjan")?.name).toBe("Abidjan");
  });

  it("trouve le lieu habité le plus proche d'une position", () => {
    const near = nearestPlace(places, { lat: 5.3, lon: -4.0 });
    expect(near?.place.name).toBe("Abidjan");
    expect(near?.distanceM).toBeLessThan(20_000);
  });

  it("préfère la grande ville à un quartier plus proche", () => {
    const withDistrict = [
      ...places,
      { ...places[0], name: "Paris 04 Hôtel-de-Ville", lat: 48.8556, lon: 2.3522, population: 96_000, capital: false },
    ];
    const near = nearestPlace(withDistrict, { lat: 48.8566, lon: 2.3522 });
    expect(near?.place.name).toBe("Paris");
  });

  it("affiche les exonymes français des grandes villes", () => {
    expect(displayPlaceName({ name: "London" })).toBe("Londres");
    expect(displayPlaceName({ name: "Moscow" })).toBe("Moscou");
    expect(displayPlaceName({ name: "Cairo" })).toBe("Le Caire");
    expect(displayPlaceName({ name: "Abidjan" })).toBe("Abidjan");
  });

  it("liste plusieurs lieux du monde et privilégie les correspondances exactes", () => {
    expect(searchPlaceList(places, "par", 3).map((place) => place.name)[0]).toBe("Paris");
    expect(searchPlaceList(places, "tok", 5).map((place) => place.name)).toContain("Tokyo");
    expect(searchPlaceList(places, "abidjan", 5)[0].country).toBe("Côte d'Ivoire");
    expect(searchPlaceList(places, "zzz", 5)).toEqual([]);
  });

  it("cherche aussi les exonymes français", () => {
    const withLondon = [
      ...places,
      { ...places[0], name: "London", population: 8_900_000, country: "Royaume-Uni" },
    ];
    expect(searchPlaceList(withLondon, "londres", 5)[0].name).toBe("London");
  });
});
