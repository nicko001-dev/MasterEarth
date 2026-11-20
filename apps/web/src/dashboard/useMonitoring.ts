import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertItem,
  SensorState,
  WeatherItem,
  WeatherStatus,
  fetchAlerts,
  fetchHealth,
  fetchSensors,
  fetchWeather,
  fetchWeatherStatus,
} from "../services/api";
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

/** Résultat d'une source : la valeur ou son erreur, jamais une exception propagée. */
type Settled<T> = { value: T } | { error: unknown };

function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  return promise.then((value) => ({ value })).catch((error: unknown) => ({ error }));
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

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

/**
 * Charge capteurs, alertes, météo et impacts automatiques.
 *
 * Chaque source est indépendante : si une seule route échoue (401, 503, base
 * momentanément indisponible…), les autres continuent de s'afficher et les
 * dernières valeurs connues de la source défaillante restent visibles. Le mode
 * « Hors ligne » n'est activé que lorsque **l'API entière** est injoignable,
 * jamais pour une panne partielle. C'est la santé de `/health` qui fait foi,
 * avec un repli sur « au moins une source a répondu » si le proxy bloque le
 * chemin `/health`.
 */
export function useMonitoring() {
  const cached = readCache();
  const [data, setData] = useState<Snapshot>(cached ?? { sensors: [], alerts: [], weather: [], weatherStatus: null, automaticFloods: null, updatedAt: "" });
  const dataRef = useRef(data);
  dataRef.current = data;
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [automaticFloodError, setAutomaticFloodError] = useState<string | null>(null);
  const [liveDate, setLiveDate] = useState<Date>(() => new Date());
  const [secondsSinceLastUpdate, setSecondsSinceLastUpdate] = useState<number>(0);
  const [liveTicker, setLiveTicker] = useState<number>(0);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [health, sensorsResult, alertsResult, weatherResult, statusResult, automaticResult] = await Promise.all([
        settle(fetchHealth()),
        settle(fetchSensors()),
        settle(fetchAlerts()),
        settle(fetchWeather()),
        settle(fetchWeatherStatus()),
        settle(fetchAutomaticFloods()),
      ]);

      const sources = [sensorsResult, alertsResult, weatherResult, statusResult, automaticResult];
      const succeeded = sources.filter((result) => "value" in result).length;
      // Une seule réponse suffit à prouver que le backend est joignable.
      const apiReachable = "value" in health || succeeded > 0;
      setOffline(!apiReachable);

      // On conserve systématiquement les dernières valeurs connues : une panne
      // ne doit jamais effacer la carte, les statistiques ou les couches 3D.
      const snap: Snapshot = { ...dataRef.current };
      const errors: string[] = [];
      const dataErrors: string[] = [];

      if ("value" in sensorsResult) snap.sensors = sensorsResult.value;
      else dataErrors.push(`Capteurs : ${errorMessage(sensorsResult.error, "source indisponible")}`);
      if ("value" in alertsResult) snap.alerts = alertsResult.value;
      else dataErrors.push(`Alertes : ${errorMessage(alertsResult.error, "source indisponible")}`);

      if ("value" in weatherResult) snap.weather = weatherResult.value;
      else errors.push(`Données météo indisponibles (${errorMessage(weatherResult.error, "source indisponible")}).`);

      if ("value" in statusResult) snap.weatherStatus = statusResult.value;
      else errors.push(`État des sources météo indisponible (${errorMessage(statusResult.error, "source indisponible")}).`);

      if ("value" in automaticResult) {
        const automaticFloods = withoutDemoData({
          ...snap,
          automaticFloods: automaticResult.value,
        }).automaticFloods!;
        if (!sameAutomaticEvents(dataRef.current.automaticFloods, automaticFloods)) {
          snap.automaticFloods = automaticFloods;
        }
      }
      setAutomaticFloodError("value" in automaticResult ? null : errorMessage(automaticResult.error, "Impacts automatiques indisponibles."));
      setDataError(dataErrors.length ? dataErrors.join(" ") : null);

      // L'horodatage ne progresse que si au moins une donnée fraîche est arrivée.
      if (succeeded > 0) {
        snap.updatedAt = new Date().toISOString();
        setSecondsSinceLastUpdate(0);
      }
      // Le filtrage anti-démonstration s'applique au snapshot final, donc
      // aussi aux réponses fraîches (et pas seulement au cache relu au démarrage).
      const cleaned = withoutDemoData(snap);
      dataRef.current = cleaned;
      setData(cleaned);
      setWeatherError(errors.length ? errors.join(" ") : null);
      if (succeeded > 0) {
        try { localStorage.setItem(KEY, JSON.stringify(cleaned)); } catch { /* stockage plein ou indisponible */ }
      }
    } catch {
      // Sécurité : même une erreur inattendue ne doit pas effacer les données.
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
    dataError,
    automaticFloodError,
    liveDate,
    secondsSinceLastUpdate,
    liveTicker,
    liveMetrics,
    refresh,
  };
}
