import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Place } from "../globe/places";
import type {
  HazardCatalog,
  HazardEvent,
  HazardSimulation,
  HazardSnapshot,
  ResolvedHazardPlace,
} from "../services/hazards";
import { resolveHazardPlaceMap } from "../services/hazards";
import { HazardConsole } from "./HazardConsole";

const event: HazardEvent = {
  id: "usgs:1",
  source: "usgs_earthquakes",
  source_id: "1",
  hazard: "earthquake",
  title: "M 6.8 - 20 km SW of Tokyo",
  place: "20 km SW of Tokyo",
  lat: 35.5,
  lon: 139.5,
  time: "2026-11-19T07:00:00Z",
  updated: null,
  severity: "high",
  severity_label: "Élevée",
  data_kind: "observation",
  description: "Séisme publié par l'USGS.",
  country: "Japan",
  url: "https://earthquake.usgs.gov/event/1",
  metrics: [
    { key: "magnitude", label: "Magnitude", value: 6.8, unit: "Mw", basis: "USGS" },
    { key: "profondeur_km", label: "Profondeur", value: 20, unit: "km", basis: "USGS" },
  ],
  also_reported_by: ["gdacs"],
  attribution: "USGS",
};

const hurricaneEvent: HazardEvent = {
  ...event,
  id: "nasa_eonet:EONET_26463",
  source: "nasa_eonet",
  source_id: "EONET_26463",
  hazard: "hurricane",
  title: "Tropical Cyclone Xavier",
  place: null,
  country: null,
  description: null,
  url: "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_26463",
  metrics: [
    { key: "intensite", label: "Vent maximal", value: 185.2, unit: "km/h", basis: "NASA EONET" },
  ],
  also_reported_by: [],
  attribution: "NASA Earth Observatory Natural Event Tracker",
};

const snapshot: HazardSnapshot = {
  generated_at: new Date().toISOString(),
  scope: "worldwide",
  available: true,
  stale: false,
  degraded: false,
  age_seconds: 0,
  total_events: 1,
  counts_by_type: {
    earthquake: 1, tsunami: 0, volcano: 0, hurricane: 0, flood: 0, wildfire: 0,
    drought: 0, landslide: 0, sandstorm: 0, blizzard: 0, heatwave: 0, tornado: 0, storm: 0,
  },
  counts_by_severity: { low: 0, moderate: 0, high: 1, extreme: 0, unknown: 0 },
  events: [event],
  sources: [{
    id: "usgs_earthquakes",
    name: "USGS Earthquakes",
    status: "ok",
    count: 1,
    fetched_at: "2026-11-19T07:00:00Z",
    attribution: "USGS",
    attribution_url: "https://earthquake.usgs.gov/",
    license: "Domaine public",
    error: null,
    warnings: [],
  }],
  attribution: "USGS · GDACS · NASA EONET · NOAA",
  attribution_url: "https://example.test",
  license: "Sources publiques",
  limitations: ["Les flux publics ne constituent pas une alerte locale."],
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
      { key: "depth_km", label: "Profondeur", unit: "km", min: 1, max: 700, step: 1, default: 15 },
    ],
  }, {
    id: "hurricane",
    label: "Cyclones",
    label_en: "Tropical cyclones",
    color: "#c06bff",
    description: "Vents, pression et pluies.",
    sources: ["nasa_eonet"],
    metrics: ["wind_kmh"],
    simulation_fields: [
      { key: "wind_kmh", label: "Vents max.", unit: "km/h", min: 60, max: 350, step: 0.1, default: 180 },
    ],
  }],
  count: 2,
  attribution: "USGS",
  disclaimer: "Simulation indicative.",
};

const simulation: HazardSimulation = {
  hazard: "earthquake",
  label: "Séisme",
  model: "masterearth-indicative-v1",
  generated_at: "2026-11-19T07:05:00Z",
  center: { lat: 35.5, lon: 139.5, name: "20 km SW of Tokyo" },
  radius_km: 45,
  intensity_index: 62,
  severity: "high",
  severity_label: "Élevée",
  metrics: [{ key: "magnitude", label: "Magnitude", value: 6.8, unit: "Mw", basis: "Entrée utilisateur" }],
  timeline: [{ fraction: 0, hour: 0, intensity_index: 40, label: "Modérée" }],
  statements: ["Estimation indicative."],
  input: { magnitude: 6.8 },
  assumptions: ["Sol homogène."],
  limitations: ["Pas une prévision."],
  disclaimer: "Simulation indicative MasterEarth.",
};

const places: Place[] = [{
  name: "Tokyo",
  lat: 35.6762,
  lon: 139.6503,
  population: 8_300_000,
  countryCode: "JP",
  country: "Japon",
  admin1: "Tokyo",
  capital: true,
}];

function renderConsole(overrides: Partial<ComponentProps<typeof HazardConsole>> = {}) {
  const onSelect = vi.fn();
  const onLocate = vi.fn();
  const onRefresh = vi.fn();
  const onLogin = vi.fn();
  const onSimulation = vi.fn();
  const placeMap = resolveHazardPlaceMap(snapshot.events, places);
  const view = render(
    <HazardConsole
      data={snapshot}
      catalog={catalog}
      catalogError={null}
      status="ready"
      error={null}
      stale={false}
      selectedId={null}
      places={places}
      placeMap={placeMap}
      simulation={null}
      token="token"
      onSelect={onSelect}
      onLocate={onLocate}
      onRefresh={onRefresh}
      onLogin={onLogin}
      onSimulation={onSimulation}
      {...overrides}
    />,
  );
  return { view, onSelect, onLocate, onRefresh, onLogin, onSimulation, placeMap };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("HazardConsole", () => {
  it("affiche les événements, lieux réels et états de sources", () => {
    renderConsole({ selectedId: event.id });

    expect(screen.getByRole("heading", { name: "Surveillance mondiale" })).toBeInTheDocument();
    expect(screen.getAllByText("USGS Earthquakes").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("20 km SW of Tokyo").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("M 6.8 - 20 km SW of Tokyo").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Publié/)).toBeInTheDocument();
    expect(screen.getByText("6,8 Mw")).toBeInTheDocument();
  });

  it("reprend le vent réel d'un cyclone dans le formulaire de simulation", () => {
    const cycloneSnapshot: HazardSnapshot = {
      ...snapshot,
      total_events: 1,
      counts_by_type: { ...snapshot.counts_by_type, earthquake: 0, hurricane: 1 },
      counts_by_severity: { ...snapshot.counts_by_severity, high: 1 },
      events: [hurricaneEvent],
      sources: [{ ...snapshot.sources[0], id: "nasa_eonet", name: "NASA EONET", count: 1 }],
    };

    renderConsole({
      data: cycloneSnapshot,
      selectedId: hurricaneEvent.id,
      placeMap: new Map(),
    });

    expect(screen.getByLabelText(/Vents max/)).toHaveValue(185.2);
  });

  it("ouvre l'événement choisi sans fabriquer de lieu", () => {
    const { onSelect } = renderConsole();
    fireEvent.click(screen.getByRole("button", { name: /20 km SW of Tokyo/ }));
    expect(onSelect).toHaveBeenCalledWith(event);
  });

  it("marque explicitement une ville GeoNames comme approximation", () => {
    const withoutPlace: HazardEvent = { ...event, id: "eonet:1", place: null, country: null, source: "nasa_eonet" };
    const withPlace: HazardSnapshot = {
      ...snapshot,
      total_events: 1,
      events: [withoutPlace],
      counts_by_type: { ...snapshot.counts_by_type, earthquake: 0 },
      sources: [{ ...snapshot.sources[0], id: "nasa_eonet", name: "NASA EONET", count: 1 }],
    };
    const placeMap = resolveHazardPlaceMap(withPlace.events, places) as Map<string, ResolvedHazardPlace>;
    renderConsole({ data: withPlace, placeMap });

    expect(screen.getAllByText(/Près de Tokyo/).length).toBeGreaterThanOrEqual(1);
  });

  it("ne montre aucun faux événement quand aucune source ne répond", () => {
    renderConsole({
      data: null,
      status: "unavailable",
      stale: true,
      error: "Toutes les sources sont hors ligne",
      placeMap: new Map(),
    });

    expect(screen.getByText(/Aucun événement n'est affiché/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /20 km SW of Tokyo/ })).not.toBeInTheDocument();
  });

  it("demande une connexion avant toute simulation", () => {
    const { onLogin, onSimulation } = renderConsole({ token: undefined });
    fireEvent.click(screen.getByRole("button", { name: "Se connecter pour simuler" }));
    expect(onLogin).toHaveBeenCalled();
    expect(onSimulation).not.toHaveBeenCalled();
  });

  it("envoie la simulation indicative et remonte le résultat", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(simulation), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { onSimulation } = renderConsole();

    fireEvent.click(screen.getByRole("button", { name: "Lancer la simulation" }));

    await waitFor(() => expect(onSimulation).toHaveBeenCalledWith(simulation));
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ hazard: "earthquake", magnitude: 6.5, depth_km: 15 });
    expect(body.inputs).toBeUndefined();
  });
});
