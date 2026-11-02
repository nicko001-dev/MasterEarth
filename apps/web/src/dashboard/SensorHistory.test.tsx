import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { fetchReadings } from "../services/api";
import { SensorHistory } from "./SensorHistory";

vi.mock("../services/api", () => ({
  fetchReadings: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("renders an accessible level history chart and summary", async () => {
  vi.mocked(fetchReadings).mockResolvedValue([
    { measured_at: "2026-11-01T12:05:00Z", water_level_cm: 70, rise_cm_min: 1, level: "orange" },
    { measured_at: "2026-11-01T12:00:00Z", water_level_cm: 30, rise_cm_min: 0, level: "green" },
  ]);

  const { container } = render(<SensorHistory code="CI-ABJ-001" />);

  expect(await screen.findByRole("img", { name: /Historique du niveau d’eau pour CI-ABJ-001/ })).toBeInTheDocument();
  expect(screen.getByText(/2 mesures · de 30 à 70 cm · dernière 70 cm/)).toBeInTheDocument();
  expect(container.querySelector("polyline")?.getAttribute("points")).toContain("24,126");
});

it("reports an unavailable history instead of hiding the failure", async () => {
  vi.mocked(fetchReadings).mockRejectedValue(new Error("offline"));

  render(<SensorHistory code="CI-ABJ-001" />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Historique indisponible.");
  expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
});
