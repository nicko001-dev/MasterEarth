import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SimulationPanel } from "./SimulationPanel";
import { runFloodSimulation } from "../services/simulation";

vi.mock("../services/simulation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/simulation")>()),
  runFloodSimulation: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("explains when a connected low terrain cell exceeds the requested source rise", async () => {
  vi.mocked(runFloodSimulation).mockResolvedValue({
    id: 1,
    bbox: { south: 5.3, west: -4.1, north: 5.4, east: -3.9 },
    rows: 40,
    cols: 40,
    cell_m: 10,
    depth_cm_b64: "",
    possible_b64: "",
    stats: {
      max_depth_m: 20,
      area_km2: 0.073,
      volume_m3: 474300,
      surface_level_m: 62,
      possible_area_km2: 0.08,
    },
    assumptions: [],
    frames: [],
    disclaimer: "Simulation indicative.",
    center: { lat: 5.36, lon: -4 },
  });

  function Harness() {
    const [run, setRun] = useState<Parameters<typeof SimulationPanel>[0]["run"]>(null);
    return (
      <SimulationPanel
        position="left"
        token="viewer-session"
        sensors={[]}
        run={run}
        frameIndex={0}
        onLogin={() => {}}
        onRunChange={setRun}
        onFrameChange={() => {}}
      />
    );
  }
  render(<Harness />);

  const toggle = screen.getByRole("button", { name: /Simulation pluie et inondation/ });
  if (toggle.getAttribute("aria-expanded") === "false") fireEvent.click(toggle);
  fireEvent.change(screen.getByLabelText("Scénario"), { target: { value: "level" } });
  const form = screen.getByRole("button", { name: "Lancer la simulation" }).closest("form");
  if (!form) throw new Error("Simulation form was not rendered.");
  fireEvent.submit(form);

  await waitFor(() => {
    expect(runFloodSimulation).toHaveBeenCalled();
    expect(screen.getByText(/La profondeur maximale dépasse la hausse choisie/)).toBeInTheDocument();
  });
  expect(runFloodSimulation).toHaveBeenCalledWith(
    "viewer-session",
    expect.objectContaining({ mode: "level", rise_m: 1.5 }),
  );
});

it("préremplit le scénario et les coordonnées demandés par l'assistant sans lancer de calcul", () => {
  const handled = vi.fn();
  render(
    <SimulationPanel
      position="left"
      token="viewer-session"
      sensors={[]}
      run={null}
      frameIndex={0}
      request={{ mode: "level", lat: 48.8566, lon: 2.3522, timestamp: 1 }}
      onLogin={() => {}}
      onRunChange={() => {}}
      onFrameChange={() => {}}
      onRequestHandled={handled}
    />,
  );

  const toggle = screen.getByRole("button", { name: /Simulation pluie et inondation/ });
  if (toggle.getAttribute("aria-expanded") === "false") fireEvent.click(toggle);

  expect(screen.getByLabelText("Scénario")).toHaveValue("level");
  expect(screen.getByLabelText("Latitude")).toHaveValue(48.8566);
  expect(screen.getByLabelText("Longitude")).toHaveValue(2.3522);
  expect(handled).toHaveBeenCalledTimes(1);
  expect(runFloodSimulation).not.toHaveBeenCalled();
});
