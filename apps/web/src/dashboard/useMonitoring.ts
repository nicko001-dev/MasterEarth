import { useCallback, useEffect, useRef, useState } from "react";
import { AlertItem, SensorState, WeatherItem, WeatherStatus, fetchAlerts, fetchSensors, fetchWeather, fetchWeatherStatus } from "../services/api";
import { AutomaticFloodsResponse, fetchAutomaticFloods } from "../services/simulation";

const KEY = "intelliflood.monitoring.v1";
const REFRESH_MS = 5_000; // Fréquence d'actualisation temps réel accélérée (5s)

export interface LiveWeatherMetrics {
  instantaneousMaxMmH: number;
  activeRainCount: number;
  forecastRainCount: number;
  highestRiskItem: WeatherItem | null;
  averageRainMmH: number;
  totalEstimated24hMm: number;
}

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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [automaticFloodError, setAutomaticFloodError] = useState<string | null>(null);
  const [liveDate, setLiveDate] = useState<Date>(() => new Date());
  const [secondsSinceLastUpdate, setSecondsSinceLastUpdate] = useState<number>(0);
  const [liveTicker, setLiveTicker] = useState<number>(0);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
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
      setSecondsSinceLastUpdate(0);
      setWeatherError(errors.length ? errors.join(" ") : null);
      setOffline(false);
      try { localStorage.setItem(KEY, JSON.stringify(snap)); } catch { /* stockage plein ou indisponible */ }
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Horloge temps réel seconde par seconde (1 Hz)
  useEffect(() => {
    const secondTimer = window.setInterval(() => {
      const now = new Date();
      setLiveDate(now);
      setLiveTicker((t) => t + 1);
      if (dataRef.current.updatedAt) {
        const diffSec = Math.max(0, Math.floor((now.getTime() - new Date(dataRef.current.updatedAt).getTime()) / 1000));
        setSecondsSinceLastUpdate(diffSec);
      }
    }, 1000);
    return () => window.clearInterval(secondTimer);
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(refresh, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  // Calcul continu des métriques météo temps réel
  const liveMetrics: LiveWeatherMetrics = {
    instantaneousMaxMmH: data.weather.reduce((max, w) => {
      const val = w.observed_precip_mm_h ?? w.modeled_precip_mm_h ?? 0;
      return Math.max(max, val);
    }, 0),
    activeRainCount: data.weather.filter((w) => (w.observed_precip_mm_h ?? w.modeled_precip_mm_h ?? 0) > 0).length,
    forecastRainCount: data.weather.filter((w) => (w.forecast_intensity_3h_mm_h ?? w.intensity_3h_mm_h) > 0).length,
    highestRiskItem: data.weather.reduce<WeatherItem | null>((highest, item) => {
      if (!highest) return item;
      const rank = (lvl?: string | null) => (lvl === "red" ? 3 : lvl === "orange" ? 2 : lvl === "yellow" ? 1 : 0);
      const currLvl = rank(item.observed_level ?? item.level);
      const prevLvl = rank(highest.observed_level ?? highest.level);
      return currLvl > prevLvl ? item : highest;
    }, null),
    averageRainMmH: data.weather.length > 0
      ? data.weather.reduce((sum, w) => sum + (w.observed_precip_mm_h ?? w.modeled_precip_mm_h ?? 0), 0) / data.weather.length
      : 0,
    totalEstimated24hMm: data.weather.reduce((sum, w) => sum + (w.observed_24h_mm ?? w.modeled_24h_mm ?? w.accumulated_24h_mm ?? 0), 0),
  };

  return {
    ...data,
    offline,
    loading,
    isRefreshing,
    weatherError,
    automaticFloodError,
    liveDate,
    secondsSinceLastUpdate,
    liveTicker,
    liveMetrics,
    refresh,
  };
}
