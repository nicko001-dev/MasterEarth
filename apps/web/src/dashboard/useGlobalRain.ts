/**
 * Compteur mondial de points en pluie, indépendant des capteurs déployés.
 *
 * Le scan est lent à changer (cache serveur de 10 minutes) : on le rafraîchit
 * donc peu souvent. En cas d'échec — réseau coupé, quota Open-Meteo épuisé ou
 * réponse ``available: false`` — la dernière mesure VALIDE reste affichée et
 * signalée périmée, mais aucune valeur n'est inventée et aucun zéro n'est
 * affiché à la place d'une donnée manquante. Quand le scan est indisponible,
 * un nouvel essai est tenté toutes les 60 secondes au lieu d'attendre le
 * rafraîchissement complet de 10 minutes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { GlobalRainResponse, fetchGlobalRain } from "../services/api";

export const GLOBAL_RAIN_REFRESH_MS = 10 * 60_000;
export const GLOBAL_RAIN_UNAVAILABLE_RETRY_MS = 60_000;

export type GlobalRainStatus = "idle" | "loading" | "ready" | "unavailable";

/** Formate l'âge d'une mesure (affichage, sans calcul métier). */
export function formatAgeSeconds(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, "0")} min`;
  if (minutes > 0) return `${minutes} min`;
  return `${total} s`;
}

export interface GlobalRainState {
  data: GlobalRainResponse | null;
  status: GlobalRainStatus;
  error: string | null;
  stale: boolean;
  retry: () => void;
}

export function useGlobalRain(
  options: {
    enabled?: boolean;
    fetcher?: typeof fetchGlobalRain;
    refreshMs?: number;
    unavailableRetryMs?: number;
  } = {},
): GlobalRainState {
  const {
    enabled = true,
    fetcher = fetchGlobalRain,
    refreshMs = GLOBAL_RAIN_REFRESH_MS,
    unavailableRetryMs = GLOBAL_RAIN_UNAVAILABLE_RETRY_MS,
  } = options;
  const [data, setData] = useState<GlobalRainResponse | null>(null);
  const [status, setStatus] = useState<GlobalRainStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

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
        const result = await fetcher();
        if (!active || !mounted.current) return;
        if (result.available) {
          // Mesure valide (éventuellement périmée côté serveur) : on l'affiche
          // telle quelle, avec son âge, sans jamais la confondre avec du zéro.
          setData(result);
          setError(null);
          setStale(result.stale === true);
          setStatus("ready");
        } else {
          // Le serveur n'a aucune valeur exploitable : la dernière mesure
          // valide reste affichée et marquée périmée ; on n'écrase rien.
          setError("Aucune valeur exploitable pour le moment.");
          setStale(true);
          setStatus((current) => (current === "ready" ? current : "unavailable"));
        }
      } catch (cause) {
        if (!active || !mounted.current) return;
        setError(cause instanceof Error ? cause.message : "Scan mondial indisponible.");
        setStale(true);
        setStatus((current) => (current === "ready" ? current : "unavailable"));
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), refreshMs);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [enabled, fetcher, refreshMs, attempt]);

  // Indisponible : nouvel essai rapide plutôt que 10 minutes d'attente.
  useEffect(() => {
    if (enabled && status !== "unavailable") return;
    const timer = window.setTimeout(() => retry(), unavailableRetryMs);
    return () => window.clearTimeout(timer);
  }, [enabled, status, attempt, unavailableRetryMs, retry]);

  return { data, status, error, stale, retry };
}
