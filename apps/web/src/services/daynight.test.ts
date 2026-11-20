import { describe, expect, it } from "vitest";
import { dayPhaseLabel, isNightAt, subsolarPoint, sunAltitudeDeg } from "./daynight";

const at = (iso: string) => new Date(iso);

describe("point subsolaire", () => {
  it("se trouve au-dessus de l'équateur à l'équinoxe de mars", () => {
    const sun = subsolarPoint(at("2026-03-20T12:00:00Z"));
    expect(Math.abs(sun.lat)).toBeLessThan(2);
    // À 12 h UTC, le soleil est au zénith proche du méridien de Greenwich.
    expect(Math.abs(sun.lon)).toBeLessThan(10);
  });

  it("monte vers le tropique du Cancer au solstice de juin", () => {
    const sun = subsolarPoint(at("2026-06-21T12:00:00Z"));
    expect(sun.lat).toBeGreaterThan(22);
    expect(sun.lat).toBeLessThan(24.5);
  });

  it("reste dans les bornes géographiques sur une année entière", () => {
    for (let day = 0; day < 365; day += 7) {
      const date = new Date(Date.UTC(2026, 0, 1 + day, 12));
      const sun = subsolarPoint(date);
      expect(sun.lat).toBeGreaterThanOrEqual(-23.5);
      expect(sun.lat).toBeLessThanOrEqual(23.5);
      expect(sun.lon).toBeGreaterThanOrEqual(-180);
      expect(sun.lon).toBeLessThanOrEqual(180);
    }
  });
});

describe("jour et nuit locales", () => {
  it("distingue midi et minuit à Greenwich", () => {
    expect(sunAltitudeDeg(51.48, 0, at("2026-06-21T12:00:00Z"))).toBeGreaterThan(50);
    expect(sunAltitudeDeg(51.48, 0, at("2026-06-21T00:00:00Z"))).toBeLessThan(0);
    expect(isNightAt(51.48, 0, at("2026-06-21T12:00:00Z"))).toBe(false);
    expect(isNightAt(51.48, 0, at("2026-06-21T00:00:00Z"))).toBe(true);
  });

  it("est décalé de douze heures entre l'Asie et l'Amérique", () => {
    const date = at("2026-06-21T12:00:00Z");
    expect(isNightAt(35.68, 139.69, date)).toBe(true);   // Tokyo, 21 h
    expect(isNightAt(-23.55, -46.63, date)).toBe(false); // São Paulo, 9 h
  });

  it("nomme les phases de la journée", () => {
    expect(dayPhaseLabel(48.85, 2.35, at("2026-06-21T12:00:00Z"))).toBe("jour");
    expect(dayPhaseLabel(48.85, 2.35, at("2026-06-21T00:00:00Z"))).toBe("nuit");
  });
});
