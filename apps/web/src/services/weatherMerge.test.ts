import { describe, expect, it } from "vitest";
import { WeatherItem } from "./api";
import { boundsAreaKm2, mergeWeather } from "./weatherMerge";

const point = (name: string, lat: number, lon: number, rain: number | null): WeatherItem => ({
  name,
  source: "open-meteo",
  lat,
  lon,
  updated_at: "2026-11-04T05:00:00Z",
  intensity_3h_mm_h: 0,
  forecast_intensity_3h_mm_h: 0,
  observed_precip_mm_h: null,
  modeled_precip_mm_h: rain,
  accumulated_24h_mm: 0,
  level: "green",
});

describe("fusion météo locale et mondiale", () => {
  it("garde la priorité aux points historisés et écarte les doublons", () => {
    const base = [point("Abidjan", 5.36, -4.01, 12)];
    const extra = [
      point("Open-Meteo 5,36,-4,01", 5.36, -4.01, 30),
      point("Open-Meteo 48,85,2,35", 48.86, 2.35, 4),
    ];
    const merged = mergeWeather(base, extra);
    expect(merged).toHaveLength(2);
    expect(merged[0].name).toBe("Abidjan");
    expect(merged[1].name).toContain("48");
  });

  it("trie les points mondiaux du plus intense au moins intense", () => {
    const merged = mergeWeather([], [
      point("A", 1, 1, 1),
      point("B", 2, 2, 20),
      point("C", 3, 3, 5),
    ]);
    expect(merged.map((item) => item.name)).toEqual(["B", "C", "A"]);
  });

  it("ignore les coordonnées invalides et respecte la limite", () => {
    const merged = mergeWeather(
      [point("ok", 1, 1, 1)],
      [point("bad", Number.NaN, 2, 1), point("D", 4, 4, 1)],
      2,
    );
    expect(merged.map((item) => item.name)).toEqual(["ok", "D"]);
  });

  it("estime la surface d'une emprise", () => {
    const world = boundsAreaKm2({ west: -180, south: -85, east: 180, north: 85 });
    expect(world).toBeGreaterThan(500_000_000);
    const city = boundsAreaKm2({ west: -4.1, south: 5.3, east: -3.9, north: 5.5 });
    expect(city).toBeGreaterThan(400);
    expect(city).toBeLessThan(600);
  });
});
