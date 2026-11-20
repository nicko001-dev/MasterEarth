import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchRadarProduct,
  parseRadarProduct,
  radarFrameIndexAt,
  radarFrameLabel,
  radarOpacityForHeight,
  radarTileUrlTemplate,
} from "./radar";

const now = Date.UTC(2026, 10, 4, 5, 40, 0);
const payload = {
  generated_at: new Date(now).toISOString(),
  attribution: "Weather data by RainViewer",
  attribution_url: "https://www.rainviewer.com/",
  frames: [
    { index: 0, time: 1_793_761_800, forecast: false },
    { index: 1, time: 1_793_761_860, forecast: false },
    { index: 2, time: 1_793_762_400, forecast: true },
  ],
  limitations: ["Images radar, pas une mesure de débit."],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("produit radar servi par l'API", () => {
  it("valide et ordonne les images", () => {
    const product = parseRadarProduct(payload);
    expect(product?.frames.map((frame) => frame.index)).toEqual([0, 1, 2]);
    expect(product?.frames[2].forecast).toBe(true);
    expect(product?.attribution).toBe("Weather data by RainViewer");
    expect(product?.attributionUrl).toContain("rainviewer.com");
    expect(product?.limitations).toHaveLength(1);
  });

  it("écarte les images invalides et rejette une réponse vide", () => {
    const product = parseRadarProduct({
      frames: [
        { index: 0, time: 1_793_761_800, forecast: false },
        { index: "x", time: 1, forecast: false },
        { index: 1, time: -4, forecast: false },
      ],
    });
    expect(product?.frames).toHaveLength(1);
    expect(parseRadarProduct(null)).toBeNull();
    expect(parseRadarProduct({ frames: [] })).toBeNull();
    expect(parseRadarProduct({})).toBeNull();
  });

  it("retombe sur l'attribution officielle quand elle manque", () => {
    const product = parseRadarProduct({ frames: [{ index: 0, time: 1_793_761_800, forecast: false }] });
    expect(product?.attribution).toBe("Weather data by RainViewer");
    expect(product?.attributionUrl).toBe("https://www.rainviewer.com/");
  });

  it("construit le gabarit de tuile proxifié attendu", () => {
    expect(radarTileUrlTemplate(3)).toMatch(/\/api\/v1\/weather\/radar\/tiles\/3\/\{z\}\/\{x\}\/\{y\}\.png$/);
  });
});

describe("animation", () => {
  it("boucle sur les images au rythme demandé", () => {
    expect(radarFrameIndexAt(0, 5, 500)).toBe(0);
    expect(radarFrameIndexAt(499, 5, 500)).toBe(0);
    expect(radarFrameIndexAt(500, 5, 500)).toBe(1);
    expect(radarFrameIndexAt(2_600, 5, 500)).toBe(0);
    expect(radarFrameIndexAt(-10, 5, 500)).toBe(0);
    expect(radarFrameIndexAt(1_000, 0, 500)).toBe(0);
  });

  it("libelle une image par rapport à maintenant", () => {
    const reference = 1_793_762_000;
    expect(radarFrameLabel(reference, reference)).toBe("maintenant");
    expect(radarFrameLabel(reference - 600, reference)).toBe("il y a 10 min");
    expect(radarFrameLabel(reference - 3_600, reference)).toBe("il y a 1 h");
    expect(radarFrameLabel(reference + 1_800, reference)).toBe("prévision +30 min");
  });

  it("efface le radar à mesure qu'on approche du sol", () => {
    const world = radarOpacityForHeight(23_000_000);
    const regional = radarOpacityForHeight(1_000_000);
    const street = radarOpacityForHeight(20_000);
    expect(world).toBeCloseTo(0.82, 2);
    expect(regional).toBeGreaterThan(0.3);
    expect(regional).toBeLessThan(0.55);
    // Au niveau des rues, le radar ne doit plus masquer les infrastructures.
    expect(street).toBe(0);
    expect(radarOpacityForHeight(60_000)).toBeLessThan(0.06);
    expect(street).toBeLessThan(regional);
    expect(regional).toBeLessThan(world);
  });
});

describe("récupération réseau", () => {
  it("retourne null sans lever d'exception quand l'API est indisponible", async () => {
    const failing = vi.fn().mockRejectedValue(new TypeError("offline"));
    await expect(fetchRadarProduct(failing as unknown as typeof fetch)).resolves.toBeNull();
    const notFound = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(fetchRadarProduct(notFound as unknown as typeof fetch)).resolves.toBeNull();
  });

  it("appelle bien l'endpoint de l'API IntelliFlood", async () => {
    const ok = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    const product = await fetchRadarProduct(ok as unknown as typeof fetch);
    expect(product?.frames).toHaveLength(3);
    expect(String(ok.mock.calls[0][0])).toContain("/api/v1/weather/radar/frames");
  });
});
