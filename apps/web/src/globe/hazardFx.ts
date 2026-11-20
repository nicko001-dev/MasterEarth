/**
 * Effets 3D des aléas sur le globe Cesium.
 *
 * Ces volumes ne sont pas des prévisions : ils matérialisent le lieu publié
 * par une source (ou l'emprise d'une simulation indicative) afin de rendre le
 * phénomène lisible en trois dimensions. Chaque forme est propre à la famille
 * d'aléa : anneaux sismiques, panache volcanique, spirale cyclonique, mur
 * d'onde, couloir de tornade, etc.
 */

import * as Cesium from "cesium";
import type {
  HazardId,
  HazardSeverity,
} from "../services/hazards";
import { hazardColor } from "../services/hazards";
import { hazardSprite } from "./hazardIcons";

export type HazardFxSpec = {
  hazard: HazardId;
  lat: number;
  lon: number;
  radiusKm: number;
  label: string;
  severity?: HazardSeverity;
};

type MaterialColor = Cesium.Color;

const MIN_VISUAL_RADIUS_KM = 6;

function colorOf(hazard: HazardId, alpha = 0.85): MaterialColor {
  return Cesium.Color.fromCssColorString(hazardColor(hazard)).withAlpha(alpha);
}

function secondsSince(viewer: Cesium.Viewer, start: Cesium.JulianDate, time?: Cesium.JulianDate): number {
  if (!time) return 0;
  const elapsed = Cesium.JulianDate.secondsDifference(time, start);
  // L'horloge peut être remise en arrière par un changement d'onglet : on
  // garde une phase positive pour éviter des rayons négatifs.
  return Math.max(0, elapsed);
}

function lonOffsetDeg(lat: number, radiusKm: number): number {
  return radiusKm / (111.32 * Math.max(0.12, Math.cos(Cesium.Math.toRadians(lat))));
}

function latOffsetDeg(radiusKm: number): number {
  return radiusKm / 110.57;
}

function pulseRings(
  source: Cesium.CustomDataSource,
  viewer: Cesium.Viewer,
  spec: HazardFxSpec,
  radiusM: number,
  color: MaterialColor,
  count = 3,
  period = 2.8,
) {
  const start = Cesium.JulianDate.clone(viewer.clock.currentTime);
  for (let index = 0; index < count; index += 1) {
    const phase = index / count;
    source.entities.add({
      position: Cesium.Cartesian3.fromDegrees(spec.lon, spec.lat, 120),
      ellipse: {
        height: 120,
        semiMajorAxis: new Cesium.CallbackProperty((time) => {
          const cycle = (secondsSince(viewer, start, time) / period + phase) % 1;
          return Math.max(250, radiusM * (0.12 + 0.92 * cycle));
        }, false),
        semiMinorAxis: new Cesium.CallbackProperty((time) => {
          const cycle = (secondsSince(viewer, start, time) / period + phase) % 1;
          return Math.max(250, radiusM * (0.12 + 0.92 * cycle));
        }, false),
        material: Cesium.Color.TRANSPARENT,
        outline: true,
        outlineColor: new Cesium.CallbackProperty((time) => {
          const cycle = (secondsSince(viewer, start, time) / period + phase) % 1;
          return color.withAlpha(Math.max(0, 0.78 * (1 - cycle)));
        }, false),
        outlineWidth: 2.2,
      },
    });
  }
}

function groundEllipse(
  source: Cesium.CustomDataSource,
  spec: HazardFxSpec,
  radiusM: number,
  color: MaterialColor,
  outline: boolean,
  rotation = 0,
  ratio = 1,
) {
  source.entities.add({
    position: Cesium.Cartesian3.fromDegrees(spec.lon, spec.lat, 80),
    ellipse: {
      height: 80,
      semiMajorAxis: radiusM,
      semiMinorAxis: radiusM * ratio,
      rotation,
      material: color.withAlpha(Math.min(0.28, color.alpha * 0.34)),
      outline,
      outlineColor: color.withAlpha(0.8),
      outlineWidth: 2,
    },
  });
}

function marker(
  source: Cesium.CustomDataSource,
  spec: HazardFxSpec,
  width = 42,
  height = 42,
) {
  source.entities.add({
    position: Cesium.Cartesian3.fromDegrees(spec.lon, spec.lat, 1_800),
    billboard: {
      image: hazardSprite(spec.hazard, spec.severity),
      width,
      height,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scaleByDistance: new Cesium.NearFarScalar(20_000, 1.15, 3_500_000, 0.55),
    },
    label: {
      text: spec.label,
      font: "600 12px Inter, system-ui, sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString("#06121e").withAlpha(0.78),
      backgroundPadding: new Cesium.Cartesian2(7, 4),
      pixelOffset: new Cesium.Cartesian2(0, -28),
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5_000_000),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

function spiralPositions(
  viewer: Cesium.Viewer,
  spec: HazardFxSpec,
  start: Cesium.JulianDate,
  radiusKm: number,
  phase: number,
  heightM: number,
  turns = 3.2,
): Cesium.CallbackProperty {
  const maxRadiusM = Math.max(5_000, (radiusKm / 2.6) * 1000);
  return new Cesium.CallbackProperty((time) => {
    const rotation = secondsSince(viewer, start, time) * 0.16;
    const points: Cesium.Cartesian3[] = [];
    const steps = 76;
    for (let index = 0; index <= steps; index += 1) {
      const progress = index / steps;
      const angle = phase + rotation + progress * turns * Math.PI * 2;
      const distance = maxRadiusM * (0.06 + 0.94 * progress);
      points.push(Cesium.Cartesian3.fromDegrees(
        spec.lon + (Math.cos(angle) * distance) / 111_320 / Math.max(0.2, Math.cos(Cesium.Math.toRadians(spec.lat))),
        spec.lat + (Math.sin(angle) * distance) / 110_570,
        heightM,
      ));
    }
    return points;
  }, false);
}

function addSpiral(
  source: Cesium.CustomDataSource,
  viewer: Cesium.Viewer,
  spec: HazardFxSpec,
  radiusKm: number,
  color: MaterialColor,
  arms = 3,
) {
  const start = Cesium.JulianDate.clone(viewer.clock.currentTime);
  for (let arm = 0; arm < arms; arm += 1) {
    source.entities.add({
      polyline: {
        positions: spiralPositions(viewer, spec, start, radiusKm, (arm / arms) * Math.PI * 2, 1_200),
        width: 3.4,
        material: color.withAlpha(0.88),
        arcType: Cesium.ArcType.NONE,
      },
    });
  }
  // Œil : anneau net au centre, sans prétendre à un rayon métrique.
  source.entities.add({
    position: Cesium.Cartesian3.fromDegrees(spec.lon, spec.lat, 1_100),
    ellipse: {
      height: 1_100,
      semiMajorAxis: Math.max(3_000, radiusKm * 85),
      semiMinorAxis: Math.max(3_000, radiusKm * 85),
      fill: false,
      outline: true,
      outlineColor: color.withAlpha(0.95),
      outlineWidth: 2.6,
    },
  });
}

function crackLines(
  source: Cesium.CustomDataSource,
  spec: HazardFxSpec,
  radiusM: number,
  color: MaterialColor,
  count = 9,
) {
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + 0.22;
    const inner = radiusM * (0.18 + 0.08 * ((index * 7) % 5));
    const outer = radiusM * (0.56 + 0.13 * ((index * 3) % 4));
    const bend = 0.12 + 0.05 * (index % 3);
    source.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray([
          spec.lon + (Math.cos(angle) * inner) / (111_320 * Math.max(0.2, Math.cos(Cesium.Math.toRadians(spec.lat)))),
          spec.lat + (Math.sin(angle) * inner) / 110_570,
          spec.lon + (Math.cos(angle + bend) * outer) / (111_320 * Math.max(0.2, Math.cos(Cesium.Math.toRadians(spec.lat)))),
          spec.lat + (Math.sin(angle + bend) * outer) / 110_570,
        ]),
        clampToGround: true,
        width: 2.2,
        material: color.withAlpha(0.72),
      },
    });
  }
}

/**
 * Remplit la source avec l'effet 3D du moment. Les entités précédentes sont
 * retirées : un seul aléa est mis en scène, celui que l'utilisateur a choisi.
 */
export function renderHazardFx(
  viewer: Cesium.Viewer,
  source: Cesium.CustomDataSource,
  spec: HazardFxSpec | null,
): void {
  source.entities.removeAll();
  if (!spec || viewer.isDestroyed()) return;

  const radiusKm = Math.max(MIN_VISUAL_RADIUS_KM, spec.radiusKm);
  const radiusM = radiusKm * 1000;
  const accent = colorOf(spec.hazard, 0.85);

  marker(source, spec);

  switch (spec.hazard) {
    case "earthquake":
      pulseRings(source, viewer, spec, radiusM, accent, 4, 2.4);
      groundEllipse(source, spec, radiusM * 0.32, accent, true);
      crackLines(source, spec, radiusM * 0.24, accent, 11);
      break;

    case "tsunami": {
      pulseRings(source, viewer, spec, radiusM, accent, 3, 3.6);
      groundEllipse(source, spec, radiusM * 0.55, accent, true);
      // Crête d'onde : arc vertical translucide, orienté vers l'est. Ce n'est
      // pas une prévision de direction côtière, seulement un volume lisible.
      const arcLat = latOffsetDeg(radiusKm * 0.5);
      const positions: Cesium.Cartesian3[] = [];
      for (let index = 0; index <= 24; index += 1) {
        const angle = -0.9 + (index / 24) * 1.8;
        positions.push(Cesium.Cartesian3.fromDegrees(
          spec.lon + Math.cos(angle) * lonOffsetDeg(spec.lat, radiusKm * 0.7),
          spec.lat + Math.sin(angle) * arcLat,
          0,
        ));
      }
      source.entities.add({
        wall: {
          positions,
          maximumHeights: positions.map((_, index) => 900 + Math.sin((index / 24) * Math.PI) * 3_400),
          minimumHeights: positions.map(() => 0),
          material: accent.withAlpha(0.34),
          outline: true,
          outlineColor: accent.withAlpha(0.9),
        },
      });
      break;
    }

    case "volcano": {
      const plumeHeightM = Math.max(8_000, Math.min(32_000, radiusKm * 260));
      const baseRadiusM = Math.max(1_400, radiusKm * 45);
      const topRadiusM = Math.max(4_000, radiusKm * 130);
      source.entities.add({
        position: Cesium.Cartesian3.fromDegrees(spec.lon, spec.lat, plumeHeightM / 2),
        cylinder: {
          length: plumeHeightM,
          topRadius: topRadiusM,
          bottomRadius: baseRadiusM,
          material: accent.withAlpha(0.24),
          outline: true,
          outlineColor: accent.withAlpha(0.56),
        },
      });
      pulseRings(source, viewer, spec, radiusM * 0.8, accent, 2, 4.2);
      groundEllipse(source, spec, radiusM * 0.6, accent, true);
      // Coulée de lave : ligne orange au sol, sans direction volcanique réelle.
      source.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray([
            spec.lon,
            spec.lat,
            spec.lon + lonOffsetDeg(spec.lat, radiusKm * 0.35) * 0.8,
            spec.lat - latOffsetDeg(radiusKm * 0.2),
          ]),
          clampToGround: true,
          width: 5,
          material: Cesium.Color.fromCssColorString("#ff5a1f").withAlpha(0.9),
        },
      });
      for (let index = 0; index < 5; index += 1) {
        source.entities.add({
          position: Cesium.Cartesian3.fromDegrees(
            spec.lon + Math.cos(index * 1.7) * lonOffsetDeg(spec.lat, radiusKm * 0.2),
            spec.lat + Math.sin(index * 1.7) * latOffsetDeg(radiusKm * 0.2),
            2_000 + index * 700,
          ),
          point: {
            pixelSize: 4 + index,
            color: accent.withAlpha(0.5),
            outlineColor: Cesium.Color.WHITE.withAlpha(0.18),
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      }
      break;
    }

    case "hurricane":
      groundEllipse(source, spec, radiusM, accent, true);
      addSpiral(source, viewer, spec, radiusKm, accent, 3);
      pulseRings(source, viewer, spec, radiusM * 0.28, accent, 2, 3.4);
      break;

    case "flood":
      groundEllipse(source, spec, radiusM, accent, true);
      pulseRings(source, viewer, spec, radiusM * 0.92, accent, 3, 3.2);
      break;

    case "wildfire": {
      groundEllipse(source, spec, radiusM * 0.82, accent, false);
      pulseRings(source, viewer, spec, radiusM * 0.55, accent, 2, 2.2);
      const start = Cesium.JulianDate.clone(viewer.clock.currentTime);
      for (let index = 0; index < 7; index += 1) {
        const angle = index * 1.31;
        source.entities.add({
          position: Cesium.Cartesian3.fromDegrees(
            spec.lon + Math.cos(angle) * lonOffsetDeg(spec.lat, radiusKm * (0.08 + 0.09 * (index % 4))),
            spec.lat + Math.sin(angle) * latOffsetDeg(radiusKm * (0.08 + 0.09 * (index % 4))),
            600 + index * 180,
          ),
          billboard: {
            image: hazardSprite("wildfire", spec.severity),
            width: 24,
            height: 24,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scale: new Cesium.CallbackProperty((time) => {
              const phase = (secondsSince(viewer, start, time) * 1.8 + index * 0.7) % 1;
              return 0.72 + 0.32 * Math.sin(phase * Math.PI);
            }, false),
          },
        });
      }
      break;
    }

    case "drought":
      groundEllipse(source, spec, radiusM, accent, true);
      crackLines(source, spec, radiusM * 0.9, accent, 12);
      break;

    case "landslide":
      source.entities.add({
        position: Cesium.Cartesian3.fromDegrees(spec.lon, spec.lat, 90),
        ellipse: {
          height: 90,
          semiMajorAxis: radiusM,
          semiMinorAxis: radiusM * 0.32,
          rotation: Cesium.Math.toRadians(24),
          material: accent.withAlpha(0.22),
          outline: true,
          outlineColor: accent.withAlpha(0.8),
          outlineWidth: 2.2,
        },
      });
      source.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray([
            spec.lon - lonOffsetDeg(spec.lat, radiusKm * 0.45),
            spec.lat + latOffsetDeg(radiusKm * 0.1),
            spec.lon + lonOffsetDeg(spec.lat, radiusKm * 0.45),
            spec.lat - latOffsetDeg(radiusKm * 0.1),
          ]),
          clampToGround: true,
          width: 4,
          material: new Cesium.PolylineDashMaterialProperty({
            color: accent.withAlpha(0.8),
            dashLength: 18,
          }),
        },
      });
      for (let index = 0; index < 4; index += 1) {
        source.entities.add({
          position: Cesium.Cartesian3.fromDegrees(
            spec.lon + lonOffsetDeg(spec.lat, radiusKm * (index - 1.5) * 0.18),
            spec.lat + latOffsetDeg(radiusKm * (index % 2 === 0 ? 0.08 : -0.06)),
            500,
          ),
          point: {
            pixelSize: 7 + (index % 2) * 3,
            color: accent.withAlpha(0.8),
            outlineColor: Cesium.Color.TRANSPARENT,
          },
        });
      }
      break;

    case "sandstorm":
      groundEllipse(source, spec, radiusM, accent, true);
      addSpiral(source, viewer, spec, radiusKm * 1.25, accent, 4);
      pulseRings(source, viewer, spec, radiusM * 0.7, accent, 2, 3.9);
      break;

    case "blizzard": {
      groundEllipse(source, spec, radiusM, accent, true);
      pulseRings(source, viewer, spec, radiusM * 0.9, accent, 3, 3.7);
      const flake = hazardSprite("blizzard", spec.severity);
      for (let index = 0; index < 14; index += 1) {
        const angle = index * 2.399;
        const distance = radiusKm * (0.12 + 0.7 * ((index * 5) % 9) / 9);
        source.entities.add({
          position: Cesium.Cartesian3.fromDegrees(
            spec.lon + Math.cos(angle) * lonOffsetDeg(spec.lat, distance),
            spec.lat + Math.sin(angle) * latOffsetDeg(distance),
            700 + (index % 5) * 450,
          ),
          billboard: {
            image: flake,
            width: 13 + (index % 3) * 4,
            height: 13 + (index % 3) * 4,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      }
      break;
    }

    case "heatwave":
      pulseRings(source, viewer, spec, radiusM, accent, 4, 3.2);
      groundEllipse(source, spec, radiusM * 0.88, accent, true);
      break;

    case "tornado": {
      groundEllipse(source, spec, radiusM * 0.8, accent, true);
      const start = Cesium.JulianDate.clone(viewer.clock.currentTime);
      const base = Math.max(700, radiusKm * 80);
      for (let arm = 0; arm < 3; arm += 1) {
        const phase = (arm / 3) * Math.PI * 2;
        source.entities.add({
          polyline: {
            positions: new Cesium.CallbackProperty((time) => {
              const rotation = secondsSince(viewer, start, time) * 0.7;
              const points: Cesium.Cartesian3[] = [];
              for (let index = 0; index <= 60; index += 1) {
                const progress = index / 60;
                const height = progress * 19_000;
                const spread = base + progress * Math.max(2_500, radiusKm * 220);
                const angle = phase + rotation + progress * Math.PI * 7;
                points.push(Cesium.Cartesian3.fromDegrees(
                  spec.lon + (Math.cos(angle) * spread) / (111_320 * Math.max(0.2, Math.cos(Cesium.Math.toRadians(spec.lat)))),
                  spec.lat + (Math.sin(angle) * spread) / 110_570,
                  height,
                ));
              }
              return points;
            }, false),
            width: 2.8,
            material: accent.withAlpha(0.72),
            arcType: Cesium.ArcType.NONE,
          },
        });
      }
      break;
    }

    case "storm": {
      groundEllipse(source, spec, radiusM, accent, true);
      pulseRings(source, viewer, spec, radiusM, accent, 3, 2.9);
      source.entities.add({
        position: Cesium.Cartesian3.fromDegrees(spec.lon, spec.lat, 7_500),
        billboard: {
          image: hazardSprite("storm", spec.severity),
          width: Math.max(52, Math.min(120, radiusKm * 0.9)),
          height: Math.max(52, Math.min(120, radiusKm * 0.9)),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(30_000, 1, 3_000_000, 0.55),
        },
      });
      source.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights([
            spec.lon,
            spec.lat,
            6_000,
            spec.lon + lonOffsetDeg(spec.lat, radiusKm * 0.06),
            spec.lat + latOffsetDeg(radiusKm * 0.04),
            3_500,
            spec.lon - lonOffsetDeg(spec.lat, radiusKm * 0.03),
            spec.lat + latOffsetDeg(radiusKm * 0.01),
            1_200,
          ]),
          width: 4,
          material: Cesium.Color.fromCssColorString("#ffe082").withAlpha(0.95),
          arcType: Cesium.ArcType.NONE,
        },
      });
      break;
    }

    default:
      pulseRings(source, viewer, spec, radiusM, accent, 2, 3);
      break;
  }

  viewer.scene.requestRender();
}
