import { AlertItem, SensorState, WeatherItem } from "./api";
import { AlertLevelName, SituationLevel } from "./levels";

export interface CurrentSituation {
  level: SituationLevel;
  currentSensorCount: number;
  observedRainCount: number;
}

const LEVEL_RANK: Record<AlertLevelName, number> = {
  green: 0,
  orange: 1,
  red: 2,
};

function isRecent(timestamp: string | null | undefined, now: number, maxAgeMs: number): boolean {
  if (!timestamp) return false;
  const measuredAt = Date.parse(timestamp);
  return Number.isFinite(measuredAt)
    && measuredAt <= now + 5 * 60_000
    && now - measuredAt <= maxAgeMs;
}

export function currentSituation(
  sensors: SensorState[],
  weather: WeatherItem[],
  offline = false,
  now = Date.now(),
): CurrentSituation {
  if (offline) {
    return { level: "unknown", currentSensorCount: 0, observedRainCount: 0 };
  }

  const currentSensors = sensors.filter(
    (sensor) => sensor.kind !== "rain_gauge"
      && sensor.status === "active"
      && sensor.health_status === "online"
      && isRecent(sensor.last_measured_at, now, 60 * 60_000),
  );
  const observedRain = weather.filter(
    (item) => item.observed_level != null
      && isRecent(item.observed_at, now, 2 * 60 * 60_000),
  );
  const levels = [
    ...currentSensors.map((sensor) => sensor.alert_level),
    ...observedRain.map((item) => item.observed_level!),
  ];
  const level = levels.length
    ? levels.reduce((worst, candidate) =>
      LEVEL_RANK[candidate] > LEVEL_RANK[worst] ? candidate : worst,
    )
    : "unknown";

  return {
    level,
    currentSensorCount: currentSensors.length,
    observedRainCount: observedRain.length,
  };
}

export function currentSituationAlerts(
  sensors: SensorState[],
  alerts: AlertItem[],
  offline = false,
  now = Date.now(),
): AlertItem[] {
  if (offline) return [];
  const freshCodes = new Set(
    sensors
      .filter((sensor) => sensor.kind !== "rain_gauge"
        && sensor.status === "active"
        && sensor.health_status === "online"
        && isRecent(sensor.last_measured_at, now, 60 * 60_000))
      .map((sensor) => sensor.code),
  );
  return alerts.filter((alert) => freshCodes.has(alert.sensor_code));
}
