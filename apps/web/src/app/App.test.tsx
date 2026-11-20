import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

it("renders the MasterEarth platform shell and header without crashing", () => {
  render(<App />);

  expect(screen.getByRole("link", { name: "Retour à l'accueil" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Retour à l'accueil" }).querySelector("img")).toHaveAttribute(
    "src",
    "/brand/masterearth-logo.png",
  );
  expect(screen.getAllByRole("button", { name: "Connexion" }).length).toBeGreaterThanOrEqual(1);
  expect(screen.getByRole("button", { name: "Carte 2D" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Globe 3D" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /MasterEarth World/ })).toHaveAttribute(
    "href",
    `http://${window.location.hostname}:4173`,
  );
});

it("uses the MasterEarth logo in the login panel", () => {
  render(<App />);
  fireEvent.click(screen.getAllByRole("button", { name: "Connexion" })[0]);

  expect(document.querySelector(".login-logo")).toHaveAttribute(
    "src",
    "/brand/masterearth-logo.png",
  );
  expect(document.querySelector(".login-form-logo")).toHaveAttribute(
    "src",
    "/brand/masterearth-logo.png",
  );
});
