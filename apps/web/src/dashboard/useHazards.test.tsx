/** La veille doit conserver la dernière photographie valide sans jamais inventer d'événement. */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HazardCatalog, HazardSnapshot } from "../services/hazards";
import { useHazards } from "./useHazards";

const snapshot: HazardSnapshot = {
  generated_at: "2026-11-19T08:00:00Z",
  scope: "worldwide",
  available: true,
  stale: false,
  degraded: true,
  age_seconds: 12,
  total_events: 1,
  counts_by_type: {
    earthquake: 1, tsunami: 0, volcano: 0, hurricane: 0, flood: 0, wildfire: 0,
    drought: 0, landslide: 0, sandstorm: 0, blizzard: 0, heatwave: 0, tornado: 0, storm: 0,
  },
  counts_by_severity: { low: 0, moderate: 1, high: 0, extreme: 0, unknown: 0 },
  events: [{
    id: "usgs:1",
    source: "usgs_earthquakes",
    source_id: "1",
    hazard: "earthquake",
    title: "M 4.8 - Example",
    place: "Example",
    lat: 10,
    lon: 20,
    time: "2026-11-19T07:58:00Z",
    updated: null,
    severity: "moderate",
    severity_label: "Modérée",
    data_kind: "observation",
    description: null,
    country: null,
    url: null,
    metrics: [],
    also_reported_by: [],
    attribution: "USGS",
  }],
  sources: [{
    id: "usgs_earthquakes",
    name: "USGS Earthquakes",
    status: "ok",
    count: 1,
    fetched_at: "2026-11-19T08:00:00Z",
    attribution: "USGS",
    attribution_url: "https://earthquake.usgs.gov/",
    license: "Domaine public",
    error: null,
    warnings: [],
  }],
  attribution: "USGS · GDACS · NASA EONET · NOAA",
  attribution_url: "https://example.test",
  license: "Sources publiques",
  limitations: ["Flux public non garanti en temps réel."],
};

const catalog: HazardCatalog = {
  hazards: [{
    id: "earthquake",
    label: "Séismes",
    label_en: "Earthquakes",
    color: "#ff6b6b",
    description: "Séismes",
    sources: ["usgs_earthquakes"],
    metrics: ["magnitude"],
    simulation_fields: [
      { key: "magnitude", label: "Magnitude", unit: "Mw", min: 3, max: 9.5, step: 0.1, default: 6.5 },
    ],
  }],
  count: 1,
  attribution: "USGS",
  disclaimer: "Simulation indicative.",
};

const unavailable: HazardSnapshot = {
  ...snapshot,
  available: false,
  stale: true,
  total_events: 0,
  events: [],
  counts_by_type: { ...snapshot.counts_by_type, earthquake: 0 },
  counts_by_severity: { low: 0, moderate: 0, high: 0, extreme: 0, unknown: 0 },
  sources: [],
};

describe("useHazards", () => {
  afterEach(() => {
    cleanup();
  });

  it("expose l'instantané et le catalogue réels", async () => {
    const snapshotFetcher = vi.fn(async () => snapshot);
    const catalogFetcher = vi.fn(async () => catalog);
    const { result } = renderHook(() => useHazards({
      snapshotFetcher,
      catalogFetcher,
      refreshMs: 10_000_000,
    }));

    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.data?.total_events).toBe(1);
    expect(result.current.data?.events[0].place).toBe("Example");
    expect(result.current.catalog?.count).toBe(1);
    expect(result.current.catalogError).toBeNull();
    // Une source secondaire en panne ne transforme pas un instantané frais en cache.
    expect(result.current.stale).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("signale l'indisponibilité sans fabriquer de faux zéro", async () => {
    const snapshotFetcher = vi.fn(async () => unavailable);
    const catalogFetcher = vi.fn(async () => catalog);
    const { result } = renderHook(() => useHazards({
      snapshotFetcher,
      catalogFetcher,
      refreshMs: 10_000_000,
    }));

    await waitFor(() => expect(result.current.status).toBe("unavailable"));

    expect(result.current.data).toBeNull();
    expect(result.current.stale).toBe(true);
    expect(result.current.error).toContain("Aucune source");
  });

  it("conserve la dernière photographie valide quand le réseau échoue", async () => {
    const snapshotFetcher = vi
      .fn()
      .mockResolvedValueOnce(snapshot)
      .mockRejectedValueOnce(new Error("réseau coupé"));
    const catalogFetcher = vi.fn(async () => catalog);
    const { result } = renderHook(() => useHazards({
      snapshotFetcher,
      catalogFetcher,
      refreshMs: 10_000_000,
    }));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data?.total_events).toBe(1);

    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.error).toContain("réseau coupé"));

    expect(result.current.status).toBe("ready");
    expect(result.current.data?.total_events).toBe(1);
    expect(result.current.stale).toBe(true);
  });

  it("conserve le catalogue même si l'instantané échoue", async () => {
    const snapshotFetcher = vi.fn(async () => {
      throw new Error("flux indisponible");
    });
    const catalogFetcher = vi.fn(async () => catalog);
    const { result } = renderHook(() => useHazards({
      snapshotFetcher,
      catalogFetcher,
      refreshMs: 10_000_000,
    }));

    await waitFor(() => expect(result.current.status).toBe("unavailable"));

    expect(result.current.catalog?.hazards[0].label).toBe("Séismes");
    expect(result.current.catalogError).toBeNull();
  });
});
