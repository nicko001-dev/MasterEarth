import { afterEach, describe, expect, it, vi } from "vitest";
import {
  boundsIntersect,
  countryLabelAnchors,
  decimateRing,
  loadAdmin1,
  loadCountries,
  parseBorderFeatures,
  resetBorderCaches,
  selectBorders,
  GeoFeature,
} from "./borders";

const square = (west: number, south: number, east: number, north: number) => [[
  [west, south],
  [east, south],
  [east, north],
  [west, north],
  [west, south],
]];

const feature = (name: string, coordinates: number[][][], properties: Record<string, unknown> = {}) => ({
  type: "Feature",
  properties: { name, ...properties },
  geometry: { type: "Polygon", coordinates },
});

afterEach(() => {
  resetBorderCaches();
  vi.unstubAllGlobals();
});

describe("lecture GeoJSON", () => {
  it("calcule l'emprise, l'aire et un point d'ancrage", () => {
    const features = parseBorderFeatures({
      type: "FeatureCollection",
      features: [feature("France", square(-5, 42, 8, 51), { iso_a2: "FR" })],
    }, { nameKey: "name", countryKey: "iso_a2" });
    expect(features).toHaveLength(1);
    const [country] = features;
    expect(country.name).toBe("France");
    expect(country.country).toBe("FR");
    expect(country.bounds).toEqual({ west: -5, south: 42, east: 8, north: 51 });
    expect(country.area).toBeGreaterThan(0);
    expect(country.anchor[0]).toBeCloseTo(1.5, 1);
    expect(country.anchor[1]).toBeCloseTo(46.5, 1);
  });

  it("gère les MultiPolygon et ignore les géométries vides", () => {
    const features = parseBorderFeatures({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "Archipel", country: "X" },
          geometry: {
            type: "MultiPolygon",
            coordinates: [square(0, 0, 1, 1), square(2, 2, 3, 3)],
          },
        },
        feature("Vide", []),
        { type: "Feature", properties: { name: "" }, geometry: { type: "Polygon", coordinates: [] } },
      ],
    });
    expect(features).toHaveLength(1);
    expect(features[0].rings).toHaveLength(2);
    expect(features[0].bounds).toEqual({ west: 0, south: 0, east: 3, north: 3 });
  });

  it("charge les pays une seule fois et valide la réponse HTTP", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [feature("France", square(-5, 42, 8, 51), { iso_a2: "FR" })] }),
    });
    const first = await loadCountries(fetchMock as unknown as typeof fetch);
    const second = await loadCountries(fetchMock as unknown as typeof fetch);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const failing = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    resetBorderCaches();
    await expect(loadAdmin1(failing as unknown as typeof fetch)).rejects.toThrow(/404/);
  });
});

describe("sélection selon la vue", () => {
  const countries: GeoFeature[] = parseBorderFeatures({
    type: "FeatureCollection",
    features: [
      feature("France", square(-5, 42, 8, 51), { iso_a2: "FR" }),
      feature("Japon", square(130, 31, 146, 46), { iso_a2: "JP" }),
    ],
  });
  const admin1: GeoFeature[] = parseBorderFeatures({
    type: "FeatureCollection",
    features: [
      feature("Île-de-France", square(1, 48, 3, 49), { country: "France" }),
      feature("Hokkaido", square(140, 41, 145, 45), { country: "Japon" }),
    ],
  });

  it("dessine les pays de loin et les régions seulement en vue rapprochée", () => {
    const far = selectBorders(3_000_000, null, { countries, admin1 });
    expect(far.countries).toHaveLength(2);
    expect(far.admin1).toHaveLength(0);

    const near = selectBorders(200_000, null, { countries, admin1 });
    expect(near.admin1).toHaveLength(2);
  });

  it("filtre sur l'emprise visible", () => {
    const view = { west: -10, south: 40, east: 10, north: 52 };
    const selected = selectBorders(1_000_000, view, { countries, admin1 });
    expect(selected.countries.map((item) => item.name)).toEqual(["France"]);
    const near = selectBorders(200_000, view, { countries, admin1 });
    expect(near.admin1.map((item) => item.name)).toEqual(["Île-de-France"]);
  });

  it("gère le passage de l'antiméridien", () => {
    const view = { west: 170, south: -50, east: -170, north: -10 };
    expect(boundsIntersect({ west: 175, south: -45, east: 179, north: -20 }, view)).toBe(true);
    expect(boundsIntersect({ west: -179, south: -45, east: -175, north: -20 }, view)).toBe(true);
    expect(boundsIntersect({ west: 0, south: 0, east: 10, north: 10 }, view)).toBe(false);
  });

  it("expose des ancrages de libellés uniquement pour les territoires visibles", () => {
    expect(countryLabelAnchors(countries)).toHaveLength(2);
    expect(countryLabelAnchors([...countries, { ...countries[0], anchor: [0, 88], area: 1 }])).toHaveLength(2);
  });
});

describe("simplification", () => {
  it("réduit un anneau en conservant ses extrémités", () => {
    const ring = Array.from({ length: 100 }, (_, index) => [index, index] as [number, number]);
    const reduced = decimateRing(ring, 20);
    expect(reduced.length).toBeLessThanOrEqual(21);
    expect(reduced[0]).toEqual(ring[0]);
    expect(reduced[reduced.length - 1]).toEqual(ring[ring.length - 1]);
    expect(decimateRing(ring, 500)).toHaveLength(100);
  });
});
