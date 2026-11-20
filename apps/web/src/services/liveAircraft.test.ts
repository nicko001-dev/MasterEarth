import { describe, expect, it } from "vitest";
import {
  aircraftApiUrl,
  aircraftDescription,
  aircraftIconSvg,
  aircraftLabel,
  extrapolateAircraft,
  parseAircraftProduct,
} from "./liveAircraft";

const row = (overrides: Record<string, unknown> = {}) => ({
  icao24: "abc123",
  callsign: "AFR123",
  country: "France",
  lat: 48.85,
  lon: 2.35,
  altitude_m: 10_000,
  on_ground: false,
  velocity_m_s: 250,
  heading_deg: 90,
  vertical_rate_m_s: 0,
  observed_at: 1_760_000_000,
  source: "ADS-B",
  ...overrides,
});

const payload = (states: unknown[] = [row()]) => ({
  generated_at: "2026-11-04T12:00:00+00:00",
  upstream_time: 1_760_000_000,
  attribution: "OpenSky Network",
  attribution_url: "https://opensky-network.org/",
  license: "CC BY-NC 4.0",
  degraded: false,
  bbox: { west: -5, south: 45, north: 55, east: 15 },
  count: states.length,
  states,
  limitations: ["Couverture dépendante des récepteurs."],
});

describe("charge utile du trafic aérien", () => {
  it("valide les états et ignore les entrées incomplètes", () => {
    const product = parseAircraftProduct(payload([
      row(),
      row({ icao24: "", lat: 48 }),
      row({ lat: "nord" }),
      row({ lat: 99 }),
      "pas un avion",
    ]));

    expect(product).not.toBeNull();
    expect(product?.aircraft).toHaveLength(1);
    expect(product?.aircraft[0]).toMatchObject({
      icao24: "abc123",
      callsign: "AFR123",
      headingDeg: 90,
      source: "ADS-B",
    });
    expect(product?.attribution).toBe("OpenSky Network");
    expect(product?.limitations).toHaveLength(1);
  });

  it("rejette une charge utile inexploitable", () => {
    expect(parseAircraftProduct(null)).toBeNull();
    expect(parseAircraftProduct({})?.aircraft).toEqual([]);
  });

  it("normalise le cap et accepte une emprise absente", () => {
    const product = parseAircraftProduct(payload([row({ heading_deg: -90 })]));
    expect(product?.aircraft[0].headingDeg).toBe(270);
    expect(parseAircraftProduct({ ...payload(), bbox: null })?.bbox).toBeNull();
  });

  it("construit une URL d'API bornée", () => {
    const url = aircraftApiUrl({ west: -5, south: 45, north: 55, east: 15 });
    expect(url).toContain("/api/v1/live/aircraft?");
    expect(url).toContain("west=-5.0000");
    expect(url).toContain("north=55.0000");
  });
});

describe("interpolation entre observations", () => {
  const aircraft = parseAircraftProduct(payload())!.aircraft[0];

  it("prolonge le déplacement vers l'est le long du cap", () => {
    const position = extrapolateAircraft(aircraft, (aircraft.observedAt! + 10) * 1000);
    expect(position.lat).toBeCloseTo(48.85, 3);
    expect(position.lon).toBeGreaterThan(2.35);
    expect(position.elapsedSeconds).toBe(10);
  });

  it("plafonne l'interpolation et ne déplace pas un avion au sol", () => {
    const later = extrapolateAircraft(aircraft, (aircraft.observedAt! + 3_600) * 1000);
    expect(later.elapsedSeconds).toBe(120);

    const grounded = { ...aircraft, onGround: true };
    expect(extrapolateAircraft(grounded, (aircraft.observedAt! + 30) * 1000)).toMatchObject({
      lat: aircraft.lat,
      lon: aircraft.lon,
    });
  });

  it("ne déplace pas un avion sans vitesse ni cap", () => {
    const unknown = { ...aircraft, velocityMs: null, headingDeg: null };
    expect(extrapolateAircraft(unknown, (aircraft.observedAt! + 30) * 1000)).toMatchObject({
      lat: aircraft.lat,
      lon: aircraft.lon,
      elapsedSeconds: 0,
    });
  });
});

describe("présentation", () => {
  const aircraft = parseAircraftProduct(payload())!.aircraft[0];

  it("affiche l'indicatif et une description lisible", () => {
    expect(aircraftLabel(aircraft)).toBe("AFR123");
    const description = aircraftDescription(aircraft);
    expect(description).toContain("10");
    expect(description).toContain("km/h");
    expect(description).toContain("France");
  });

  it("fournit une icône SVG utilisable comme image", () => {
    const icon = aircraftIconSvg();
    expect(icon).toContain("data:image/svg+xml");
    expect(decodeURIComponent(icon)).toContain("M12 1.6");
  });
});
