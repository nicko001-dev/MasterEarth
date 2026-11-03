/**
 * Globe 3D IntelliFlood (CesiumJS) : capteurs, risque pluie, pluie 3D et inondation illustrative.
 * Globe CesiumJS avec fond satellite sans clé; voir l'audit du monde 3D IntelliFlood.
 */
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { LEVEL_COLOR } from "../dashboard/SensorMap";
import { SensorState, WeatherItem } from "../services/api";
import { AutomaticFloodEvent, FloodRun } from "../services/simulation";
import { buildFloodPrimitive } from "./flood";
import { buildRainPrimitive } from "./flood";
import { STORM_FRAGMENT, altitudeFade, rainVisual } from "./rain";

(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = "/cesium/";
const ION = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined;
const CI = { lon: -5.55, lat: 7.54, height: 1_300_000 };
const CLOUD_BASE_HEIGHT = 760;
type Basemap = "esri" | "osm" | "nasa";
type Pick = { kind: "sensor"; item: SensorState } | { kind: "weather"; item: WeatherItem };
type CurrentRain = { intensity: number; label: string };
type RainZone = { lon: number; lat: number; radiusM: number; intensity: number; label: string };
const PLACE_LABELS = [
  { name: "Abidjan", lon: -4.01, lat: 5.36, neighborhood: false },
  { name: "Yamoussoukro", lon: -5.28, lat: 6.83, neighborhood: false },
  { name: "Bouaké", lon: -5.03, lat: 7.69, neighborhood: false },
  { name: "San-Pédro", lon: -6.64, lat: 4.75, neighborhood: false },
  { name: "Korhogo", lon: -5.63, lat: 9.46, neighborhood: false },
  { name: "Daloa", lon: -6.45, lat: 6.88, neighborhood: false },
  { name: "Man", lon: -7.55, lat: 7.41, neighborhood: false },
  { name: "Cocody", lon: -3.985, lat: 5.359, neighborhood: true },
  { name: "Plateau", lon: -4.02, lat: 5.32, neighborhood: true },
  { name: "Yopougon", lon: -4.09, lat: 5.35, neighborhood: true },
  { name: "Abobo", lon: -4.02, lat: 5.42, neighborhood: true },
  { name: "Marcory", lon: -3.98, lat: 5.29, neighborhood: true },
  { name: "Treichville", lon: -4.01, lat: 5.29, neighborhood: true },
  { name: "Bingerville", lon: -3.89, lat: 5.36, neighborhood: true },
  { name: "Adjamé", lon: -4.05, lat: 5.38, neighborhood: true },
  { name: "Port-Bouët", lon: -4.12, lat: 5.40, neighborhood: true },
  { name: "Anyama", lon: -4.62, lat: 5.43, neighborhood: true },
  { name: "Brobo", lon: -5.12, lat: 6.45, neighborhood: true },
  { name: "Oumé", lon: -7.22, lat: 6.98, neighborhood: true },
  { name: "Dimbokro", lon: -5.68, lat: 6.45, neighborhood: true },
  // Enrichissement zones Abidjan & environs
  { name: "Koumassi", lon: -3.96, lat: 5.30, neighborhood: true },
  { name: "Attécoubé", lon: -4.04, lat: 5.37, neighborhood: true },
  { name: "Songon", lon: -4.25, lat: 5.32, neighborhood: true },
  { name: "Anyama", lon: -4.62, lat: 5.43, neighborhood: true },
  { name: "Grand-Bassam", lon: -3.72, lat: 5.21, neighborhood: false },
  { name: "Jacqueville", lon: -4.38, lat: 5.23, neighborhood: false },
  { name: "Agboville", lon: -4.21, lat: 5.65, neighborhood: false },
  { name: "Divo", lon: -6.35, lat: 5.34, neighborhood: false },
  { name: "Gagnoa", lon: -6.38, lat: 5.84, neighborhood: false },
  { name: "Soubré", lon: -6.75, lat: 5.08, neighborhood: false },
  { name: "Boundiali", lon: -5.45, lat: 10.12, neighborhood: false },
  { name: "Odienné", lon: -7.56, lat: 9.48, neighborhood: false },
  { name: "Ferkessédougou", lon: -5.12, lat: 10.15, neighborhood: false },
  { name: "Bondoukou", lon: -2.82, lat: 8.04, neighborhood: false },
  { name: "Abengourou", lon: -3.01, lat: 6.73, neighborhood: false },
  { name: "Agnibilékrou", lon: -3.12, lat: 7.35, neighborhood: false },
  { name: "Toumodi", lon: -5.21, lat: 6.55, neighborhood: false },
  { name: "Daoukro", lon: -4.35, lat: 7.12, neighborhood: false },
  { name: "Katiola", lon: -5.15, lat: 8.18, neighborhood: false },
];

function makeBasemap(kind: Basemap): Cesium.ImageryProvider | Promise<Cesium.ImageryProvider> {
  if (kind === "osm") return new Cesium.UrlTemplateImageryProvider({ url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", maximumLevel: 19, credit: "© contributeurs OpenStreetMap" });
  if (kind === "nasa") return new Cesium.UrlTemplateImageryProvider({
    url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg",
    maximumLevel: 9, credit: "NASA GIBS / VIIRS (image du jour)" });
  return Cesium.ArcGisMapServerImageryProvider.fromUrl("https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer", { enablePickFeatures: false });
}

function rainScreenPosition(viewer: Cesium.Viewer, position: Cesium.Cartesian3 | null): Cesium.Cartesian2 {
  if (!position || viewer.isDestroyed()) return new Cesium.Cartesian2(-2, -2);
  const screen = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, position);
  if (!screen) return new Cesium.Cartesian2(-2, -2);
  return new Cesium.Cartesian2(screen.x / Math.max(1, viewer.canvas.clientWidth), 1 - screen.y / Math.max(1, viewer.canvas.clientHeight));
}

/**
 * Rayon écran (en fraction de la hauteur) d'un cercle de `radiusM` mètres
 * autour de `center`. Le rayon est ensuite réutilisé par le rideau de pluie
 * pour rester fidèle au diamètre réel de la zone pluvieuse.
 */
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

/**
 * Demi-largeur et hauteur écran du cumulonimbus (en fraction de la hauteur du
 * canvas). Le nuage garde une taille plausible par rapport au rideau de pluie
 * tout en restant borné pour ne jamais masquer toute la zone inondée.
 */
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

export default function GlobeView({
  sensors,
  weather,
  simulation,
  automaticFloods = [],
  frameIndex = 0,
}: {
  sensors: SensorState[];
  weather: WeatherItem[];
  simulation?: FloodRun | null;
  automaticFloods?: AutomaticFloodEvent[];
  frameIndex?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Cesium.Viewer | null>(null);
  const floodPrimitive = useRef<Cesium.GroundPrimitive | null>(null);
  const automaticFloodPrimitives = useRef<Cesium.GroundPrimitive[]>([]);
  const rainPrimitives = useRef<Cesium.GroundPrimitive[]>([]);
  const cameraSimulationId = useRef<number | null>(null);
  const centered = useRef(false);
  const rainRef = useRef(0);
  const rainPosition = useRef<Cesium.Cartesian3 | null>(null);
  const rainGround = useRef<Cesium.Cartesian3 | null>(null);
  const rainRadiusM = useRef(1500);
  const animationFrame = useRef<number | null>(null);
  const scheduleAnimation = useRef<() => void>(() => {});
  const [basemap, setBasemap] = useState<Basemap>("esri");
  const [picked, setPicked] = useState<Pick | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [rainOn, setRainOn] = useState(true);
  const [floodOn, setFloodOn] = useState(true);
  const [error, setError] = useState("");

  const real = useMemo(() => {
    if (!picked) return {
      rain: 0,
      rainLabel: "Sélectionnez un point pour afficher la pluie actuelle",
      forecast: 0,
      flood: 0,
      label: "Sélectionnez un capteur ou un point météo sur le globe.",
    };
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
    const near = weather.reduce<WeatherItem | null>((b, w) => (!b || Math.hypot(w.lat - picked.item.lat, w.lon - picked.item.lon) < Math.hypot(b.lat - picked.item.lat, b.lon - picked.item.lon) ? w : b), null);
    const rain = currentRain(near);
    return {
      rain: rain.intensity,
      rainLabel: rain.label,
      forecast: near?.forecast_intensity_3h_mm_h ?? near?.intensity_3h_mm_h ?? 0,
      flood: (picked.item.water_level_cm ?? 0) / 100,
      label: `${picked.item.name}${near ? ` — météo : ${near.name}` : ""}`,
    };
  }, [picked, weather]);
  // Zones pluvieuses : la simulation est prioritaire, sinon les points météo
  // (ou le point sélectionné) alimentent les nuages et le rideau de pluie.
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
      .slice(0, 4)
      .map((item) => ({
        lon: item.lon,
        lat: item.lat,
        radiusM: 2600,
        intensity: item.observed_precip_mm_h ?? item.modeled_precip_mm_h ?? 0,
        label: item.name,
      }));
    if (rainy.length) return rainy;
    if (!picked) return [];
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
    () => primaryZone
      ? Cesium.Cartesian3.fromDegrees(primaryZone.lon, primaryZone.lat, CLOUD_BASE_HEIGHT)
      : null,
    [primaryZone],
  );
  const rainGroundPoint = useMemo(
    () => primaryZone ? Cesium.Cartesian3.fromDegrees(primaryZone.lon, primaryZone.lat, 0) : null,
    [primaryZone],
  );

  useEffect(() => {
    rainRef.current = rainOn ? rainVisual(primaryZone?.intensity ?? 0) : 0;
    rainRadiusM.current = primaryZone?.radiusM ?? 1500;
    rainPosition.current = rainPoint;
    rainGround.current = rainGroundPoint;
    const v = viewer.current;
    if (v && !v.isDestroyed()) {
      v.scene.requestRender();
      scheduleAnimation.current();
    }
  }, [primaryZone, rainOn, rainPoint, rainGroundPoint]);

  // Création unique du viewer
  useEffect(() => {
    if (!host.current) return;
    let v: Cesium.Viewer;
    try {
      if (ION) Cesium.Ion.defaultAccessToken = ION;
      v = new Cesium.Viewer(host.current, {
        baseLayer: false, baseLayerPicker: false, geocoder: false, homeButton: false, animation: false, timeline: false,
        fullscreenButton: false, navigationHelpButton: false, infoBox: false, selectionIndicator: false, sceneModePicker: true,
        requestRenderMode: true,
      });
    } catch (e) { setError("WebGL indisponible sur cet appareil : le globe 3D ne peut pas s'afficher. Utilisez la carte 2D."); return; }
    viewer.current = v;
    if (import.meta.env.DEV) (window as unknown as { __ifViewer?: Cesium.Viewer }).__ifViewer = v;
    v.scene.maximumRenderTimeChange = Number.POSITIVE_INFINITY;
    if (ION) void Cesium.createWorldTerrainAsync().then((t) => {
      if (!v.isDestroyed()) {
        v.terrainProvider = t;
        v.scene.requestRender();
      }
    }).catch(() => setError("Le relief 3D est indisponible; le globe utilisera son ellipsoïde."));
    v.scene.globe.enableLighting = false;
    v.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(CI.lon, CI.lat, CI.height) });

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
    // Animation de la pluie limitée à ~30 images/s : le rendu continu à 60 fps
    // n'apporte rien visuellement et coûte cher sur batterie.
    const animate = () => {
      if (animationFrame.current !== null || v.isDestroyed()) return;
      let lastFrame = 0;
      const tick = (now: number) => {
        animationFrame.current = null;
        if (v.isDestroyed()) return;
        const center = rainScreenPosition(v, rainPosition.current);
        const rainVisible = center.x >= 0 && center.x <= 1 && center.y >= 0 && center.y <= 1;
        const rainAnimating = rainRef.current > 0 && rainVisible && altitudeFade(v.camera.positionCartographic.height) > 0;
        if (rainAnimating) {
          animationFrame.current = requestAnimationFrame(tick);
          if (now - lastFrame >= 32) {
            lastFrame = now;
            v.scene.requestRender();
          }
        }
      };
      animationFrame.current = requestAnimationFrame(tick);
    };
    scheduleAnimation.current = animate;
    const onCameraChanged = () => {
      v.scene.requestRender();
      animate();
    };
    v.camera.changed.addEventListener(onCameraChanged);
    const handler = new Cesium.ScreenSpaceEventHandler(v.canvas);
    handler.setInputAction((m: { position: Cesium.Cartesian2 }) => {
      const obj = v.scene.pick(m.position);
      const data = obj?.id?.properties?.pick?.getValue?.();
      if (data) setPicked(data as Pick);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    v.scene.requestRender();
    return () => {
      handler.destroy();
      v.camera.changed.removeEventListener(onCameraChanged);
      if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
      scheduleAnimation.current = () => {};
      if (!v.isDestroyed()) v.destroy();
      viewer.current = null;
      // StrictMode recrée le viewer en développement : réautoriser le cadrage.
      centered.current = false;
      cameraSimulationId.current = null;
      automaticFloodPrimitives.current = [];
    };
  }, []);

  // Cadrage initial : dès que des capteurs ou des points météo sont connus,
  // rapprocher la caméra de la zone surveillée plutôt que de laisser le globe
  // sur une vue continentale.
  useEffect(() => {
    const v = viewer.current;
    if (!v || v.isDestroyed() || centered.current) return;
    const focus = sensors[0] ?? weather[0];
    if (!focus) return;
    centered.current = true;
    v.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(focus.lon, focus.lat - 0.052, 5000),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-35), roll: 0 },
      duration: 1.8,
    });
  }, [sensors, weather]);

  // Une simulation terminée recadre le globe sur sa zone et son rayon.
  useEffect(() => {
    const v = viewer.current;
    if (!v || v.isDestroyed() || !simulation) return;
    if (cameraSimulationId.current === simulation.result.id) return;
    cameraSimulationId.current = simulation.result.id;
    const height = Math.max(2600, (simulation.input.radius_m ?? 1500) * 3);
    const latitudeOffset = height / Math.tan(Cesium.Math.toRadians(38)) / 111_320;
    v.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        simulation.result.center.lon,
        simulation.result.center.lat - latitudeOffset,
        height,
      ),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-38), roll: 0 },
      duration: 1.6,
    });
  }, [simulation]);

  // Fond de carte. Si les tuiles du fournisseur échouent en masse (réseau ou
  // service indisponible), on bascule automatiquement sur OpenStreetMap pour
  // ne jamais laisser un globe noir à l'écran.
  useEffect(() => {
    const v = viewer.current; if (!v) return;
    let cancelled = false;
    let detach = () => {};
    Promise.resolve(makeBasemap(basemap)).then((p) => {
      if (cancelled || v.isDestroyed()) return;
      v.imageryLayers.removeAll(); v.imageryLayers.addImageryProvider(p);
      setError("");
      let failures = 0;
      const onTileError = () => {
        failures += 1;
        if (failures < 8 || cancelled || v.isDestroyed() || basemap === "osm") return;
        detach();
        setBasemap("osm");
        setError("Fond satellite indisponible (réseau) : bascule automatique sur le plan OpenStreetMap.");
      };
      if (p.errorEvent) {
        const remove = p.errorEvent.addEventListener(onTileError);
        detach = () => { if (typeof remove === "function") remove(); };
      }
      if (basemap !== "osm") {
        return Cesium.ArcGisMapServerImageryProvider.fromUrl(
          "https://services.arcgisonline.com/ArcGIS/rest/services/World_Boundaries_and_Places/MapServer",
          { enablePickFeatures: false },
        ).then((labels) => {
          if (cancelled || v.isDestroyed()) return;
          const labelLayer = v.imageryLayers.addImageryProvider(labels);
          labelLayer.alpha = 0.95;
          v.scene.requestRender();
        }).catch(() => {
          if (!cancelled) setError("Le fond est chargé, mais les noms de lieux Esri sont indisponibles.");
        });
      }
      v.scene.requestRender();
      return undefined;
    }).catch(() => {
      if (!cancelled) setError("Fond de carte indisponible (réseau). Essayez un autre fond.");
    });
    return () => { cancelled = true; detach(); };
  }, [basemap]);

  // Entités : capteurs (disques), points météo (anneaux)
  useEffect(() => {
    const v = viewer.current; if (!v || v.isDestroyed()) return;
    v.entities.removeAll();
    PLACE_LABELS.forEach((place) => v.entities.add({
      position: Cesium.Cartesian3.fromDegrees(place.lon, place.lat, 40),
      name: place.name,
      label: {
        text: place.name,
        font: place.neighborhood ? "12px sans-serif" : "15px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString("#06111c").withAlpha(0.65),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, place.neighborhood ? 60_000 : 8_000_000),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    }));
    sensors.forEach((s) => v.entities.add({
      position: Cesium.Cartesian3.fromDegrees(s.lon, s.lat, 30), name: s.name,
      point: { pixelSize: 15, color: Cesium.Color.fromCssColorString(LEVEL_COLOR[s.alert_level]), outlineColor: Cesium.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: { text: s.name, font: "13px sans-serif", pixelOffset: new Cesium.Cartesian2(0, -24), fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 300_000), disableDepthTestDistance: Number.POSITIVE_INFINITY },
      properties: { pick: { kind: "sensor", item: s } },
    }));
    weather.forEach((w) => v.entities.add({
      position: Cesium.Cartesian3.fromDegrees(w.lon, w.lat, 30), name: `Pluie — ${w.name}`,
      point: { pixelSize: 22, color: Cesium.Color.fromCssColorString(LEVEL_COLOR[w.level]).withAlpha(0.28), outlineColor: Cesium.Color.fromCssColorString(LEVEL_COLOR[w.level]), outlineWidth: 4, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      properties: { pick: { kind: "weather", item: w } },
    }));
    v.scene.requestRender();
  }, [sensors, weather]);

  // Simulation rasterisée sur la zone demandée; les mesures réelles restent des points d'observation.
  useEffect(() => {
    const v = viewer.current; if (!v || v.isDestroyed()) return;
    let cancelled = false;
    const previous = floodPrimitive.current;
    if (previous) {
      v.scene.primitives.remove(previous);
      floodPrimitive.current = null;
    }
    if (!simulation || !floodOn) {
      v.scene.requestRender();
      return () => { cancelled = true; };
    }
    void buildFloodPrimitive(simulation.result, frameIndex).then((primitive) => {
      if (cancelled || v.isDestroyed()) {
        if (primitive) v.scene.primitives.remove(primitive);
        return;
      }
      if (primitive) {
        primitive.show = floodOn;
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
  }, [simulation, frameIndex, floodOn]);

  useEffect(() => {
    const v = viewer.current;
    if (!v || v.isDestroyed()) return;
    automaticFloodPrimitives.current.forEach((primitive) => v.scene.primitives.remove(primitive));
    automaticFloodPrimitives.current = [];
    if (!floodOn || automaticFloods.length === 0) {
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
  }, [automaticFloods, floodOn]);

  // Emprises pluvieuses au sol : délimitation violette précise de chaque zone où il pleut.
  useEffect(() => {
    const v = viewer.current;
    if (!v || v.isDestroyed()) return;
    rainPrimitives.current.forEach((primitive) => v.scene.primitives.remove(primitive));
    rainPrimitives.current = [];
    if (!rainOn || rainZones.length === 0) {
      v.scene.requestRender();
      return;
    }
    let cancelled = false;
    void Promise.all(rainZones.map((zone) => buildRainPrimitive({
      lon: zone.lon,
      lat: zone.lat,
      radiusM: zone.radiusM,
      intensity: rainVisual(zone.intensity),
    })))
      .then((primitives) => {
        if (cancelled || v.isDestroyed()) {
          primitives.forEach((primitive) => { if (primitive) v.scene.primitives.remove(primitive); });
          return;
        }
        rainPrimitives.current = primitives.filter(
          (primitive): primitive is Cesium.GroundPrimitive => primitive !== null,
        );
        rainPrimitives.current.forEach((primitive) => v.scene.primitives.add(primitive));
        v.scene.requestRender();
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Impossible d'afficher les zones de pluie.");
      });
    return () => { cancelled = true; };
  }, [rainZones, rainOn]);

  useEffect(() => {
    const v = viewer.current;
    if (!v || !simulation || !picked) return;
    v.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(picked.item.lon, picked.item.lat, 1800),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-30), roll: 0 },
      duration: 1.5,
    });
  }, [picked, simulation]);

  if (error && !viewer.current) return <div className="globe-error" role="alert">{error}</div>;
  return (
    <div className="globe-wrap">
      <div ref={host} className="globe" role="region" aria-label="Globe 3D" />
      <aside className={`globe-panel${panelOpen ? " open" : ""}`}>
        <button type="button" className="globe-panel-toggle" aria-expanded={panelOpen} onClick={() => setPanelOpen((open) => !open)}>
          <span>Globe 3D · informations</span><span aria-hidden="true">{panelOpen ? "−" : "+"}</span>
        </button>
        {panelOpen && <div className="globe-panel-content">
          <strong>Données actuelles · mesures et modèle</strong>
          <small>{real.label}</small>
          <small>{real.rainLabel ?? "Pluie actuelle indisponible"} : {real.rain.toFixed(1)} mm/h · Prévision max. à 3 h : {real.forecast.toFixed(1)} mm/h · Niveau mesuré : {real.flood.toFixed(2)} m</small>
          {simulation && <small className="warn">La couche colorée provient du calcul MNT de la zone sélectionnée.</small>}
          {automaticFloods.length > 0 && <small className="warn">{automaticFloods.length} emprise(s) automatique(s) estimée(s) depuis des mesures ou estimations météo récentes; aucune ne confirme à elle seule une inondation terrain.</small>}
          {automaticFloods.map((event) => (
            <small key={event.id}>
              {event.name} · {event.source} · {new Date(event.observed_at).toLocaleString("fr-FR")} ·
              max. {event.simulation.result.stats.max_depth_m.toFixed(2)} m ·
              {event.simulation.result.stats.area_km2.toFixed(3)} km² ·
              {event.simulation.result.stats.volume_m3.toLocaleString("fr-FR")} m³
            </small>
          ))}
          {automaticFloods.some((event) => event.simulation.input.mode === "rain") && <small className="warn">Le calcul pluie utilise des seuils et un modèle de ruissellement provisoires.</small>}
          <label className="chk"><input type="checkbox" checked={rainOn} onChange={(event) => setRainOn(event.target.checked)} />Pluie actuelle rapportée (hors prévisions)</label>
          <label className="chk"><input type="checkbox" checked={floodOn} onChange={(event) => setFloodOn(event.target.checked)} />Afficher l'inondation simulée</label>
          <select value={basemap} onChange={(event) => setBasemap(event.target.value as Basemap)} aria-label="Fond de carte">
            <option value="osm">Plan OpenStreetMap · noms selon le zoom</option><option value="esri">Satellite + noms (Esri) · par défaut</option><option value="nasa">Satellite NASA + noms Esri</option>
          </select>
          <small>La couverture des villes et quartiers dépend des données cartographiques disponibles et de la connexion réseau.</small>
          <button className="ghost" onClick={() => { setPicked(null); viewer.current?.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(CI.lon, CI.lat, CI.height), duration: 2 }); }}>Vue Côte d'Ivoire</button>
          {error && <p className="globe-error" role="alert">{error}</p>}
        </div>}
      </aside>
    </div>
  );
}
