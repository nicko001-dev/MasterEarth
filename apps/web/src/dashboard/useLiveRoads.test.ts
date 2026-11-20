import { describe, expect, it } from "vitest";
import {
  clampRoadsBounds,
  parseRoadsProduct,
  ROADS_MAX_AREA_KM2,
  roadsBoundsEligible,
} from "../services/liveRoads";
import { ROADS_MAX_CAMERA_HEIGHT_M } from "./useLiveRoads";

const CITY = { west: -4.05, south: 5.3, east: -3.99, north: 5.36 };

describe("emprise du réseau routier", () => {
  it("accepte une vue de ville", () => {
    expect(roadsBoundsEligible(CITY)).toBe(true);
  });

  it("refuse une vue trop large, un span trop grand ou des bornes inversées", () => {
    expect(roadsBoundsEligible({ west: -60, south: -30, east: 60, north: 30 })).toBe(false);
    expect(roadsBoundsEligible({ west: -4.05, south: 5.3, east: -4.05, north: 5.36 })).toBe(false);
    expect(roadsBoundsEligible({ west: -4.05, south: 5.36, east: -3.99, north: 5.3 })).toBe(false);
    expect(roadsBoundsEligible({ west: 10, south: 5.3, east: -3.99, north: 5.36 })).toBe(false);
    expect(Number.isFinite(ROADS_MAX_AREA_KM2)).toBe(true);
  });

  it("resserre une emprise trop large autour de son centre", () => {
    const clamped = clampRoadsBounds({ west: -40, south: -30, east: 40, north: 30 });
    expect(clamped.east - clamped.west).toBeLessThanOrEqual(6);
    expect(clamped.north - clamped.south).toBeLessThanOrEqual(6);
    expect((clamped.west + clamped.east) / 2).toBeCloseTo(0, 3);
    expect((clamped.south + clamped.north) / 2).toBeCloseTo(0, 3);
  });

  it("borne l'altitude d'affichage du trafic", () => {
    expect(ROADS_MAX_CAMERA_HEIGHT_M).toBeGreaterThan(100_000);
    expect(ROADS_MAX_CAMERA_HEIGHT_M).toBeLessThan(1_000_000);
  });
});

describe("parseRoadsProduct", () => {
  it("reconnaît un chargement en cours et une réponse prête", () => {
    const pending = parseRoadsProduct({ status: "loading" });
    expect(pending.status).toBe("pending");
    expect(pending.roads).toEqual([]);

    const ready = parseRoadsProduct({
      status: "ready",
      generated_at: "2026-11-06T10:00:00Z",
      attribution: "© contributeurs OpenStreetMap",
      license: "ODbL 1.0",
      degraded: true,
      limitations: ["tracé indicatif", 42],
      roads: [{ id: "1", class: "primary", oneway: 0, points: [[-4, 5.3], [-3.9, 5.3]] }],
    });
    expect(ready.status).toBe("ready");
    expect(ready.roads).toHaveLength(1);
    expect(ready.degraded).toBe(true);
    expect(ready.limitations).toEqual(["tracé indicatif"]);
    expect(ready.generatedAt).toBe(Date.parse("2026-11-06T10:00:00Z"));
  });

  it("tolère une charge utile absente", () => {
    const product = parseRoadsProduct(null);
    expect(product.status).toBe("pending");
    expect(product.roads).toEqual([]);
    expect(product.attribution).toContain("OpenStreetMap");
  });
});
