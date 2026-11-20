import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUserLocation } from "./useUserLocation";
import { GEOLOCATION_STORAGE_KEY } from "../services/geolocation";

const position: GeolocationPosition = {
  coords: {
    latitude: 5.36,
    longitude: -4.01,
    accuracy: 12,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    toJSON: () => ({}),
  },
  timestamp: 1_700_000_000_000,
  toJSON: () => ({}),
};

describe("consentement de localisation à l'entrée", () => {
  const getCurrentPosition = vi.fn();
  const watchPosition = vi.fn(() => 7);
  const clearWatch = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    getCurrentPosition.mockReset();
    watchPosition.mockClear();
    clearWatch.mockClear();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition, watchPosition, clearWatch },
    });
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: undefined,
    });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("ne suit rien et n'affiche aucune position après un refus", async () => {
    localStorage.setItem(GEOLOCATION_STORAGE_KEY, "denied");
    const { result } = renderHook(() => useUserLocation());

    await waitFor(() => expect(result.current.status).toBe("denied"));
    expect(result.current.position).toBeNull();
    expect(result.current.promptVisible).toBe(false);
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it("efface la position lorsque l'utilisateur refuse après l'avoir accordée", async () => {
    localStorage.setItem(GEOLOCATION_STORAGE_KEY, "granted");
    getCurrentPosition.mockImplementation((success: PositionCallback) => success(position));

    const { result } = renderHook(() => useUserLocation());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.position).toMatchObject({ lat: 5.36, lon: -4.01 });
    expect(watchPosition).toHaveBeenCalledTimes(1);

    act(() => result.current.refuseLocation());

    expect(result.current.position).toBeNull();
    expect(result.current.status).toBe("denied");
    expect(result.current.promptVisible).toBe(false);
    expect(clearWatch).toHaveBeenCalledWith(7);
  });
});
