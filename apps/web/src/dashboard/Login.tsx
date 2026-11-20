import { FormEvent, useEffect, useState } from "react";
import { login, registerViewer } from "../services/auth";

type Props = { onLogged: () => void; onCancel: () => void };

export function Login({ onLogged, onCancel }: Props) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email")).trim();
    const password = String(data.get("password"));
    let accountCreated = false;
    try {
      if (creatingAccount) {
        const fullName = String(data.get("full_name")).trim();
        if (password !== String(data.get("password_confirmation"))) {
          throw new Error("Les mots de passe ne correspondent pas.");
        }
        await registerViewer(email, fullName, password);
        accountCreated = true;
      }
      await login(email, password);
      onLogged();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Opération impossible.";
      if (accountCreated) {
        setCreatingAccount(false);
        setNotice("Votre compte a bien été créé. Connectez-vous avec le mot de passe que vous venez de choisir.");
        setError(message);
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="modal"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}
    >
      <div className="login-card" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <aside className="login-aside" aria-hidden="true">
          <img className="login-logo" src="/brand/masterearth-logo.png" alt="" />
          <p>Veiller sur la Terre, aléa par aléa, en temps réel.</p>
          <ul>
            <li>Surveillance mondiale des aléas et des capteurs</li>
            <li>Simulations indicatives pour tous les phénomènes</li>
            <li>Observations terrain vérifiées</li>
          </ul>
          <small>Les données publiques et les crédits restent visibles sans compte.</small>
        </aside>
        <form className="login-form" onSubmit={(event) => void submit(event)}>
          <button type="button" className="modal-close" onClick={onCancel} aria-label="Fermer" disabled={busy}>×</button>
          <img className="login-form-logo" src="/brand/masterearth-logo.png" alt="" />
          <h2 id="login-title">{creatingAccount ? "Créer un compte citoyen" : "Connexion"}</h2>
          <p className="muted">
            {creatingAccount
              ? "L'inscription crée uniquement un compte citoyen (lecture seule). Les comptes agent, analyste, responsable et administrateur sont créés par un administrateur."
              : "Connectez-vous avec un compte citoyen, agent, analyste, responsable ou administrateur. Vous pouvez créer un compte citoyen."}
          </p>
          {creatingAccount && (
            <label className="field">
              <span>Nom complet</span>
              <input name="full_name" type="text" placeholder="Nom complet" required minLength={1} maxLength={160} autoComplete="name" autoFocus />
            </label>
          )}
          <label className="field">
            <span>E-mail</span>
            <input name="email" type="email" placeholder="E-mail" required autoComplete="username" autoFocus={!creatingAccount} />
          </label>
          <label className="field">
            <span>Mot de passe</span>
            <input
              name="password"
              type="password"
              placeholder="Mot de passe"
              required
              minLength={creatingAccount ? 10 : 1}
              maxLength={200}
              autoComplete={creatingAccount ? "new-password" : "current-password"}
            />
            {creatingAccount && <small>10 caractères minimum.</small>}
          </label>
          {creatingAccount && (
            <label className="field">
              <span>Confirmation</span>
              <input name="password_confirmation" type="password" placeholder="Confirmer le mot de passe" required minLength={10} maxLength={200} autoComplete="new-password" />
            </label>
          )}
          {notice && <p className="ok-msg" role="status">{notice}</p>}
          {error && <p className="err-msg" role="alert">{error}</p>}
          <div className="modal-actions">
            <button className="button button-primary" disabled={busy}>
              {busy ? "Traitement…" : creatingAccount ? "Créer mon compte" : "Se connecter"}
            </button>
            <button type="button" className="button button-ghost" onClick={onCancel} disabled={busy}>Annuler</button>
          </div>
          <button
            type="button"
            className="link-button"
            disabled={busy}
            onClick={() => { setCreatingAccount((current) => !current); setError(""); setNotice(""); }}
          >
            {creatingAccount ? "J'ai déjà un compte" : "Créer un compte citoyen"}
          </button>
        </form>
      </div>
    </div>
  );
}
