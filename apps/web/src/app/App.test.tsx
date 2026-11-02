import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("../dashboard/SensorMap", () => ({
  SensorMap: () => <div data-testid="sensor-map">Carte 2D</div>,
  LEVEL_COLOR: { green: "#2ecc71", orange: "#f28c28", red: "#ff3b30" },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("renders the IntelliFlood platform shell and header without crashing", () => {
  render(<App />);

  expect(screen.getByRole("link", { name: "Retour à l'accueil" })).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Connexion" }).length).toBeGreaterThanOrEqual(1);
  expect(screen.getByRole("button", { name: "Carte 2D" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Globe 3D" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /IntelliFlood World/ })).toHaveAttribute(
    "href",
    `http://${window.location.hostname}:4173`,
  );
});
