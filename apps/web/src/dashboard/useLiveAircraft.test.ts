import { describe, expect, it } from "vitest";
import {
  AIRCRAFT_MAX_AREA_KM2,
  AIRCRAFT_MAX_CLOCK_SKEW_MS,
  AIRCRAFT_MAX_LONGITUDE_SPAN,
  aircraftBoundsEligible,
  providerClockOffsetMs,
} from "./useLiveAircraft";

describe("emprise du trafic aérien", () => {
  it("accepte une vue régionale valide", () => {
    expect(
      aircraftBoundsEligible({ west: 2, south: 48, east: 12, north: 52 }),
    ).toBe(true);
  });

  it("accepte une vue de ville, même très resserrée", () => {
    expect(
      aircraftBoundsEligible({
        west: 2.32,
        south: 48.84,
        east: 2.36,
        north: 48.87,
      }),
    ).toBe(true);
  });

  it("refuse une emprise trop large ou trop longue", () => {
    expect(
      aircraftBoundsEligible({ west: -60, south: -30, east: 60, north: 30 }),
    ).toBe(false);
    expect(
      aircraftBoundsEligible({
        west: -60,
        south: 0,
        east: -60 + AIRCRAFT_MAX_LONGITUDE_SPAN - 10,
        north: 10,
      }),
    ).toBe(true);
    expect(
      aircraftBoundsEligible({
        west: -70,
        south: 0,
        east: -70 + AIRCRAFT_MAX_LONGITUDE_SPAN + 1,
        north: 10,
      }),
    ).toBe(false);
  });

  it("refuse une emprise inversée, non finie ou hors du monde", () => {
    expect(
      aircraftBoundsEligible({ west: 12, south: 48, east: 2, north: 52 }),
    ).toBe(false);
    expect(
      aircraftBoundsEligible({ west: 2, south: Number.NaN, east: 12, north: 52 }),
    ).toBe(false);
    expect(
      aircraftBoundsEligible({ west: 179, south: -10, east: 181, north: 10 }),
    ).toBe(false);
    expect(
      aircraftBoundsEligible({ west: -181, south: -10, east: -179, north: 10 }),
    ).toBe(false);
  });

  it("garde une marge sous le plafond d'aire de l'API", () => {
    const bbox = { west: -30, south: -20, east: 30, north: 20 };
    expect(AIRCRAFT_MAX_AREA_KM2).toBe(30_000_000);
    expect(aircraftBoundsEligible(bbox)).toBe(true);
  });
});

describe("décalage d'horloge du fournisseur", () => {
  const generatedAt = 1_793_779_600_000;

  it("mesure l'avance du fournisseur sur l'horodatage serveur", () => {
    expect(providerClockOffsetMs(1_793_779_648, generatedAt)).toBe(48_000);
    expect(providerClockOffsetMs(1_793_779_552, generatedAt)).toBe(-48_000);
  });

  it("ignore une heure amont absente ou non finie", () => {
    expect(providerClockOffsetMs(null, generatedAt)).toBe(0);
    expect(providerClockOffsetMs(Number.NaN, generatedAt)).toBe(0);
    expect(providerClockOffsetMs(1_793_779_648, Number.NaN)).toBe(0);
  });

  it("borne un décalage aberrant au lieu de projeter les aéronefs", () => {
    expect(providerClockOffsetMs(9_999_999_999, generatedAt)).toBe(
      AIRCRAFT_MAX_CLOCK_SKEW_MS,
    );
    expect(providerClockOffsetMs(-9_999_999_999, generatedAt)).toBe(
      -AIRCRAFT_MAX_CLOCK_SKEW_MS,
    );
  });
});
