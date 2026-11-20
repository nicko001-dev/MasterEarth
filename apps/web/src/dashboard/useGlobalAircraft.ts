/**
 * Trafic aérien réel à l'échelle du globe.
 *
 * L'endpoint régional est volontairement borné (120° de longitude, 30 M km²) :
 * à l'ouverture d'IntelliFlood, aucune emprise n'est donc éligible et le globe
 * semblait figé. Ce hook consulte l'endpoint mondial, qui renvoie un
 * échantillon d'observations ADS-B réparties sur tous les continents.
 *
 * La forme de l'état est identique à `useLiveAircraft` : les cartes 2D et 3D
 * peuvent basculer de l'un à l'autre sans changer leur code de rendu.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchGlobalAircraft } from "../services/liveAircraft";
import {
  AIRCRAFT_REFRESH_MS,
  LiveAircraftState,
  LiveAircraftStatus,
  providerClockOffsetMs,
} from "./useLiveAircraft";

export function useGlobalAircraft(
  options: {
    enabled?: boolean;
    fetcher?: typeof fetchGlobalAircraft;
    refreshMs?: number;
  } = {},
): LiveAircraftState {
  const { enabled = true, fetcher = fetchGlobalAircraft, refreshMs = AIRCRAFT_REFRESH_MS } = options;
  const [aircraft, setAircraft] = useState<LiveAircraftState["aircraft"]>([]);
  const [status, setStatus] = useState<LiveAircraftStatus>("idle");
  const [attribution, setAttribution] = useState("OpenSky Network");
  const [attributionUrl, setAttributionUrl] = useState("https://opensky-network.org/");
  const [license, setLicense] = useState("");
  const [degraded, setDegraded] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [limitations, setLimitations] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const mounted = useRef(true);
  const retry = useCallback(() => setRetryToken((value) => value + 1), []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = async () => {
      setStatus((current) => (current === "ready" ? current : "loading"));
      try {
        const product = await fetcher();
        if (!active || !mounted.current) return;
        setAircraft(product.aircraft);
        setAttribution(product.attribution);
        setAttributionUrl(product.attributionUrl);
        setLicense(product.license);
        setDegraded(product.degraded);
        setGeneratedAt(product.generatedAt);
        setClockOffsetMs(
          providerClockOffsetMs(product.upstreamTime, product.generatedAt),
        );
        setLimitations(product.limitations);
        setError(null);
        setStatus("ready");
      } catch (cause) {
        if (!active || !mounted.current) return;
        // On garde les dernières positions : une panne ne doit pas figer le globe.
        setError(cause instanceof Error ? cause.message : "Trafic aérien mondial indisponible.");
        setDegraded(true);
        setStatus((current) => (current === "ready" ? current : "unavailable"));
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), refreshMs);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [enabled, fetcher, refreshMs, retryToken]);

  return {
    aircraft,
    status,
    attribution,
    attributionUrl,
    license,
    degraded,
    generatedAt,
    clockOffsetMs,
    limitations,
    error,
    retry,
  };
}
