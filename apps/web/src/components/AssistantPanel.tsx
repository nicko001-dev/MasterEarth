import { FormEvent, useEffect, useState } from "react";
import {
  analyzeImage,
  askAssistant,
  AssistantResult,
  fetchAIStatus,
  AIStatus,
  localAssistantSummary,
} from "../services/ai";
import { AlertItem, SensorState, WeatherItem } from "../services/api";

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

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    addEventListener("online", update);
    addEventListener("offline", update);
    return () => {
      removeEventListener("online", update);
      removeEventListener("offline", update);
    };
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

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!message.trim() || (isOnline && (!consent || !statusReady)) || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = !isOnline
        ? localAssistantSummary(sensors, alerts, weather, mode)
        : await askAssistant(token, message.trim(), mode);
      setEntries((current) => [...current, { question: message.trim(), result }]);
      setMessage("");
    } catch (reason) {
      if (reason instanceof TypeError) {
        setEntries((current) => [...current, {
          question: message.trim(),
          result: localAssistantSummary(sensors, alerts, weather, mode, true),
        }]);
        setError("API injoignable. Une synthèse locale est affichée; l'envoi initial a peut-être atteint le serveur.");
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
    setEntries((current) => [...current, {
      question: "Résumé local des données en mémoire",
      result: localAssistantSummary(sensors, alerts, weather, mode),
    }]);
  };

  const sendImage = async () => {
    if (!isOnline || !image || !imageConsent || !consent || !statusReady || busy) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(image.type) || image.size > 4 * 1024 * 1024) {
      setError("Choisissez une image JPEG, PNG ou WebP de 4 Mio maximum.");
      return;
    }
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
      <form className="ai-form" onSubmit={(event) => void send(event)}>
        <label htmlFor="ai-question">Question (ne saisissez aucune donnée personnelle)</label>
        <textarea
          id="ai-question"
          rows={3}
          maxLength={2000}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Ex. Résume les tendances observées et leurs limites."
          disabled={busy}
        />
        <label htmlFor="ai-mode">Format</label>
        <select id="ai-mode" value={mode} onChange={(event) => setMode(event.target.value as "answer" | "report")}>
          <option value="answer">Réponse informative</option>
          <option value="report">Synthèse / rapport</option>
        </select>
        <label className="ai-consent">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          En ligne, j'autorise l'envoi de ma question, d'agrégats capteurs/météo et d'extraits documentaires à l'un des fournisseurs indiqués. Pas de coordonnées, observations libres, identifiants ou médias.
        </label>
        <button type="submit" disabled={!message.trim() || (isOnline && (!consent || !statusReady)) || busy}>
          {busy ? "Traitement…" : isOnline ? "Envoyer la question" : "Répondre localement"}
        </button>
        <button type="button" disabled={busy} onClick={showLocalSummary}>Résumé des données en mémoire — sans envoi</button>
        <div className="ai-image">
          <label htmlFor="ai-image">Analyse d'image (facultative, non conservée)</label>
          <input id="ai-image" type="file" accept="image/jpeg,image/png,image/webp" disabled={!isOnline || busy} onChange={(event) => setImage(event.target.files?.[0] ?? null)} />
          {image && <>
            <label className="ai-consent">
              <input type="checkbox" checked={imageConsent} onChange={(event) => setImageConsent(event.target.checked)} />
              J'autorise explicitement l'envoi de cette image et de la question associée au fournisseur IA pour analyse.
            </label>
            <button type="button" disabled={!isOnline || !statusReady || !consent || !imageConsent || busy} onClick={() => void sendImage()}>
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
          </article>
        ))}
      </div>
    </section>
  );
}
