import { useCallback, useEffect, useState } from "react";
import { AlertItem, SensorState, WeatherItem, fetchAlerts, fetchSensors, fetchWeather } from "../services/api";

const KEY = "intelliflood.monitoring.v1";
const REFRESH_MS = 10_000;

interface Snapshot { sensors: SensorState[]; alerts: AlertItem[]; weather: WeatherItem[]; updatedAt: string }

function readCache(): Snapshot | null {
  try { const c = JSON.parse(localStorage.getItem(KEY) ?? "null"); return c && { weather: [], ...c }; } catch { return null; }
}

/** Charge capteurs et alertes ; en cas d'échec réseau, reprend les dernières données connues (hors ligne). */
export function useMonitoring() {
  const cached = readCache();
  const [data, setData] = useState<Snapshot>(cached ?? { sensors: [], alerts: [], weather: [], updatedAt: "" });
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [sensors, alerts, weather] = await Promise.all([fetchSensors(), fetchAlerts(), fetchWeather().catch(() => [])]);
      const snap = { sensors, alerts, weather, updatedAt: new Date().toISOString() };
      setData(snap);
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

  return { ...data, offline, loading, refresh };
}
