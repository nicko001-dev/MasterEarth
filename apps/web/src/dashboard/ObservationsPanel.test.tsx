import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as auth from "../services/auth";
import { fetchObservations } from "../services/api";
import { ObservationsPanel } from "./ObservationsPanel";

vi.mock("../services/api", () => ({
  fetchObservations: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("lets an anonymous visitor submit an observation without an account", async () => {
  vi.mocked(fetchObservations).mockResolvedValue([]);
  const post = vi.spyOn(auth, "authed").mockResolvedValue({});
  render(<ObservationsPanel />);

  expect(screen.getByText(/Aucun compte requis/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Type d’observation/), { target: { value: "eau" } });
  fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Niveau en hausse près du pont" } });
  fireEvent.change(screen.getByLabelText("Date et heure observées"), { target: { value: "2026-11-01T10:30" } });
  fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "-4.01" } });
  fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "5.36" } });
  fireEvent.click(screen.getByRole("button", { name: "Envoyer l’observation" }));

  await waitFor(() => expect(post).toHaveBeenCalledOnce());
  expect(post).toHaveBeenCalledWith(
    "/api/v1/observations",
    undefined,
    expect.objectContaining({ observation_type: "eau", lon: -4.01, lat: 5.36 }),
  );
  expect(await screen.findByText("Observation enregistrée pour vérification.")).toBeInTheDocument();
});

it("submits a field observation and shows the review status", async () => {
  vi.mocked(fetchObservations).mockResolvedValue([]);
  const post = vi.spyOn(auth, "authed").mockResolvedValue({});
  const user = { id: 8, email: "citoyen@example.test", full_name: "Citoyen", role: "viewer" as const };
  render(<ObservationsPanel token="token" user={user} />);

  fireEvent.change(screen.getByLabelText(/Type d’observation/), { target: { value: "eau" } });
  fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Niveau en hausse près du pont" } });
  fireEvent.change(screen.getByLabelText("Date et heure observées"), { target: { value: "2026-11-01T10:30" } });
  fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "-4.01" } });
  fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "5.36" } });
  fireEvent.click(screen.getByRole("button", { name: "Envoyer l’observation" }));

  await waitFor(() => expect(post).toHaveBeenCalledOnce());
  expect(post).toHaveBeenCalledWith(
    "/api/v1/observations",
    "token",
    expect.objectContaining({ observation_type: "eau", lon: -4.01, lat: 5.36 }),
  );
  expect(await screen.findByText("Aucune observation à afficher.")).toBeInTheDocument();
});

it("offers review actions only to operators", async () => {
  vi.mocked(fetchObservations).mockResolvedValue([{
    id: 11,
    observation_type: "eau",
    description: "Niveau en hausse",
    observed_at: "2026-11-01T10:30:00Z",
    lon: -4.01,
    lat: 5.36,
    source: "human",
    status: "new",
    created_by_user_id: 8,
    organization_id: null,
    created_at: "2026-11-01T10:31:00Z",
  }]);
  const patch = vi.spyOn(auth, "authedPatch").mockResolvedValue({});
  const user = { id: 9, email: "agent@example.test", full_name: "Agent", role: "operator" as const };
  render(<ObservationsPanel token="token" user={user} />);

  fireEvent.click(await screen.findByRole("button", { name: "Vérifiée" }));

  await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/observations/11/status", "token", { status: "verified" }));
});
