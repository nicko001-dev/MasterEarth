import { useEffect, useState } from "react";
import {
  AIProvider,
  AIProviderModel,
  fetchAIProviders,
  fetchFreeModels,
  removeAIProvider,
  saveAIProvider,
} from "../services/ai";

const KEY_PAGES: Record<string, string> = {
  gemini: "https://aistudio.google.com/apikey",
  groq: "https://console.groq.com/keys",
  mistral: "https://console.mistral.ai/api-keys",
  xkiro: "https://xkiro.com/dashboard/api/keys",
  openrouter: "https://openrouter.ai/settings/keys",
};

type Props = { token: string };

export function AIProviderSettings({ token }: Props) {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [catalogs, setCatalogs] = useState<Record<string, AIProviderModel[]>>({});
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [priorities, setPriorities] = useState<Record<string, number>>({});
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});

  const reload = async () => {
    const current = await fetchAIProviders(token);
    setProviders(current);
    setSelected((previous) => Object.fromEntries(current.map((provider) => [provider.id, previous[provider.id] ?? provider.selected_models])));
    setPriorities((previous) => Object.fromEntries(current.map((provider) => [provider.id, previous[provider.id] ?? provider.priority])));
    setEnabled((previous) => Object.fromEntries(current.map((provider) => [provider.id, previous[provider.id] ?? (provider.configured ? provider.enabled : true)])));
  };

  useEffect(() => {
    void reload().catch((reason) => setError((reason as Error).message));
  }, [token]);

  const discover = async (provider: AIProvider) => {
    setBusy(provider.id); setError(null); setMessage(null);
    try {
      const models = await fetchFreeModels(token, provider.id, keys[provider.id]?.trim() || undefined);
      setCatalogs((current) => ({ ...current, [provider.id]: models }));
      setSelected((current) => ({ ...current, [provider.id]: current[provider.id] ?? [] }));
      setMessage(models.length ? `${models.length} modèle(s) gratuits confirmés pour ${provider.name}.` : `Aucun modèle gratuit éligible pour ${provider.name}.`);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const save = async (provider: AIProvider) => {
    const models = selected[provider.id] ?? [];
    if (!confirmed[provider.id]) { setError("Confirmez l'utilisation d'une offre gratuite avant l'enregistrement."); return; }
    if (!models.length) { setError("Sélectionnez au moins un modèle gratuit."); return; }
    setBusy(provider.id); setError(null); setMessage(null);
    try {
      await saveAIProvider(token, provider.id, {
        ...(keys[provider.id]?.trim() ? { api_key: keys[provider.id].trim() } : {}),
        selected_models: models,
        enabled: enabled[provider.id] ?? true,
        free_tier_confirmed: true,
        priority: Number(priorities[provider.id] ?? 100),
      });
      setKeys((current) => ({ ...current, [provider.id]: "" }));
      await reload();
      setMessage(`${provider.name} configuré. La clé n'est pas réaffichée.`);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (provider: AIProvider) => {
    setBusy(provider.id); setError(null); setMessage(null);
    try {
      await removeAIProvider(token, provider.id);
      setKeys((current) => ({ ...current, [provider.id]: "" }));
      setCatalogs((current) => { const next = { ...current }; delete next[provider.id]; return next; });
      await reload();
      setMessage(`${provider.name} supprimé.`);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="ai-provider-settings" aria-labelledby="ai-provider-title">
      <h3 id="ai-provider-title">Fournisseurs IA (administration)</h3>
      <p className="ai-warning">
        Cinq emplacements au maximum. Seuls les modèles gratuits connus sont proposés; les quotas, offres et prix peuvent changer.
        Les clés sont chiffrées côté serveur et ne sont jamais renvoyées au navigateur. Configurez aussi AI_ENCRYPTION_KEY.
      </p>
      {message && <p className="ok-msg" role="status">{message}</p>}
      {error && <p className="err-msg" role="alert">{error}</p>}
      {providers.map((provider) => {
        const models = catalogs[provider.id];
        const chosen = selected[provider.id] ?? provider.selected_models;
        const moveModel = (modelId: string, direction: -1 | 1) => {
          setSelected((current) => {
            const order = [...(current[provider.id] ?? provider.selected_models)];
            const index = order.indexOf(modelId);
            const nextIndex = index + direction;
            if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return current;
            [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
            return { ...current, [provider.id]: order };
          });
        };
        return (
          <article className="ai-provider" key={provider.id}>
            <div className="ai-provider-title">
              <strong>{provider.name}</strong>
              <span>{provider.configured ? "Clé enregistrée" : "Non configuré"}</span>
            </div>
            <p>{provider.billing_note}</p>
            <a href={KEY_PAGES[provider.id]} target="_blank" rel="noreferrer">Ouvrir la gestion officielle des clés</a>
            <label htmlFor={`ai-key-${provider.id}`}>Clé API {provider.has_key ? "(laisser vide pour conserver)" : ""}</label>
            <input id={`ai-key-${provider.id}`} type="password" autoComplete="new-password" value={keys[provider.id] ?? ""} onChange={(event) => setKeys((current) => ({ ...current, [provider.id]: event.target.value }))} />
            <div className="ai-provider-actions">
              <label>Priorité (1 = première)<input type="number" min={1} max={500} value={priorities[provider.id] ?? provider.priority} onChange={(event) => setPriorities((current) => ({ ...current, [provider.id]: Number(event.target.value) }))} /></label>
              <button type="button" disabled={busy !== null || (!keys[provider.id]?.trim() && !provider.configured)} onClick={() => void discover(provider)}>Découvrir les modèles gratuits</button>
            </div>
            {models && <fieldset>
              <legend>Modèles explicitement gratuits (ordre de repli)</legend>
              {!models.length && <p>Aucun modèle gratuit disponible actuellement.</p>}
              {models.map((model) => {
                const position = chosen.indexOf(model.id);
                return <div className="ai-model" key={model.id}>
                  <label>
                    <input type="checkbox" checked={position >= 0} onChange={(event) => setSelected((current) => {
                      const old = current[provider.id] ?? provider.selected_models;
                      return { ...current, [provider.id]: event.target.checked ? [...old, model.id] : old.filter((id) => id !== model.id) };
                    })} />
                    <span>{model.name} <small>{model.id}{model.supports_images ? " · vision" : ""}</small></span>
                  </label>
                  {position >= 0 && <span className="ai-model-order">
                    <button type="button" className="ghost" aria-label={`Monter ${model.name}`} disabled={position === 0} onClick={() => moveModel(model.id, -1)}>↑</button>
                    <button type="button" className="ghost" aria-label={`Descendre ${model.name}`} disabled={position === chosen.length - 1} onClick={() => moveModel(model.id, 1)}>↓</button>
                  </span>}
                </div>;
              })}
            </fieldset>}
            <label className="ai-consent">
              <input type="checkbox" checked={enabled[provider.id] ?? (provider.configured ? provider.enabled : true)} onChange={(event) => setEnabled((current) => ({ ...current, [provider.id]: event.target.checked }))} />
              Activer ce fournisseur dans la rotation automatique
            </label>
            <label className="ai-consent">
              <input type="checkbox" checked={confirmed[provider.id] ?? provider.free_tier_confirmed} onChange={(event) => setConfirmed((current) => ({ ...current, [provider.id]: event.target.checked }))} />
              Je confirme que ce compte utilise une offre gratuite et accepte ses quotas; je n'autorise pas de modèle payant ni de repli payant.
            </label>
            <div className="ai-provider-actions">
              <button type="button" disabled={busy !== null || !models?.length} onClick={() => void save(provider)}>Enregistrer</button>
              {provider.configured && <button className="ghost" type="button" disabled={busy !== null} onClick={() => void remove(provider)}>Supprimer la clé</button>}
            </div>
          </article>
        );
      })}
    </section>
  );
}
