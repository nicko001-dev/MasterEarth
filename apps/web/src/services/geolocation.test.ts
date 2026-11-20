import { afterEach, describe, expect, it } from "vitest";
import {
  distanceMeters,
  formatAccuracy,
  formatCoordinates,
  formatDistance,
  describeGeolocationError,
  isValidLatLon,
  normalizePosition,
  readConsent,
  writeConsent,
  GEOLOCATION_STORAGE_KEY,
} from "./geolocation";

afterEach(() => {
  localStorage.clear();
});

describe("validation des coordonnées", () => {
  it("accepte les coordonnées du monde entier et rejette les valeurs invalides", () => {
    expect(isValidLatLon(48.8566, 2.3522)).toBe(true);
    expect(isValidLatLon(-33.8688, 151.2093)).toBe(true);
    expect(isValidLatLon(90, 180)).toBe(true);
    expect(isValidLatLon(91, 0)).toBe(false);
    expect(isValidLatLon(0, -181)).toBe(false);
    expect(isValidLatLon(Number.NaN, 0)).toBe(false);
    expect(isValidLatLon("5", 0)).toBe(false);
  });

  it("normalise un évènement de géolocalisation et écarte les erreurs", () => {
    const position = normalizePosition({
      coords: { latitude: 5.36, longitude: -4.01, accuracy: 12.5 },
      timestamp: 1_700_000_000_000,
    });
    expect(position).toEqual({ lat: 5.36, lon: -4.01, accuracyM: 12.5, timestamp: 1_700_000_000_000 });
    expect(normalizePosition({ coords: { latitude: 120, longitude: 0 } })).toBeNull();
    expect(normalizePosition({ coords: { latitude: 5, longitude: -4, accuracy: Number.NaN } })).toMatchObject({
      lat: 5,
      lon: -4,
      accuracyM: 0,
    });
    expect(normalizePosition(null)).toBeNull();
    expect(normalizePosition({})).toBeNull();
  });
});

describe("formatage", () => {
  it("formate les coordonnées dans le repère français", () => {
    expect(formatCoordinates(5.36, -4.01)).toBe("5,36° N · 4,01° O");
    expect(formatCoordinates(-33.8688, 151.2093)).toBe("33,87° S · 151,21° E");
  });

  it("formate la précision et les distances", () => {
    expect(formatAccuracy(12.6)).toBe("± 13 m");
    expect(formatAccuracy(1400)).toBe("± 1,4 km");
    expect(formatAccuracy(0)).toBe("précision inconnue");
    expect(formatDistance(850)).toBe("850 m");
    expect(formatDistance(12_430)).toBe("12,4 km");
    expect(formatDistance(3_200_000)).toMatch(/km$/);
  });

  it("explique chaque code d'erreur de localisation", () => {
    expect(describeGeolocationError({ code: 1 })).toMatch(/refusée/i);
    expect(describeGeolocationError({ code: 2 })).toMatch(/indisponible/i);
    expect(describeGeolocationError({ code: 3 })).toMatch(/expiré/i);
    expect(describeGeolocationError(null)).toMatch(/Impossible/i);
  });
});

describe("consentement mémorisé", () => {
  it("mémorise, relit et efface le choix de l'utilisateur", () => {
    expect(readConsent(localStorage)).toBeNull();
    writeConsent("granted", localStorage);
    expect(localStorage.getItem(GEOLOCATION_STORAGE_KEY)).toBe("granted");
    expect(readConsent(localStorage)).toBe("granted");
    writeConsent("denied", localStorage);
    expect(readConsent(localStorage)).toBe("denied");
    writeConsent(null, localStorage);
    expect(readConsent(localStorage)).toBeNull();
  });

  it("ignore une valeur inconnue", () => {
    localStorage.setItem(GEOLOCATION_STORAGE_KEY, "peut-être");
    expect(readConsent(localStorage)).toBeNull();
  });
});

describe("distance", () => {
  it("calcule une distance orthodromique plausible", () => {
    const parisToAbidjan = distanceMeters(
      { lat: 48.8566, lon: 2.3522 },
      { lat: 5.36, lon: -4.01 },
    );
    expect(parisToAbidjan).toBeGreaterThan(4_700_000);
    expect(parisToAbidjan).toBeLessThan(5_100_000);
    expect(distanceMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 0 })).toBe(0);
  });
});
