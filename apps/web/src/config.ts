/** Frontend runtime configuration.
 *
 * Values come from Vite environment variables (the ``VITE_*`` prefix is
 * exposed to the client bundle by Vite). See ``apps/web/.env.example``
 * for safe local defaults.
 *
 * When no explicit API URL is configured, the browser hostname is reused so
 * that both ``localhost`` and ``127.0.0.1`` (or a LAN address) reach the API.
 * This avoids the classic "Failed to fetch" caused by a bundle hardcoded to
 * ``127.0.0.1`` while the page is opened through another host name.
 */

const runtimeHost = () => {
  if (typeof window === "undefined" || !window.location.hostname) return null;
  return window.location.hostname;
};

const runtimeProtocol = () =>
  typeof window !== "undefined" && window.location.protocol === "https:" ? "https:" : "http:";

const defaultApiBaseUrl = () => {
  const host = runtimeHost();
  return host ? `${runtimeProtocol()}//${host}:8000` : "http://127.0.0.1:8000";
};

const defaultWorldUrl = () => {
  const host = runtimeHost();
  // Port 4173 n'est pas systématiquement disponible ; on utilise le même
  // hostname que la page mais sur le port de l'API (8000), ou on laisse vide
  // si l'utilisateur veut le configurer via VITE_INTELLIFLOOD_WORLD_URL.
  return host ? `${runtimeProtocol()}//${host}:8000` : "http://127.0.0.1:8000";
};

export const config = {
  /** Base URL of the backend API. */
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl(),
  /** URL of the standalone IntelliFlood World application. */
  intelliFloodWorldUrl: import.meta.env.VITE_INTELLIFLOOD_WORLD_URL ?? defaultWorldUrl(),
  /** Local development server port. */
  port: Number(import.meta.env.VITE_PORT) || 5173,
};

export default config;
