/**
 * Couverture météo mondiale à la demande.
 *
 * La base météo historisée ne couvre qu'une partie du réseau ; le globe et la
 * carte 2D doivent pouvoir afficher les conditions partout dans le monde. On
 * interroge donc l'API pour l'emprise visible (`/api/v1/weather/viewport`),
 * avec un anti-rebond et une mise en cache par emprise arrondie.
 *
 * Le service est entièrement facultatif : s'il est indisponible (hors ligne,
 * endpoint absent, quota), les points déjà connus restent affichés et aucun
 * message d'erreur bloquant n'apparaît.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWeatherViewport, WeatherItem } from "../services/api";
import { Bounds } from "../globe/borders";
import { boundsAreaKm2 } from "../services/weatherMerge";

/**
 * Surface de la Terre : une vue mondiale entière reste éligible. L'API adapte
 * l'espacement pour ne renvoyer que 60 points au maximum.
 */
const MAX_AREA_KM2 = 510_100_000;
const DEBOUNCE_MS = 1_800;
const KEY_DEGREES = 0.5;

export type WorldWeatherStatus = "idle" | "loading" | "ready" | "unavailable";

export type WorldWeatherState = {
  points: WeatherItem[];
  status: WorldWeatherStatus;
  attribution: string;
  error: string | null;
  retry: () => void;
};

function boundsKey(bounds: Bounds): string {
  const rounded = [bounds.west, bounds.south, bounds.east, bounds.north].map(
    (value) => Math.round(value / KEY_DEGREES) * KEY_DEGREES,
  );
  return rounded.join(",");
}

/**
 * Une emprise est-elle interrogeable par l'API météo ?
 *
 * L'API refuse une longitude hors de [-180, 180], une emprise inversée et le
 * franchissement de l'antiméridien. Ces vues restent gracieuses : on conserve
 * les points déjà affichés au lieu de désactiver la couverture mondiale.
 */
export function weatherBoundsEligible(bounds: Bounds): boolean {
  const values = [bounds.west, bounds.south, bounds.east, bounds.north];
  if (!values.every(Number.isFinite)) return false;
  return bounds.west >= -180
    && bounds.east <= 180
    && bounds.south >= -90
    && bounds.north <= 90
    && bounds.west < bounds.east
    && bounds.south < bounds.north
    && boundsAreaKm2(bounds) <= MAX_AREA_KM2;
}

export function useWorldWeather(
  bounds: Bounds | null,
  options: { enabled?: boolean; fetcher?: typeof fetchWeatherViewport } = {},
): WorldWeatherState {
  const { enabled = true, fetcher = fetchWeatherViewport } = options;
  const [points, setPoints] = useState<WeatherItem[]>([]);
  const [status, setStatus] = useState<WorldWeatherStatus>("idle");
  const [attribution, setAttribution] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lastKey = useRef("");
  const unavailable = useRef(false);
  const mounted = useRef(true);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Une nouvelle emprise mérite une nouvelle tentative, même après un échec
  // transitoire (quota, réseau). Sans cela, un seul refus 429/422 couperait la
  // couverture météo pour toute la session.
  useEffect(() => {
    if (!bounds) return;
    if (boundsKey(bounds) !== lastKey.current) unavailable.current = false;
  }, [bounds]);

  useEffect(() => {
    if (!enabled || !bounds) return;
    if (!weatherBoundsEligible(bounds)) return;
    if (unavailable.current) return;
    const key = boundsKey(bounds);
    if (key === lastKey.current) return;
    const timer = window.setTimeout(() => {
      lastKey.current = key;
      setStatus("loading");
      void fetcher(bounds)
        .then((payload) => {
          if (!mounted.current) return;
          if (payload.degraded) {
            // Le fournisseur est momentanément indisponible : on garde les
            // points connus et on réessaiera au prochain déplacement.
            lastKey.current = "";
            setStatus("ready");
            setError(null);
            return;
          }
          setPoints(payload.points);
          setAttribution(payload.attribution ?? "");
          setError(null);
          setStatus("ready");
        })
        .catch((reason: unknown) => {
          if (!mounted.current) return;
          unavailable.current = true;
          setStatus("unavailable");
          setError(reason instanceof Error ? reason.message : "Couverture météo mondiale indisponible.");
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [bounds, enabled, fetcher, retryToken]);

  const retry = useCallback(() => {
    unavailable.current = false;
    lastKey.current = "";
    setError(null);
    setStatus("idle");
    setRetryToken((value) => value + 1);
  }, []);

  return { points, status, attribution, error, retry };
}
