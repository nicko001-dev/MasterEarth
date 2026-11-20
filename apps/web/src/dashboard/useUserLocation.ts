/**
 * État de la localisation de l'utilisateur.
 *
 * Le consentement est demandé à l'entrée dans la plateforme. S'il est accordé,
 * la position est suivie en continu (`watchPosition`) et affichée sur la carte
 * 2D comme sur le globe 3D. En cas de refus, aucun suivi n'est effectué et
 * aucun marqueur n'apparaît ; l'utilisateur peut revenir sur son choix depuis
 * le bouton de localisation.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  describeGeolocationError,
  geolocationSupported,
  GeolocationStatus,
  normalizePosition,
  POSITION_OPTIONS,
  queryPermissionState,
  readConsent,
  StoredConsent,
  UserPosition,
  writeConsent,
} from "../services/geolocation";

export type UserLocationController = {
  status: GeolocationStatus;
  position: UserPosition | null;
  error: string | null;
  consent: StoredConsent | null;
  promptVisible: boolean;
  supported: boolean;
  requestLocation: () => Promise<UserPosition | null>;
  refreshLocation: () => Promise<UserPosition | null>;
  postponePrompt: () => void;
  refuseLocation: () => void;
  forgetLocation: () => void;
};

export function useUserLocation(): UserLocationController {
  const supported = geolocationSupported();
  const [status, setStatus] = useState<GeolocationStatus>(supported ? "idle" : "unsupported");
  const [position, setPosition] = useState<UserPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState<StoredConsent | null>(() => readConsent());
  const [promptVisible, setPromptVisible] = useState(false);
  const watchId = useRef<number | null>(null);
  const mounted = useRef(true);

  const stopWatch = useCallback(() => {
    if (watchId.current !== null && supported) {
      try {
        navigator.geolocation.clearWatch(watchId.current);
      } catch {
        // Le navigateur a pu invalider le suivi : rien à faire.
      }
    }
    watchId.current = null;
  }, [supported]);

  const startWatch = useCallback(() => {
    if (!supported || watchId.current !== null) return;
    try {
      watchId.current = navigator.geolocation.watchPosition(
        (raw) => {
          const next = normalizePosition(raw);
          if (next && mounted.current) {
            setPosition(next);
            setStatus("ready");
          }
        },
        (failure) => {
          if (!mounted.current) return;
          if (failure.code === 1) {
            writeConsent("denied");
            setConsent("denied");
            setStatus("denied");
            // Une permission révoquée ne doit laisser ni marqueur ni position.
            setPosition(null);
            setError(null);
            stopWatch();
          }
        },
        { ...POSITION_OPTIONS, maximumAge: 10_000 },
      );
    } catch {
      // `watchPosition` peut échouer si la permission vient d'être révoquée.
    }
  }, [supported, stopWatch]);

  const locate = useCallback(async (): Promise<UserPosition | null> => {
    if (!supported) {
      setStatus("unsupported");
      return null;
    }
    setStatus("locating");
    setError(null);
    try {
      const raw = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, POSITION_OPTIONS);
      });
      const next = normalizePosition(raw);
      if (!next) {
        setStatus("error");
        setError("Position reçue invalide.");
        return null;
      }
      writeConsent("granted");
      setConsent("granted");
      setPosition(next);
      setStatus("ready");
      setPromptVisible(false);
      startWatch();
      return next;
    } catch (failure) {
      const code = (failure as GeolocationPositionError | undefined)?.code;
      if (code === 1) {
        writeConsent("denied");
        setConsent("denied");
        setStatus("denied");
        setPosition(null);
        setError(describeGeolocationError(failure as GeolocationPositionError));
      } else {
        setStatus("error");
        setError(describeGeolocationError(failure as GeolocationPositionError));
      }
      return null;
    }
  }, [supported, startWatch]);

  // Au montage : applique le choix mémorisé, sinon demande explicitement.
  useEffect(() => {
    mounted.current = true;
    if (!supported) return () => { mounted.current = false; };
    let cancelled = false;
    void (async () => {
      const stored = readConsent();
      if (stored === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }
      if (stored === "granted") {
        if (!cancelled) void locate();
        return;
      }
      const permission = await queryPermissionState();
      if (cancelled) return;
      if (permission === "granted") {
        void locate();
        return;
      }
      if (permission === "denied") {
        writeConsent("denied");
        setConsent("denied");
        setStatus("denied");
        return;
      }
      setStatus("asking");
      setPromptVisible(true);
    })();
    return () => {
      cancelled = true;
      mounted.current = false;
      stopWatch();
    };
    // La découverte initiale ne doit se produire qu'une seule fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestLocation = useCallback(async () => {
    setPromptVisible(false);
    return locate();
  }, [locate]);

  const refreshLocation = useCallback(async () => {
    return locate();
  }, [locate]);

  const postponePrompt = useCallback(() => {
    setPromptVisible(false);
    setStatus((current) => (current === "asking" ? "idle" : current));
  }, []);

  const refuseLocation = useCallback(() => {
    writeConsent("denied");
    setConsent("denied");
    setStatus("denied");
    setPromptVisible(false);
    setPosition(null);
    setError(null);
    stopWatch();
  }, [stopWatch]);

  const forgetLocation = useCallback(() => {
    writeConsent(null);
    setConsent(null);
    setPosition(null);
    setError(null);
    stopWatch();
    setStatus(supported ? "asking" : "unsupported");
    setPromptVisible(supported);
  }, [stopWatch, supported]);

  return {
    status,
    position,
    error,
    consent,
    promptVisible,
    supported,
    requestLocation,
    refreshLocation,
    postponePrompt,
    refuseLocation,
    forgetLocation,
  };
}
