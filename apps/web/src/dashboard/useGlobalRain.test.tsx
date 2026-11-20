/** Le compteur mondial ne doit jamais inventer de zéro en cas de panne. */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GlobalRainResponse } from "../services/api";
import { GLOBAL_RAIN_UNAVAILABLE_RETRY_MS, formatAgeSeconds, useGlobalRain } from "./useGlobalRain";

const ready: GlobalRainResponse = {
  generated_at: "2026-11-06T18:00:00+00:00",
  scope: "worldwide",
  available: true,
  stale: false,
  age_seconds: 0,
  source: "Open-Meteo",
  sampled_points: 198,
  valid_points: 196,
  failed_points: 2,
  rain_points: 25,
  rain_fraction: 0.1276,
  max_precip_mm_h: 0.6,
  wettest: [],
  degraded: true,
  attribution: "Open-Meteo (CC BY 4.0)",
  limitations: [],
};

const serverUnavailable: GlobalRainResponse = {
  ...ready,
  available: false,
  stale: true,
  age_seconds: 0,
  source: null,
  valid_points: 0,
  failed_points: 198,
  rain_points: null,
  rain_fraction: null,
  max_precip_mm_h: null,
};

describe("formatage de l'âge d'une mesure", () => {
  it("exprime secondes, minutes et heures en texte lisible", () => {
    expect(formatAgeSeconds(undefined)).toBe("—");
    expect(formatAgeSeconds(Number.NaN)).toBe("—");
    expect(formatAgeSeconds(-5)).toBe("—");
    expect(formatAgeSeconds(45)).toBe("45 s");
    expect(formatAgeSeconds(300)).toBe("5 min");
    expect(formatAgeSeconds(7_200)).toBe("2 h 00 min");
    expect(formatAgeSeconds(19_800)).toBe("5 h 30 min");
  });
});

describe("statistique de pluie mondiale", () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  async function flush() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it("expose les compteurs réels quand le scan réussit", async () => {
    const fetcher = vi.fn(async () => ready);
    const { result } = renderHook(() => useGlobalRain({ fetcher }));

    await flush();

    expect(result.current.status).toBe("ready");
    expect(result.current.data?.rain_points).toBe(25);
    expect(result.current.data?.valid_points).toBe(196);
    expect(result.current.stale).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("passe en indisponible sans fabriquer de donnée quand le serveur n'en a aucune", async () => {
    const fetcher = vi.fn(async () => serverUnavailable);
    const { result } = renderHook(() => useGlobalRain({ fetcher }));

    await flush();

    expect(result.current.status).toBe("unavailable");
    // Aucune donnée inventée : pas de payload vide affiché à la place d'un zéro.
    expect(result.current.data).toBeNull();
    expect(result.current.stale).toBe(true);
  });

  it("conserve la dernière mesure valide quand le serveur redevient indisponible", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(ready)
      .mockResolvedValueOnce(serverUnavailable)
      .mockResolvedValueOnce(ready);
    const { result } = renderHook(() => useGlobalRain({ fetcher, refreshMs: 10_000_000 }));

    await flush();
    expect(result.current.status).toBe("ready");
    expect(result.current.data?.rain_points).toBe(25);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000_000);
    });

    // La réponse « indisponible » n'écrase PAS la dernière mesure valide.
    expect(result.current.status).toBe("ready");
    expect(result.current.data?.rain_points).toBe(25);
    expect(result.current.stale).toBe(true);
    expect(result.current.error).toContain("Aucune valeur exploitable");

    act(() => result.current.retry());
    await flush();

    expect(result.current.stale).toBe(false);
    expect(result.current.error).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("affiche une réponse serveur valide mais périmée, sans la masquer", async () => {
    const staleReady: GlobalRainResponse = {
      ...ready,
      stale: true,
      age_seconds: 7_200,
      source: "Open-Meteo (hôte de repli)",
    };
    const fetcher = vi.fn(async () => staleReady);
    const { result } = renderHook(() => useGlobalRain({ fetcher }));

    await flush();

    expect(result.current.status).toBe("ready");
    expect(result.current.data?.rain_points).toBe(25);
    expect(result.current.stale).toBe(true);
    expect(result.current.data?.age_seconds).toBe(7_200);
    expect(result.current.data?.source).toContain("repli");
  });

  it("garde la dernière valeur connue sur erreur réseau et permet de réessayer", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(ready)
      .mockRejectedValueOnce(new Error("scan en panne"))
      .mockResolvedValueOnce(ready);
    const { result } = renderHook(() => useGlobalRain({ fetcher, refreshMs: 1_000 }));

    await flush();
    expect(result.current.status).toBe("ready");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(result.current.stale).toBe(true);
    expect(result.current.error).toContain("scan en panne");
    expect(result.current.status).toBe("ready");
    expect(result.current.data?.rain_points).toBe(25);

    act(() => result.current.retry());
    await flush();

    expect(result.current.stale).toBe(false);
    expect(result.current.error).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("retente rapidement quand le scan est indisponible, sans attendre 10 minutes", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("quota quotidien épuisé");
    });
    const { result } = renderHook(() => useGlobalRain({ fetcher, refreshMs: 10_000_000 }));

    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("unavailable");
    expect(result.current.data).toBeNull();
    expect(result.current.stale).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(GLOBAL_RAIN_UNAVAILABLE_RETRY_MS);
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("signale une indisponibilité initiale sans fabriquer de donnée", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("réseau coupé");
    });
    const { result } = renderHook(() => useGlobalRain({ fetcher }));

    await flush();

    expect(result.current.status).toBe("unavailable");
    expect(result.current.data).toBeNull();
    expect(result.current.stale).toBe(true);
  });

  it("rafraîchit périodiquement et reste inactif quand désactivé", async () => {
    const active = vi.fn(async () => ready);
    const { unmount } = renderHook(() => useGlobalRain({ fetcher: active, refreshMs: 1_000 }));
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(active).toHaveBeenCalledTimes(2);
    unmount();

    const disabled = vi.fn(async () => ready);
    renderHook(() => useGlobalRain({ fetcher: disabled, enabled: false }));
    await flush();
    expect(disabled).not.toHaveBeenCalled();
  });
});
