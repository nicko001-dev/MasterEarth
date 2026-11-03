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

type Entry = { question: string; result: AssistantResult; error?: string };

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

  // Audio / conversation state — NE SE LANCE QUE AU CLIC UTILISATEUR
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    addEventListener("online", update);
    addEventListener("offline", update);
    return () => {
      removeEventListener("online", update);
      removeEventListener("offline", update);
    };
  }, []);

  // Initialiser Web Speech API (reconnaissance + synthèse) — sans auto-démarrage
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const Synthesis = window.speechSynthesis;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = "fr-FR";

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setMessage(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
        if (event.error !== "no-speech" && event.error !== "aborted") {
          setError(`Erreur reconnaissance vocale : ${event.error}`);
        }
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
    synthRef.current = Synthesis;
  }, []);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      setError("La reconnaissance vocale n'est pas supportée par votre navigateur.");
      return;
    }
    if (isListening || isSpeaking || busy) return;
    setIsListening(true);
    setError(null);
    setMessage("");
    try {
      recognitionRef.current.start();
    } catch {
      setIsListening(false);
      setError("Impossible de démarrer l'écoute vocale.");
    }
  }, [isListening, isSpeaking, busy]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    try { recognitionRef.current.stop(); } catch {}
    setIsListening(false);
  }, []);

  const speakText = useCallback((text: string, onEnd: () => void) => {
    if (!synthRef.current) { onEnd(); return; }
    // Annuler toute parole en cours
    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "fr-FR";
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utteranceRef.current = utterance;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      utteranceRef.current = null;
      onEnd();
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      utteranceRef.current = null;
      onEnd();
    };
    try {
      synthRef.current.speak(utterance);
    } catch {
      setIsSpeaking(false);
      onEnd();
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    if (synthRef.current) synthRef.current.cancel();
    setIsSpeaking(false);
    utteranceRef.current = null;
  }, []);

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
      setEntries((current) => [...current, { question: msg, result }]);
      setMessage("");

      // Lire la réponse à voix haute uniquement si l'IA a répondu (pas de mode local silencieux)
      if (isOnline && result.answer) {
        speakText(result.answer, () => {
          setBusy(false);
        });
        return;
      }
    } catch (reason) {
      if (reason instanceof TypeError) {
        setEntries((current) => [...current, {
          question: msg,
          result: localAssistantSummary(sensors, alerts, weather, mode, true),
        }]);
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
    setEntries((current) => [...current, {
      question: "Résumé local des données en mémoire",
      result: localAssistantSummary(sensors, alerts, weather, mode, !isOnline),
    }]);
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
      setEntries((current) => [...current, {
        question: "Analyse d'image (envoi expressément autorisé)",
        result: {
          answer: result.answer ?? result.message ?? "Aucun modèle gratuit avec vision n'est disponible.",
          mode: result.mode === "cloud_ai" ? "cloud_ai" : "offline_deterministic",
          provider: result.provider ?? null,
          model: result.model ?? null,
          sources: ["Image fournie volontairement par l'utilisateur"],
          human_validation_required: true,
          operational_decision: false,
          limitations: ["Analyse visuelle indicative; image non conservée par IntelliFlood."],
        },
      }]);
      setImage(null);
      setImageConsent(false);

      if (result.answer && isOnline) {
        speakText(result.answer, () => {
          setBusy(false);
        });
        return;
      }
    } catch (reason) {
      setError(reason instanceof TypeError
        ? "Connexion interrompue pendant l'analyse; l'image a peut-être déjà atteint le serveur ou le fournisseur. L'envoi n'est pas confirmé."
        : (reason as Error).message);
    } finally {
      setBusy(false);
      setConsent(false);
      setImageConsent(false);
    }
  };

  return (
    <section className="pane-ai" aria-labelledby="ai-title">
      <h2 id="ai-title">Intelligence Engine</h2>
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
        {aiStatus.providers.map((provider) => <p key={provider.id}>
          {provider.name} · modèles {provider.models.join(", ")}. {provider.billing_note}
        </p>)}
      </div>}

      {/* Bouton de conversation vocale — UNIQUEMENT AU CLIC, jamais automatique */}
      <div className="ai-voice-bar">
        <button
          type="button"
          className={`icon-button ${isListening ? "on" : ""}`}
          onClick={startListening}
          disabled={busy || !isOnline || !statusReady || isListening}
          title={isListening ? "Arrêter l'écoute" : "Parler à l'IA (cliquer pour dicter)"}
        >
          <Icon name={isListening ? "mic-on" : "mic"} size={17} />
          <span style={{ marginLeft: "6px", fontSize: "0.72rem" }}>
            {isListening ? "Écoute en cours…" : "Parler à l'IA"}
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
            className="icon-button"
            onClick={startListening}
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
        <button type="button" disabled={busy || isListening} onClick={showLocalSummary}>Résumé des données en mémoire — sans envoi</button>
        <div className="ai-image">
          <label htmlFor="ai-image">Analyse d'image (facultative, non conservée)</label>
          <input id="ai-image" type="file" accept="image/jpeg,image/png,image/webp" disabled={!isOnline || busy} onChange={(event) => setImage(event.target.files?.[0] ?? null)} />
          {image && <>
            <label className="ai-consent">
              <input type="checkbox" checked={imageConsent} onChange={(event) => setImageConsent(event.target.checked)} />
              J'autorise explicitement l'envoi de cette image et de la question associée au fournisseur IA pour analyse.
            </label>
            <button type="button" disabled={!isOnline || !statusReady || !consent || !imageConsent || busy || isListening} onClick={() => void sendImage()}>
              Analyser l'image
            </button>
          </>}
        </div>
      </form>
      {error && <p role="alert" className="err-msg">{error}</p>}
      <div className="ai-history" aria-live="polite">
        {entries.map((entry, index) => (
          <article className="ai-entry" key={`${index}-${entry.question}`}>
            <h3>{entry.question}</h3>
            <p>{entry.result.answer}</p>
            <small>
              {entry.result.mode === "cloud_ai" ? `IA · ${entry.result.provider} / ${entry.result.model}` : "Mode local déterministe — sans modèle IA"}
            </small>
            {entry.result.sources.length > 0 && <p className="ai-sources">Sources : {entry.result.sources.join("; ")}</p>}
            <small className="ai-warning">Information non décisionnelle; validation humaine requise. L'IA ne déclenche pas d'alerte.</small>
            <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
              <button
                className="ghost"
                style={{ fontSize: "0.6rem", padding: "2px 6px", flex: 1 }}
                onClick={() => {
                  stopSpeaking();
                  speakText(entry.result.answer, () => {});
                }}
                disabled={isSpeaking || !isOnline || busy}
              >
                {isSpeaking ? "Arrêter" : "Lire la réponse"}
              </button>
              <button
                className="ghost"
                style={{ fontSize: "0.6rem", padding: "2px 6px" }}
                onClick={stopSpeaking}
                disabled={!isSpeaking}
              >
                Arrêter la voix
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
