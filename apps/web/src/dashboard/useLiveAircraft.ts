/**
 * Trafic aérien mondial de l'emprise visible.
 *
 * Le service est facultatif et respecte le quota du fournisseur : il ne
 * demande rien en vue mondiale, attend un déplacement stable (anti-rebond),
 * met en cache par emprise arrondie et rafraîchit lentement. En cas d'échec,
 * les positions déjà reçues restent affichées et un nouvel essai est possible.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Aircraft, AircraftBounds, fetchAircraft } from "../services/liveAircraft";
import { boundsAreaKm2 } from "../services/weatherMerge";

/** Emprise maximale acceptée par l'API et par le fournisseur. */
export const AIRCRAFT_MAX_AREA_KM2 = 30_000_000;
/** Au-delà de cette largeur, la requête OpenSky serait trop coûteuse. */
export const AIRCRAFT_MAX_LONGITUDE_SPAN = 120;
const DEBOUNCE_MS = 700;
const KEY_DEGREES = 0.1;
export const AIRCRAFT_REFRESH_MS = 45_000;
/** Décalage d'horloge maximal accepté entre le fournisseur et le serveur. */
export const AIRCRAFT_MAX_CLOCK_SKEW_MS = 300_000;

export type LiveAircraftStatus = "idle" | "loading" | "ready" | "paused" | "unavailable";

export type LiveAircraftState = {
  aircraft: Aircraft[];
  status: LiveAircraftStatus;
  attribution: string;
  attributionUrl: string;
  license: string;
  degraded: boolean;
  generatedAt: number | null;
  /** Décalage à ajouter à l'horloge locale pour suivre celle du fournisseur. */
  clockOffsetMs: number;
  limitations: string[];
  error: string | null;
  retry: () => void;
};

function boundsKey(bounds: AircraftBounds): string {
  const rounded = [bounds.west, bounds.south, bounds.east, bounds.north].map(
    (value) => Math.round(value / KEY_DEGREES) * KEY_DEGREES,
  );
  return rounded.join(",");
}

/**
 * Décalage entre l'horloge du fournisseur et celle du serveur, en millisecondes.
 *
 * OpenSky peut dater une observation quelques dizaines de secondes dans le
 * futur si son horloge avance. Sans correction, l'interpolation resterait
 * immobile jusqu'à ce que l'horloge locale rattrape chaque observation. Le
 * décalage est borné : une valeur aberrante ne doit pas projeter les aéronefs
 * à des centaines de kilomètres.
 */
export function providerClockOffsetMs(
  upstreamTime: number | null,
  generatedAt: number,
): number {
  if (
    upstreamTime == null ||
    !Number.isFinite(upstreamTime) ||
    !Number.isFinite(generatedAt)
  ) {
    return 0;
  }
  const offset = upstreamTime * 1000 - generatedAt;
  if (!Number.isFinite(offset)) return 0;
  return Math.max(
    -AIRCRAFT_MAX_CLOCK_SKEW_MS,
    Math.min(AIRCRAFT_MAX_CLOCK_SKEW_MS, offset),
  );
}

/** Une emprise est-elle valide et assez locale pour interroger OpenSky ? */
export function aircraftBoundsEligible(bounds: AircraftBounds): boolean {
  const values = [bounds.west, bounds.south, bounds.east, bounds.north];
  if (!values.every(Number.isFinite)) return false;
  return bounds.west >= -180
    && bounds.east <= 180
    && bounds.south >= -90
    && bounds.north <= 90
    && bounds.west < bounds.east
    && bounds.south < bounds.north
    && bounds.east - bounds.west <= AIRCRAFT_MAX_LONGITUDE_SPAN
    && boundsAreaKm2(bounds) <= AIRCRAFT_MAX_AREA_KM2;
}

export function useLiveAircraft(
  bounds: AircraftBounds | null,
  options: {
    enabled?: boolean;
    fetcher?: typeof fetchAircraft;
    refreshMs?: number;
  } = {},
): LiveAircraftState {
  const { enabled = true, fetcher = fetchAircraft, refreshMs = AIRCRAFT_REFRESH_MS } = options;
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [status, setStatus] = useState<LiveAircraftStatus>("idle");
  const [attribution, setAttribution] = useState("OpenSky Network");
  const [attributionUrl, setAttributionUrl] = useState("https://opensky-network.org/");
  const [license, setLicense] = useState("");
  const [degraded, setDegraded] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [limitations, setLimitations] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const unavailable = useRef(false);
  const mounted = useRef(true);
  const [retryToken, setRetryToken] = useState(0);

  const key = useMemo(() => (bounds ? boundsKey(bounds) : ""), [bounds]);
  const eligible = bounds ? aircraftBoundsEligible(bounds) : false;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Une nouvelle emprise mérite une nouvelle tentative, même après une erreur
  // transitoire (quota, réseau). Le cache serveur évite les appels redondants.
  useEffect(() => {
    unavailable.current = false;
  }, [key]);

  useEffect(() => {
    if (!enabled || !bounds) {
      setAircraft([]);
      setClockOffsetMs(0);
      setStatus("idle");
      return;
    }
    if (!eligible) {
      setAircraft([]);
      setClockOffsetMs(0);
      setStatus("paused");
      return;
    }
    if (unavailable.current) return;
    let cancelled = false;
    // La clé arrondie sert uniquement à mutualiser les rafraîchissements. La
    // requête conserve l'emprise exacte : à fort zoom, arrondir à 0,1° peut
    // réduire l'emprise à une largeur nulle et faire échouer la validation.
    const requestBounds: AircraftBounds = bounds;

    const run = () => {
      if (cancelled || unavailable.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      setStatus((current) => (current === "ready" ? current : "loading"));
      void fetcher(requestBounds)
        .then((product) => {
          if (cancelled || !mounted.current) return;
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
        })
        .catch((reason: unknown) => {
          if (cancelled || !mounted.current) return;
          unavailable.current = true;
          setStatus("unavailable");
          setError(reason instanceof Error ? reason.message : "Trafic aérien indisponible.");
        });
    };

    const debounce = window.setTimeout(run, DEBOUNCE_MS);
    const timer = window.setInterval(run, Math.max(15_000, refreshMs));
    return () => {
      cancelled = true;
      window.clearTimeout(debounce);
      window.clearInterval(timer);
    };
  }, [bounds, enabled, eligible, fetcher, key, refreshMs, retryToken]);

  const retry = useCallback(() => {
    unavailable.current = false;
    setError(null);
    setStatus("idle");
    setRetryToken((value) => value + 1);
  }, []);

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
