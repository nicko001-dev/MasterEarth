/** Rendu 3D de l'eau d'une simulation : cellules drapées sur le relief / les tuiles 3D (aucun décalage d'altitude). */
import * as Cesium from 'cesium';

const BUCKETS = [ // seuil (cm) → couleur
  [5, [120, 220, 255, 150]], [25, [60, 190, 240, 170]], [50, [30, 150, 225, 185]],
  [100, [20, 110, 205, 200]], [200, [40, 90, 210, 215]], [300, [80, 70, 200, 230]], [Infinity, [120, 50, 180, 240]],
];
const bucketOf = (cm) => (cm < 1 ? -1 : BUCKETS.findIndex(([max]) => cm < max));

export function b64ToU16(b64) {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Uint16Array(u8.buffer);
}
export function b64ToU8(b64) {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

/** Regroupe les cellules voisines de même classe en rectangles (beaucoup moins d'instances). */
export function mergeRuns(rows, cols, classOf) {
  const runs = [];
  for (let i = 0; i < rows; i++) {
    let j = 0;
    while (j < cols) {
      const c = classOf(i, j);
      if (c < 0) { j++; continue; }
      let k = j + 1;
      while (k < cols && classOf(i, k) === c) k++;
      runs.push({ i, j0: j, j1: k - 1, c });
      j = k;
    }
  }
  return runs;
}

/**
 * Eau d'une simulation : UNE seule image (une texture par cellule) drapée sur le relief ou les tuiles 3D.
 * Une seule instance quelle que soit la taille de la grille : performant et sans décalage d'altitude.
 * Cesium affiche la première ligne de l'image au SUD pour ce matériau : les lignes sont donc inversées ici.
 */
export function buildWaterPrimitive(sim, depthCm, possible, showPossible = true) {
  const { south, west, north, east } = sim.bbox;
  const { rows, cols } = sim;
  const dy = (north - south) / (rows - 1), dx = (east - west) / (cols - 1);
  const canvas = document.createElement('canvas');
  canvas.width = cols; canvas.height = rows;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(cols, rows);
  let any = false;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const k = i * cols + j;
      const b = bucketOf(depthCm[k]);
      const rgba = b >= 0 ? BUCKETS[b][1] : (showPossible && possible[k] ? [255, 205, 70, 55] : null);
      if (!rgba) continue;
      any = true;
      const o = ((rows - 1 - i) * cols + j) * 4;
      img.data[o] = rgba[0]; img.data[o + 1] = rgba[1]; img.data[o + 2] = rgba[2]; img.data[o + 3] = rgba[3];
    }
  }
  if (!any) return null;
  ctx.putImageData(img, 0, 0);
  return new Cesium.GroundPrimitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry: new Cesium.RectangleGeometry({
        rectangle: Cesium.Rectangle.fromDegrees(west - dx / 2, south - dy / 2, east + dx / 2, north + dy / 2),
        vertexFormat: Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat,
      }),
    }),
    appearance: new Cesium.MaterialAppearance({
      material: new Cesium.Material({ fabric: { type: 'Image', uniforms: { image: canvas } }, translucent: true }),
      translucent: true, flat: true,
    }),
    asynchronous: false, classificationType: Cesium.ClassificationType.BOTH,
  });
}
