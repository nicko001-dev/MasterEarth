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

/**
 * Crée une emprise au sol violette délimitant précisément la zone où il pleut.
 * Contrairement à un simple cercle, cette emprise est une texture radiale
 * positionnée sur le MNT, avec une intensité proportionnelle au taux de pluie.
 */
export interface RainZonePrimitiveInput {
  lon: number;
  lat: number;
  radiusM: number;
  intensity: number; // mm/h, 0..1 après normalisation
}

export async function buildRainPrimitive(zone: RainZonePrimitiveInput): Promise<Cesium.GroundPrimitive | null> {
  await Cesium.GroundPrimitive.initializeTerrainHeights();

  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return null;

  // Dégradé radial violet : intense au centre, s'estompant vers les bords.
  const center = size / 2;
  const radius = size / 2;
  const gradient = context.createRadialGradient(center, center, 0, center, center, radius);
  const alpha = Math.max(0.15, Math.min(0.6, 0.25 + zone.intensity * 0.35));
  gradient.addColorStop(0, `rgba(120, 40, 160, ${alpha})`);      // centre : violet soutenu
  gradient.addColorStop(0.5, `rgba(140, 60, 190, ${alpha * 0.6})`); // intermédiaire
  gradient.addColorStop(1, "rgba(120, 40, 160, 0)");            // bord : transparent

  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  // Contour légèrement plus marqué pour bien délimiter l'emprise
  context.strokeStyle = `rgba(180, 80, 240, ${Math.min(0.8, alpha + 0.2)})`;
  context.lineWidth = 3;
  context.beginPath();
  context.arc(center, center, radius - 2, 0, 2 * Math.PI);
  context.stroke();

  const imageDataUrl = canvas.toDataURL("image/png");

  // Calculer l'emprise en degrés autour du point (approximation locale)
  const degPerMeter = 1 / 111_320;
  const radiusDeg = zone.radiusM * degPerMeter;
  // Ajuster la longitude pour la latitude (les degrés de longitude se rétrécissent vers les pôles)
  const latRad = (zone.lat * Math.PI) / 180;
  const radiusDegLon = radiusDeg / Math.max(0.1, Math.cos(latRad));

  const west = zone.lon - radiusDegLon;
  const east = zone.lon + radiusDegLon;
  const south = zone.lat - radiusDeg;
  const north = zone.lat + radiusDeg;

  return new Cesium.GroundPrimitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry: new Cesium.RectangleGeometry({
        rectangle: Cesium.Rectangle.fromDegrees(west, south, east, north),
        vertexFormat: Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat,
      }),
    }),
    appearance: new Cesium.MaterialAppearance({
      material: new Cesium.Material({ fabric: { type: "Image", uniforms: { image: imageDataUrl } }, translucent: true }),
      translucent: true,
      flat: true,
    }),
    asynchronous: false,
    classificationType: Cesium.ClassificationType.BOTH,
  });
}
