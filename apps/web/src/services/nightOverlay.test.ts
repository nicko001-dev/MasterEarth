import { describe, expect, it } from "vitest";
import {
  createNightOverlayCanvas,
  nightCityLightsAlpha,
  nightOverlayOpacity,
  nightShadeAt,
  nightTintDataUrl,
  nightTintProviderOptions,
  nightOverlayVisible,
  NIGHT_OVERLAY_MAX_LATITUDE,
  NIGHT_OVERLAY_MAX_ZOOM,
  NIGHT_TINT_TILE_HEIGHT,
  NIGHT_TINT_TILE_WIDTH,
} from "./nightOverlay";

const NOON = new Date("2026-03-20T12:00:00Z");
const MIDNIGHT = new Date("2026-03-20T00:00:00Z");

describe("voile jour/nuit", () => {
  it("assombrit la face opposée au soleil", () => {
    expect(nightShadeAt(0, 0, NOON)).toBe(0);
    expect(nightShadeAt(0, 180, NOON)).toBe(1);
    expect(nightShadeAt(0, 0, MIDNIGHT)).toBe(1);
  });

  it("produit un dégradé de crépuscule", () => {
    const shade = nightShadeAt(0, 90, NOON);
    expect(shade).toBeGreaterThan(0);
    expect(shade).toBeLessThan(1);
  });

  it("borne la latitude du voile", () => {
    expect(NIGHT_OVERLAY_MAX_LATITUDE).toBeLessThan(90);
  });

  it("ne crée pas de canvas hors navigateur", () => {
    expect(createNightOverlayCanvas()).toBeNull();
  });

  it("allège le voile nocturne quand on zoome", () => {
    expect(nightOverlayOpacity(2)).toBeCloseTo(0.58, 2);
    expect(nightOverlayOpacity(7)).toBeLessThan(nightOverlayOpacity(4));
    expect(nightOverlayOpacity(12)).toBeCloseTo(0.12, 2);
    expect(nightOverlayOpacity(Number.NaN)).toBeCloseTo(0.58, 2);
  });

  it("baisse les lumières nocturnes près du sol", () => {
    expect(nightCityLightsAlpha(20_000)).toBeCloseTo(0.2, 2);
    expect(nightCityLightsAlpha(1_000_000)).toBeGreaterThan(0.35);
    expect(nightCityLightsAlpha(1_000_000)).toBeLessThan(0.6);
    expect(nightCityLightsAlpha(23_000_000)).toBeGreaterThan(0.75);
  });

  it("dimensionne explicitement la tuile exigée par Cesium 1.146+", () => {
    const options = nightTintProviderOptions("data:image/png;base64,AAAA", NIGHT_TINT_TILE_WIDTH);
    // Sans ces nombres, `new SingleTileImageryProvider` lève une
    // DeveloperError et la nuit disparaît entièrement du globe 3D.
    expect(options.url).toMatch(/^data:image\/png/);
    expect(typeof options.tileWidth).toBe("number");
    expect(typeof options.tileHeight).toBe("number");
    expect(options.tileWidth).toBe(512);
    expect(options.tileHeight).toBe(256);
  });

  it("garde les dimensions cohérentes avec l'image équirectangulaire", () => {
    expect(NIGHT_TINT_TILE_HEIGHT).toBe(NIGHT_TINT_TILE_WIDTH / 2);
    expect(nightTintProviderOptions("x", 1024)).toEqual({
      url: "x",
      tileWidth: 1024,
      tileHeight: 512,
    });
  });

  it("ne produit pas d'image hors navigateur", () => {
    expect(nightTintDataUrl()).toBeNull();
  });

  it("retire le voile 2D avant qu'il ne devienne une image géante", () => {
    // Largeur de l'image = 256 * 2^zoom : au zoom 12 elle dépasse le million
    // de pixels et faisait disparaître le fond de carte pourtant chargé.
    expect(NIGHT_OVERLAY_MAX_ZOOM).toBeLessThanOrEqual(7);
    expect(256 * 2 ** (NIGHT_OVERLAY_MAX_ZOOM + 1)).toBeLessThan(100_000);
    expect(nightOverlayVisible(2)).toBe(true);
    expect(nightOverlayVisible(NIGHT_OVERLAY_MAX_ZOOM)).toBe(true);
    expect(nightOverlayVisible(NIGHT_OVERLAY_MAX_ZOOM + 1)).toBe(false);
    expect(nightOverlayVisible(12)).toBe(false);
    expect(nightOverlayVisible(Number.NaN)).toBe(false);
  });
});
