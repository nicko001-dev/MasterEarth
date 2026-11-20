import { config } from "../config";

// Nouveaux rôles métier selon DOCUMENT003 §5.1
export type Role = "citoyen" | "agent_terrain" | "analyste" | "responsable" | "admin";
// Alias pour compatibilité
export type LegacyRole = "viewer" | "operator" | "admin";

export interface Account { id: number; email: string; full_name: string; role: Role | LegacyRole }
const KEY = "intelliflood.session.v1";
const RANK: Record<Role | LegacyRole, number> = {
    citoyen: 0,
    agent_terrain: 1,
    analyste: 2,
    responsable: 3,
    admin: 4,
    // Compatibilité
    viewer: 0,
    operator: 1,
} as const;

export const NETWORK_ERROR_MESSAGE =
  "Serveur MasterEarth injoignable. Vérifiez votre connexion réseau, puis réessayez.";

/** Convertit les erreurs de transport en message compréhensible (jamais « Failed to fetch »). */
export function friendlyError(error: unknown, fallback = "Opération impossible pour le moment."): Error {
  if (error instanceof Error && error.message && !/failed to fetch|networkerror|load failed/i.test(error.message)) {
    return error;
  }
  if (error instanceof TypeError) return new Error(NETWORK_ERROR_MESSAGE);
  return new Error(fallback);
}

interface Session { token: string; user: Account; at: number }
const MAX_AGE_MS = 8 * 3600 * 1000;

export function loadSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Session | null;
    return s && Date.now() - s.at < MAX_AGE_MS ? s : null;
  } catch { return null; }
}
export const can = (user: Account | undefined, minimum: Role | LegacyRole) => !!user && RANK[user.role] >= RANK[minimum];

export async function logout(token: string): Promise<void> {
  try {
    const response = await fetch(`${config.apiBaseUrl}/api/v1/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok && response.status !== 401) {
      throw new Error(`La révocation de session a échoué (${response.status}).`);
    }
  } catch (error) {
    throw friendlyError(error, "La session serveur n'a pas pu être révoquée.");
  } finally {
    localStorage.removeItem(KEY);
  }
}

export async function login(email: string, password: string): Promise<Session> {
  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch (error) {
    throw friendlyError(error, "Connexion impossible.");
  }
  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? "Trop de tentatives, réessayez dans quelques minutes."
        : response.status === 401
          ? "E-mail ou mot de passe incorrect."
          : "Connexion impossible.",
    );
  }
  const data = await response.json().catch(() => null) as { access_token?: string; user?: Account } | null;
  if (!data?.access_token || !data.user) {
    throw new Error("Réponse de connexion invalide. Réessayez.");
  }
  const session = { token: data.access_token, user: data.user, at: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(session)); } catch { /* stockage indisponible */ }
  return session;
}

export async function registerViewer(email: string, fullName: string, password: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, full_name: fullName, password }),
    });
  } catch (error) {
    throw friendlyError(error, "Inscription impossible.");
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const detailMsg = data?.details?.[0]?.message ?? data?.detail?.[0]?.msg;
    const msg = data?.message ?? detailMsg ?? data?.detail;
    throw new Error(
      msg ||
        (response.status === 409
          ? "Un compte existe déjà avec cet e-mail."
          : response.status === 429
            ? "Trop de tentatives d'inscription. Réessayez plus tard."
            : "Inscription impossible."),
    );
  }
}

/** Appel JSON vers l'API (avec ou sans token) ; renvoie le message d'erreur lisible du serveur en cas d'échec. */
export async function authed<T>(path: string, token: string | undefined, body: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let r: Response;
  try {
    r = await fetch(`${config.apiBaseUrl}${path}`, {
      method: "POST", headers, body: JSON.stringify(body),
    });
  } catch (error) {
    throw friendlyError(error, "Envoi impossible : le serveur est injoignable.");
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message ?? data?.detail?.[0]?.msg ?? `Erreur ${r.status}`);
  return data as T;
}

export async function authedPatch<T>(path: string, token: string | undefined, body: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw friendlyError(error, "Mise à jour impossible : le serveur est injoignable.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message ?? data?.detail?.[0]?.msg ?? `Erreur ${response.status}`);
  return data as T;
}
