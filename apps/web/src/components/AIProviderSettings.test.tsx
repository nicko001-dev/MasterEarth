import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AIProviderSettings } from "./AIProviderSettings";

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const provider = {
  id: "groq",
  name: "Groq",
  configured: false,
  enabled: true,
  has_key: false,
  selected_models: [] as string[],
  free_tier_confirmed: false,
  priority: 100,
  billing_note: "Offre gratuite limitée.",
};

const models = Array.from({ length: 6 }, (_, index) => ({
  id: `modele-${index + 1}`,
  name: `Modèle ${index + 1}`,
  supports_images: false,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("limite la sélection à cinq modèles et enregistre la configuration", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/ai/providers") && (!init || !init.method || init.method === "GET")) {
      return jsonResponse([provider]);
    }
    if (url.endsWith("/ai/providers/groq/catalog")) {
      return jsonResponse(models);
    }
    if (url.endsWith("/ai/providers/groq") && init?.method === "PUT") {
      return jsonResponse({ ok: true });
    }
    return jsonResponse({});
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<AIProviderSettings token="jeton-test" />);
  expect(await screen.findByText("Groq")).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/Clé API/), {
    target: { value: "gsk_cle_de_test_123456" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Découvrir les modèles gratuits" }));
  expect(await screen.findByText(/6 modèle\(s\) gratuits confirmés/)).toBeInTheDocument();

  for (let index = 1; index <= 5; index += 1) {
    fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(`Modèle ${index} `) }));
  }
  expect(screen.getByText(/5\/5 modèles maximum/)).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: /Modèle 6 / })).toBeDisabled();

  fireEvent.click(screen.getByLabelText(/Je confirme que ce compte utilise une offre gratuite/));
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

  expect(await screen.findByText(/Groq configuré/)).toBeInTheDocument();
  const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
  expect(put).toBeTruthy();
  const body = JSON.parse(String(put?.[1]?.body));
  expect(body.selected_models).toHaveLength(5);
  expect(body.free_tier_confirmed).toBe(true);
  expect(body.api_key).toBe("gsk_cle_de_test_123456");
});

it("affiche le détail d'une erreur de validation 422", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/ai/providers") && (!init || !init.method || init.method === "GET")) {
      return jsonResponse([{ ...provider, configured: true, has_key: true, selected_models: ["modele-1"] }]);
    }
    if (url.endsWith("/ai/providers/groq/catalog")) {
      return jsonResponse([models[0]]);
    }
    if (url.endsWith("/ai/providers/groq") && init?.method === "PUT") {
      return jsonResponse({ detail: [{ loc: ["body", "selected_models"], msg: "List should have at most 5 items" }] }, 422);
    }
    return jsonResponse({});
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<AIProviderSettings token="jeton-test" />);
  expect(await screen.findByText("Groq")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Découvrir les modèles gratuits" }));
  expect(await screen.findByText(/1 modèle\(s\) gratuits confirmés/)).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: /Modèle 1 / })).toBeChecked();
  fireEvent.click(screen.getByLabelText(/Je confirme que ce compte utilise une offre gratuite/));
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

  await waitFor(() => {
    expect(screen.getByRole("alert").textContent).toContain("selected_models: List should have at most 5 items");
  });
});
