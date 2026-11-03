import { useCallback, useEffect, useRef, useState } from "react";
import { AlertItem, SensorState, WeatherItem, WeatherStatus, fetchAlerts, fetchSensors, fetchWeather, fetchWeatherStatus } from "../services/api";
import { AutomaticFloodsResponse, fetchAutomaticFloods } from "../services/simulation";

const KEY = "intelliflood.monitoring.v1";
const REFRESH_MS = 10_000;

interface Snapshot { sensors: SensorState[]; alerts: AlertItem[]; weather: WeatherItem[]; weatherStatus: WeatherStatus | null; automaticFloods: AutomaticFloodsResponse | null; updatedAt: string }

function withoutDemoData(snapshot: Snapshot): Snapshot {
  const isDemoSensor = (sensor: SensorState) =>
    sensor.code.startsWith("DEMO-") || sensor.name.startsWith("Démo · Caniveau ");
  const isDemoWeatherPoint = (item: WeatherItem) =>
    item.source_kind === "weather_model" && item.name.startsWith("Démo · Caniveau ");
  return {
    ...snapshot,
    sensors: snapshot.sensors.filter((sensor) => !isDemoSensor(sensor)),
    alerts: snapshot.alerts.filter((alert) => !alert.sensor_code.startsWith("DEMO-")),
    weather: snapshot.weather.filter((item) => !isDemoWeatherPoint(item)),
    automaticFloods: snapshot.automaticFloods
      ? {
          ...snapshot.automaticFloods,
          events: snapshot.automaticFloods.events.filter(
            (event) => !(event.source === "open-meteo" && event.name.startsWith("Démo · Caniveau ")),
          ),
        }
      : null,
  };
}

function sameAutomaticEvents(current: AutomaticFloodsResponse | null, incoming: AutomaticFloodsResponse): boolean {
  if (!current) return false;
  const signature = (value: AutomaticFloodsResponse) => JSON.stringify({
    events: value.events.map((event) => [
      event.id,
      event.name,
      event.source,
      event.source_kind,
      event.observed_at,
      event.measured_water_level_cm,
      event.simulation.result.stats,
      event.simulation.input,
    ]),
    failures: value.failures,
  });
  return signature(current) === signature(incoming);
}

function readCache(): Snapshot | null {
  try {
    const cached = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return cached
      ? withoutDemoData({
          weather: [],
          weatherStatus: null,
          automaticFloods: null,
          ...cached,
        })
      : null;
  } catch {
    return null;
  }
}

/** Charge capteurs et alertes ; en cas d'échec réseau, reprend les dernières données connues (hors ligne). */
export function useMonitoring() {
  const cached = readCache();
  const [data, setData] = useState<Snapshot>(cached ?? { sensors: [], alerts: [], weather: [], weatherStatus: null, automaticFloods: null, updatedAt: "" });
  const dataRef = useRef(data);
  dataRef.current = data;
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [automaticFloodError, setAutomaticFloodError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [sensors, alerts, weatherResult, statusResult, automaticResult] = await Promise.all([
        fetchSensors(),
        fetchAlerts(),
        fetchWeather().then((value) => ({ value })).catch((error: unknown) => ({ error })),
        fetchWeatherStatus().then((value) => ({ value })).catch((error: unknown) => ({ error })),
        fetchAutomaticFloods().then((value) => ({ value })).catch((error: unknown) => ({ error })),
      ]);
      const snap = withoutDemoData({
        ...dataRef.current,
        sensors,
        alerts,
        updatedAt: new Date().toISOString(),
      });
      const errors: string[] = [];
      if ("value" in weatherResult) {
        snap.weather = weatherResult.value.filter(
          (item) => !(item.source_kind === "weather_model" && item.name.startsWith("Démo · Caniveau ")),
        );
      }
      else errors.push(weatherResult.error instanceof Error ? weatherResult.error.message : "Données météo indisponibles.");
      if ("value" in statusResult) snap.weatherStatus = statusResult.value;
      else errors.push(statusResult.error instanceof Error ? statusResult.error.message : "État des sources météo indisponible.");
      if ("value" in automaticResult) {
        const automaticFloods = withoutDemoData({
          ...snap,
          automaticFloods: automaticResult.value,
        }).automaticFloods!;
        if (!sameAutomaticEvents(dataRef.current.automaticFloods, automaticFloods)) {
          snap.automaticFloods = automaticFloods;
        }
      }
      setAutomaticFloodError("value" in automaticResult ? null : automaticResult.error instanceof Error ? automaticResult.error.message : "Impacts automatiques indisponibles.");
      dataRef.current = snap;
      setData(snap);
      setWeatherError(errors.length ? errors.join(" ") : null);
      setOffline(false);
      try { localStorage.setItem(KEY, JSON.stringify(snap)); } catch { /* stockage plein ou indisponible */ }
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(refresh, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  return { ...data, offline, loading, weatherError, automaticFloodError, refresh };
}
