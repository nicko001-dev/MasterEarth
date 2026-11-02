import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AssistantPanel } from "./AssistantPanel";

const props = {
  sensors: [{
    code: "CI-ABJ-001",
    name: "Capteur test",
    lon: -4,
    lat: 5,
    status: "active",
    alert_level: "red" as const,
    water_level_cm: 90,
    last_measured_at: null,
    health_status: "online" as const,
    minutes_since_last_reading: 0,
  }],
  alerts: [],
  weather: [],
};

const jsonResponse = (data: unknown) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

it("provides an unauthenticated deterministic answer offline without consent or network", async () => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  render(<AssistantPanel {...props} />);

  fireEvent.change(screen.getByLabelText("Question (ne saisissez aucune donnée personnelle)"), {
    target: { value: "Résume la situation" },
  });
  const send = screen.getByRole("button", { name: "Répondre localement" });
  expect(send).toBeEnabled();
  fireEvent.click(send);

  expect(await screen.findByText(/Mode local déterministe — aucune requête ni donnée/)).toBeInTheDocument();
  expect(screen.getByText(/1 capteur\(s\).*1 niveau\(x\) rouge\(s\)/)).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("checks the globally configured AI catalogue without a session", async () => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
    providers: [],
    external_requests_require_consent: true,
    offline_mode: "deterministic_summary",
  }));
  vi.stubGlobal("fetch", fetchMock);
  render(<AssistantPanel {...props} />);

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(await screen.findByText(/aucun n'est configuré/)).toBeInTheDocument();
  expect((fetchMock.mock.calls[0][1] as RequestInit).headers).not.toHaveProperty("Authorization");
});

it("shows recipients and requires per-request consent before cloud transmission", async () => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(jsonResponse({
      providers: [{
        id: "gemini",
        name: "Google Gemini",
        models: ["gemini-3.8-flash"],
        billing_note: "Les données gratuites peuvent contribuer à l'amélioration des produits.",
      }],
      external_requests_require_consent: true,
      offline_mode: "deterministic_summary",
    }))
    .mockResolvedValueOnce(jsonResponse({
      answer: "Réponse informative",
      mode: "cloud_ai",
      provider: "Google Gemini",
      model: "gemini-3.8-flash",
      sources: ["Capteurs agrégés"],
      human_validation_required: true,
      operational_decision: false,
      limitations: [],
    }));
  vi.stubGlobal("fetch", fetchMock);
  render(<AssistantPanel {...props} token="session-token" />);

  expect(await screen.findByText(/Google Gemini · modèles gemini-3.8-flash/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Question (ne saisissez aucune donnée personnelle)"), {
    target: { value: "Résume la situation" },
  });
  const send = screen.getByRole("button", { name: "Envoyer la question" });
  expect(send).toBeDisabled();
  expect(fetchMock).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("checkbox", { name: /En ligne, j'autorise/ }));
  expect(send).toBeEnabled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fireEvent.click(send);

  expect(await screen.findByText("Réponse informative")).toBeInTheDocument();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("checkbox", { name: /En ligne, j'autorise/ })).not.toBeChecked();
  expect(send).toBeDisabled();
  const request = fetchMock.mock.calls[1][1] as RequestInit;
  expect(JSON.parse(String(request.body))).toMatchObject({
    message: "Résume la situation",
    external_consent: true,
  });
  expect(request.headers).toEqual(expect.objectContaining({ Authorization: "Bearer session-token" }));
});

it("offers an explicit local summary without authentication, consent, or network", async () => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  render(<AssistantPanel {...props} />);

  fireEvent.click(screen.getByRole("button", { name: "Résumé des données en mémoire — sans envoi" }));

  expect(await screen.findByText(/Mode local déterministe — aucune requête ni donnée/)).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("falls back to a clearly qualified local summary when the API connection fails", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(jsonResponse({
      providers: [],
      external_requests_require_consent: true,
      offline_mode: "deterministic_summary",
    }))
    .mockRejectedValueOnce(new TypeError("Failed to fetch"));
  vi.stubGlobal("fetch", fetchMock);
  render(<AssistantPanel {...props} token="session-token" />);

  fireEvent.change(screen.getByLabelText("Question (ne saisissez aucune donnée personnelle)"), {
    target: { value: "Résume la situation" },
  });
  fireEvent.click(await screen.findByRole("checkbox", { name: /En ligne, j'autorise/ }));
  fireEvent.click(screen.getByRole("button", { name: "Envoyer la question" }));

  expect(await screen.findByText(/La requête a peut-être atteint le serveur/)).toBeInTheDocument();
  expect(screen.getByText(/API injoignable/)).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: /En ligne, j'autorise/ })).not.toBeChecked();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("warns about uncertain image delivery and clears both consents on connection failure", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(jsonResponse({
      providers: [{
        id: "gemini",
        name: "Google Gemini",
        models: ["vision-free-model"],
        billing_note: "Offre gratuite dépendante du compte.",
      }],
      external_requests_require_consent: true,
      offline_mode: "deterministic_summary",
    }))
    .mockRejectedValueOnce(new TypeError("Failed to fetch"));
  vi.stubGlobal("fetch", fetchMock);
  render(<AssistantPanel {...props} token="session-token" />);
  expect(await screen.findByText(/Google Gemini · modèles vision-free-model/)).toBeInTheDocument();

  const image = new File(["image"], "water.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText("Analyse d'image (facultative, non conservée)"), {
    target: { files: [image] },
  });
  fireEvent.click(await screen.findByRole("checkbox", { name: /En ligne, j'autorise/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /J'autorise explicitement l'envoi de cette image/ }));
  fireEvent.click(screen.getByRole("button", { name: "Analyser l'image" }));

  expect(await screen.findByText(/l'image a peut-être déjà atteint le serveur ou le fournisseur/)).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: /En ligne, j'autorise/ })).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: /J'autorise explicitement l'envoi de cette image/ })).not.toBeChecked();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
