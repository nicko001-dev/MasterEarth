import { describe, expect, it } from "vitest";
import { hazardKind, hazardSprite } from "./hazardIcons";

describe("pictogrammes de risque", () => {
  it("choisit la classe selon la pluie et l'inondation", () => {
    expect(hazardKind(false, false)).toBeNull();
    expect(hazardKind(true, false)).toBe("rain");
    expect(hazardKind(false, true)).toBe("flood");
    expect(hazardKind(true, true)).toBe("compound");
  });

  it("produit un SVG distinct et stable par classe", () => {
    const rain = hazardSprite("rain");
    const flood = hazardSprite("flood");
    const compound = hazardSprite("compound");

    for (const sprite of [rain, flood, compound]) {
      expect(sprite.startsWith("data:image/svg+xml")).toBe(true);
      expect(sprite.length).toBeGreaterThan(120);
    }
    expect(new Set([rain, flood, compound]).size).toBe(3);
    // Mise en cache : la même référence est renvoyée.
    expect(hazardSprite("rain")).toBe(rain);
  });
});
