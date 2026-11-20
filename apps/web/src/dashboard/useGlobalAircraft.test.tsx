/** Vue mondiale : les avions réels doivent rester affichés même en cas de panne. */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseAircraftProduct } from "../services/liveAircraft";
import { useGlobalAircraft } from "./useGlobalAircraft";

const generatedAt = "2026-11-06T18:00:00+00:00";
const upstreamTime = Date.parse(generatedAt) / 1000 + 48;

const payload = {
  generated_at: generatedAt,
  upstream_time: upstreamTime,
  attribution: "OpenSky Network",
  attribution_url: "https://opensky-network.org/",
  license: "CC BY-NC 4.0",
  degraded: false,
  scope: "worldwide",
  bbox: { west: -180, south: -85, east: 180, north: 85 },
  count: 3,
  states: [
    { icao24: "abc123", callsign: "AFR123", lat: 48.85, lon: 2.35 },
    { icao24: "def456", callsign: "QFA040", lat: -36.3, lon: 142.5 },
    { icao24: "ghi789", callsign: "LAN801", lat: -33.4, lon: -70.8 },
  ],
  limitations: ["Vue mondiale : échantillon réparti."],
};

const product = parseAircraftProduct(payload)!;

describe("flux aérien mondial", () => {
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

  it("charge des avions sur les deux hémisphères et aligne l'horloge amont", async () => {
    const fetcher = vi.fn(async () => product);
    const { result } = renderHook(() => useGlobalAircraft({ fetcher }));

    await flush();

    expect(result.current.status).toBe("ready");
    expect(result.current.aircraft).toHaveLength(3);
    expect(result.current.aircraft.some((state) => state.lat < 0)).toBe(true);
    expect(result.current.aircraft.some((state) => state.lat > 0)).toBe(true);
    expect(result.current.clockOffsetMs).toBe(48_000);
    expect(result.current.degraded).toBe(false);
    expect(result.current.limitations).toHaveLength(1);
  });

  it("conserve les dernières positions quand le fournisseur tombe", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(product)
      .mockRejectedValueOnce(new Error("OpenSky indisponible"));
    const { result } = renderHook(() => useGlobalAircraft({ fetcher, refreshMs: 1_000 }));

    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(result.current.aircraft).toHaveLength(3);
    expect(result.current.status).toBe("ready");
    expect(result.current.degraded).toBe(true);
    expect(result.current.error).toContain("OpenSky indisponible");
  });

  it("réessaie sur demande et ne fait aucun appel quand désactivé", async () => {
    const fetcher = vi.fn(async () => product);
    const { result, unmount } = renderHook(() => useGlobalAircraft({ fetcher }));
    await flush();
    act(() => result.current.retry());
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);
    unmount();

    const disabled = vi.fn(async () => product);
    renderHook(() => useGlobalAircraft({ fetcher: disabled, enabled: false }));
    await flush();
    expect(disabled).not.toHaveBeenCalled();
  });
});
