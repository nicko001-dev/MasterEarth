import { expect, it } from "vitest";
import { SensorState, WeatherItem } from "./api";
import { currentSituation } from "./situation";

const now = Date.parse("2026-11-02T17:00:00Z");

function sensor(overrides: Partial<SensorState> = {}): SensorState {
  return {
    code: "CI-001",
    name: "Capteur réel",
    kind: "water_level",
    lon: -4,
    lat: 5,
    status: "active",
    alert_level: "red",
    water_level_cm: 90,
    last_measured_at: new Date(now - 5 * 60_000).toISOString(),
    health_status: "online",
    minutes_since_last_reading: 5,
    ...overrides,
  };
}

function rain(overrides: Partial<WeatherItem> = {}): WeatherItem {
  return {
    name: "Abidjan",
    source: "open-meteo",
    lat: 5,
    lon: -4,
    updated_at: new Date(now).toISOString(),
    intensity_3h_mm_h: 0,
    accumulated_24h_mm: 100,
    level: "red",
    observed_precip_mm_h: null,
    observed_at: null,
    observed_level: null,
    modeled_precip_mm_h: 0,
    ...overrides,
  };
}

it("ignores forecasts and model-only rain in the current country status", () => {
  expect(currentSituation([], [rain()], false, now)).toEqual({
    level: "unknown",
    currentSensorCount: 0,
    observedRainCount: 0,
  });
});

it("ignores stale sensor alerts and stale rain observations", () => {
  const staleSensor = sensor({
    last_measured_at: new Date(now - 2 * 60 * 60_000).toISOString(),
    health_status: "stale",
  });
  const staleRain = rain({
    observed_level: "red",
    observed_at: new Date(now - 3 * 60 * 60_000).toISOString(),
  });

  expect(currentSituation([staleSensor], [staleRain], false, now).level).toBe("unknown");
});

it("uses fresh measured levels and reports partial coverage counts", () => {
  const situation = currentSituation(
    [sensor()],
    [rain({
      observed_precip_mm_h: 0,
      observed_at: new Date(now - 10 * 60_000).toISOString(),
      observed_level: "green",
    })],
    false,
    now,
  );

  expect(situation).toEqual({
    level: "red",
    currentSensorCount: 1,
    observedRainCount: 1,
  });
});

it("does not present cached values as current while offline", () => {
  expect(currentSituation([sensor()], [], true, now).level).toBe("unknown");
});
