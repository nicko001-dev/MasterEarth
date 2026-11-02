import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFloodPixels,
  decodeDepthCm,
  decodePossible,
  depthClassAreas,
  floodedAreaShare,
  FloodSimulation,
  runFloodSimulation,
} from "./simulation";

function encodeDepth(values: number[]): string {
  const bytes = new Uint8Array(values.length * 2);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setUint16(index * 2, value, true));
  return btoa(String.fromCharCode(...bytes));
}

function simulation(values: number[]): FloodSimulation {
  return {
    id: 1,
    bbox: { south: 5.3, west: -4.1, north: 5.4, east: -3.9 },
    rows: 2,
    cols: 3,
    cell_m: 10,
    depth_cm_b64: encodeDepth(values),
    possible_b64: btoa(String.fromCharCode(0, 0, 0, 0, 0, 0)),
    stats: {
      max_depth_m: 2,
      area_km2: 0.0006,
      volume_m3: 60,
      surface_level_m: 10,
      possible_area_km2: 0.0008,
    },
    assumptions: [],
    frames: [],
    disclaimer: "Simulation indicative.",
    center: { lat: 5.35, lon: -4 },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("simulation raster", () => {
  it("decodes the backend's little-endian depth grid", () => {
    const bytes = new Uint8Array([0, 0, 25, 0, 120, 0]);
    const encoded = btoa(String.fromCharCode(...bytes));

    expect([...decodeDepthCm(encoded)]).toEqual([0, 25, 120]);
  });

  it("renders localized depth classes and the possible MNT area in both map orientations", () => {
    const depth = new Uint16Array([0, 10, 60, 120]);
    const possible = new Uint8Array([1, 0, 0, 0]);
    const southUp = buildFloodPixels(depth, possible, 2, 2, false);
    const northUp = buildFloodPixels(depth, possible, 2, 2, true);

    expect([...southUp.slice(0, 4)]).toEqual([255, 205, 70, 65]);
    expect([...southUp.slice(4, 8)]).toEqual([31, 181, 217, 165]);
    expect([...southUp.slice(8, 12)]).toEqual([255, 155, 0, 205]);
    expect([...southUp.slice(12, 16)]).toEqual([245, 60, 45, 220]);
    expect([...northUp.slice(0, 4)]).toEqual([255, 155, 0, 205]);
    expect([...northUp.slice(8, 12)]).toEqual([255, 205, 70, 65]);
  });

  it("rejects a raster whose dimensions do not match its values", () => {
    expect(() => buildFloodPixels(new Uint16Array(1), new Uint8Array(1), 2, 2, true)).toThrow(/dimensions/);
    expect([...decodePossible(btoa(String.fromCharCode(0, 1)))]).toEqual([0, 1]);
  });

  it("sends authenticated simulation inputs to the deterministic MNT API", async () => {
    const result = { id: 12, stats: { area_km2: 0.4 } };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      mode: "rain" as const,
      lat: 5.359,
      lon: -3.985,
      rain_mm_h: 80,
      hours: 2,
      radius_m: 1500,
      cells: 120,
      steps: 6,
    };

    await expect(runFloodSimulation("viewer-session", input)).resolves.toEqual(result);
    const requestHeaders = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(requestHeaders.Authorization).toBe(["Bearer", "viewer-session"].join(" "));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/simulations/flood"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: ["Bearer", "viewer-session"].join(" ") }),
        body: JSON.stringify(input),
      }),
    );
  });

  it("surfaces backend terrain and validation errors without a simulated fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: "Altitudes indisponibles : vérifiez le cache MNT." },
    }), { status: 422 })));

    await expect(runFloodSimulation("viewer-session", {
      mode: "level",
      lat: 5.359,
      lon: -3.985,
      rise_m: 1.5,
      radius_m: 1500,
      cells: 120,
      steps: 6,
    })).rejects.toThrow("Altitudes indisponibles");
  });
});

describe("simulation depth classes", () => {
  it("buckets every wet cell into an honest depth class and area", () => {
    const run = simulation([3, 10, 30, 60, 120, 200]);
    const classes = depthClassAreas(run, 0);

    expect(classes.map((depthClass) => depthClass.cells)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(classes.map((depthClass) => depthClass.key)).toEqual([
      "trace", "low", "moderate", "high", "very-high", "critical",
    ]);
    const sum = classes.reduce((total, depthClass) => total + depthClass.areaKm2, 0);
    expect(sum).toBeCloseTo(0.0006, 7);
    expect(classes.reduce((total, depthClass) => total + depthClass.share, 0)).toBeCloseTo(
      floodedAreaShare(run, 0),
      10,
    );
  });

  it("ignores dry cells and keeps the sum of class areas equal to the wet cell area", () => {
    const run = simulation([0, 0, 0, 4, 4, 0]);
    const classes = depthClassAreas(run, 0);

    expect(classes.find((depthClass) => depthClass.key === "trace")?.cells).toBe(2);
    expect(classes.reduce((total, depthClass) => total + depthClass.cells, 0)).toBe(2);
    expect(classes.reduce((total, depthClass) => total + depthClass.areaKm2, 0)).toBeCloseTo(0.0002, 7);
  });
});
