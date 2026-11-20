/**
 * Globe 3D IntelliFlood (CesiumJS).
 *
 * Monde entier, temps réel :
 *  - noms de villes, capitales, pays et régions du monde (niveau de détail) ;
 *  - frontières des pays et délimitations administratives vectorielles, nettes
 *    à tous les niveaux de zoom ;
 *  - radar de précipitations mondial animé (images réelles RainViewer) ;
 *  - éclairage solaire : la zone où il fait nuit passe en mode sombre, avec les
 *    lumières nocturnes de la NASA ;
 *  - capteurs, météo, alertes, pluie et inondation simulée ;
 *  - position de l'utilisateur, si elle a été autorisée.
 *
 * Les calculs (seuils, simulation) restent côté serveur : ce composant ne fait
 * que rendre des données et les couches géographiques.
 */
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LEVEL_COLOR } from "../dashboard/SensorMap";
import { SensorState, WeatherItem } from "../services/api";
import { AutomaticFloodEvent, FloodRun } from "../services/simulation";
import {
  HazardEvent,
  HazardSimulation,
  ResolvedHazardPlace,
  SEVERITY_COLOR,
  hazardLabel,
  metricValueLabel,
  resolveHazardPlace,
} from "../services/hazards";
import { renderHazardFx } from "./hazardFx";
import { buildFloodPrimitive } from "./flood";
import { hazardKind, hazardSprite } from "./hazardIcons";
import { STORM_FRAGMENT, altitudeFade, rainVisual } from "./rain";
import {
  displayPlaceName,
  labelBudget,
  labelFontSize,
  loadPlaces,
  nearestPlace,
  Place,
  selectVisiblePlaces,
} from "./places";
import {
  Bounds,
  GeoFeature,
  loadAdmin1,
  loadCountries,
  selectBorders,
} from "./borders";
import {
  fetchRadarProduct,
  radarFrameIndexAt,
  radarFrameLabel,
  radarOpacityForHeight,
  radarTileUrlTemplate,
  RADAR_CREDIT_HTML,
  RadarProduct,
} from "./radar";
import { imageryInsertIndex } from "./imageryLayers";
import { formatAccuracy, formatCoordinates, UserPosition } from "../services/geolocation";
import { dayPhaseLabel, sunAltitudeDeg } from "../services/daynight";
import {
  nightCityLightsAlpha,
} from "../services/nightOverlay";
import {
  buildSeaTraffic,
  buildTraffic,
  buildWorldFlow,
  seaTrafficVisibility,
  trafficVisibility,
  vehicleSprite,
  vesselSprite,
  worldFlowVisibility,
  Road,
  TrafficKind,
} from "./traffic";
import {
  Aircraft,
  aircraftIconSvg,
  aircraftLabel,
  extrapolateAircraft,
} from "../services/liveAircraft";
import { useLiveAircraft } from "../dashboard/useLiveAircraft";
import { useGlobalAircraft } from "../dashboard/useGlobalAircraft";
import { useLiveRoads } from "../dashboard/useLiveRoads";

(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = "/cesium/";
const ION = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined;

/** Vue par défaut : le globe entier, puisque la plateforme est mondiale. */
const WORLD_VIEW = { lon: 12, lat: 16, height: 23_000_000 };
const CLOUD_BASE_HEIGHT = 760;
const NIGHT_LIGHTS_URL =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg";
const RADAR_FRAME_MS = 620;
/** Plafond d'affichage : le serveur renvoie déjà au plus 400 observations. */
const MAX_3D_AIRCRAFT = 420;
/** Au-delà, l'emprise est trop large pour interroger OpenSky sans quota. */
const AIRCRAFT_MAX_CAMERA_HEIGHT_M = 4_000_000;

export type Basemap = "esri" | "osm" | "nasa";

export const GLOBE_LAYERS = [
  "radar",
  "rain",
  "flood",
  "labels",
  "borders",
  "night",
  "traffic",
  "aircraft",
  "sensors",
  "weather",
  "alerts",
  "hazards",
] as const;

export type GlobeLayerKey = (typeof GLOBE_LAYERS)[number];
export type GlobeLayers = Record<GlobeLayerKey, boolean>;

export type GlobeHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  flyTo: (lat: number, lon: number, height?: number) => void;
  getCenter: () => { lat: number; lon: number; height: number } | null;
};

type Pick =
  | { kind: "sensor"; item: SensorState }
  | { kind: "weather"; item: WeatherItem }
  | { kind: "hazard"; item: HazardEvent };
type CurrentRain = { intensity: number; label: string };
type RainZone = { lon: number; lat: number; radiusM: number; intensity: number; label: string };

function makeBasemap(kind: Basemap): Cesium.ImageryProvider | Promise<Cesium.ImageryProvider> {
  if (kind === "osm") {
    return new Cesium.UrlTemplateImageryProvider({
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      maximumLevel: 19,
      credit: "© contributeurs OpenStreetMap",
    });
  }
  if (kind === "nasa") {
    return new Cesium.UrlTemplateImageryProvider({
      url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg",
      maximumLevel: 9,
      credit: "NASA GIBS / VIIRS (image du jour)",
    });
  }
  return Cesium.ArcGisMapServerImageryProvider.fromUrl(
    "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
    { enablePickFeatures: false },
  );
}

function rainScreenPosition(viewer: Cesium.Viewer, position: Cesium.Cartesian3 | null): Cesium.Cartesian2 {
  if (!position || viewer.isDestroyed()) return new Cesium.Cartesian2(-2, -2);
  const screen = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, position);
  if (!screen) return new Cesium.Cartesian2(-2, -2);
  return new Cesium.Cartesian2(
    screen.x / Math.max(1, viewer.canvas.clientWidth),
    1 - screen.y / Math.max(1, viewer.canvas.clientHeight),
  );
}

/** Rayon écran (fraction de la hauteur) d'un cercle de `radiusM` mètres. */
function screenRadius(viewer: Cesium.Viewer, center: Cesium.Cartesian3 | null, radiusM: number): number {
  if (!center || viewer.isDestroyed()) return 0.12;
  const edge = Cesium.Cartesian3.add(
    center,
    Cesium.Cartesian3.multiplyByScalar(viewer.camera.rightWC, radiusM, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  const a = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, center);
  const b = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, edge);
  if (!a || !b) return 0.12;
  const ratio = Math.abs(b.x - a.x) / Math.max(1, viewer.canvas.clientHeight);
  return Math.max(0.05, Math.min(0.55, ratio));
}

function cloudScreenSize(viewer: Cesium.Viewer, center: Cesium.Cartesian3 | null, radiusM: number): Cesium.Cartesian2 {
  const width = Math.min(0.19, Math.max(0.07, screenRadius(viewer, center, radiusM) * 1.05));
  return new Cesium.Cartesian2(width, Math.min(0.26, Math.max(0.08, width * 1.2)));
}

function currentRain(item: WeatherItem | null | undefined): CurrentRain {
  if (!item) return { intensity: 0, label: "Pluie actuelle indisponible" };
  if (item.observed_precip_mm_h != null) {
    return { intensity: item.observed_precip_mm_h, label: "Pluie rapportée" };
  }
  if (item.modeled_precip_mm_h != null) {
    return { intensity: item.modeled_precip_mm_h, label: "Estimation actuelle Open-Meteo" };
  }
  return { intensity: 0, label: "Pluie actuelle indisponible" };
}

/** Emprise visible du globe, ou null si la caméra regarde l'espace. */
export function viewBounds(viewer: Cesium.Viewer): Bounds | null {
  try {
    const rectangle = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
    if (!rectangle) return null;
    return {
      west: Cesium.Math.toDegrees(rectangle.west),
      south: Cesium.Math.toDegrees(rectangle.south),
      east: Cesium.Math.toDegrees(rectangle.east),
      north: Cesium.Math.toDegrees(rectangle.north),
    };
  } catch {
    return null;
  }
}

/**
 * Les lumières nocturnes n'ont de sens qu'à distance, et seulement si la zone
 * regardée est effectivement dans la nuit. Près du sol, elles ne feraient
 * qu'ajouter un voile basse résolution sur des tuiles déjà lisibles.
 */
export function cityLightsRelevant(heightM: number, viewer: Cesium.Viewer): boolean {
  if (!Number.isFinite(heightM) || heightM < 500_000) return false;
  if (heightM >= 3_500_000) return true;
  const carto = viewer.camera.positionCartographic;
  const lat = Cesium.Math.toDegrees(carto.latitude);
  const lon = Cesium.Math.toDegrees(carto.longitude);
  return sunAltitudeDeg(lat, lon) < 4;
}

/** Cercle fermé (lon/lat) approximant une zone de rayon `radiusM` autour d'un point. */export function circlePositions(lon: number, lat: number, radiusM: number, segments = 96): Cesium.Cartesian3[] {
  const points: Cesium.Cartesian3[] = [];
  const latRad = (lat * Math.PI) / 180;
  const latDeg = radiusM / 111_320;
  const lonDeg = radiusM / (111_320 * Math.max(0.05, Math.cos(latRad)));
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    points.push(Cesium.Cartesian3.fromDegrees(
      lon + lonDeg * Math.cos(angle),
      Math.max(-89.9, Math.min(89.9, lat + latDeg * Math.sin(angle))),
    ));
  }
  return points;
}

export default function GlobeView({
  sensors,
  weather,
  simulation,
  automaticFloods = [],
  frameIndex = 0,
  flyToTarget = null,
  onClearFlyToTarget,
  layers,
  onLayerChange,
  userPosition = null,
  onLocate,
  onBoundsChange,
  handleRef,
  worldWeatherAttribution = "",
  hazards = [],
  hazardPlaceMap,
  selectedHazard = null,
  hazardSimulation = null,
  onHazardSelect,
}: {
  sensors: SensorState[];
  weather: WeatherItem[];
  simulation?: FloodRun | null;
  automaticFloods?: AutomaticFloodEvent[];
  frameIndex?: number;
  flyToTarget?: { lat: number; lon: number; height?: number; timestamp?: number } | null;
  onClearFlyToTarget?: () => void;
  layers: GlobeLayers;
  onLayerChange?: (layer: GlobeLayerKey, enabled: boolean) => void;
  userPosition?: UserPosition | null;
  onLocate?: () => void;
  onBoundsChange?: (bounds: Bounds) => void;
  handleRef?: React.MutableRefObject<GlobeHandle | null>;
  worldWeatherAttribution?: string;
  hazards?: HazardEvent[];
  hazardPlaceMap?: ReadonlyMap<string, ResolvedHazardPlace>;
  selectedHazard?: HazardEvent | null;
  hazardSimulation?: HazardSimulation | null;
  onHazardSelect?: (event: HazardEvent) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Cesium.Viewer | null>(null);
  const baseImagery = useRef<Cesium.ImageryLayer | null>(null);
  const nightImagery = useRef<Cesium.ImageryLayer | null>(null);
  const radarLayers = useRef<Cesium.ImageryLayer[]>([]);
  const radarProduct = useRef<RadarProduct | null>(null);
  const radarIndex = useRef(0);
  const radarStartedAt = useRef(0);
  const labelCollection = useRef<Cesium.LabelCollection | null>(null);
  const bordersSource = useRef<Cesium.CustomDataSource | null>(null);
  const sensorSource = useRef<Cesium.CustomDataSource | null>(null);
  const weatherSource = useRef<Cesium.CustomDataSource | null>(null);
  const alertSource = useRef<Cesium.CustomDataSource | null>(null);
  const rainSource = useRef<Cesium.CustomDataSource | null>(null);
  const userSource = useRef<Cesium.CustomDataSource | null>(null);
  const aircraftSource = useRef<Cesium.CustomDataSource | null>(null);
  const hazardSource = useRef<Cesium.CustomDataSource | null>(null);
  const hazardFxSource = useRef<Cesium.CustomDataSource | null>(null);
  const hazardFxActive = useRef(false);
  const lastHazardFxRender = useRef(0);
  const hazardSelectCallback = useRef(onHazardSelect);
  hazardSelectCallback.current = onHazardSelect;
  const aircraftEntities = useRef<Map<string, Cesium.Entity>>(new Map());
  const aircraftData = useRef<Aircraft[]>([]);
  const aircraftClockOffset = useRef(0);
  const lastAircraftTick = useRef(0);
  const trafficBillboards = useRef<Cesium.BillboardCollection | null>(null);
  const vesselBillboards = useRef<Cesium.BillboardCollection | null>(null);
  const worldFlowBillboards = useRef<Cesium.BillboardCollection | null>(null);
  const worldFlowKinds = useRef<TrafficKind[]>([]);
  const trafficKinds = useRef<TrafficKind[]>([]);
  const roadsRef = useRef<Road[]>([]);
  const lastTrafficTick = useRef(0);
  const lastVesselTick = useRef(0);
  const floodPrimitive = useRef<Cesium.GroundPrimitive | null>(null);
  const automaticFloodPrimitives = useRef<Cesium.GroundPrimitive[]>([]);
  const cameraSimulationId = useRef<number | null>(null);
  const handledTarget = useRef<{ lat: number; lon: number; height?: number; timestamp?: number } | null>(null);
  const targetActive = useRef(false);
  const clearTargetRef = useRef<(() => void) | undefined>(undefined);
  clearTargetRef.current = onClearFlyToTarget;
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const boundsCallback = useRef(onBoundsChange);
  boundsCallback.current = onBoundsChange;
  const rainRef = useRef(0);
  const rainPosition = useRef<Cesium.Cartesian3 | null>(null);
  const rainGround = useRef<Cesium.Cartesian3 | null>(null);
  const rainRadiusM = useRef(1500);
  const animationFrame = useRef<number | null>(null);
  const lastRainRender = useRef(0);
  const moveTimer = useRef<number | null>(null);
  const autoCentered = useRef(false);
  const placesRef = useRef<Place[]>([]);
  const bordersData = useRef<{ countries: GeoFeature[]; admin1: GeoFeature[] }>({ countries: [], admin1: [] });
  const rebuildLabelsRef = useRef<() => void>(() => {});
  const rebuildBordersRef = useRef<() => void>(() => {});

  const [basemap, setBasemap] = useState<Basemap>("esri");
  const [picked, setPicked] = useState<Pick | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [error, setError] = useState("");
  const [radarReady, setRadarReady] = useState(false);
  const [radarFrame, setRadarFrame] = useState<string>("");
  const [placeCount, setPlaceCount] = useState(0);
  const [viewInfo, setViewInfo] = useState<{ label: string; phase: string; heightKm: number } | null>(null);
  const [aircraftBounds, setAircraftBounds] = useState<Bounds | null>(null);
  const [cameraHeightM, setCameraHeightM] = useState(WORLD_VIEW.height);

  // Trafic aérien : observations ADS-B réelles dans les deux cas.
  // - vue rapprochée : endpoint régional, borné par l'emprise visible ;
  // - vue mondiale (ouverture du globe) : endpoint mondial réparti sur tous
  //   les continents. Sans ce second flux, l'ouverture du globe n'affichait
  //   aucun avion et donnait l'impression d'une carte figée.
  const wideView = viewInfo == null
    || viewInfo.heightKm * 1000 > AIRCRAFT_MAX_CAMERA_HEIGHT_M;
  const localAircraftState = useLiveAircraft(aircraftBounds, {
    enabled: layers.aircraft && !wideView,
  });
  const useGlobalFeed = wideView || localAircraftState.aircraft.length === 0;
  const globalAircraftState = useGlobalAircraft({
    enabled: layers.aircraft && useGlobalFeed,
  });
  const aircraftState = useGlobalFeed ? globalAircraftState : localAircraftState;

  // Véhicules routiers : le tracé vient d'OpenStreetMap, le mouvement est
  // calculé localement à partir de l'heure. Rien n'est demandé en vue large.
  const roadsState = useLiveRoads(aircraftBounds, {
    enabled: layers.traffic,
    cameraHeightM,
  });

  const real = useMemo(() => {
    if (!picked) {
      return {
        rain: 0,
        rainLabel: "Sélectionnez un point pour afficher la pluie actuelle",
        forecast: 0,
        flood: 0,
        label: "Sélectionnez un capteur ou un point météo sur le globe.",
      };
    }
    if (picked.kind === "weather") {
      const rain = currentRain(picked.item);
      return {
        rain: rain.intensity,
        rainLabel: rain.label,
        forecast: picked.item.forecast_intensity_3h_mm_h ?? picked.item.intensity_3h_mm_h,
        flood: 0,
        label: `${picked.item.name} — ${picked.item.source}`,
      };
    }
    if (picked.kind === "hazard") {
      const place = hazardPlaceMap?.get(picked.item.id) ?? resolveHazardPlace(picked.item);
      return {
        rain: 0,
        rainLabel: "Aucune mesure de pluie associée à cet aléa",
        forecast: 0,
        flood: 0,
        label: `${place.label} — ${hazardLabel(picked.item.hazard)} (${picked.item.severity_label})`,
      };
    }
    const near = weather.reduce<WeatherItem | null>(
      (best, item) => (!best || Math.hypot(item.lat - picked.item.lat, item.lon - picked.item.lon) < Math.hypot(best.lat - picked.item.lat, best.lon - picked.item.lon) ? item : best),
      null,
    );
    const rain = currentRain(near);
    return {
      rain: rain.intensity,
      rainLabel: rain.label,
      forecast: near?.forecast_intensity_3h_mm_h ?? near?.intensity_3h_mm_h ?? 0,
      flood: (picked.item.water_level_cm ?? 0) / 100,
      label: `${picked.item.name}${near ? ` — météo : ${near.name}` : ""}`,
    };
  }, [picked, weather, hazardPlaceMap]);

  // Zones pluvieuses : la simulation est prioritaire, sinon les points météo.
  const rainZones = useMemo<RainZone[]>(() => {
    if (simulation) {
      if (simulation.input.mode !== "rain") return [];
      const intensity = simulation.input.rain_mm_h ?? 0;
      if (intensity <= 0) return [];
      return [{
        lon: simulation.result.center.lon,
        lat: simulation.result.center.lat,
        radiusM: simulation.input.radius_m ?? 1500,
        intensity,
        label: "Zone simulée",
      }];
    }
    const rainy = weather
      .filter((item) => (item.observed_precip_mm_h ?? item.modeled_precip_mm_h ?? 0) > 0)
      .sort((a, b) =>
        (b.observed_precip_mm_h ?? b.modeled_precip_mm_h ?? 0)
        - (a.observed_precip_mm_h ?? a.modeled_precip_mm_h ?? 0))
      .slice(0, 6)
      .map((item) => ({
        lon: item.lon,
        lat: item.lat,
        radiusM: 2600,
        intensity: item.observed_precip_mm_h ?? item.modeled_precip_mm_h ?? 0,
        label: item.name,
      }));
    if (rainy.length) return rainy;
    if (!picked) return [];
    if (picked.kind === "hazard") return [];
    if (picked.kind === "weather") {
      const rain = currentRain(picked.item);
      return rain.intensity > 0
        ? [{ lon: picked.item.lon, lat: picked.item.lat, radiusM: 2600, intensity: rain.intensity, label: picked.item.name }]
        : [];
    }
    if (real.rain <= 0) return [];
    return [{ lon: picked.item.lon, lat: picked.item.lat, radiusM: 2600, intensity: real.rain, label: picked.item.name }];
  }, [picked, simulation, weather, real.rain]);

  const primaryZone = rainZones[0];
  const rainPoint = useMemo(
    () => primaryZone ? Cesium.Cartesian3.fromDegrees(primaryZone.lon, primaryZone.lat, CLOUD_BASE_HEIGHT) : null,
    [primaryZone],
  );
  const rainGroundPoint = useMemo(
    () => primaryZone ? Cesium.Cartesian3.fromDegrees(primaryZone.lon, primaryZone.lat, 0) : null,
    [primaryZone],
  );

  useEffect(() => {
    rainRef.current = layers.rain ? rainVisual(primaryZone?.intensity ?? 0) : 0;
    rainRadiusM.current = primaryZone?.radiusM ?? 1500;
    rainPosition.current = rainPoint;
    rainGround.current = rainGroundPoint;
    viewer.current?.scene.requestRender();
  }, [primaryZone, layers.rain, rainPoint, rainGroundPoint]);

  /**
   * Aligne les entités Cesium sur la dernière observation OpenSky.
   * Les positions sont prolongées à l'instant courant, sans jamais créer de
   * nouvelle mesure : le panneau indique qu'il s'agit d'une interpolation.
   */
  const syncAircraft = useCallback((items: Aircraft[], nowMs: number) => {
    const v = viewer.current;
    const source = aircraftSource.current;
    if (!v || v.isDestroyed() || !source) return;
    const visible = layersRef.current.aircraft ? items.slice(0, MAX_3D_AIRCRAFT) : [];
    const live = new Set<string>();
    for (const item of visible) live.add(item.icao24);

    for (const [id, entity] of aircraftEntities.current) {
      if (live.has(id)) continue;
      source.entities.remove(entity);
      aircraftEntities.current.delete(id);
    }

    const icon = aircraftIconSvg();
    for (const item of visible) {
      const estimated = extrapolateAircraft(item, nowMs);
      const altitude = item.onGround
        ? 80
        : Math.max(500, Math.min(15_000, item.altitudeM ?? 9_000));
      const position = Cesium.Cartesian3.fromDegrees(estimated.lon, estimated.lat, altitude);
      const rotation = Cesium.Math.toRadians(-(item.headingDeg ?? 0));
      const entity = aircraftEntities.current.get(item.icao24);
      if (entity) {
        entity.position = new Cesium.ConstantPositionProperty(position);
        if (entity.billboard) entity.billboard.rotation = new Cesium.ConstantProperty(rotation);
        if (entity.label) entity.label.text = new Cesium.ConstantProperty(aircraftLabel(item));
        continue;
      }
      aircraftEntities.current.set(item.icao24, source.entities.add({
        id: `avion-${item.icao24}`,
        position,
        billboard: {
          image: icon,
          width: 22,
          height: 22,
          rotation,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          scaleByDistance: new Cesium.NearFarScalar(80_000, 1.25, 3_500_000, 0.55),
          color: item.onGround ? Cesium.Color.fromCssColorString("#ffd166") : Cesium.Color.WHITE,
        },
        label: {
          text: aircraftLabel(item),
          font: "600 11px 'Segoe UI', system-ui, sans-serif",
          fillColor: Cesium.Color.fromCssColorString("#e8f4ff"),
          outlineColor: Cesium.Color.fromCssColorString("#06111d"),
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -20),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 900_000),
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString("rgba(4, 14, 24, 0.62)"),
        },
        properties: {
          aircraft: {
            icao24: item.icao24,
            callsign: item.callsign,
            country: item.country,
          },
        },
      }));
    }
    v.scene.requestRender();
  }, []);

  /**
   * Anime les véhicules routiers à l'instant courant.
   *
   * Le tracé vient d'OpenStreetMap ; la position de chaque véhicule est une
   * fonction de l'heure, donc le flux avance en continu, sans nouvelle requête
   * réseau. Le mouvement est un modèle : l'interface l'indique dans le panneau.
   */
  const syncTraffic = useCallback((nowMs: number) => {
    const v = viewer.current;
    const collection = trafficBillboards.current;
    if (!v || v.isDestroyed() || !collection) return;
    try {
      const height = v.camera.positionCartographic.height;
      const visibility = trafficVisibility(height);
      if (!layersRef.current.traffic || visibility <= 0.02 || roadsRef.current.length === 0) {
        if (collection.show) {
          collection.show = false;
          v.scene.requestRender();
        }
        return;
      }
      const budget = height < 80_000 ? 850 : height < 250_000 ? 460 : 180;
      const vehicles = buildTraffic(roadsRef.current, nowMs, { budget });
      collection.show = true;
      while (collection.length > vehicles.length) {
        collection.remove(collection.get(collection.length - 1));
      }
      while (collection.length < vehicles.length) {
        collection.add({
          position: Cesium.Cartesian3.fromDegrees(0, 0, 2),
          image: vehicleSprite("car"),
          width: 15,
          height: 15,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(200, 1.35, 420_000, 0.42),
        });
      }
      trafficKinds.current.length = vehicles.length;
      for (let index = 0; index < vehicles.length; index += 1) {
        const vehicle = vehicles[index];
        const billboard = collection.get(index);
        billboard.position = Cesium.Cartesian3.fromDegrees(vehicle.lon, vehicle.lat, 2);
        billboard.rotation = Cesium.Math.toRadians(-vehicle.headingDeg);
        billboard.scale = Math.max(0.35, visibility);
        if (trafficKinds.current[index] !== vehicle.kind) {
          billboard.image = vehicleSprite(vehicle.kind);
          trafficKinds.current[index] = vehicle.kind;
        }
      }
      v.scene.requestRender();
    } catch {
      // Un incident de rendu ne doit jamais interrompre la boucle d'animation.
      collection.show = false;
    }
  }, []);

  /** Navires : liaisons entre ports réels, déplacement continu modélisé. */
  const syncVessels = useCallback((nowMs: number) => {
    const v = viewer.current;
    const collection = vesselBillboards.current;
    if (!v || v.isDestroyed() || !collection) return;
    try {
      const visibility = seaTrafficVisibility(v.camera.positionCartographic.height);
      if (!layersRef.current.traffic || visibility <= 0.02) {
        collection.show = false;
        return;
      }
      const vessels = buildSeaTraffic(nowMs, 220);
      collection.show = true;
      while (collection.length > vessels.length) {
        collection.remove(collection.get(collection.length - 1));
      }
      while (collection.length < vessels.length) {
        collection.add({
          position: Cesium.Cartesian3.fromDegrees(0, 0, 2),
          image: vesselSprite(),
          width: 16,
          height: 16,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(5_000, 1.4, 3_000_000, 0.5),
        });
      }
      for (let index = 0; index < vessels.length; index += 1) {
        const vessel = vessels[index];
        const billboard = collection.get(index);
        billboard.position = Cesium.Cartesian3.fromDegrees(vessel.lon, vessel.lat, 2);
        billboard.rotation = Cesium.Math.toRadians(-vessel.headingDeg);
        billboard.scale = Math.max(0.4, visibility);
      }
      v.scene.requestRender();
    } catch {
      collection.show = false;
    }
  }, []);

  /**
   * Flux à l'échelle du globe.
   *
   * Les vraies rues OSM ne sont chargées qu'en vue rapprochée ; sans ce calque,
   * l'ouverture du globe n'avait aucun véhicule en mouvement. Ce sont des flux
   * modélisés et accélérés entre métropoles réelles, pas des observations.
   */
  const syncWorldFlow = useCallback((nowMs: number) => {
    const v = viewer.current;
    const collection = worldFlowBillboards.current;
    if (!v || v.isDestroyed() || !collection) return;
    try {
      const visibility = worldFlowVisibility(v.camera.positionCartographic.height);
      if (!layersRef.current.traffic || visibility <= 0.02) {
        if (collection.show) collection.show = false;
        return;
      }
      const flow = buildWorldFlow(nowMs, 320);
      collection.show = true;
      while (collection.length > flow.length) {
        collection.remove(collection.get(collection.length - 1));
      }
      while (collection.length < flow.length) {
        collection.add({
          position: Cesium.Cartesian3.fromDegrees(0, 0, 2),
          image: vehicleSprite("car"),
          width: 13,
          height: 13,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(1_000_000, 1.5, 25_000_000, 0.8),
        });
      }
      worldFlowKinds.current.length = flow.length;
      for (let index = 0; index < flow.length; index += 1) {
        const point = flow[index];
        const billboard = collection.get(index);
        billboard.position = Cesium.Cartesian3.fromDegrees(point.lon, point.lat, 2);
        billboard.rotation = Cesium.Math.toRadians(-point.headingDeg);
        billboard.scale = Math.max(0.5, visibility);
        if (worldFlowKinds.current[index] !== point.kind) {
          billboard.image = vehicleSprite(point.kind);
          worldFlowKinds.current[index] = point.kind;
        }
      }
      v.scene.requestRender();
    } catch {
      collection.show = false;
    }
  }, []);

  useEffect(() => {
    roadsRef.current = roadsState.roads;
    if (viewer.current && !viewer.current.isDestroyed()) viewer.current.scene.requestRender();
  }, [roadsState.roads]);

  useEffect(() => {
    aircraftData.current = aircraftState.aircraft;
    aircraftClockOffset.current = aircraftState.clockOffsetMs;
    syncAircraft(
      aircraftState.aircraft,
      Date.now() + aircraftState.clockOffsetMs,
    );
  }, [
    aircraftState.aircraft,
    aircraftState.clockOffsetMs,
    layers.aircraft,
    syncAircraft,
  ]);

  // --- Création unique du viewer -------------------------------------------------
  useEffect(() => {
    if (!host.current) return;
    let v: Cesium.Viewer;
    try {
      if (ION) Cesium.Ion.defaultAccessToken = ION;
      v = new Cesium.Viewer(host.current, {
        baseLayer: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        animation: false,
        timeline: false,
        fullscreenButton: false,
        navigationHelpButton: false,
        infoBox: false,
        selectionIndicator: false,
        sceneModePicker: true,
        requestRenderMode: true,
        msaaSamples: 4,
      });
    } catch {
      setError("WebGL indisponible sur cet appareil : le globe 3D ne peut pas s'afficher. Utilisez la carte 2D.");
      return;
    }
    viewer.current = v;
    // Rendu à la résolution physique de l'écran : sans cela, le globe est
    // interpolé et paraît flou sur les écrans haute densité (HiDPI/Retina).
    v.resolutionScale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    if (import.meta.env.DEV) (window as unknown as { __ifViewer?: Cesium.Viewer }).__ifViewer = v;

    // --- Netteté et qualité de rendu
    v.scene.globe.maximumScreenSpaceError = 1.1;
    v.scene.globe.tileCacheSize = 512;
    v.scene.globe.preloadAncestors = true;
    v.scene.globe.preloadSiblings = true;
    v.scene.globe.baseColor = Cesium.Color.fromCssColorString("#0a1521");
    v.scene.postProcessStages.fxaa.enabled = true;
    v.scene.maximumRenderTimeChange = Number.POSITIVE_INFINITY;
    v.scene.globe.showGroundAtmosphere = true;
    if (v.scene.skyAtmosphere) v.scene.skyAtmosphere.show = true;

    // --- Jour / nuit : éclairage solaire progressif
    //
    // Cesium applique l'éclairage solaire à l'imagerie. À l'échelle mondiale,
    // le terminateur est net et les lumières NASA ne s'affichent que côté nuit.
    // En approchant du sol, l'éclairage s'efface : rues, bâtiments et relief
    // restent parfaitement lisibles, de jour comme de nuit. C'est ce fondu qui
    // remplace l'ancien voile basse résolution, source de flou.
    v.scene.globe.enableLighting = layersRef.current.night;
    v.scene.globe.dynamicAtmosphereLighting = true;
    v.scene.globe.dynamicAtmosphereLightingFromSun = true;
    // fadeOut = début du fondu (caméra proche), fadeIn = éclairage complet
    // (caméra lointaine). Vers 600 km d'altitude : pleine lumière ; vers
    // 3 100 km : terminateur complet.
    v.scene.globe.lightingFadeOutDistance = 7_000_000;
    v.scene.globe.lightingFadeInDistance = 9_500_000;
    v.clock.shouldAnimate = true;
    v.clock.multiplier = 1;
    // La brume d'altitude voilait les tuiles en vue rapprochée.
    v.scene.fog.enabled = false;

    // Lumières nocturnes de la NASA : la couche est transparente côté jour
    // (`dayAlpha = 0`) et visible côté nuit (`nightAlpha > 0`), sans voile
    // noir sur l'imagerie diurne.
    try {
      const nightProvider = new Cesium.UrlTemplateImageryProvider({
        url: NIGHT_LIGHTS_URL,
        maximumLevel: 8,
        credit: "NASA GIBS / VIIRS City Lights",
      });
      const nightLayer = v.imageryLayers.addImageryProvider(
        nightProvider,
        imageryInsertIndex(2, v.imageryLayers.length),
      );
      // L'image NASA a un fond noir opaque. Sans ce traitement, elle forme un
      // voile noir au-dessus du fond de carte et masque rues et bâtiments.
      // Le noir devient transparent : seuls les points lumineux restent.
      nightLayer.colorToAlpha = new Cesium.Color(0, 0, 0, 1);
      nightLayer.colorToAlphaThreshold = 0.06;
      nightLayer.dayAlpha = 0;
      nightLayer.nightAlpha = 0.92;
      nightLayer.alpha = nightCityLightsAlpha(v.camera.positionCartographic.height);
      nightLayer.brightness = 1.35;
      nightLayer.saturation = 1.15;
      nightLayer.show = layersRef.current.night;
      nightImagery.current = nightLayer;
    } catch {
      // Sans lumières nocturnes, l'éclairage solaire suffit à distinguer la nuit.
    }

    if (ION) {
      void Cesium.createWorldTerrainAsync().then((terrain) => {
        if (!v.isDestroyed()) {
          v.terrainProvider = terrain;
          v.scene.requestRender();
        }
      }).catch(() => setError("Le relief 3D est indisponible; le globe utilisera son ellipsoïde."));
    }

    v.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(WORLD_VIEW.lon, WORLD_VIEW.lat, WORLD_VIEW.height) });

    bordersSource.current = new Cesium.CustomDataSource("delimitations");
    sensorSource.current = new Cesium.CustomDataSource("capteurs");
    weatherSource.current = new Cesium.CustomDataSource("meteo");
    alertSource.current = new Cesium.CustomDataSource("alertes");
    rainSource.current = new Cesium.CustomDataSource("pluie");
    userSource.current = new Cesium.CustomDataSource("position-utilisateur");
    aircraftSource.current = new Cesium.CustomDataSource("trafic-aerien");
    hazardSource.current = new Cesium.CustomDataSource("aleas-mondiaux");
    hazardFxSource.current = new Cesium.CustomDataSource("aleas-effets-3d");
    [bordersSource, sensorSource, weatherSource, alertSource, rainSource, userSource, aircraftSource, hazardSource, hazardFxSource].forEach((source) => {
      if (source.current) v.dataSources.add(source.current);
    });

    labelCollection.current = v.scene.primitives.add(new Cesium.LabelCollection({ scene: v.scene })) as Cesium.LabelCollection;
    // Trafic routier et maritime : des collections de billboards, mises à jour
    // à chaque image. Elles sont bien plus rapides que des entités Cesium,
    // nécessaires pour animer des centaines de véhicules en continu.
    trafficBillboards.current = v.scene.primitives.add(
      new Cesium.BillboardCollection({ scene: v.scene }),
    ) as Cesium.BillboardCollection;
    vesselBillboards.current = v.scene.primitives.add(
      new Cesium.BillboardCollection({ scene: v.scene }),
    ) as Cesium.BillboardCollection;
    // Flux de la vue mondiale : modèle accéléré entre métropoles réelles.
    worldFlowBillboards.current = v.scene.primitives.add(
      new Cesium.BillboardCollection({ scene: v.scene }),
    ) as Cesium.BillboardCollection;

    // --- Orage : rideau de pluie et cumulonimbus autour de la zone active
    v.scene.postProcessStages.add(new Cesium.PostProcessStage({
      fragmentShader: STORM_FRAGMENT,
      uniforms: {
        u_intensity: () => rainRef.current * altitudeFade(v.camera.positionCartographic.height),
        u_time: () => (performance.now() / 1000) % 1000,
        u_aspect: () => v.canvas.clientWidth / Math.max(1, v.canvas.clientHeight),
        u_cloud: () => rainScreenPosition(v, rainPosition.current),
        u_cloudSize: () => cloudScreenSize(v, rainGround.current, rainRadiusM.current),
        u_center: () => rainScreenPosition(v, rainPosition.current),
        u_ground: () => rainScreenPosition(v, rainGround.current),
        u_radius: () => screenRadius(v, rainGround.current, rainRadiusM.current),
        u_max_depth: () => simulation ? (simulation.result.stats?.max_depth_m ?? 0) : 0,
        u_flood_depth: () => simulation ? (simulation.result.stats?.max_depth_m > 0 ? 1 : 0) : 0,
      },
    }));

    // --- Boucle d'animation : radar mondial image par image + pluie locale
    const tick = (now: number) => {
      animationFrame.current = requestAnimationFrame(tick);
      if (v.isDestroyed()) return;

      const frames = radarProduct.current?.frames ?? [];
      if (layersRef.current.radar && frames.length > 1 && radarLayers.current.length) {
        if (!radarStartedAt.current) radarStartedAt.current = now;
        const index = radarFrameIndexAt(now - radarStartedAt.current, frames.length, RADAR_FRAME_MS);
        if (index !== radarIndex.current) {
          radarIndex.current = index;
          radarLayers.current.forEach((layer, layerIndex) => {
            layer.show = layerIndex === index;
          });
          setRadarFrame(radarFrameLabel(frames[index].time));
          v.scene.requestRender();
        }
      }

      const center = rainScreenPosition(v, rainPosition.current);
      const rainVisible = center.x >= 0 && center.x <= 1 && center.y >= 0 && center.y <= 1;
      const rainAnimating = rainRef.current > 0 && rainVisible && altitudeFade(v.camera.positionCartographic.height) > 0;
      if (rainAnimating && now - lastRainRender.current >= 32) {
        lastRainRender.current = now;
        v.scene.requestRender();
      }

      // Temps réel : l'interpolation suit l'horloge locale entre deux lots
      // d'observations OpenSky, afin qu'aucun appareil ne paraisse figé.
      if (layersRef.current.aircraft && aircraftData.current.length && now - lastAircraftTick.current >= 60) {
        lastAircraftTick.current = now;
        syncAircraft(
          aircraftData.current,
          Date.now() + aircraftClockOffset.current,
        );
      }

      // Trafic routier, flux mondiaux et navires : trente images par seconde
      // pour les véhicules, huit pour les navires (leur déplacement est lent).
      if (layersRef.current.traffic) {
        if (now - lastTrafficTick.current >= 33) {
          lastTrafficTick.current = now;
          syncTraffic(Date.now());
          syncWorldFlow(Date.now());
        }
        if (now - lastVesselTick.current >= 120) {
          lastVesselTick.current = now;
          syncVessels(Date.now());
        }
      }

      // Les effets d'aléa (anneaux, spirales, panaches) sont animés par des
      // CallbackProperty : ils nécessitent un rendu régulier même si la caméra
      // ne bouge pas.
      if (hazardFxActive.current && now - lastHazardFxRender.current >= 33) {
        lastHazardFxRender.current = now;
        v.scene.requestRender();
      }
    };
    animationFrame.current = requestAnimationFrame(tick);

    // Le soleil avance en temps réel : on rafraîchit le terminateur lentement.
    const sunTimer = window.setInterval(() => {
      if (!v.isDestroyed() && layersRef.current.night) v.scene.requestRender();
    }, 20_000);

    const updateCameraLayers = () => {
      if (v.isDestroyed()) return;
      const height = v.camera.positionCartographic.height;
      radarLayers.current.forEach((layer) => {
        layer.alpha = radarOpacityForHeight(height);
      });
      if (nightImagery.current) {
        nightImagery.current.alpha = nightCityLightsAlpha(height);
        nightImagery.current.show = layersRef.current.night && cityLightsRelevant(height, v);
      }
      // Netteté : plus la caméra descend, plus l'erreur d'écran tolérée diminue,
      // ce qui charge des tuiles plus fines (rues, bâtiments) au bon moment.
      const sse = height < 250_000 ? 0.8 : height < 2_000_000 ? 1.0 : 1.25;
      if (Math.abs(v.scene.globe.maximumScreenSpaceError - sse) > 0.01) {
        v.scene.globe.maximumScreenSpaceError = sse;
      }
      setCameraHeightM(height);
      v.scene.requestRender();
    };

    const onCameraMoveEnd = () => {
      updateCameraLayers();
      if (moveTimer.current !== null) window.clearTimeout(moveTimer.current);
      moveTimer.current = window.setTimeout(() => {
        moveTimer.current = null;
        if (v.isDestroyed()) return;
        rebuildLabelsRef.current();
        rebuildBordersRef.current();
        const bounds = viewBounds(v);
        if (bounds) boundsCallback.current?.(bounds);
        setAircraftBounds(bounds);
        const carto = v.camera.positionCartographic;
        const lat = Cesium.Math.toDegrees(carto.latitude);
        const lon = Cesium.Math.toDegrees(carto.longitude);
        const height = carto.height;
        const near = placesRef.current.length ? nearestPlace(placesRef.current, { lat, lon }) : null;
        const regional = height <= 5_000_000;
        setViewInfo({
          label: regional
            ? (near ? `${displayPlaceName(near.place)}${near.place.country ? `, ${near.place.country}` : ""}` : `${lat.toFixed(1)}°, ${lon.toFixed(1)}°`)
            : "Monde",
          phase: regional ? dayPhaseLabel(lat, lon) : "éclairage solaire en direct",
          heightKm: height / 1000,
        });
      }, 220);
    };
    v.camera.moveEnd.addEventListener(onCameraMoveEnd);
    v.camera.percentageChanged = 0.05;
    v.camera.changed.addEventListener(updateCameraLayers);
    const initialTimer = window.setTimeout(onCameraMoveEnd, 700);

    const handler = new Cesium.ScreenSpaceEventHandler(v.canvas);
    handler.setInputAction((movement: { position: Cesium.Cartesian2 }) => {
      const obj = v.scene.pick(movement.position);
      const data = obj?.id?.properties?.pick?.getValue?.();
      if (!data) return;
      setPicked(data as Pick);
      if (data.kind === "hazard") {
        setPanelOpen(true);
        hazardSelectCallback.current?.(data.item as HazardEvent);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Toute interaction manuelle libère la localisation en cours.
    const canvas = v.canvas;
    const releaseCamera = () => {
      if (!targetActive.current) return;
      targetActive.current = false;
      handledTarget.current = null;
      if (!v.isDestroyed()) v.camera.cancelFlight();
      clearTargetRef.current?.();
    };
    canvas.addEventListener("pointerdown", releaseCamera, { passive: true });
    canvas.addEventListener("wheel", releaseCamera, { passive: true });
    canvas.addEventListener("touchstart", releaseCamera, { passive: true });
    v.scene.requestRender();

    if (handleRef) {
      handleRef.current = {
        zoomIn: () => { if (!v.isDestroyed()) { v.camera.zoomIn(v.camera.positionCartographic.height * 0.45); v.scene.requestRender(); } },
        zoomOut: () => { if (!v.isDestroyed()) { v.camera.zoomOut(v.camera.positionCartographic.height * 0.45); v.scene.requestRender(); } },
        resetView: () => { if (!v.isDestroyed()) v.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(WORLD_VIEW.lon, WORLD_VIEW.lat, WORLD_VIEW.height), duration: 1.6 }); },
        flyTo: (lat, lon, height = 40_000) => { if (!v.isDestroyed()) v.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(lon, lat, height), duration: 1.8 }); },
        getCenter: () => {
          if (v.isDestroyed()) return null;
          const carto = v.camera.positionCartographic;
          return {
            lat: Cesium.Math.toDegrees(carto.latitude),
            lon: Cesium.Math.toDegrees(carto.longitude),
            height: carto.height,
          };
        },
      };
    }

    return () => {
      handler.destroy();
      canvas.removeEventListener("pointerdown", releaseCamera);
      canvas.removeEventListener("wheel", releaseCamera);
      canvas.removeEventListener("touchstart", releaseCamera);
      v.camera.moveEnd.removeEventListener(onCameraMoveEnd);
      v.camera.changed.removeEventListener(updateCameraLayers);
      window.clearTimeout(initialTimer);
      window.clearInterval(sunTimer);
      if (moveTimer.current !== null) window.clearTimeout(moveTimer.current);
      if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
      if (!v.isDestroyed()) v.destroy();
      viewer.current = null;
      labelCollection.current = null;
      bordersSource.current = null;
      sensorSource.current = null;
      weatherSource.current = null;
      alertSource.current = null;
      rainSource.current = null;
      userSource.current = null;
      aircraftSource.current = null;
      aircraftEntities.current.clear();
      aircraftData.current = [];
      hazardSource.current = null;
      hazardFxSource.current = null;
      hazardFxActive.current = false;
      trafficBillboards.current = null;
      vesselBillboards.current = null;
      worldFlowBillboards.current = null;
      worldFlowKinds.current.length = 0;
      trafficKinds.current = [];
      roadsRef.current = [];
      radarLayers.current = [];
      radarProduct.current = null;
      cameraSimulationId.current = null;
      automaticFloodPrimitives.current = [];
      handledTarget.current = null;
      targetActive.current = false;
      autoCentered.current = false;
      if (handleRef) handleRef.current = null;
    };
    // Le viewer est créé une seule fois ; les autres effets appliquent les props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Fond de carte + lumières nocturnes ----------------------------------------
  useEffect(() => {
    const v = viewer.current;
    if (!v || v.isDestroyed()) return;
    let cancelled = false;
    let detach = () => {};
    if (baseImagery.current) {
      v.imageryLayers.remove(baseImagery.current, true);
      baseImagery.current = null;
    }
    Promise.resolve(makeBasemap(basemap)).then((provider) => {
      if (cancelled || v.isDestroyed()) return;
      baseImagery.current = v.imageryLayers.addImageryProvider(provider, 0);
      setError("");
      let failures = 0;
      const onTileError = () => {
        failures += 1;
        if (failures < 8 || cancelled || v.isDestroyed() || basemap === "osm") return;
        detach();
        setBasemap("osm");
        setError("Fond satellite indisponible (réseau) : bascule automatique sur le plan OpenStreetMap.");
      };
      if (provider.errorEvent) {
        const remove = provider.errorEvent.addEventListener(onTileError);
        detach = () => { if (typeof remove === "function") remove(); };
      }
      v.scene.requestRender();
    }).catch(() => {
      if (!cancelled) setError("Fond de carte indisponible (réseau). Essayez un autre fond.");
    });
    return () => { cancelled = true; detach(); };
  }, [basemap]);

  // --- Noms de lieux mondiaux (niveau de détail + anti-chevauchement) ------------
  useEffect(() => {
    const v = viewer.current;
    if (!v || v.isDestroyed()) return;
    let cancelled = false;
    void Promise.all([loadPlaces(), loadCountries().catch(() => [] as GeoFeature[])])
      .then(([dataset, countries]) => {
        if (cancelled || v.isDestroyed()) return;
        placesRef.current = dataset.places;
        bordersData.current.countries = countries;
        setPlaceCount(dataset.places.length);
        rebuildLabelsRef.current();
        rebuildBordersRef.current();
      })
      .catch(() => setError("Les noms de lieux mondiaux sont momentanément indisponibles."));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const v = viewer.current;
    if (!v || v.isDestroyed()) return;
    let cancelled = false;
    void loadAdmin1()
      .then((features) => {
        if (cancelled) return;
        bordersData.current.admin1 = features;
        rebuildBordersRef.current();
      })
      .catch(() => {
        // Les limites administratives sont un enrichissement, pas une condition.
      });
    return () => { cancelled = true; };
    // Chargé une seule fois, après les frontières nationales.
  }, []);

  /** Reconstruit les libellés visibles, avec décluttering écran. */
  const rebuildLabels = useCallback(() => {
    const v = viewer.current;
    const collection = labelCollection.current;
    if (!v || v.isDestroyed() || !collection) return;
    collection.removeAll();
    if (!layersRef.current.labels) {
      v.scene.requestRender();
      return;
    }
    const height = v.camera.positionCartographic.height;
    const occluder = new Cesium.EllipsoidalOccluder(v.scene.globe.ellipsoid, v.camera.positionWC);
    const taken: Array<{ x: number; y: number; w: number; h: number }> = [];
    const width = v.canvas.clientWidth;
    const heightPx = v.canvas.clientHeight;
    let placed = 0;
    const tryPlace = (
      name: string,
      lat: number,
      lon: number,
      fontSize: number,
      color: Cesium.Color,
      background: Cesium.Color,
      detail: "capital" | "major" | "city" | "town" | "country" | "region",
    ) => {
      const position = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
      if (!occluder.isPointVisible(position)) return false;
      const screen = Cesium.SceneTransforms.worldToWindowCoordinates(v.scene, position);
      if (!screen || screen.x < 8 || screen.y < 8 || screen.x > width - 8 || screen.y > heightPx - 8) return false;
      const textWidth = name.length * fontSize * 0.55 + 10;
      const textHeight = fontSize * 1.45;
      const box = { x: screen.x - textWidth / 2, y: screen.y - textHeight / 2, w: textWidth, h: textHeight };
      for (const other of taken) {
        if (box.x < other.x + other.w && box.x + box.w > other.x && box.y < other.y + other.h && box.y + box.h > other.y) {
          return false;
        }
      }
      taken.push(box);
      placed += 1;
      collection.add({
        position,
        text: name,
        font: detail === "country"
          ? `${fontSize}px "Segoe UI", system-ui, sans-serif`
          : `${detail === "capital" || detail === "major" ? "600 " : ""}${fontSize}px "Segoe UI", system-ui, sans-serif`,
        fillColor: color,
        outlineColor: Cesium.Color.fromCssColorString("#04101c").withAlpha(0.92),
        outlineWidth: detail === "country" ? 4 : 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        showBackground: detail !== "country",
        backgroundColor: background,
        backgroundPadding: new Cesium.Cartesian2(6, 3),
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        pixelOffset: new Cesium.Cartesian2(0, detail === "country" ? 0 : -4),
        translucencyByDistance: new Cesium.NearFarScalar(2_000_000, 1, 20_000_000, 0.65),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });
      return true;
    };

    // 1. Pays à moyenne et haute altitude.
    if (height > 2_000_000) {
      const countries = bordersData.current.countries
        .filter((feature) => feature.name && feature.area > 0.25)
        .sort((a, b) => b.area - a.area)
        .slice(0, 60);
      for (const country of countries) {
        const fontSize = height > 10_000_000 ? 12 : 13;
        tryPlace(
          country.name.toLocaleUpperCase("fr"),
          country.anchor[1],
          country.anchor[0],
          fontSize,
          Cesium.Color.fromCssColorString("#dce9f5").withAlpha(0.82),
          Cesium.Color.TRANSPARENT,
          "country",
        );
        if (placed > 70) break;
      }
    }

    // 2. Villes du monde, par ordre d'importance.
    const budget = labelBudget(height);
    const places = selectVisiblePlaces(placesRef.current, height, budget);
    for (const place of places) {
      if (placed > budget + 70) break;
      const fontSize = labelFontSize(place, height);
      const isCapital = place.capital;
      const color = isCapital
        ? Cesium.Color.fromCssColorString("#ffffff")
        : Cesium.Color.fromCssColorString("#e8f4ff").withAlpha(0.94);
      tryPlace(
        displayPlaceName(place),
        place.lat,
        place.lon,
        fontSize,
        color,
        Cesium.Color.fromCssColorString("#06121e").withAlpha(isCapital ? 0.72 : 0.55),
        place.population >= 1_000_000 ? "major" : isCapital ? "capital" : "city",
      );
    }

    // 3. Régions (premier niveau administratif) en vue rapprochée.
    if (height < 1_500_000 && bordersData.current.admin1.length) {
      const view = viewBounds(v);
      const regions = selectBorders(height, view, { countries: [], admin1: bordersData.current.admin1 }, { admin1Limit: 90 }).admin1;
      for (const region of regions) {
        tryPlace(
          region.name,
          region.anchor[1],
          region.anchor[0],
          11,
          Cesium.Color.fromCssColorString("#bcd6ea").withAlpha(0.78),
          Cesium.Color.fromCssColorString("#06121e").withAlpha(0.4),
          "region",
        );
      }
    }

    v.scene.requestRender();
  }, []);
  useEffect(() => {
    rebuildLabelsRef.current = rebuildLabels;
  }, [rebuildLabels]);

  /** Frontières vectorielles : tracées au sol, nettes à tout zoom. */
  const rebuildBorders = useCallback(() => {
    const v = viewer.current;
    const source = bordersSource.current;
    if (!v || v.isDestroyed() || !source) return;
    const height = v.camera.positionCartographic.height;
    const selection = selectBorders(height, viewBounds(v), bordersData.current);
    source.entities.removeAll();
    const addFeature = (feature: GeoFeature, color: Cesium.Color, width: number) => {
      for (const ring of feature.rings) {
        if (ring.length < 3) continue;
        const positions: number[] = [];
        for (const [lon, lat] of ring) {
          positions.push(lon, lat);
        }
        source.entities.add({
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(positions),
            width,
            material: color,
            clampToGround: true,
          },
        });
      }
    };
    for (const country of selection.countries) {
      addFeature(country, Cesium.Color.fromCssColorString("#9fd8ff").withAlpha(0.55), 1.6);
    }
    for (const region of selection.admin1) {
      addFeature(region, Cesium.Color.fromCssColorString("#7fb3d5").withAlpha(0.32), 1);
    }
    source.show = layersRef.current.borders;
    v.scene.requestRender();
  }, []);
  useEffect(() => {
    rebuildBordersRef.current = rebuildBorders;
  }, [rebuildBorders]);

  // --- Radar mondial (RainViewer) ------------------------------------------------
  useEffect(() => {
    const v = viewer.current;
    if (!v || v.isDestroyed() || !layers.radar || radarProduct.current) return;
    let cancelled = false;
    void fetchRadarProduct().then((product) => {
      if (cancelled || v.isDestroyed()) return;
      if (!product) {
        setError("Le radar mondial est momentanément indisponible (réseau).");
        return;
      }
      // On charge un sous-ensemble régulier des images (8 maximum) : assez pour
      // une animation fluide sur deux heures, sans saturer le proxy de tuiles.
      const animated = product.frames.length <= 8
        ? product.frames
        : Array.from({ length: 8 }, (_, index) => product.frames[Math.round((index * (product.frames.length - 1)) / 7)]);
      const frames = animated.filter((frame, index, list) => list.findIndex((item) => item.index === frame.index) === index);
      radarProduct.current = { ...product, frames };
      const layers_ = frames.map((frame) => {
        const provider = new Cesium.UrlTemplateImageryProvider({
          url: radarTileUrlTemplate(frame.index),
          maximumLevel: 7,
          minimumLevel: 0,
          tileWidth: 256,
          tileHeight: 256,
          credit: new Cesium.Credit(RADAR_CREDIT_HTML),
        });
        const layer = v.imageryLayers.addImageryProvider(provider);
        // L'opacité du radar est recalculée à chaque mouvement de caméra :
        // forte à l'échelle mondiale, presque transparente au niveau des rues.
        layer.alpha = radarOpacityForHeight(v.camera.positionCartographic.height);
        layer.brightness = 1.15;
        layer.contrast = 1.05;
        layer.saturation = 1.15;
        layer.show = false;
        return layer;
      });
      radarLayers.current = layers_;
      radarIndex.current = -1;
      radarStartedAt.current = 0;
      setRadarReady(true);
      v.scene.requestRender();
    });
    return () => { cancelled = true; };
  }, [layers.radar]);

  // --- Position de l'utilisateur -------------------------------------------------
  useEffect(() => {
    const v = viewer.current;
    const source = userSource.current;
    if (!v || v.isDestroyed() || !source) return;
    source.entities.removeAll();
    if (!userPosition) {
      v.scene.requestRender();
      return;
    }
    const { lat, lon, accuracyM } = userPosition;
    source.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, 40),
      name: "Ma position",
      point: {
        pixelSize: 13,
        color: Cesium.Color.fromCssColorString("#37c6f4"),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2.5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: "Ma position",
        font: "600 13px system-ui, sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString("#06202f").withAlpha(0.82),
        pixelOffset: new Cesium.Cartesian2(0, -28),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      ellipse: accuracyM > 0 ? {
        semiMajorAxis: Math.min(accuracyM, 500_000),
        semiMinorAxis: Math.min(accuracyM, 500_000),
        material: Cesium.Color.fromCssColorString("#37c6f4").withAlpha(0.14),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString("#37c6f4").withAlpha(0.7),
        outlineWidth: 1.5,
        height: 0,
      } : undefined,
    });
    v.scene.requestRender();

    // Premier repérage : rapproche la caméra du pays de l'utilisateur.
    if (!autoCentered.current) {
      autoCentered.current = true;
      v.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, 900_000),
        duration: 2.2,
      });
    }
  }, [userPosition]);

  // --- Capteurs, alertes, météo --------------------------------------------------
  useEffect(() => {
    const v = viewer.current;
    if (!v || v.isDestroyed()) return;
    const sensors_ = sensorSource.current;
    const alerts_ = alertSource.current;
    const weather_ = weatherSource.current;
    if (!sensors_ || !alerts_ || !weather_) return;
    sensors_.entities.removeAll();
    alerts_.entities.removeAll();
    weather_.entities.removeAll();

    sensors.forEach((sensor) => {
      const isOnline = sensor.health_status === "online";
      const isFlood = isOnline && sensor.alert_level !== "green";
      const nearbyRain = weather.some(
        (item) => (item.observed_precip_mm_h ?? item.modeled_precip_mm_h ?? 0) > 0
          && Math.hypot(item.lat - sensor.lat, item.lon - sensor.lon) < 0.12,
      );
      const isCompound = isFlood && nearbyRain;
      sensors_.entities.add({
        position: Cesium.Cartesian3.fromDegrees(sensor.lon, sensor.lat, 35),
        name: isCompound ? `Pluie + Inondation — ${sensor.name}` : isFlood ? `Inondation — ${sensor.name}` : sensor.name,
        point: {
          pixelSize: isCompound ? 22 : isFlood ? 19 : 12,
          color: isCompound
            ? Cesium.Color.fromCssColorString("#ff1744")
            : isFlood
              ? Cesium.Color.fromCssColorString("#d32f2f")
              : Cesium.Color.fromCssColorString(LEVEL_COLOR[sensor.alert_level]),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: isCompound || isFlood ? 3 : 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5_000_000),
        },
        label: {
          text: isCompound ? `${sensor.name} · pluie + inondation` : sensor.name,
          font: isCompound || isFlood ? "bold 12px system-ui, sans-serif" : "11px system-ui, sans-serif",
          fillColor: isCompound ? Cesium.Color.fromCssColorString("#ff6b7a") : Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString("#06121e").withAlpha(0.7),
          pixelOffset: new Cesium.Cartesian2(0, -20),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 220_000),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: { pick: { kind: "sensor", item: sensor } },
      });
      if (isFlood) {
        sensors_.entities.add({
          position: Cesium.Cartesian3.fromDegrees(sensor.lon, sensor.lat, 70),
          name: `Inondation — ${sensor.name}`,
          billboard: {
            image: hazardSprite(isCompound ? "compound" : "flood"),
            width: 30,
            height: 30,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(2_000, 1.05, 600_000, 0.4),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 900_000),
          },
        });
        alerts_.entities.add({
          position: Cesium.Cartesian3.fromDegrees(sensor.lon, sensor.lat, 20),
          name: `${isCompound ? "Pluie + inondation" : "Alerte inondation"} — ${sensor.name}`,
          ellipse: {
            semiMajorAxis: 900,
            semiMinorAxis: 900,
            material: Cesium.Color.fromCssColorString(isCompound ? "#ff1744" : "#d32f2f").withAlpha(0.22),
            height: 0,
          },
        });
      }
    });

    weather.forEach((item) => {
      const rain = item.observed_precip_mm_h ?? item.modeled_precip_mm_h ?? 0;
      const isRain = rain > 0;
      const nearbyFlood = sensors.some(
        (sensor) => sensor.health_status === "online" && sensor.alert_level !== "green"
          && Math.hypot(sensor.lat - item.lat, sensor.lon - item.lon) < 0.12,
      );
      const isCompound = isRain && nearbyFlood;
      // Icône explicite dès qu'il pleut ou que la zone est inondée : le même
      // pictogramme qu'en 2D, lisible dans le monde entier.
      const hazard = hazardKind(isRain, nearbyFlood);
      weather_.entities.add({
        position: Cesium.Cartesian3.fromDegrees(item.lon, item.lat, 35),
        name: isCompound ? `Pluie + Inondation — ${item.name}` : isRain ? `Pluie — ${item.name}` : `Météo — ${item.name}`,
        point: hazard ? undefined : {
          pixelSize: 12,
          color: Cesium.Color.fromCssColorString(LEVEL_COLOR[item.level]).withAlpha(0.3),
          outlineColor: Cesium.Color.fromCssColorString(LEVEL_COLOR[item.level]),
          outlineWidth: 1.5,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 4_000_000),
        },
        billboard: hazard ? {
          image: hazardSprite(hazard),
          width: isCompound ? 38 : 32,
          height: isCompound ? 38 : 32,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(3_000, 1.1, 1_400_000, 0.45),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2_200_000),
        } : undefined,
        label: isRain ? {
          text: `${rain.toFixed(1)} mm/h`,
          font: "bold 11px system-ui, sans-serif",
          fillColor: Cesium.Color.fromCssColorString(isCompound ? "#ff1744" : "#ffb74d"),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -24),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 900_000),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        } : undefined,
        properties: { pick: { kind: "weather", item: item } },
      });
    });
    v.scene.requestRender();
  }, [sensors, weather]);

  // --- Zones pluvieuses : ellipse de remplissage + anneau vectoriel net --------
  useEffect(() => {
    const v = viewer.current;
    const source = rainSource.current;
    if (!v || v.isDestroyed() || !source) return;
    source.entities.removeAll();
    if (layers.rain) {
      rainZones.forEach((zone) => {
        const alpha = 0.08 + rainVisual(zone.intensity) * 0.14;
        source.entities.add({
          position: Cesium.Cartesian3.fromDegrees(zone.lon, zone.lat, 0),
          name: `Zone de pluie — ${zone.label}`,
          ellipse: {
            semiMajorAxis: zone.radiusM,
            semiMinorAxis: zone.radiusM,
            material: Cesium.Color.fromCssColorString("#7a1fb0").withAlpha(alpha),
            height: 0,
          },
        });
        // Halo extérieur : donne du relief au tracé sans le rendre flou.
        source.entities.add({
          name: `Halo de pluie — ${zone.label}`,
          polyline: {
            positions: circlePositions(zone.lon, zone.lat, zone.radiusM * 1.02),
            width: 8,
            material: Cesium.Color.fromCssColorString("#a24bff").withAlpha(0.16),
            clampToGround: true,
          },
        });
        // Limite nette : reste crisp à tous les zooms, contrairement à la
        // texture radar agrandie.
        source.entities.add({
          name: `Limite de pluie — ${zone.label}`,
          polyline: {
            positions: circlePositions(zone.lon, zone.lat, zone.radiusM, 160),
            width: 2.6,
            material: Cesium.Color.fromCssColorString("#d29bff").withAlpha(0.95),
            clampToGround: true,
          },
        });
      });
    }
    v.scene.requestRender();
  }, [rainZones, layers.rain]);

  // --- Inondation simulée --------------------------------------------------------
  useEffect(() => {
    const v = viewer.current;
    if (!v || v.isDestroyed()) return;
    let cancelled = false;
    const previous = floodPrimitive.current;
    if (previous) {
      v.scene.primitives.remove(previous);
      floodPrimitive.current = null;
    }
    if (!simulation || !layers.flood) {
      v.scene.requestRender();
      return () => { cancelled = true; };
    }
    void buildFloodPrimitive(simulation.result, frameIndex).then((primitive) => {
      if (cancelled || v.isDestroyed()) {
        if (primitive) v.scene.primitives.remove(primitive);
        return;
      }
      if (primitive) {
        primitive.show = layers.flood;
        floodPrimitive.current = v.scene.primitives.add(primitive);
      }
      if (cameraSimulationId.current !== simulation.result.id) {
        const { south, west, north, east } = simulation.result.bbox;
        const center = Cesium.Cartesian3.fromDegrees(simulation.result.center.lon, simulation.result.center.lat, 0);
        const radius = Math.max(
          simulation.input.radius_m ?? 1500,
          Cesium.Cartesian3.distance(center, Cesium.Cartesian3.fromDegrees(west, south, 0)),
          Cesium.Cartesian3.distance(center, Cesium.Cartesian3.fromDegrees(east, north, 0)),
        );
        v.camera.flyToBoundingSphere(new Cesium.BoundingSphere(center, radius), {
          offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-42), radius * 3.2),
          duration: 1.5,
        });
        cameraSimulationId.current = simulation.result.id;
      }
      v.scene.requestRender();
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Impossible d'afficher la simulation 3D.");
    });
    return () => { cancelled = true; };
  }, [simulation, frameIndex, layers.flood]);

  useEffect(() => {
    const v = viewer.current;
    if (!v || v.isDestroyed()) return;
    automaticFloodPrimitives.current.forEach((primitive) => v.scene.primitives.remove(primitive));
    automaticFloodPrimitives.current = [];
    if (!layers.flood || automaticFloods.length === 0) {
      v.scene.requestRender();
      return;
    }
    let cancelled = false;
    void Promise.all(automaticFloods.map((event) => buildFloodPrimitive(event.simulation.result, 0)))
      .then((primitives) => {
        if (cancelled || v.isDestroyed()) {
          primitives.forEach((primitive) => { if (primitive) v.scene.primitives.remove(primitive); });
          return;
        }
        automaticFloodPrimitives.current = primitives.filter(
          (primitive): primitive is Cesium.GroundPrimitive => primitive !== null,
        );
        automaticFloodPrimitives.current.forEach((primitive) => v.scene.primitives.add(primitive));
        v.scene.requestRender();
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Impossible d'afficher les impacts automatiques en 3D.");
      });
    return () => { cancelled = true; };
  }, [automaticFloods, layers.flood]);

  // --- Aléas réels : marqueurs mondiaux et mise en scène 3D ---------------------
  const eventFxRadiusKm = (event: HazardEvent): number => {
    const base: Record<HazardEvent["hazard"], number> = {
      earthquake: 48,
      tsunami: 110,
      volcano: 35,
      hurricane: 150,
      flood: 55,
      wildfire: 34,
      drought: 90,
      landslide: 26,
      sandstorm: 70,
      blizzard: 70,
      heatwave: 90,
      tornado: 32,
      storm: 60,
    };
    const factor = event.severity === "extreme" ? 1.35 : event.severity === "high" ? 1.1 : 0.85;
    return base[event.hazard] * factor;
  };

  useEffect(() => {
    const v = viewer.current;
    const source = hazardSource.current;
    if (!v || v.isDestroyed() || !source) return;
    source.entities.removeAll();
    for (const event of hazards) {
      const place = hazardPlaceMap?.get(event.id) ?? resolveHazardPlace(event, placesRef.current);
      const selected = selectedHazard?.id === event.id;
      source.entities.add({
        position: Cesium.Cartesian3.fromDegrees(event.lon, event.lat, 80),
        name: `${hazardLabel(event.hazard)} — ${place.label}`,
        billboard: {
          image: hazardSprite(event.hazard, event.severity),
          width: selected ? 46 : 34,
          height: selected ? 46 : 34,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          scaleByDistance: new Cesium.NearFarScalar(40_000, 1.12, 9_000_000, 0.62),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 14_000_000),
        },
        label: {
          text: place.label,
          font: selected ? "600 13px Inter, system-ui, sans-serif" : "11px Inter, system-ui, sans-serif",
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString("#06121e").withAlpha(0.74),
          backgroundPadding: new Cesium.Cartesian2(6, 3),
          pixelOffset: new Cesium.Cartesian2(0, -25),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, selected ? 4_000_000 : 1_900_000),
          disableDepthTestDistance: 120_000,
        },
        properties: { pick: { kind: "hazard", item: event } },
      });
    }
    v.scene.requestRender();
  }, [hazards, hazardPlaceMap, selectedHazard?.id]);

  useEffect(() => {
    const v = viewer.current;
    const source = hazardFxSource.current;
    if (!v || v.isDestroyed() || !source) return;
    const place = selectedHazard
      ? hazardPlaceMap?.get(selectedHazard.id) ?? resolveHazardPlace(selectedHazard, placesRef.current)
      : null;
    const spec = hazardSimulation
      ? {
          hazard: hazardSimulation.hazard,
          lat: hazardSimulation.center.lat,
          lon: hazardSimulation.center.lon,
          radiusKm: hazardSimulation.radius_km,
          label: hazardSimulation.center.name
            ? `${hazardSimulation.label} · ${hazardSimulation.center.name}`
            : `${hazardSimulation.label} · simulation`,
          severity: hazardSimulation.severity,
        }
      : selectedHazard
        ? {
            hazard: selectedHazard.hazard,
            lat: selectedHazard.lat,
            lon: selectedHazard.lon,
            radiusKm: eventFxRadiusKm(selectedHazard),
            label: `${hazardLabel(selectedHazard.hazard)} · ${place?.label ?? selectedHazard.title}`,
            severity: selectedHazard.severity,
          }
        : null;
    renderHazardFx(v, source, spec);
    hazardFxActive.current = Boolean(spec);
    // Le nettoyage libère les propriétés animées quand on quitte le globe.
    return () => {
      hazardFxActive.current = false;
    };
  }, [selectedHazard, hazardSimulation, hazardPlaceMap]);

  // --- Application des couches (interrupteurs et actions de l'assistant) --------
  useEffect(() => {
    const v = viewer.current;
    if (!v || v.isDestroyed()) return;
    if (sensorSource.current) sensorSource.current.show = layers.sensors;
    if (weatherSource.current) weatherSource.current.show = layers.weather;
    if (alertSource.current) alertSource.current.show = layers.alerts;
    if (bordersSource.current) bordersSource.current.show = layers.borders;
    if (rainSource.current) rainSource.current.show = layers.rain;
    if (hazardSource.current) hazardSource.current.show = layers.hazards;
    if (hazardFxSource.current) hazardFxSource.current.show = layers.hazards;
    if (nightImagery.current) {
      nightImagery.current.show = layers.night && cityLightsRelevant(
        v.camera.positionCartographic.height,
        v,
      );
    }
    // Jour/nuit : l'éclairage solaire de Cesium est activé à l'échelle mondiale
    // et s'efface près du sol. Désactiver la couche rend l'imagerie pleinement
    // éclairée, sans voile ni perte de netteté.
    v.scene.globe.enableLighting = layers.night;
    if (trafficBillboards.current) trafficBillboards.current.show = layers.traffic;
    if (vesselBillboards.current) vesselBillboards.current.show = layers.traffic;
    if (worldFlowBillboards.current) worldFlowBillboards.current.show = layers.traffic;
    if (!layers.traffic) {
      trafficKinds.current = [];
    }
    radarLayers.current.forEach((layer, index) => {
      layer.show = layers.radar && index === Math.max(0, radarIndex.current);
    });
    if (floodPrimitive.current) floodPrimitive.current.show = layers.flood;
    automaticFloodPrimitives.current.forEach((primitive) => { primitive.show = layers.flood; });
    if (layers.labels) {
      if (labelCollection.current && labelCollection.current.length === 0) rebuildLabelsRef.current();
    } else {
      labelCollection.current?.removeAll();
    }
    v.scene.requestRender();
  }, [layers]);

  // --- Navigation demandée (recherche, alertes, assistant) ---------------------
  useEffect(() => {
    targetActive.current = Boolean(flyToTarget);
    if (!flyToTarget) {
      handledTarget.current = null;
      return;
    }
    if (handledTarget.current === flyToTarget) return;
    const v = viewer.current;
    if (!v || v.isDestroyed()) return;
    handledTarget.current = flyToTarget;
    targetActive.current = true;
    v.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(flyToTarget.lon, flyToTarget.lat, flyToTarget.height ?? 30_000),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-42), roll: 0 },
      duration: 2.2,
    });
    const matchWeather = selectedHazard || hazardSimulation
      ? undefined
      : weather.find(
          (item) => Math.hypot(item.lat - flyToTarget.lat, item.lon - flyToTarget.lon) < 0.08,
        );
    if (matchWeather) {
      setPicked({ kind: "weather", item: matchWeather });
      setPanelOpen(true);
    }
  }, [flyToTarget, weather, selectedHazard, hazardSimulation]);

  /** Annule la localisation en cours et rend la caméra à l'utilisateur. */
  const cancelLocalisation = () => {
    targetActive.current = false;
    handledTarget.current = null;
    const v = viewer.current;
    if (v && !v.isDestroyed()) v.camera.cancelFlight();
    clearTargetRef.current?.();
  };

  const resetView = () => {
    setPicked(null);
    cancelLocalisation();
    const v = viewer.current;
    if (v && !v.isDestroyed()) {
      v.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(WORLD_VIEW.lon, WORLD_VIEW.lat, WORLD_VIEW.height),
        duration: 1.8,
      });
    }
  };

  const toggle = (layer: GlobeLayerKey) => () => onLayerChange?.(layer, !layers[layer]);
  const pickedHazard = picked?.kind === "hazard" ? picked.item : null;

  if (error && !viewer.current) return <div className="globe-error" role="alert">{error}</div>;
  return (
    <div className="globe-wrap">
      <div ref={host} className="globe" role="region" aria-label="Globe 3D mondial" />
      <aside className={`globe-panel${panelOpen ? " open" : ""}`}>
        <button type="button" className="globe-panel-toggle" aria-expanded={panelOpen} onClick={() => setPanelOpen((open) => !open)}>
          <span>Globe 3D · monde</span><span aria-hidden="true">{panelOpen ? "−" : "+"}</span>
        </button>
        {flyToTarget && (
          <button type="button" className="globe-panel-action" onClick={cancelLocalisation}>
            Annuler la localisation
          </button>
        )}
        {panelOpen && (
          <div className="globe-panel-content">
            <div className="globe-view-info">
              <strong>{viewInfo?.label ?? "Monde"}</strong>
              <small>
                {viewInfo ? `${viewInfo.phase} · altitude ${Math.round(viewInfo.heightKm).toLocaleString("fr-FR")} km` : "Chargement de la vue…"}
              </small>
            </div>

            <div className="globe-layer-grid" role="group" aria-label="Couches du globe">
              {([
                ["radar", "Radar mondial"],
                ["rain", "Pluie"],
                ["flood", "Inondation"],
                ["night", "Jour / nuit"],
                ["labels", "Noms"],
                ["borders", "Frontières"],
                ["traffic", "Circulation"],
                ["aircraft", "Avions"],
                ["sensors", "Capteurs"],
                ["weather", "Météo"],
                ["alerts", "Alertes"],
                ["hazards", "Aléas"],
              ] as Array<[GlobeLayerKey, string]>).map(([key, label]) => (
                <label key={key} className={`globe-layer-chip${layers[key] ? " on" : ""}`}>
                  <input type="checkbox" checked={layers[key]} onChange={toggle(key)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            {layers.radar && (
              <div className="globe-radar-info">
                <span className={`radar-dot${radarReady ? " on" : ""}`} aria-hidden="true" />
                <span>Radar global {radarReady ? "· " + (radarFrame || "chargement") : "· connexion…"}</span>
                <span className="radar-legend" aria-hidden="true" />
              </div>
            )}
            {layers.radar && (
              <small className="globe-radar-credit">
                <a href="https://www.rainviewer.com/" target="_blank" rel="noopener noreferrer">Weather data by RainViewer</a>
                {" "}· images radar, pas une mesure de débit.
              </small>
            )}
            {layers.hazards && (
              <div className="globe-radar-info">
                <span className={`radar-dot${hazards.length > 0 ? " on" : ""}`} aria-hidden="true" />
                <span>
                  {hazards.length > 0
                    ? `${hazards.length.toLocaleString("fr-FR")} aléas réels publiés · cliquez un pictogramme`
                    : "Aléas · aucune publication reçue pour le moment"}
                </span>
              </div>
            )}
            {layers.traffic && (
              <>
                <div className="globe-radar-info">
                  <span className={`radar-dot${roadsState.status === "ready" ? " on" : ""}`} aria-hidden="true" />
                  <span>
                    {roadsState.status === "ready"
                      ? `Circulation · ${roadsState.roads.length.toLocaleString("fr-FR")} voie(s), véhicules animés en continu`
                      : roadsState.status === "loading"
                        ? "Circulation · chargement du tracé OpenStreetMap…"
                        : roadsState.status === "paused"
                          ? "Circulation · zoomez sur une ville pour l'afficher"
                          : roadsState.status === "unavailable"
                            ? (roadsState.error ?? "Réseau routier indisponible")
                            : "Circulation · en attente de la vue"}
                  </span>
                </div>
                <small className="globe-radar-credit">
                  <a href={roadsState.attributionUrl} target="_blank" rel="noopener noreferrer">{roadsState.attribution}</a>
                  {" "}· {roadsState.license} · tracé réel, déplacement modélisé (ce n'est pas une observation de trafic).
                  {roadsState.degraded ? " Tracé repris d'une vue voisine." : ""}
                </small>
                {roadsState.status === "unavailable" && (
                  <button type="button" className="ghost" onClick={roadsState.retry}>Réessayer le réseau routier</button>
                )}
              </>
            )}
            {layers.aircraft && (
              <>
                <div className="globe-radar-info">
                  <span className={`radar-dot${aircraftState.status === "ready" ? " on" : ""}`} aria-hidden="true" />
                  <span>
                    {aircraftState.status === "ready"
                      ? aircraftState.aircraft.length > MAX_3D_AIRCRAFT
                        ? `${MAX_3D_AIRCRAFT} affichés sur ${aircraftState.aircraft.length} observations${useGlobalFeed ? " mondiales" : ""} · positions interpolées`
                        : `${aircraftState.aircraft.length} avion(s)${useGlobalFeed ? " · échantillon mondial" : ""} · positions interpolées entre observations`
                      : aircraftState.status === "loading"
                        ? "Trafic aérien · connexion à OpenSky…"
                        : aircraftState.status === "paused"
                          ? "Trafic aérien · zoomez pour interroger OpenSky"
                          : aircraftState.status === "unavailable"
                            ? "Trafic aérien indisponible"
                            : "Trafic aérien · en attente de la vue"}
                  </span>
                </div>
                {aircraftState.status === "unavailable" ? (
                  <button type="button" className="ghost" onClick={aircraftState.retry}>Réessayer le trafic aérien</button>
                ) : (
                  <small className="globe-radar-credit">
                    <a href={aircraftState.attributionUrl} target="_blank" rel="noopener noreferrer">{aircraftState.attribution}</a>
                    {" "}· {aircraftState.license || "CC BY-NC 4.0"} · aucune position de véhicule routier en direct.
                    {aircraftState.degraded ? " Données en cache, possiblement anciennes." : ""}
                  </small>
                )}
              </>
            )}

            <strong>Données actuelles · mesures et modèle</strong>
            {pickedHazard ? (
              <div className="globe-hazard-info">
                {(() => {
                  const place = hazardPlaceMap?.get(pickedHazard.id)
                    ?? resolveHazardPlace(pickedHazard, placesRef.current);
                  return (
                    <>
                      <strong>
                        {hazardLabel(pickedHazard.hazard)} · {place.label}
                      </strong>
                      <small>
                        {pickedHazard.severity_label} · publié le{" "}
                        {new Date(pickedHazard.time).toLocaleString("fr-FR")} ·{" "}
                        {pickedHazard.attribution}
                      </small>
                      {place.approximate && (
                        <small>Lieu non publié : ville réelle la plus proche (GeoNames).</small>
                      )}
                      {pickedHazard.metrics.length > 0 && (
                        <ul>
                          {pickedHazard.metrics.slice(0, 6).map((metric) => (
                            <li key={`${metric.key}-${metric.label}`}>
                              <span>{metric.label}</span>
                              <b>{metricValueLabel(metric)}</b>
                            </li>
                          ))}
                        </ul>
                      )}
                      {pickedHazard.url && (
                        <a href={pickedHazard.url} target="_blank" rel="noopener noreferrer">
                          Bulletin source
                        </a>
                      )}
                      <small className="warn">
                        Le volume 3D localise l'aléa ; il ne délimite pas une zone de dommages officielle.
                      </small>
                    </>
                  );
                })()}
              </div>
            ) : (
              <>
                <small>{real.label}</small>
                <small>
                  {real.rainLabel ?? "Pluie actuelle indisponible"} : {real.rain.toFixed(1)} mm/h · Prévision max. à 3 h :{" "}
                  {real.forecast.toFixed(1)} mm/h · Niveau mesuré : {real.flood.toFixed(2)} m
                </small>
              </>
            )}
            {hazardSimulation && (
              <div className="globe-hazard-sim">
                <strong>
                  Simulation indicative · {hazardSimulation.label} · {hazardSimulation.severity_label}
                </strong>
                <small>
                  {hazardSimulation.center.name
                    ? `${hazardSimulation.center.name} · `
                    : ""}
                  rayon {hazardSimulation.radius_km.toLocaleString("fr-FR")} km · modèle {hazardSimulation.model}
                </small>
                <ul>
                  {hazardSimulation.metrics.slice(0, 6).map((metric) => (
                    <li key={`${metric.key}-${metric.label}`}>
                      <span>{metric.label}</span>
                      <b>{metricValueLabel(metric)}</b>
                    </li>
                  ))}
                </ul>
                <small className="warn">{hazardSimulation.disclaimer}</small>
              </div>
            )}
            {simulation && <small className="warn">La couche colorée provient du calcul MNT de la zone sélectionnée.</small>}
            {automaticFloods.length > 0 && (
              <small className="warn">
                {automaticFloods.length} emprise(s) automatique(s) estimée(s) depuis des mesures ou estimations météo récentes;
                aucune ne confirme à elle seule une inondation terrain.
              </small>
            )}
            {automaticFloods.map((event) => (
              <small key={event.id}>
                {event.name} · {event.source} · {new Date(event.observed_at).toLocaleString("fr-FR")} · max.{" "}
                {event.simulation.result.stats.max_depth_m.toFixed(2)} m ·{" "}
                {event.simulation.result.stats.area_km2.toFixed(3)} km² ·{" "}
                {event.simulation.result.stats.volume_m3.toLocaleString("fr-FR")} m³
              </small>
            ))}

            {userPosition && (
              <div className="globe-user-location">
                <strong>Ma position</strong>
                <small>
                  {formatCoordinates(userPosition.lat, userPosition.lon)} · {formatAccuracy(userPosition.accuracyM)} ·{" "}
                  {dayPhaseLabel(userPosition.lat, userPosition.lon)}
                </small>
                <button type="button" className="ghost" onClick={onLocate}>Recentrer sur moi</button>
              </div>
            )}

            <label className="globe-basemap">
              <span>Fond de carte</span>
              <select value={basemap} onChange={(event) => setBasemap(event.target.value as Basemap)} aria-label="Fond de carte">
                <option value="esri">Satellite (Esri)</option>
                <option value="osm">Plan OpenStreetMap</option>
                <option value="nasa">Satellite NASA</option>
              </select>
            </label>
            <small>
              {placeCount > 0
                ? `${placeCount.toLocaleString("fr-FR")} lieux mondiaux disponibles (GeoNames) · frontières Natural Earth.`
                : "Chargement des noms de lieux mondiaux…"}
            </small>
            <button className="ghost" onClick={resetView}>Vue monde</button>
            {worldWeatherAttribution && <small>{worldWeatherAttribution}</small>}
            {error && <p className="globe-error" role="alert">{error}</p>}
          </div>
        )}
      </aside>
    </div>
  );
}
