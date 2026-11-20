/** Tests des clients des deux nouvelles sources mondiales, sans réseau. */
import { describe, expect, it, vi } from "vitest";
import { fetchGlobalRain } from "./api";
import { fetchGlobalAircraft, globalAircraftApiUrl } from "./liveAircraft";

const rain = {
  generated_at: "2026-11-06T18:00:00+00:00",
  scope: "worldwide",
  available: true,
  sampled_points: 198,
  valid_points: 198,
  failed_points: 0,
  rain_points: 25,
  rain_fraction: 0.1263,
  max_precip_mm_h: 0.6,
  wettest: [{ name: "Monde -30,-20", lat: -30, lon: -20, precip_mm_h: 0.6 }],
  degraded: false,
  attribution: "Open-Meteo (CC BY 4.0)",
  limitations: [],
};

const aircraftPayload = {
  generated_at: "2026-11-06T18:00:00+00:00",
  upstream_time: 1_760_000_000,
  attribution: "OpenSky Network",
  attribution_url: "https://opensky-network.org/",
  license: "CC BY-NC 4.0",
  degraded: false,
  scope: "worldwide",
  bbox: { west: -180, south: -85, east: 180, north: 85 },
  count: 2,
  states: [
    { icao24: "abc123", callsign: "AFR123", country: "France", lat: 48.85, lon: 2.35, observed_at: 1_760_000_000, source: "ADS-B" },
    { icao24: "def456", callsign: "QFA040", country: "Australia", lat: -36.3, lon: 142.5, observed_at: 1_760_000_000, source: "ADS-B" },
  ],
  limitations: ["Vue mondiale : échantillon réparti."],
};

function response(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe("scan de pluie mondial", () => {
  it("interroge la route dédiée et conserve les compteurs réels", async () => {
    const fetcher = vi.fn(async () => response(rain));

    const result = await fetchGlobalRain(fetcher as unknown as typeof fetch);

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/weather/global-rain"),
    );
    expect(result.rain_points).toBe(25);
    expect(result.valid_points).toBe(198);
    expect(result.scope).toBe("worldwide");
  });

  it("préserve null quand la donnée est indisponible (jamais un zéro)", async () => {
    const fetcher = vi.fn(async () => response({ ...rain, available: false, rain_points: null }));

    const result = await fetchGlobalRain(fetcher as unknown as typeof fetch);

    expect(result.available).toBe(false);
    expect(result.rain_points).toBeNull();
  });

  it("signale une réponse en erreur", async () => {
    const fetcher = vi.fn(async () => response({}, false, 503));

    await expect(fetchGlobalRain(fetcher as unknown as typeof fetch)).rejects.toThrow("503");
  });
});

describe("trafic aérien mondial", () => {
  it("construit l'URL de la vue mondiale", () => {
    expect(globalAircraftApiUrl()).toMatch(/\/api\/v1\/live\/aircraft\/global$/);
  });

  it("valide les positions et couvre les deux hémisphères", async () => {
    const fetcher = vi.fn(async () => response(aircraftPayload));

    const product = await fetchGlobalAircraft(fetcher as unknown as typeof fetch);

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/live/aircraft/global"),
      expect.objectContaining({ credentials: "omit", cache: "no-store" }),
    );
    expect(product.aircraft).toHaveLength(2);
    expect(product.aircraft.some((state) => state.lat < 0)).toBe(true);
    expect(product.aircraft.some((state) => state.lat > 0)).toBe(true);
    expect(product.bbox).toMatchObject({ west: -180, east: 180 });
    expect(product.limitations).toHaveLength(1);
  });

  it("rejette une réponse HTTP en erreur et une charge inexploitable", async () => {
    const failing = vi.fn(async () => response({}, false, 503));
    await expect(fetchGlobalAircraft(failing as unknown as typeof fetch)).rejects.toThrow("503");

    const unusable = vi.fn(async () => response(null));
    await expect(fetchGlobalAircraft(unusable as unknown as typeof fetch)).rejects.toThrow(
      "inexploitable",
    );
  });
});
