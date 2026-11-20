/**
 * Régression du bandeau « Hors ligne » de la capture : une seule route en
 * échec (401 visiteur, base indisponible, proxy…) ne doit plus vider toute
 * l'application ni désactiver les couches mondiales.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMonitoring } from "./useMonitoring";

const mocks = vi.hoisted(() => ({
  fetchHealth: vi.fn(),
  fetchSensors: vi.fn(),
  fetchAlerts: vi.fn(),
  fetchWeather: vi.fn(),
  fetchWeatherStatus: vi.fn(),
  fetchAutomaticFloods: vi.fn(),
}));

vi.mock("../services/api", () => ({
  fetchHealth: mocks.fetchHealth,
  fetchSensors: mocks.fetchSensors,
  fetchAlerts: mocks.fetchAlerts,
  fetchWeather: mocks.fetchWeather,
  fetchWeatherStatus: mocks.fetchWeatherStatus,
}));
vi.mock("../services/simulation", () => ({
  fetchAutomaticFloods: mocks.fetchAutomaticFloods,
}));

const sensors = [
  { code: "S-REEL", name: "Station réelle", lon: -4, lat: 5.3 },
  { code: "DEMO-1", name: "Démo · Caniveau A", lon: -4, lat: 5.3 },
];
const alerts = [
  { id: 1, sensor_code: "S-REEL" },
  { id: 2, sensor_code: "DEMO-1" },
];
const weather = [
  { name: "Abidjan", source_kind: "weather_model", observed_precip_mm_h: 2 },
  { name: "Démo · Caniveau A", source_kind: "weather_model", observed_precip_mm_h: 2 },
];
const weatherStatus = { refresh_interval_minutes: 15, providers: [], supplemental_sources: [] };
const automaticFloods = { generated_at: "", events: [], failures: [], thresholds_provisional: true };
const health = { status: "ok" };

const sources = [
  mocks.fetchSensors,
  mocks.fetchAlerts,
  mocks.fetchWeather,
  mocks.fetchWeatherStatus,
  mocks.fetchAutomaticFloods,
];

function allResolve() {
  mocks.fetchHealth.mockResolvedValue(health);
  mocks.fetchSensors.mockResolvedValue(sensors);
  mocks.fetchAlerts.mockResolvedValue(alerts);
  mocks.fetchWeather.mockResolvedValue(weather);
  mocks.fetchWeatherStatus.mockResolvedValue(weatherStatus);
  mocks.fetchAutomaticFloods.mockResolvedValue(automaticFloods);
}

function allSourcesReject() {
  for (const source of sources) source.mockRejectedValue(new Error("source indisponible"));
}

describe("monitoring tolérant aux pannes partielles", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    for (const mock of [mocks.fetchHealth, ...sources]) mock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    localStorage.clear();
  });

  async function flush() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it("une seule source en échec ne met pas l'application hors ligne", async () => {
    allResolve();
    mocks.fetchAlerts.mockRejectedValueOnce(new Error("401 visiteur"));

    const { result } = renderHook(() => useMonitoring());
    await flush();

    expect(result.current.offline).toBe(false);
    expect(result.current.sensors).toHaveLength(1);
    expect(result.current.weather).toHaveLength(1);
    expect(result.current.automaticFloods).not.toBeNull();
    expect(result.current.dataError).toContain("Alertes");
    expect(result.current.weatherError).toBeNull();
  });

  it("conserve les dernières valeurs connues quand plusieurs sources tombent", async () => {
    allResolve();
    const { result } = renderHook(() => useMonitoring());
    await flush();
    expect(result.current.sensors).toHaveLength(1);
    expect(result.current.weather).toHaveLength(1);

    allSourcesReject();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(result.current.offline).toBe(false); // /health répond toujours
    expect(result.current.sensors).toHaveLength(1);
    expect(result.current.weather).toHaveLength(1);
    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.dataError).not.toBeNull();
  });

  it("ne passe hors ligne que si l'API entière est injoignable, sans effacer le cache", async () => {
    localStorage.setItem(
      "intelliflood.monitoring.v1",
      JSON.stringify({ sensors, alerts, weather, weatherStatus, automaticFloods, updatedAt: "2026-11-06T17:00:00Z" }),
    );
    allSourcesReject();
    mocks.fetchHealth.mockRejectedValue(new Error("API injoignable"));

    const { result } = renderHook(() => useMonitoring());
    await flush();

    expect(result.current.offline).toBe(true);
    expect(result.current.sensors).toHaveLength(1);
    expect(result.current.weather).toHaveLength(1);
  });

  it("reste en ligne si /health est bloqué mais que les sources répondent", async () => {
    allResolve();
    mocks.fetchHealth.mockRejectedValue(new Error("proxy bloque /health"));

    const { result } = renderHook(() => useMonitoring());
    await flush();

    expect(result.current.offline).toBe(false);
    expect(result.current.sensors).toHaveLength(1);
    expect(result.current.liveMetrics.activeRainCount).toBe(1);
  });

  it("filtre toujours les données de démonstration", async () => {
    allResolve();

    const { result } = renderHook(() => useMonitoring());
    await flush();

    expect(result.current.sensors.map((sensor) => sensor.code)).toEqual(["S-REEL"]);
    expect(result.current.alerts.map((alert) => alert.sensor_code)).toEqual(["S-REEL"]);
    expect(result.current.weather.map((item) => item.name)).toEqual(["Abidjan"]);
  });
});
