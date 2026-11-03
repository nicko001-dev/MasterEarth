import { FormEvent, useEffect, useState, useRef, useCallback } from "react";
import {
  analyzeImage,
  askAssistant,
  AssistantResult,
  fetchAIStatus,
  AIStatus,
  localAssistantSummary,
} from "../services/ai";
import { AlertItem, SensorState, WeatherItem } from "../services/api";
import { Icon } from "./Icon";

type Props = {
  token?: string;
  sensors: SensorState[];
  alerts: AlertItem[];
  weather: WeatherItem[];
};

type Entry = { question: string; result: AssistantResult; error?: string; timestamp?: string };

/**
 * Génère une réponse vocale naturelle, directe et humaine
 * basée sur les données hydrométéorologiques réelles en mémoire.
 */
function generateHydrologicalSpokenResponse(
  query: string,
  sensors: SensorState[],
  alerts: AlertItem[],
  weather: WeatherItem[],
): string {
  const q = query.toLowerCase();
  const rainPoints = weather.filter(
    (w) => (w.observed_precip_mm_h ?? w.modeled_precip_mm_h ?? 0) > 0,
  );
  const maxRain = weather.reduce(
    (max, w) => Math.max(max, w.observed_precip_mm_h ?? w.modeled_precip_mm_h ?? 0),
    0,
  );
  const strongestRain = weather.find(
    (w) => (w.observed_precip_mm_h ?? w.modeled_precip_mm_h ?? 0) === maxRain && maxRain > 0,
  );
  const alertSensors = sensors.filter(
    (s) => s.health_status === "online" && (s.alert_level === "red" || s.alert_level === "orange"),
  );

  if (q.includes("pluie") || q.includes("météo") || q.includes("pleut") || q.includes("précipitation")) {
    if (rainPoints.length === 0) {
      return "D'après les relevés météorologiques en temps réel, aucune précipitation significative n'est détectée actuellement sur les zones surveillées du pays.";
    }
    const locText = strongestRain ? ` notamment vers ${strongestRain.name}` : "";
    return `Il pleut actuellement sur ${rainPoints.length} point(s) du territoire, avec un pic d'intensité mesuré à ${maxRain.toFixed(1)} millimètres par heure${locText}.`;
  }

  if (q.includes("inondation") || q.includes("alerte") || q.includes("danger") || q.includes("niveau")) {
    if (alertSensors.length === 0 && alerts.length === 0) {
      return "Aucune alerte d'inondation majeure n'est active actuellement. Les niveaux d'eau sur les capteurs du réseau restent dans les seuils normaux.";
    }
    const critical = alertSensors.filter((s) => s.alert_level === "red");
    if (critical.length > 0) {
      return `Vigilance requise : ${critical.length} capteur(s) dépassent le seuil rouge d'inondation, en particulier vers ${critical[0].name}.`;
    }
    return `Situation sous surveillance : ${alertSensors.length} capteur(s) signalent un niveau orange de pré-alerte.`;
  }

  // Synthèse générale par défaut
  if (rainPoints.length === 0 && alertSensors.length === 0) {
    return `Situation calme sur le territoire : aucun capteur en alerte inondation et aucune pluie forte détectée sur les ${weather.length} stations surveillées.`;
  }

  return `Point de situation en direct : ${weather.length} stations météo suivies, ${rainPoints.length} en pluie avec un pic de ${maxRain.toFixed(1)} millimètres par heure, et ${alertSensors.length} capteur(s) sous vigilance inondation.`;
}

export function AssistantPanel({ token, sensors, alerts, weather }: Props) {
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"answer" | "report">("answer");
  const [consent, setConsent] = useState(false);
  const [imageConsent, setImageConsent] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiStatus, setAIStatus] = useState<AIStatus | null>(null);
  const [statusReady, setStatusReady] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  // État vocal interactif perfectionné
  const [isLiveVoiceMode, setIsLiveVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<"idle" | "listening" | "processing" | "speaking">("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>("");
  const [speechRate, setSpeechRate] = useState<number>(1.0);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const isLiveVoiceModeRef = useRef(isLiveVoiceMode);
  isLiveVoiceModeRef.current = isLiveVoiceMode;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const isSpeakingRef = useRef(isSpeaking);
  isSpeakingRef.current = isSpeaking;

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const silenceTimeoutRef = useRef<number | null>(null);
  const spokenTextRef = useRef<string>("");

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    addEventListener("online", update);
    addEventListener("offline", update);
    return () => {
      removeEventListener("online", update);
      removeEventListener("offline", update);
    };
  }, []);

  // Découverte et chargement des voix de synthèse vocale françaises
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    synthRef.current = window.speechSynthesis;
    const loadVoices = () => {
      const allVoices = window.speechSynthesis.getVoices();
      const frVoices = allVoices.filter((v) => v.lang.toLowerCase().startsWith("fr"));
      const chosenList = frVoices.length > 0 ? frVoices : allVoices;
      setAvailableVoices(chosenList);
      if (chosenList.length > 0 && !selectedVoiceURI) {
        setSelectedVoiceURI(chosenList[0].voiceURI);
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, [selectedVoiceURI]);

  // Analyseur de volume audio du micro pour retour visuel temps réel
  const setupAudioAnalyser = useCallback((stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        if (!isLiveVoiceModeRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 110) * 100));
        setAudioLevel(normalized);
        animFrameRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch {
      // Ignorer si AudioContext non disponible
    }
  }, []);

  const cleanupAudio = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  // Déclenché automatiquement lors de la détection de la parole ou au clic Envoyer
  const executeVoiceQuery = useCallback(async (queryText: string) => {
    if (!queryText.trim() || busyRef.current) return;
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    setBusy(true);
    setVoiceStatus("processing");
    setError(null);
    spokenTextRef.current = "";
    setInterimTranscript("");

    // Stopper l'écoute pendant la formulation de la réponse
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    setIsListening(false);

    try {
      let resultAnswer = "";
      let entryResult: AssistantResult;

      // Essayer d'abord l'assistant en ligne si disponible et connecté
      if (isOnline && statusReady) {
        try {
          entryResult = await askAssistant(token, queryText, "answer");
          resultAnswer = entryResult.answer;
        } catch {
          // Si le modèle distant n'est pas prêt ou renvoie une erreur, basculer sur le moteur local intelligent
          resultAnswer = generateHydrologicalSpokenResponse(queryText, sensors, alerts, weather);
          entryResult = {
            answer: resultAnswer,
            mode: "offline_deterministic",
            provider: null,
            model: null,
            sources: ["Données hydrologiques en mémoire"],
            human_validation_required: true,
            operational_decision: false,
            limitations: ["Synthèse locale vocale instantanée."],
          };
        }
      } else {
        resultAnswer = generateHydrologicalSpokenResponse(queryText, sensors, alerts, weather);
        entryResult = {
          answer: resultAnswer,
          mode: "offline_deterministic",
          provider: null,
          model: null,
          sources: ["Données hydrologiques locales"],
          human_validation_required: true,
          operational_decision: false,
          limitations: ["Mode vocal déterministe."],
        };
      }

      setEntries((current) => [
        ...current,
        {
          question: queryText,
          result: entryResult,
          timestamp: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        },
      ]);
      setMessage("");

      if (resultAnswer) {
        speakText(resultAnswer);
      }
    } catch (reason) {
      const fallbackVoice = generateHydrologicalSpokenResponse(queryText, sensors, alerts, weather);
      setEntries((current) => [
        ...current,
        {
          question: queryText,
          result: localAssistantSummary(sensors, alerts, weather, "answer", true),
          timestamp: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        },
      ]);
      speakText(fallbackVoice);
    } finally {
      setBusy(false);
    }
  }, [isOnline, statusReady, token, sensors, alerts, weather]);

  const speakText = useCallback((text: string, onEnd?: () => void) => {
    if (!synthRef.current) {
      onEnd?.();
      return;
    }
    // Nettoyer et réveiller le moteur de synthèse
    synthRef.current.cancel();
    if (synthRef.current.paused) {
      synthRef.current.resume();
    }

    const cleanSpeech = text
      .replace(/[*_#`~>]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanSpeech);
    utterance.lang = "fr-FR";
    utterance.rate = speechRate;
    utterance.pitch = 1.0;

    if (selectedVoiceURI && availableVoices.length > 0) {
      const chosen = availableVoices.find((v) => v.voiceURI === selectedVoiceURI);
      if (chosen) utterance.voice = chosen;
    }

    utteranceRef.current = utterance;

    // Watchdog de sécurité pour éviter le blocage de SpeechSynthesis dans Chromium
    let watchdogTimer: number | null = window.setTimeout(() => {
      if (synthRef.current?.speaking) {
        synthRef.current.cancel();
        setIsSpeaking(false);
        setVoiceStatus("idle");
      }
    }, Math.max(12000, cleanSpeech.length * 90));

    utterance.onstart = () => {
      setIsSpeaking(true);
      setVoiceStatus("speaking");
    };

    const finishSpeaking = () => {
      if (watchdogTimer) clearTimeout(watchdogTimer);
      setIsSpeaking(false);
      utteranceRef.current = null;
      setVoiceStatus("idle");
      onEnd?.();
      // Si en mode vocal continu, relancer automatiquement l'écoute pour la réponse de l'utilisateur !
      if (isLiveVoiceModeRef.current && !busyRef.current) {
        setTimeout(() => {
          if (isLiveVoiceModeRef.current && !busyRef.current) {
            startListening();
          }
        }, 500);
      }
    };

    utterance.onend = finishSpeaking;
    utterance.onerror = finishSpeaking;

    try {
      synthRef.current.speak(utterance);
    } catch {
      finishSpeaking();
    }
  }, [availableVoices, selectedVoiceURI, speechRate]);

  const stopSpeaking = useCallback(() => {
    if (synthRef.current) synthRef.current.cancel();
    setIsSpeaking(false);
    utteranceRef.current = null;
    setVoiceStatus("idle");
  }, []);

  const startListening = useCallback(async () => {
    if (isListening || isSpeaking || busy) return;

    // Vérifier l'autorisation et la captation du microphone
    if (!mediaStreamRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        setupAudioAnalyser(stream);
      } catch (err) {
        setError("Accès micro refusé. Veuillez autoriser le microphone dans les paramètres de votre navigateur.");
        return;
      }
    }

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setError("La reconnaissance vocale n'est pas disponible sur votre navigateur (Chrome/Edge recommandés).");
      return;
    }

    if (!recognitionRef.current) {
      const rec = new SpeechRec();
      rec.continuous = true; // Écoute continue sans coupure abrupte
      rec.interimResults = true;
      rec.lang = "fr-FR";

      rec.onstart = () => {
        setIsListening(true);
        setVoiceStatus("listening");
      };

      rec.onresult = (event: any) => {
        let currentText = "";
        for (let i = 0; i < event.results.length; ++i) {
          currentText += event.results[i][0].transcript;
        }
        const text = currentText.trim();
        if (text) {
          spokenTextRef.current = text;
          setInterimTranscript(text);
          setMessage(text);

          // Réinitialiser le timer de silence : si l'utilisateur s'arrête 1.4s, soumettre automatiquement
          if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
          if (isLiveVoiceModeRef.current && text.length > 2) {
            silenceTimeoutRef.current = window.setTimeout(() => {
              void executeVoiceQuery(spokenTextRef.current);
            }, 1400);
          }
        }
      };

      rec.onerror = (event: any) => {
        if (event.error !== "no-speech" && event.error !== "aborted") {
          console.warn("Speech recognition notice:", event.error);
        }
      };

      rec.onend = () => {
        setIsListening(false);
        // Si le mode vocal reste actif et qu'on ne parle pas, relancer l'écoute automatique
        if (isLiveVoiceModeRef.current && !isSpeakingRef.current && !busyRef.current) {
          try {
            rec.start();
          } catch {}
        }
      };

      recognitionRef.current = rec;
    }

    setError(null);
    try {
      recognitionRef.current.start();
    } catch {
      // Déjà démarré
    }
  }, [isListening, isSpeaking, busy, setupAudioAnalyser, executeVoiceQuery]);

  const stopListening = useCallback(() => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    setIsListening(false);
    setVoiceStatus("idle");
  }, []);

  // Bascule explicite du mode vocal temps réel
  const toggleLiveVoiceMode = async () => {
    if (isLiveVoiceMode) {
      // Désactivation immédiate
      setIsLiveVoiceMode(false);
      stopListening();
      stopSpeaking();
      cleanupAudio();
    } else {
      // Activation explicite
      setIsLiveVoiceMode(true);
      setConsent(true);
      setError(null);
      stopSpeaking();
      await startListening();
    }
  };

  useEffect(() => {
    return () => {
      cleanupAudio();
      stopSpeaking();
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
    };
  }, [cleanupAudio, stopSpeaking]);

  useEffect(() => {
    let active = true;
    setAIStatus(null);
    setStatusReady(false);
    setStatusError(false);
    if (!isOnline) return () => { active = false; };
    void fetchAIStatus(token)
      .then((status) => {
        if (active) {
          setAIStatus(status);
          setStatusReady(true);
        }
      })
      .catch(() => {
        if (active) {
          setAIStatus(null);
          setStatusError(true);
        }
      });
    return () => { active = false; };
  }, [token, isOnline]);

  const send = async (event?: FormEvent) => {
    if (event) event.preventDefault();
    const msg = message.trim();
    if (!msg || (isOnline && (!consent || !statusReady)) || busy) return;
    stopListening();
    setBusy(true);
    setError(null);
    try {
      const result = !isOnline
        ? localAssistantSummary(sensors, alerts, weather, mode, true)
        : await askAssistant(token, msg, mode);
      setEntries((current) => [
        ...current,
        {
          question: msg,
          result,
          timestamp: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        },
      ]);
      setMessage("");

      if (isLiveVoiceMode && result.answer) {
        speakText(result.answer);
      }
    } catch (reason) {
      if (reason instanceof TypeError) {
        setEntries((current) => [
          ...current,
          {
            question: msg,
            result: localAssistantSummary(sensors, alerts, weather, mode, true),
            timestamp: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          },
        ]);
        setError("API injoignable. Une synthèse locale est affichée.");
      } else {
        setError((reason as Error).message);
      }
    } finally {
      setBusy(false);
      setConsent(false);
    }
  };

  const showLocalSummary = () => {
    setError(null);
    stopSpeaking();
    const result = localAssistantSummary(sensors, alerts, weather, mode, !isOnline);
    setEntries((current) => [
      ...current,
      {
        question: "Résumé local des données en mémoire",
        result,
        timestamp: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      },
    ]);
    if (isLiveVoiceMode && result.answer) {
      speakText(result.answer);
    }
  };

  const sendImage = async () => {
    if (!isOnline || !image || !imageConsent || !consent || !statusReady || busy) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(image.type) || image.size > 4 * 1024 * 1024) {
      setError("Choisissez une image JPEG, PNG ou WebP de 4 Mio maximum.");
      return;
    }
    stopSpeaking();
    setBusy(true);
    setError(null);
    try {
      const result = await analyzeImage(token, message.trim() || "Décris les éléments visibles.", image);
      const entryResult: AssistantResult = {
        answer: result.answer ?? result.message ?? "Aucun modèle gratuit avec vision n'est disponible.",
        mode: result.mode === "cloud_ai" ? "cloud_ai" : "offline_deterministic",
        provider: result.provider ?? null,
        model: result.model ?? null,
        sources: ["Image fournie volontairement par l'utilisateur"],
        human_validation_required: true,
        operational_decision: false,
        limitations: ["Analyse visuelle indicative; image non conservée par IntelliFlood."],
      };
      setEntries((current) => [
        ...current,
        {
          question: "Analyse d'image (envoi expressément autorisé)",
          result: entryResult,
          timestamp: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        },
      ]);
      setImage(null);
      setImageConsent(false);

      if (entryResult.answer && isLiveVoiceMode) {
        speakText(entryResult.answer);
      }
    } catch (reason) {
      setError(
        reason instanceof TypeError
          ? "Connexion interrompue pendant l'analyse; l'image a peut-être déjà atteint le serveur ou le fournisseur. L'envoi n'est pas confirmé."
          : (reason as Error).message,
      );
    } finally {
      setBusy(false);
      setConsent(false);
      setImageConsent(false);
    }
  };

  return (
    <section className="pane-ai" aria-labelledby="ai-title">
      <div className="ai-header-wrapper">
        <div className="ai-title-row">
          <div>
            <h2 id="ai-title">Intelligence Engine</h2>
            <p className="ai-subtitle">Assistant hydrologique vocal et écrit en temps réel</p>
          </div>
          {/* Bouton d'activation explicite du mode vocal temps réel */}
          <button
            type="button"
            className={`voice-mode-toggle-btn ${isLiveVoiceMode ? "is-active" : ""}`}
            onClick={() => void toggleLiveVoiceMode()}
            title={isLiveVoiceMode ? "Désactiver la conversation vocale" : "Activer la conversation vocale en temps réel"}
          >
            <span className="voice-mode-icon">
              <Icon name={isLiveVoiceMode ? "mic-on" : "mic"} size={18} />
            </span>
            <span className="voice-mode-label">
              {isLiveVoiceMode ? "Mode Vocal Actif" : "Activer Mode Vocal"}
            </span>
            {isLiveVoiceMode && <span className="voice-live-pulse" />}
          </button>
        </div>

        {/* HUD de conversation vocale interactive lorsque le mode vocal est activé */}
        {isLiveVoiceMode && (
          <div className="voice-conversation-hud">
            <div className="voice-hud-top">
              <div className="voice-hud-indicator">
                <span className={`voice-hud-dot ${voiceStatus}`} />
                <span className="voice-hud-text">
                  {voiceStatus === "listening" && (audioLevel > 18 ? "🎙️ Voix captée… Parlez !" : "👂 À votre écoute… Dites votre question")}
                  {voiceStatus === "processing" && "⚡ Analyse et réflexion…"}
                  {voiceStatus === "speaking" && "🔊 L'assistant vous parle…"}
                  {voiceStatus === "idle" && "🔵 Prêt · Parlez naturellement"}
                </span>
              </div>
              <div className="voice-hud-actions">
                <button
                  type="button"
                  className="voice-hud-btn"
                  onClick={() => setShowVoiceSettings((prev) => !prev)}
                  title="Paramètres de voix et débit"
                >
                  <Icon name="settings" size={14} />
                  <span>Voix</span>
                </button>
                {isSpeaking && (
                  <button
                    type="button"
                    className="voice-hud-btn danger"
                    onClick={stopSpeaking}
                    title="Arrêter la voix"
                  >
                    <Icon name="volume-off" size={14} />
                    <span>Stopper</span>
                  </button>
                )}
                <button
                  type="button"
                  className="voice-hud-btn close"
                  onClick={() => void toggleLiveVoiceMode()}
                  title="Quitter le mode vocal"
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            </div>

            {/* Vu-mètre audio de captation en direct */}
            <div className="voice-level-meter-row">
              <span className="meter-label">Signal micro :</span>
              <div className="voice-meter-track" title={`Volume capté : ${audioLevel}%`}>
                <div
                  className="voice-meter-bar"
                  style={{
                    width: `${Math.max(4, audioLevel)}%`,
                    background: audioLevel > 50 ? "#2ecc71" : audioLevel > 15 ? "#37c6f4" : "rgba(255,255,255,0.2)",
                  }}
                />
              </div>
              <span className="meter-val">{audioLevel}%</span>
            </div>

            {/* Onde sonore animée */}
            <div className={`voice-soundwave-container ${voiceStatus}`}>
              <div className="soundwave-bar b1" />
              <div className="soundwave-bar b2" />
              <div className="soundwave-bar b3" />
              <div className="soundwave-bar b4" />
              <div className="soundwave-bar b5" />
              <div className="soundwave-bar b6" />
              <div className="soundwave-bar b7" />
              <div className="soundwave-bar b8" />
            </div>

            {/* Transcription en direct avec bouton Envoyer immédiat */}
            {interimTranscript && (
              <div className="voice-live-transcript-box">
                <span className="voice-transcript-text">« {interimTranscript} »</span>
                <button
                  type="button"
                  className="voice-send-now-btn"
                  onClick={() => void executeVoiceQuery(interimTranscript)}
                  title="Envoyer la question vocale maintenant"
                >
                  <Icon name="check" size={13} />
                  <span>Envoyer</span>
                </button>
              </div>
            )}

            {/* Boutons d'interaction rapide vocale */}
            <div className="voice-hud-footer">
              <button
                type="button"
                className={`voice-action-pill ${isListening ? "on" : ""}`}
                onClick={isListening ? stopListening : () => void startListening()}
                disabled={busy}
              >
                <Icon name={isListening ? "mic-on" : "mic"} size={16} />
                <span>{isListening ? "Pause micro" : "Reprendre l'écoute"}</span>
              </button>
              <button
                type="button"
                className="voice-action-pill ghost"
                onClick={showLocalSummary}
                disabled={busy}
              >
                <Icon name="sparkles" size={16} />
                <span>Synthèse vocale des capteurs</span>
              </button>
            </div>

            {/* Panneau de réglages audio */}
            {showVoiceSettings && (
              <div className="voice-settings-dropdown">
                <div className="voice-setting-row">
                  <label htmlFor="voice-select">Voix de l'assistant :</label>
                  <select
                    id="voice-select"
                    value={selectedVoiceURI}
                    onChange={(e) => setSelectedVoiceURI(e.target.value)}
                  >
                    {availableVoices.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="voice-setting-row">
                  <label htmlFor="speed-slider">Vitesse ({speechRate.toFixed(1)}x) :</label>
                  <input
                    id="speed-slider"
                    type="range"
                    min="0.7"
                    max="1.4"
                    step="0.1"
                    value={speechRate}
                    onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="ai-warning">
        L'IA est facultative et informative. Les calculs, seuils et alertes restent déterministes.
        Les modèles gratuits peuvent être indisponibles ou soumis à quota; aucun fournisseur ne peut être garanti.
      </p>
      <p className="ai-access-info">
        <strong>Aucun compte requis.</strong> Si un administrateur a configuré les clés API, les modèles en ligne sont
        disponibles directement pour l'ensemble des usagers. Sans clé, le résumé local déterministe reste disponible.
      </p>

      {isOnline && !statusReady && !statusError && <p className="muted" role="status">Vérification des modèles IA disponibles…</p>}
      {statusError && <p role="alert" className="err-msg">Destinataires impossibles à vérifier. Aucune question ne sera envoyée.</p>}
      {aiStatus && <div className="ai-recipients">
        <strong>Fournisseurs susceptibles de recevoir la requête (après consentement) :</strong>
        {!aiStatus.providers.length && <span>aucun n'est configuré; seul le mode local déterministe sera disponible.</span>}
        {aiStatus.providers.map((provider) => (
          <p key={provider.id}>
            {provider.name} · modèles {provider.models.join(", ")}. {provider.billing_note}
          </p>
        ))}
      </div>}

      {/* Barre de dictée rapide */}
      <div className="ai-voice-bar">
        <button
          type="button"
          className={`icon-button ${isListening && !isLiveVoiceMode ? "on" : ""}`}
          onClick={() => void startListening()}
          disabled={busy || !isOnline || !statusReady || isListening}
          title={isListening ? "Arrêter l'écoute" : "Parler à l'IA (cliquer pour dicter)"}
        >
          <Icon name={isListening ? "mic-on" : "mic"} size={17} />
          <span style={{ marginLeft: "6px", fontSize: "0.75rem" }}>
            {isListening ? "Écoute en cours…" : "Dicter une question"}
          </span>
        </button>
        {isListening && <span className="ai-voice-status">Écoute… (dites votre question)</span>}
        {isSpeaking && <span className="ai-voice-status">L'IA vous répond…</span>}
      </div>

      <form className="ai-form" onSubmit={(event) => void send(event)}>
        <label htmlFor="ai-question">Question (ne saisissez aucune donnée personnelle)</label>
        <div style={{ position: "relative", display: "flex", gap: "8px" }}>
          <textarea
            id="ai-question"
            rows={3}
            maxLength={2000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={isListening ? "Écoute en cours…" : "Ex. Résume les tendances observées et leurs limites."}
            disabled={busy || isListening}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className={`icon-button ${isListening ? "on" : ""}`}
            onClick={() => void startListening()}
            disabled={busy || !isOnline || !statusReady || isListening}
            title="Parler à l'IA"
            style={{ height: "fit-content", alignSelf: "flex-start", marginTop: "4px" }}
          >
            <Icon name={isListening ? "mic-on" : "mic"} size={18} />
          </button>
        </div>
        <label htmlFor="ai-mode">Format</label>
        <select id="ai-mode" value={mode} onChange={(event) => setMode(event.target.value as "answer" | "report")}>
          <option value="answer">Réponse informative</option>
          <option value="report">Synthèse / rapport</option>
        </select>
        <label className="ai-consent">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          En ligne, j'autorise l'envoi de ma question, d'un agrégat capteurs/météo et d'extraits documentaires à l'un des fournisseurs indiqués. Pas de coordonnées, observations libres, identifiants ou médias.
        </label>
        <button type="submit" disabled={!message.trim() || (isOnline && (!consent || !statusReady)) || busy || isListening}>
          {busy ? "Traitement…" : isOnline ? "Envoyer la question" : "Répondre localement"}
        </button>
        <button type="button" disabled={busy || isListening} onClick={showLocalSummary}>
          Résumé des données en mémoire — sans envoi
        </button>
        <div className="ai-image">
          <label htmlFor="ai-image">Analyse d'image (facultative, non conservée)</label>
          <input
            id="ai-image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={!isOnline || busy}
            onChange={(event) => setImage(event.target.files?.[0] ?? null)}
          />
          {image && (
            <>
              <label className="ai-consent">
                <input type="checkbox" checked={imageConsent} onChange={(event) => setImageConsent(event.target.checked)} />
                J'autorise explicitement l'envoi de cette image et de la question associée au fournisseur IA pour analyse.
              </label>
              <button
                type="button"
                disabled={!isOnline || !statusReady || !consent || !imageConsent || busy || isListening}
                onClick={() => void sendImage()}
              >
                Analyser l'image
              </button>
            </>
          )}
        </div>
      </form>

      {error && <p role="alert" className="err-msg">{error}</p>}

      <div className="ai-history" aria-live="polite">
        {entries.map((entry, index) => (
          <article className="ai-entry" key={`${index}-${entry.question}`}>
            <div className="ai-entry-header">
              <h3>{entry.question}</h3>
              {entry.timestamp && <span className="ai-entry-time">{entry.timestamp}</span>}
            </div>
            <div className="ai-entry-body">
              <p>{entry.result.answer}</p>
            </div>
            <small>
              {entry.result.mode === "cloud_ai"
                ? `IA · ${entry.result.provider} / ${entry.result.model}`
                : "Mode local déterministe — sans modèle IA"}
            </small>
            {entry.result.sources.length > 0 && (
              <p className="ai-sources">Sources : {entry.result.sources.join("; ")}</p>
            )}
            <small className="ai-warning">
              Information non décisionnelle; validation humaine requise. L'IA ne déclenche pas d'alerte.
            </small>
            <div className="ai-entry-voice-controls">
              <button
                type="button"
                className="ghost voice-playback-btn"
                onClick={() => {
                  stopSpeaking();
                  speakText(entry.result.answer);
                }}
                disabled={busy}
              >
                <Icon name="volume" size={14} />
                <span>{isSpeaking ? "Relire" : "Lire à voix haute"}</span>
              </button>
              {isSpeaking && (
                <button
                  type="button"
                  className="ghost voice-playback-btn danger"
                  onClick={stopSpeaking}
                >
                  <Icon name="volume-off" size={14} />
                  <span>Arrêter la voix</span>
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
