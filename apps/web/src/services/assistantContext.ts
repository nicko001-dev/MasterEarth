/** Contexte cartographique transmis à l'assistant. */

import type { Bounds } from "../globe/borders";

/**
 * Centre géographique d'une emprise visible.
 *
 * Les cartes peuvent traverser l'antiméridien : Leaflet renvoie alors une
 * longitude est supérieure à 180° (ou inférieure à l'ouest). On remet le
 * résultat dans l'intervalle [-180, 180] sans écraser la position exacte.
 */
export function centerFromBounds(bounds: Bounds): { lat: number; lon: number } {
  const lat = Math.max(-90, Math.min(90, (bounds.south + bounds.north) / 2));
  const east = bounds.east < bounds.west ? bounds.east + 360 : bounds.east;
  let lon = (bounds.west + east) / 2;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return { lat, lon };
}
