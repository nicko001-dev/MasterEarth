/**
 * Veille mondiale des aléas réels.
 *
 * Le serveur mutualise un cache de 90 secondes environ : interroger plus vite
 * ne produirait pas d'événement plus récent et solliciterait inutilement les
 * organismes. En cas de panne, la dernière photographie valide reste affichée
 * et clairement marquée périmée ; aucun événement de secours n'est fabriqué.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchHazardCatalog,
  fetchHazards,
  HazardCatalog,
  HazardSnapshot,
} from "../services/hazards";

export const HAZARDS_REFRESH_MS = 90_000;
export const HAZARDS_RETRY_MS = 60_000;

export type HazardFeedStatus = "idle" | "loading" | "ready" | "unavailable";

export interface HazardFeedState {
  data: HazardSnapshot | null;
  catalog: HazardCatalog | null;
  catalogError: string | null;
  status: HazardFeedStatus;
  error: string | null;
  stale: boolean;
  refresh: () => void;
}

export function useHazards(options: {
  enabled?: boolean;
  snapshotFetcher?: typeof fetchHazards;
  catalogFetcher?: typeof fetchHazardCatalog;
  refreshMs?: number;
} = {}): HazardFeedState {
  const {
    enabled = true,
    snapshotFetcher = fetchHazards,
    catalogFetcher = fetchHazardCatalog,
    refreshMs = HAZARDS_REFRESH_MS,
  } = options;
  const [data, setData] = useState<HazardSnapshot | null>(null);
  const [catalog, setCatalog] = useState<HazardCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [status, setStatus] = useState<HazardFeedStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);
  const lastLoad = useRef(0);
  const loading = useRef(false);

  const refresh = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const controller = new AbortController();

    const loadCatalog = async () => {
      try {
        const result = await catalogFetcher(controller.signal);
        if (!active || !mounted.current) return;
        setCatalog(result);
        setCatalogError(null);
      } catch (cause) {
        if (!active || !mounted.current) return;
        setCatalogError(
          cause instanceof Error ? cause.message : "Catalogue des aléas indisponible.",
        );
      }
    };

    const load = async (force = false) => {
      if (loading.current && !force) return;
      if (!force && lastLoad.current && Date.now() - lastLoad.current < 30_000) return;
      loading.current = true;
      setStatus((current) => (current === "ready" ? current : "loading"));
      try {
        const result = await snapshotFetcher(controller.signal);
        if (!active || !mounted.current) return;
        lastLoad.current = Date.now();
        if (result.available) {
          setData(result);
          setError(null);
          // `degraded` signale une source secondaire en panne, pas un cache :
          // les sources en échec restent visibles individuellement. Seul
          // `stale` indique que l'instantané lui-même est ancien.
          setStale(result.stale === true);
          setStatus("ready");
        } else {
          // Aucune source disponible : on conserve la dernière photographie
          // valide au lieu d'afficher un faux « aucun aléa dans le monde ».
          setError("Aucune source d'aléas n'a répondu pour le moment.");
          setStale(true);
          setStatus((current) => (current === "ready" ? current : "unavailable"));
        }
      } catch (cause) {
        if (!active || !mounted.current) return;
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Veille mondiale indisponible.");
        setStale(true);
        setStatus((current) => (current === "ready" ? current : "unavailable"));
      } finally {
        loading.current = false;
      }
    };

    void load(true);
    void loadCatalog();
    const timer = window.setInterval(() => void load(), refreshMs);

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastLoad.current >= 60_000) void load(true);
    };
    const onOnline = () => void load(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      active = false;
      controller.abort();
      loading.current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [enabled, snapshotFetcher, catalogFetcher, refreshMs, attempt]);

  // Une veille indisponible réessaie plus vite qu'elle ne se rafraîchit.
  useEffect(() => {
    if (!enabled || status === "ready" || status === "loading") return;
    const timer = window.setTimeout(refresh, HAZARDS_RETRY_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, status, refresh]);

  return { data, catalog, catalogError, status, error, stale, refresh };
}
