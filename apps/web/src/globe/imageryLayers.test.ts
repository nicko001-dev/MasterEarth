import { describe, expect, it } from "vitest";
import { imageryInsertIndex } from "./imageryLayers";

describe("insertion des couches d'imagerie Cesium", () => {
  it("accepte une collection vide au premier rendu", () => {
    // `baseLayer: false` : aucun fond de carte n'existe encore. Un index 1 ou 2
    // provoquait une DeveloperError et supprimait silencieusement la nuit.
    expect(imageryInsertIndex(1, 0)).toBe(0);
    expect(imageryInsertIndex(2, 0)).toBe(0);
  });

  it("respecte l'ordre voulu une fois le fond de carte présent", () => {
    expect(imageryInsertIndex(1, 1)).toBe(1);
    expect(imageryInsertIndex(2, 3)).toBe(2);
    expect(imageryInsertIndex(1, 6)).toBe(1);
  });

  it("borne un index trop grand ou invalide", () => {
    expect(imageryInsertIndex(5, 2)).toBe(2);
    expect(imageryInsertIndex(-3, 2)).toBe(0);
    expect(imageryInsertIndex(Number.NaN, 2)).toBe(0);
    expect(imageryInsertIndex(1, Number.NaN)).toBe(0);
    expect(imageryInsertIndex(2, -5)).toBe(0);
  });
});
