/**
 * Voile jour/nuit pour les cartes raster (Leaflet).
 *
 * Le terminateur est calculé à partir de la position du soleil, puis dessiné
 * dans une petite image équirectangulaire : la zone où il fait nuit s'assombrit,
 * avec un dégradé de crépuscule. Ce n'est pas une image météo ni une prévision ;
 * c'est un repère visuel recalculé périodiquement.
 */
import { sunAltitudeDeg } from "./daynight";

/** Opacité du voile à l'intérieur de la nuit (0 = aucun, 1 = noir). */
export const NIGHT_OVERLAY_MAX_ALPHA = 0.82;
/** Limite de latitude de l'image : au-delà, la projection Web Mercator étire trop. */
export const NIGHT_OVERLAY_MAX_LATITUDE = 85;

/**
 * Zoom maximal du voile jour/nuit 2D.
 *
 * `L.imageOverlay` étire son image sur toute l'emprise mondiale : sa largeur
 * vaut `256 * 2^zoom` pixels, soit plus d'un million de pixels au zoom 12.
 * Un tel élément dépasse les limites de composition du navigateur et faisait
 * disparaître le fond de carte au zoom, bien que les tuiles soient chargées.
 * Au-delà du zoom 6 (échelle continentale), le terminateur n'a plus de sens
 * utile et la nuit ne doit de toute façon pas assombrir rues ni bâtiments.
 */
export const NIGHT_OVERLAY_MAX_ZOOM = 6;

/** Le voile n'est peint qu'aux échelles mondiales / continentales. */
export function nightOverlayVisible(zoom: number): boolean {
  return Number.isFinite(zoom) && zoom <= NIGHT_OVERLAY_MAX_ZOOM;
}

/**
 * Opacité du voile 2D selon le zoom.
 *
 * À l'échelle mondiale, l'assombrissement reste marqué pour lire le terminateur.
 * En approchant du sol, il diminue fortement : les bâtiments, rues et libellés
 * du fond de carte doivent rester distinguables malgré la nuit.
 */
export function nightOverlayOpacity(zoom: number): number {
  if (!Number.isFinite(zoom)) return 0.58;
  if (zoom <= 3) return 0.58;
  if (zoom >= 11) return 0.12;
  const progress = (zoom - 3) / 8;
  return 0.58 - progress * 0.46;
}

/**
 * Opacité des lumières nocturnes NASA sur le globe 3D.
 *
 * L'image est ajoutée au-dessus du fond de carte : elle ne doit apporter que
 * des points lumineux. Son opacité baisse près du sol, où les tuiles de villes
 * sont déjà lisibles et où un calque basse résolution créerait un voile.
 */
export function nightCityLightsAlpha(heightM: number): number {
  if (!Number.isFinite(heightM) || heightM <= 0) return 0.8;
  const minHeight = 50_000;
  const maxHeight = 25_000_000;
  const clamped = Math.min(maxHeight, Math.max(minHeight, heightM));
  const progress = Math.log10(clamped / minHeight) / Math.log10(maxHeight / minHeight);
  return 0.2 + progress * 0.6;
}

/**
 * Opacité du voile de nuit sur le globe 3D.
 *
 * Le globe n'utilise plus l'éclairage solaire de Cesium : celui-ci multipliait
 * l'imagerie par la lumière du soleil, si bien qu'à l'approche du sol la zone
 * nocturne devenait un aplat sombre où l'on ne distinguait plus ni rues ni
 * bâtiments. Le voile ci-dessous reproduit le terminateur sans toucher aux
 * tuiles : son opacité devient très faible en vue rapprochée.
 */
export function nightTintOpacity(heightM: number): number {
  if (!Number.isFinite(heightM) || heightM <= 0) return 0.16;
  if (heightM <= 40_000) return 0.16;
  // À l'échelle du globe, le terminateur doit être franchement lisible :
  // c'est le repère visuel qui montre où il fait nuit. Au sol, l'opacité
  // reste très faible pour ne jamais masquer rues ni bâtiments.
  if (heightM >= 8_000_000) return 0.76;
  const progress = Math.log10(heightM / 40_000) / Math.log10(8_000_000 / 40_000);
  return 0.16 + progress * 0.6;
}

/**
 * Dimensions de l'image équirectangulaire du voile.
 *
 * Depuis Cesium 1.146, `SingleTileImageryProvider` exige `tileWidth` et
 * `tileHeight` : sans eux le constructeur lève une `DeveloperError`. Une
 * exception avalée silencieusement supprimait donc entièrement la nuit sur le
 * globe 3D. Ces dimensions doivent rester alignées sur `nightTintDataUrl`.
 */
export const NIGHT_TINT_TILE_WIDTH = 512;
export const NIGHT_TINT_TILE_HEIGHT = 256;

/** Options d'imagerie du voile, testables sans navigateur ni Cesium. */
export function nightTintProviderOptions(
  url: string,
  width = NIGHT_TINT_TILE_WIDTH,
): { url: string; tileWidth: number; tileHeight: number } {
  return {
    url,
    tileWidth: Math.max(16, Math.round(width)),
    tileHeight: Math.max(8, Math.round(width / 2)),
  };
}

/** Image du voile de nuit, prête à devenir une couche d'imagerie Cesium. */
export function nightTintDataUrl(
  date: Date = new Date(),
  width = NIGHT_TINT_TILE_WIDTH,
): string | null {
  const canvas = createNightOverlayCanvas(width, Math.round(width / 2), date);
  if (!canvas) return null;
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/**
 * Assombrissement local entre 0 (plein jour) et 1 (nuit).
 * Le crépuscule s'étend de +6° à -6° de hauteur solaire.
 */
export function nightShadeAt(lat: number, lon: number, date: Date = new Date()): number {
  const altitude = sunAltitudeDeg(lat, lon, date);
  if (altitude >= 6) return 0;
  if (altitude <= -6) return 1;
  return (6 - altitude) / 12;
}

/**
 * Crée l'image du terminateur. Retourne null hors navigateur (tests Node).
 * La résolution reste volontairement faible : c'est un voile, pas une carte.
 */
export function createNightOverlayCanvas(
  width = 720,
  height = 360,
  date: Date = new Date(),
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(16, Math.round(width));
  canvas.height = Math.max(8, Math.round(height));
  const context = canvas.getContext("2d");
  if (!context) return null;
  const image = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    const lat = NIGHT_OVERLAY_MAX_LATITUDE - (y / Math.max(1, canvas.height - 1)) * NIGHT_OVERLAY_MAX_LATITUDE * 2;
    for (let x = 0; x < canvas.width; x += 1) {
      const lon = -180 + (x / Math.max(1, canvas.width - 1)) * 360;
      const shade = nightShadeAt(lat, lon, date);
      const offset = (y * canvas.width + x) * 4;
      image.data[offset] = 3;
      image.data[offset + 1] = 8;
      image.data[offset + 2] = 20;
      image.data[offset + 3] = Math.round(shade * 255);
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}
