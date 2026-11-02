import { config } from "../config";

export interface AIProviderModel {
  id: string;
  name: string;
  supports_images: boolean;
}

export interface AIProvider {
  id: string;
  name: string;
  configured: boolean;
  enabled: boolean;
  has_key: boolean;
  selected_models: string[];
  free_tier_confirmed: boolean;
  priority: number;
  billing_note: string;
}

export interface AIStatus {
  providers: { id: string; name: string; models: string[]; billing_note: string }[];
  external_requests_require_consent: boolean;
  offline_mode: string;
}

export interface AssistantResult {
  answer: string;
  mode: "cloud_ai" | "offline_deterministic";
  provider: string | null;
  model: string | null;
  sources: string[];
  human_validation_required: boolean;
  operational_decision: false;
  limitations: string[];
  requested_mode?: "answer" | "report";
}

async function request<T>(
  path: string,
  token?: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.detail ?? data?.error?.message ?? `Erreur ${response.status}`);
  }
  return data as T;
}

export const fetchAIProviders = (token: string) =>
  request<AIProvider[]>("/api/v1/ai/providers", token);

export const fetchAIStatus = (token?: string) =>
  request<AIStatus>("/api/v1/ai/status", token);

export const fetchFreeModels = (
  token: string,
  providerId: string,
  apiKey?: string,
) =>
  request<AIProviderModel[]>(
    `/api/v1/ai/providers/${encodeURIComponent(providerId)}/catalog`,
    token,
    "POST",
    apiKey ? { api_key: apiKey } : {},
  );

export const saveAIProvider = (
  token: string,
  providerId: string,
  body: {
    api_key?: string;
    selected_models: string[];
    enabled: boolean;
    free_tier_confirmed: true;
    priority: number;
  },
) =>
  request<unknown>(
    `/api/v1/ai/providers/${encodeURIComponent(providerId)}`,
    token,
    "PUT",
    body,
  );

export const removeAIProvider = (token: string, providerId: string) =>
  request<void>(
    `/api/v1/ai/providers/${encodeURIComponent(providerId)}`,
    token,
    "DELETE",
  );

export const askAssistant = (token: string | undefined, message: string, mode: "answer" | "report") =>
  request<AssistantResult>("/api/v1/ai/assistant", token, "POST", {
    message,
    mode,
    surface: "web",
    external_consent: true,
  });

export async function analyzeImage(
  token: string | undefined,
  question: string,
  file: File,
): Promise<{ available: boolean; mode: string; answer?: string; message?: string; provider?: string; model?: string; image_retained?: boolean }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture de l'image impossible."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
  const separator = dataUrl.indexOf(",");
  if (separator < 0) throw new Error("Format d'image invalide.");
  return request("/api/v1/ai/vision", token, "POST", {
    question,
    media_type: file.type,
    image_base64: dataUrl.slice(separator + 1),
    external_consent: true,
  });
}

export function localAssistantSummary(
  sensors: { water_level_cm: number | null; health_status: string; alert_level: string }[],
  alerts: { level: string }[],
  weather: { level: string }[],
  mode: "answer" | "report" = "answer",
  transportUnavailable = false,
): AssistantResult {
  const levels = (items: { level: string }[]) => ({
    red: items.filter((item) => item.level === "red").length,
    orange: items.filter((item) => item.level === "orange").length,
  });
  const waterLevels = levels(sensors.map((sensor) => ({ level: sensor.alert_level })));
  const notice = transportUnavailable
    ? "Mode local après échec de connexion API. La requête a peut-être atteint le serveur; aucun résultat IA n'est confirmé."
    : "Mode local déterministe — aucune requête ni donnée n'a été envoyée à un fournisseur.";
  const summary = `${notice} ${sensors.length} capteur(s), ${sensors.filter((sensor) => sensor.health_status === "online").length} avec mesure récente, ${waterLevels.red} niveau(x) rouge(s) et ${waterLevels.orange} orange(s); ${alerts.length} alerte(s) connue(s) et ${weather.length} point(s) météo en mémoire. Ce résumé n'est ni une prévision ni une décision opérationnelle.`;
  return {
    answer: mode === "report"
      ? `Résumé local\n${summary}\n\nLimites\nAucune interprétation IA ni prévision n'a été produite.`
      : summary,
    mode: "offline_deterministic",
    provider: null,
    model: null,
    sources: ["Données déjà présentes dans cette page"],
    human_validation_required: true,
    operational_decision: false,
    limitations: [
      "Aucun résultat IA n'est confirmé.",
      transportUnavailable
        ? "La requête peut avoir été reçue avant l'interruption."
        : "Données locales/cachées uniquement.",
    ],
  };
}
