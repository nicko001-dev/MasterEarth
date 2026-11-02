import { FormEvent, useCallback, useEffect, useState } from "react";
import { Account, authed, authedPatch, can } from "../services/auth";
import { FieldObservation, fetchObservations, ObservationStatus } from "../services/api";

interface Props {
  token?: string;
  user?: Account;
}

const STATUS_LABEL: Record<ObservationStatus, string> = {
  new: "Nouvelle",
  in_review: "En vérification",
  verified: "Vérifiée",
  rejected: "Rejetée",
};
const REVIEW_OPTIONS: ObservationStatus[] = ["in_review", "verified", "rejected"];
const EXAMPLE_TYPES = ["eau", "pluie", "route bloquée", "bâtiment touché", "dégât", "anomalie", "infrastructure", "autre"];

function localDateTimeNow(): string {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function ObservationsPanel({ token, user }: Props) {
  const [items, setItems] = useState<FieldObservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchObservations(token));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Chargement des observations impossible.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await authed("/api/v1/observations", token, {
        observation_type: String(data.get("observation_type")),
        description: String(data.get("description")),
        observed_at: new Date(String(data.get("observed_at"))).toISOString(),
        lon: Number(data.get("lon")),
        lat: Number(data.get("lat")),
      });
      form.reset();
      setMessage("Observation enregistrée pour vérification.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Envoi de l’observation impossible.");
    } finally {
      setSubmitting(false);
    }
  };

  const review = async (item: FieldObservation, status: ObservationStatus) => {
    setError(null);
    setMessage(null);
    try {
      await authedPatch(`/api/v1/observations/${item.id}/status`, token, { status });
      setMessage("Statut de l’observation mis à jour.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Mise à jour du statut impossible.");
    }
  };

  return (
    <section className="pane-observations" aria-labelledby="observations-heading">
      <h2 id="observations-heading">Observations terrain</h2>
      <p className="muted">
        <strong>Aucun compte requis.</strong> Les signalements anonymes sont enregistrés pour vérification et ne
        diffusent pas d’alerte officielle.
      </p>
      <form className="observation-form" onSubmit={(event) => void submit(event)}>
        <label>
          Type d’observation
          <input name="observation_type" list="observation-type-examples" maxLength={64} required />
          <datalist id="observation-type-examples">
            {EXAMPLE_TYPES.map((type) => <option key={type} value={type} />)}
          </datalist>
          <small>Catégorie libre; les exemples ne sont pas une liste exhaustive.</small>
        </label>
        <label>Description<textarea name="description" rows={3} maxLength={2000} required /></label>
        <label>Date et heure observées<input name="observed_at" type="datetime-local" defaultValue={localDateTimeNow()} required /></label>
        <div className="row">
          <label>Longitude<input name="lon" type="number" min="-180" max="180" step="any" required /></label>
          <label>Latitude<input name="lat" type="number" min="-90" max="90" step="any" required /></label>
        </div>
        <button type="submit" disabled={submitting}>{submitting ? "Envoi…" : "Envoyer l’observation"}</button>
      </form>
      {message && <p className="ok-msg" role="status">{message}</p>}
      {error && <p className="err-msg" role="alert">{error}</p>}
      <h3>Signalements accessibles</h3>
      {loading && <p className="muted" role="status">Chargement…</p>}
      {!loading && items.length === 0 && <p className="muted">Aucune observation à afficher.</p>}
      <ul aria-label="Observations accessibles">
        {items.map((item) => (
          <li key={item.id} className="observation-item">
            <div>
              <strong>{item.observation_type} · {STATUS_LABEL[item.status]}</strong>
              <small>{item.description}</small>
              <small>{new Date(item.observed_at).toLocaleString("fr-FR")} · {item.lat.toFixed(5)}, {item.lon.toFixed(5)}</small>
            </div>
            {can(user, "operator") && (
              <div className="observation-review" role="group" aria-label={`Revue observation ${item.id}`}>
                {REVIEW_OPTIONS.filter((status) => status !== item.status).map((status) => (
                  <button key={status} type="button" onClick={() => void review(item, status)}>
                    {STATUS_LABEL[status]}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
