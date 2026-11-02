import { FormEvent, useState } from "react";
import { Account, authed, can } from "../services/auth";
import { AIProviderSettings } from "../components/AIProviderSettings";

type Props = { token: string; user: Account; onDone: () => void };

function useAction(onDone: () => void) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (fn: () => Promise<unknown>, okText: string) => {
    try { await fn(); setMsg({ ok: true, text: okText }); onDone(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };
  return { msg, run };
}
const f = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); return Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>; };

export function Manage({ token, user, onDone }: Props) {
  const { msg, run } = useAction(onDone);
  return (
    <div className="manage">
      {msg && <p className={msg.ok ? "ok-msg" : "err-msg"} role="status">{msg.text}</p>}
      <form onSubmit={(e) => { const d = f(e); const form = e.currentTarget; void run(() => authed("/api/v1/sensors", token, { code: d.code, name: d.name, lat: +d.lat, lon: +d.lon, mount_height_cm: +d.h }), "Capteur créé.").then(() => form.reset()); }}>
        <h3>Nouveau capteur</h3>
        <input name="code" placeholder="Code (ex. CI-ABJ-001)" required pattern="[A-Za-z0-9_.\-]+" />
        <input name="name" placeholder="Nom / emplacement" required />
        <div className="row"><input name="lat" type="number" step="any" min="-90" max="90" placeholder="Latitude" required /><input name="lon" type="number" step="any" min="-180" max="180" placeholder="Longitude" required /></div>
        <input name="h" type="number" step="any" min="1" placeholder="Hauteur de fixation (cm)" required />
        <button>Créer</button>
      </form>
      <form onSubmit={(e) => { const d = f(e); const form = e.currentTarget; void run(() => authed("/api/v1/weather/observations", token, { source: d.source, name: d.name, lat: +d.lat, lon: +d.lon, valid_at: new Date(d.at).toISOString(), precip_mm: +d.mm }), "Bulletin enregistré.").then(() => form.reset()); }}>
        <h3>Bulletin météo (SODEXAM, ONPC, station…)</h3>
        <input name="source" placeholder="Source (ex. sodexam)" required pattern="[a-z0-9_\-]+" />
        <input name="name" placeholder="Lieu" required />
        <div className="row"><input name="lat" type="number" step="any" placeholder="Latitude" required /><input name="lon" type="number" step="any" placeholder="Longitude" required /></div>
        <div className="row"><input name="at" type="datetime-local" required /><input name="mm" type="number" step="0.1" min="0" placeholder="Pluie sur 1 h (mm)" required /></div>
        <button>Enregistrer</button>
      </form>
      {can(user, "admin") && (
        <>
          <form onSubmit={(e) => { const d = f(e); const form = e.currentTarget; void run(() => authed("/api/v1/users", token, { email: d.email, full_name: d.name, password: d.password, role: d.role }), "Compte créé.").then(() => form.reset()); }}>
            <h3>Nouveau compte (administrateur)</h3>
            <input name="name" placeholder="Nom complet" required />
            <input name="email" type="email" placeholder="E-mail" required />
            <input name="password" type="password" minLength={10} placeholder="Mot de passe (10 caractères min.)" required autoComplete="new-password" />
            <select name="role" defaultValue="viewer"><option value="viewer">Lecteur</option><option value="operator">Opérateur</option><option value="admin">Administrateur</option></select>
            <button>Créer le compte</button>
          </form>
          <AIProviderSettings token={token} />
        </>
      )}
    </div>
  );
}
