import * as Cesium from "cesium";
import { createFloodCanvas, decodeDepthCm, decodePossible, FloodSimulation } from "../services/simulation";

/**
 * Emprise d'inondation simulée, plaquée sur le terrain.
 *
 * La texture est suréchantillonnée (le raster MNT est bien plus grossier que
 * l'écran) et un contour net est tracé sur la limite de l'eau : la zone reste
 * lisible quand on zoome, au lieu de se réduire à un dégradé flou.
 */
export async function buildFloodPrimitive(
  simulation: FloodSimulation,
  frameIndex: number,
): Promise<Cesium.GroundPrimitive | null> {
  await Cesium.GroundPrimitive.initializeTerrainHeights();
  const image = createFloodCanvas(simulation, frameIndex, false, 4);
  const hasWater = decodeDepthCm(simulation.frames[frameIndex]?.depth_cm_b64 ?? simulation.depth_cm_b64).some((depth) => depth > 0);
  const hasPossible = decodePossible(simulation.possible_b64).some((value) => value > 0);
  if (!hasWater && !hasPossible) return null;

  const { south, west, north, east } = simulation.bbox;
  const dy = (north - south) / Math.max(1, simulation.rows - 1);
  const dx = (east - west) / Math.max(1, simulation.cols - 1);
  return new Cesium.GroundPrimitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry: new Cesium.RectangleGeometry({
        rectangle: Cesium.Rectangle.fromDegrees(west - dx / 2, south - dy / 2, east + dx / 2, north + dy / 2),
        vertexFormat: Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat,
      }),
    }),
    appearance: new Cesium.MaterialAppearance({
      material: new Cesium.Material({ fabric: { type: "Image", uniforms: { image } }, translucent: true }),
      translucent: true,
      flat: true,
    }),
    asynchronous: false,
    classificationType: Cesium.ClassificationType.BOTH,
  });
}
