import { afterEach, describe, expect, it, vi } from "vitest";
import type { Place } from "../globe/places";
import {
  HAZARD_META,
  HazardEvent,
  hazardSourceLabel,
  metricValueLabel,
  resolveHazardPlace,
  resolveHazardPlaceMap,
  runHazardSimulation,
  sortHazards,
} from "./hazards";

const event = (overrides: Partial<HazardEvent> = {}): HazardEvent => ({
  id: "usgs:1",
  source: "usgs_earthquakes",
  source_id: "1",
  hazard: "earthquake",
  title: "M 5.9 - 10 km N of Example",
  place: "10 km N of Example",
  lat: 45.2,
  lon: 10.5,
  time: "2026-11-18T12:00:00Z",
  updated: null,
  severity: "moderate",
  severity_label: "Modérée",
  data_kind: "observation",
  description: null,
  country: "Italy",
  url: null,
  metrics: [],
  also_reported_by: [],
  attribution: "USGS",
  ...overrides,
});

const places: Place[] = [
  {
    name: "Milan",
    lat: 45.4642,
    lon: 9.19,
    population: 1_300_000,
    countryCode: "IT",
    country: "Italie",
    admin1: "Lombardie",
    capital: false,
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("resolveHazardPlace", () => {
  it("conserve le lieu réel publié par la source sans approximation", () => {
    const resolved = resolveHazardPlace(event(), places);
    expect(resolved).toMatchObject({
      label: "10 km N of Example",
      approximate: false,
      source: "event",
    });
  });

  it("signale une ville GeoNames comme approximation et donne la distance", () => {
    const resolved = resolveHazardPlace(event({ place: null, country: null }), places);
    expect(resolved.source).toBe("nearest");
    expect(resolved.approximate).toBe(true);
    expect(resolved.label).toContain("Milan");
    expect(resolved.distanceM).toBeGreaterThan(0);
  });

  it("retombe sur les coordonnées plutôt que d'inventer un toponyme", () => {
    const resolved = resolveHazardPlace(event({ place: null, country: null }), []);
    expect(resolved.source).toBe("coordinates");
    expect(resolved.label).toBe("45.20°, 10.50°");
  });

  it("résout tous les événements en conservant le lieu publié", () => {
    const second = event({ id: "gdacs:2", place: "Peru", country: "Peru" });
    const map = resolveHazardPlaceMap([event(), second], places);
    expect(map.get("usgs:1")?.label).toBe("10 km N of Example");
    expect(map.get("gdacs:2")?.label).toBe("Peru");
  });
});

describe("hazard presentation helpers", () => {
  it("trie par sévérité publiée puis par fraîcheur", () => {
    const sorted = sortHazards([
      event({ id: "low", severity: "low", time: "2026-11-18T13:00:00Z" }),
      event({ id: "extreme", severity: "extreme", time: "2026-11-17T13:00:00Z" }),
      event({ id: "high-old", severity: "high", time: "2026-11-16T13:00:00Z" }),
      event({ id: "high-new", severity: "high", time: "2026-11-18T10:00:00Z" }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["extreme", "high-new", "high-old", "low"]);
  });

  it("formate les valeurs sans inventer d'unité", () => {
    expect(metricValueLabel({ key: "magnitude", label: "Magnitude", value: 6.8, unit: "Mw" })).toBe("6,8 Mw");
    expect(metricValueLabel({ key: "niveau", label: "Niveau", value: "WATCH", unit: "" })).toBe("WATCH");
    expect(metricValueLabel({ key: "missing", label: "Absent", value: null, unit: "km" })).toBe("—");
  });

  it("affiche un libellé de repli si la source n'est plus listée", () => {
    expect(hazardSourceLabel("usgs_earthquakes", [])).toBe("usgs_earthquakes");
  });

  it("couvre les treize familles d'aléas avec une couleur distincte", () => {
    expect(Object.keys(HAZARD_META)).toHaveLength(13);
    expect(new Set(Object.values(HAZARD_META).map((item) => item.color)).size).toBeGreaterThanOrEqual(10);
  });
});

describe("runHazardSimulation", () => {
  it("aplatit les paramètres attendus par l'API et conserve le jeton", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ hazard: "earthquake", center: { lat: 35.6, lon: 139.7, name: null } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await runHazardSimulation({
      hazard: "earthquake",
      lat: 35.6,
      lon: 139.7,
      inputs: { magnitude: 6.8, depth_km: 20 },
    }, "secret-token");

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(options.body));
    expect(url).toContain("/api/v1/simulations/hazard");
    expect(options.headers).toMatchObject({ Authorization: "Bearer secret-token" });
    expect(body).toEqual({
      hazard: "earthquake",
      lat: 35.6,
      lon: 139.7,
      magnitude: 6.8,
      depth_km: 20,
    });
    expect(body.inputs).toBeUndefined();
  });

  it("remonte le détail d'erreur du serveur", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Rôle insuffisant" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    ));
    await expect(runHazardSimulation({
      hazard: "flood",
      lat: 0,
      lon: 0,
      inputs: {},
    }, "token")).rejects.toThrow("Rôle insuffisant");
  });
});
