import * as Cesium from "cesium";
import { createFloodCanvas, decodeDepthCm, decodePossible, FloodSimulation } from "../services/simulation";

export async function buildFloodPrimitive(
  simulation: FloodSimulation,
  frameIndex: number,
): Promise<Cesium.GroundPrimitive | null> {
  await Cesium.GroundPrimitive.initializeTerrainHeights();
  // Léger suréchantillonnage : la texture est lissée au lieu d'afficher de gros pixels.
  const image = createFloodCanvas(simulation, frameIndex, false, 2);
  const context = image.getContext("2d");
  if (!context) throw new Error("Impossible de préparer la grille d'inondation.");
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
