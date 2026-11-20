/**
 * Réseau routier de la vue courante, pour le trafic animé.
 *
 * Le tracé est demandé uniquement en vue locale (le trafic routier n'a aucun
 * sens à l'échelle d'un continent), après stabilisation de la caméra. Le
 * serveur répond `202` tant qu'Overpass travaille : le hook réessaie alors
 * quelques secondes plus tard, sans bloquer l'interface. Les positions des
 * véhicules sont recalculées localement à partir de l'heure, donc le flux
 * continue même si le réseau devient indisponible.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bounds } from "../globe/borders";
import { Road } from "../globe/traffic";
import {
  fetchRoads,
  RoadsProduct,
  roadsBoundsEligible,
  ROADS_ATTRIBUTION,
  ROADS_ATTRIBUTION_URL,
  ROADS_LICENSE,
} from "../services/liveRoads";

/** Altitude maximale : au-delà, les véhicules seraient invisibles et inutiles. */
export const ROADS_MAX_CAMERA_HEIGHT_M = 420_000;
const DEBOUNCE_MS = 900;
const RETRY_MS = 4_000;
const MAX_RETRIES = 20;
export const ROADS_REFRESH_MS = 20 * 60_000;
const KEY_DEGREES = 0.02;
/** Référence stable : un tableau vide recréé à chaque rendu relancerait les effets. */
const NO_ROADS: Road[] = [];
const NO_LIMITATIONS: string[] = [];

export type RoadsStatus = "idle" | "loading" | "ready" | "paused" | "unavailable";

export type LiveRoadsState = {
  roads: Road[];
  status: RoadsStatus;
  attribution: string;
  attributionUrl: string;
  license: string;
  degraded: boolean;
  limitations: string[];
  error: string | null;
  retry: () => void;
};

function boundsKey(bounds: Bounds): string {
  return [bounds.west, bounds.south, bounds.east, bounds.north]
    .map((value) => Math.round(value / KEY_DEGREES) * KEY_DEGREES)
    .join(",");
}

export function useLiveRoads(
  bounds: Bounds | null,
  options: {
    enabled?: boolean;
    cameraHeightM?: number | null;
    fetcher?: typeof fetchRoads;
    refreshMs?: number;
  } = {},
): LiveRoadsState {
  const {
    enabled = true,
    cameraHeightM = 0,
    fetcher = fetchRoads,
    refreshMs = ROADS_REFRESH_MS,
  } = options;
  const [product, setProduct] = useState<RoadsProduct | null>(null);
  const [status, setStatus] = useState<RoadsStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const mounted = useRef(true);
  const unavailable = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const key = useMemo(() => (bounds ? boundsKey(bounds) : ""), [bounds]);
  const eligible = bounds ? roadsBoundsEligible(bounds) : false;
  const inRange = !Number.isFinite(cameraHeightM)
    ? true
    : (cameraHeightM ?? 0) <= ROADS_MAX_CAMERA_HEIGHT_M;

  useEffect(() => {
    unavailable.current = false;
  }, [key]);

  useEffect(() => {
    if (!enabled || !bounds) {
      setStatus("idle");
      return;
    }
    if (!eligible) {
      // Vue trop large : on conserve le dernier tracé connu mais on n'interroge
      // plus le fournisseur, et l'interface indique la raison.
      setStatus("paused");
      return;
    }
    if (!inRange) {
      setStatus("paused");
      return;
    }
    if (unavailable.current) return;

    let cancelled = false;
    let retries = 0;
    let retryTimer: number | null = null;
    let intervalTimer: number | null = null;

    const run = () => {
      if (cancelled || unavailable.current || !mounted.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      setStatus((current) => (current === "ready" ? current : "loading"));
      void fetcher(bounds)
        .then((next) => {
          if (cancelled || !mounted.current) return;
          if (next.status === "pending" && next.roads.length === 0) {
            setStatus((current) => (current === "ready" ? current : "loading"));
            retries += 1;
            if (retries <= MAX_RETRIES && !cancelled) {
              retryTimer = window.setTimeout(run, RETRY_MS);
            } else {
              setStatus("unavailable");
              setError("Le réseau routier met trop de temps à répondre.");
            }
            return;
          }
          retries = 0;
          setProduct(next);
          setError(null);
          setStatus("ready");
        })
        .catch((reason: unknown) => {
          if (cancelled || !mounted.current) return;
          unavailable.current = true;
          setStatus((current) => (current === "ready" ? current : "unavailable"));
          setError(reason instanceof Error ? reason.message : "Réseau routier indisponible.");
        });
    };

    const debounce = window.setTimeout(run, DEBOUNCE_MS);
    intervalTimer = window.setInterval(run, Math.max(60_000, refreshMs));
    return () => {
      cancelled = true;
      window.clearTimeout(debounce);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      if (intervalTimer !== null) window.clearInterval(intervalTimer);
    };
  }, [bounds, enabled, eligible, fetcher, inRange, key, refreshMs, retryToken]);

  const retry = useCallback(() => {
    unavailable.current = false;
    setError(null);
    setStatus("idle");
    setRetryToken((value) => value + 1);
  }, []);

  return {
    roads: product?.roads ?? NO_ROADS,
    status,
    attribution: product?.attribution ?? ROADS_ATTRIBUTION,
    attributionUrl: product?.attributionUrl ?? ROADS_ATTRIBUTION_URL,
    license: product?.license ?? ROADS_LICENSE,
    degraded: product?.degraded ?? false,
    limitations: product?.limitations ?? NO_LIMITATIONS,
    error,
    retry,
  };
}
