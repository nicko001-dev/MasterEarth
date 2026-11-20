import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorldWeather, weatherBoundsEligible } from "./useWorldWeather";
import type { WeatherViewportResponse } from "../services/api";

const viewport: WeatherViewportResponse = {
  generated_at: "2026-01-01T00:00:00Z",
  bbox: { west: 2, south: 48, east: 12, north: 52 },
  spacing_km: 250,
  points: [],
  degraded: false,
  attribution: "Open-Meteo (CC BY 4.0)",
  limitations: [],
};

describe("couverture météo mondiale", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("accepte une emprise régionale valide", () => {
    expect(
      weatherBoundsEligible({ west: 2, south: 48, east: 12, north: 52 }),
    ).toBe(true);
  });

  it("refuse une emprise inversée, hors du monde ou invalide", () => {
    expect(
      weatherBoundsEligible({ west: 12, south: 48, east: 2, north: 52 }),
    ).toBe(false);
    expect(
      weatherBoundsEligible({ west: 179, south: -10, east: 181, north: 10 }),
    ).toBe(false);
    expect(
      weatherBoundsEligible({ west: -200, south: -10, east: -170, north: 10 }),
    ).toBe(false);
    expect(
      weatherBoundsEligible({ west: 2, south: Number.NaN, east: 12, north: 52 }),
    ).toBe(false);
  });

  it("accepte la vue mondiale entière", () => {
    expect(
      weatherBoundsEligible({ west: -180, south: -85, east: 180, north: 85 }),
    ).toBe(true);
  });

  it("refuse le franchissement de l'antiméridien sans couper la couverture", async () => {
    const fetcher = vi.fn(async () => viewport);
    const { rerender } = renderHook(
      ({ bounds }) => useWorldWeather(bounds, { fetcher }),
      {
        initialProps: {
          bounds: { west: 170, south: -10, east: 190, north: 10 },
        },
      },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(fetcher).not.toHaveBeenCalled();

    rerender({ bounds: { west: 2, south: 48, east: 12, north: 52 } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("réessaie après un échec dès que l'emprise change", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("quota"))
      .mockResolvedValueOnce(viewport);
    const { result, rerender } = renderHook(
      ({ bounds }) => useWorldWeather(bounds, { fetcher }),
      {
        initialProps: {
          bounds: { west: 2, south: 48, east: 12, north: 52 },
        },
      },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(result.current.status).toBe("unavailable");

    rerender({ bounds: { west: 3, south: 48, east: 13, north: 52 } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("ready");
  });
});
