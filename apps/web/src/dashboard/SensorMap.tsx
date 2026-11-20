import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { SensorState, WeatherItem } from "../services/api";
import { AutomaticFloodEvent, createFloodCanvas, FloodRun } from "../services/simulation";
import {
  HAZARD_META,
  HazardEvent,
  HazardSimulation,
  ResolvedHazardPlace,
  hazardColor,
  resolveHazardPlace,
  sortHazards,
} from "../services/hazards";
import { hazardSprite } from "../globe/hazardIcons";
import {
  buildSeaTraffic,
  buildTraffic,
  buildWorldFlow,
  seaTrafficVisibility,
  TRAFFIC_COLORS,
  trafficVisibility,
  worldFlowVisibility,
} from "../globe/traffic";
import { useLiveRoads } from "./useLiveRoads";
import { LEVEL_COLOR } from "../services/levels";
import { formatAccuracy, formatCoordinates, UserPosition } from "../services/geolocation";
import {
  displayPlaceName,
  labelBudget,
  Place,
  populationFloor,
} from "../globe/places";
import {
  Bounds,
  countryLabelAnchors,
  decimateRing,
  GeoFeature,
  loadAdmin1,
  loadCountries,
  selectBorders,
} from "../globe/borders";
import {
  fetchRadarProduct,
  radarFrameIndexAt,
  radarFrameLabel,
  radarOpacityForHeight,
  radarTileUrlTemplate,
  RADAR_ATTRIBUTION,
  RadarProduct,
} from "../globe/radar";
import {
  createNightOverlayCanvas,
  NIGHT_OVERLAY_MAX_LATITUDE,
  nightOverlayOpacity,
  nightOverlayVisible,
} from "../services/nightOverlay";
import { useLiveAircraft } from "./useLiveAircraft";
import { useGlobalAircraft } from "./useGlobalAircraft";
import {
  Aircraft,
  aircraftDescription,
  aircraftIconSvg,
  aircraftLabel,
  extrapolateAircraft,
} from "../services/liveAircraft";

export { LEVEL_COLOR } from "../services/levels";

/** Vue par défaut : le monde entier, la plateforme n'étant plus limitée à un pays. */
const WORLD_VIEW: L.LatLngExpression = [20, 0];
const WORLD_ZOOM = 2;
/** En dessous de ces zooms, les couches denses sont masquées pour rester lisibles. */
const WEATHER_MIN_ZOOM = 2;
const HAZARD_MIN_ZOOM = 3;
const AIRCRAFT_MIN_ZOOM = 5;
const MAX_2D_AIRCRAFT = 280;
const RADAR_FRAME_MS = 620;

/** Hauteur de caméra approximative équivalente à un zoom Leaflet. */
export function heightForZoom(zoom: number): number {
  return 40_000_000 / 2 ** Math.max(0, zoom);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function viewBounds(map: L.Map): Bounds {
  const bounds = map.getBounds();
  return {
    west: bounds.getWest(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    north: bounds.getNorth(),
  };
}

/** Un anneau qui traverse l'antiméridien est ignoré en 2D (cas de l'Antarctique). */
function drawableRing(ring: [number, number][]): boolean {
  for (let index = 1; index < ring.length; index += 1) {
    if (Math.abs(ring[index][0] - ring[index - 1][0]) > 180) return false;
  }
  return true;
}

/**
 * Le voile couvre l'emprise mondiale : au zoom 12 son `<img>` mesure plus d'un
 * million de pixels et sortait le fond de carte du pipeline de composition.
 * On le retire complètement de l'affichage aux échelles rapprochées ; la nuit
 * ne doit jamais décider de la lisibilité des rues ou des bâtiments.
 */
function applyNightOverlayVisibility(layer: L.ImageOverlay | null, zoom: number): void {
  if (!layer) return;
  const visible = nightOverlayVisible(zoom);
  const element = layer.getElement();
  if (element) element.style.display = visible ? "" : "none";
  layer.setOpacity(visible ? nightOverlayOpacity(zoom) : 0);
}

export type MapHandle = {
  setView: (center: [number, number], zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitSensors: () => void;
};

type BaseLayer = "osm" | "esri" | "nasa";

const TILE_LAYERS: Record<BaseLayer, () => L.TileLayer> = {
  osm: () => L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© contributeurs OpenStreetMap",
    updateWhenZooming: false,
    keepBuffer: 2,
  }),
  esri: () => L.tileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: "© Esri, DigitalGlobe, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN",
    updateWhenZooming: false,
    keepBuffer: 2,
  }),
  nasa: () => L.tileLayer("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg", {
    maxZoom: 9,
    attribution: "NASA GIBS / VIIRS (image du jour)",
    updateWhenZooming: false,
    keepBuffer: 2,
  }),
};

/** Carte des capteurs : fond OSM/Esri/NASA, marqueurs d'alerte et couche de simulation. */
export function SensorMap({
  sensors,
  weather = [],
  onSelect,
  simulation,
  automaticFloods = [],
  frameIndex = 0,
  baseLayer = "osm",
  showSensors = true,
  showWeather = true,
  showAlerts = true,
  mapRef,
  userPosition = null,
  onBoundsChange,
  places = [],
  showRadar = false,
  showLabels = false,
  showBorders = false,
  showNight = false,
  showAircraft = false,
  showTraffic = false,
  hazards = [],
  hazardPlaceMap,
  selectedHazardId = null,
  onHazardSelect,
  showHazards = true,
  hazardSimulation = null,
}: {
  sensors: SensorState[];
  weather?: WeatherItem[];
  onSelect?: (code: string) => void;
  simulation?: FloodRun | null;
  automaticFloods?: AutomaticFloodEvent[];
  frameIndex?: number;
  baseLayer?: BaseLayer;
  showSensors?: boolean;
  showWeather?: boolean;
  showAlerts?: boolean;
  mapRef?: React.RefObject<MapHandle | null>;
  userPosition?: UserPosition | null;
  onBoundsChange?: (bounds: { west: number; south: number; east: number; north: number }) => void;
  places?: Place[];
  showRadar?: boolean;
  showLabels?: boolean;
  showBorders?: boolean;
  showNight?: boolean;
  showAircraft?: boolean;
  showTraffic?: boolean;
  hazards?: HazardEvent[];
  hazardPlaceMap?: ReadonlyMap<string, ResolvedHazardPlace>;
  selectedHazardId?: string | null;
  onHazardSelect?: (event: HazardEvent) => void;
  showHazards?: boolean;
  hazardSimulation?: HazardSimulation | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const sensorLayer = useRef<L.LayerGroup | null>(null);
  const weatherLayer = useRef<L.LayerGroup | null>(null);
  const alertLayer = useRef<L.LayerGroup | null>(null);
  const userLayer = useRef<L.LayerGroup | null>(null);
  const labelLayer = useRef<L.LayerGroup | null>(null);
  const borderLayer = useRef<L.LayerGroup | null>(null);
  const aircraftLayer = useRef<L.LayerGroup | null>(null);
  const trafficLayer = useRef<L.LayerGroup | null>(null);
  const hazardLayer = useRef<L.LayerGroup | null>(null);
  const hazardSimulationLayer = useRef<L.LayerGroup | null>(null);
  const fittedHazardSimulation = useRef<string | null>(null);
  const radarLayer = useRef<L.TileLayer | null>(null);
  const nightLayer = useRef<L.ImageOverlay | null>(null);
  const baseTile = useRef<L.TileLayer | null>(null);
  const simulationOverlay = useRef<L.ImageOverlay | null>(null);
  const automaticOverlay = useRef<L.LayerGroup | null>(null);
  const sensorsRef = useRef<SensorState[]>(sensors);
  sensorsRef.current = sensors;
  const placesRef = useRef<Place[]>(places);
  placesRef.current = places;
  const boundsCallback = useRef(onBoundsChange);
  boundsCallback.current = onBoundsChange;
  const fittedSimulation = useRef<number | null>(null);
  const labelsRef = useRef<() => void>(() => {});
  const bordersRef = useRef<() => void>(() => {});
  const countriesData = useRef<GeoFeature[]>([]);
  const admin1Data = useRef<GeoFeature[]>([]);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(2);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  // Réseau routier de la vue : tracé réel, mouvement modélisé côté client.
  const roadsState = useLiveRoads(bounds, {
    enabled: showTraffic,
    cameraHeightM: heightForZoom(zoom),
  });
  const [bordersReady, setBordersReady] = useState(0);
  const [radarProduct, setRadarProduct] = useState<RadarProduct | null>(null);
  const [radarStatus, setRadarStatus] = useState("");
  // En vue mondiale, l'endpoint régional refuse l'emprise : on bascule sur le
  // flux mondial afin que des avions réels restent visibles dès l'ouverture.
  const wideZoom = zoom < AIRCRAFT_MIN_ZOOM;
  const localAircraftState = useLiveAircraft(bounds, {
    enabled: showAircraft && !wideZoom,
  });
  const globalAircraftState = useGlobalAircraft({ enabled: showAircraft && wideZoom });
  const aircraftState = wideZoom ? globalAircraftState : localAircraftState;

  useEffect(() => {
    if (!el.current || map.current) return;
    const instance = L.map(el.current, {
      zoomControl: false,
      preferCanvas: true,
      fadeAnimation: false,
      attributionControl: true,
      worldCopyJump: true,
    }).setView(WORLD_VIEW, WORLD_ZOOM);
    map.current = instance;
    if (mapRef) {
      mapRef.current = {
        setView: (center, zoom) => instance.setView(center, zoom),
        zoomIn: () => instance.zoomIn(),
        zoomOut: () => instance.zoomOut(),
        fitSensors: () => {
          const points = sensorsRef.current;
          if (!points.length) {
            instance.setView(WORLD_VIEW, WORLD_ZOOM);
            return;
          }
          instance.fitBounds(
            L.latLngBounds(points.map((sensor) => [sensor.lat, sensor.lon] as [number, number])).pad(0.3),
            { maxZoom: 14 },
          );
        },
      };
    }

    baseTile.current = TILE_LAYERS[baseLayer]().addTo(instance);
    sensorLayer.current = L.layerGroup().addTo(instance);
    weatherLayer.current = L.layerGroup().addTo(instance);
    alertLayer.current = L.layerGroup().addTo(instance);
    userLayer.current = L.layerGroup().addTo(instance);
    borderLayer.current = L.layerGroup().addTo(instance);
    labelLayer.current = L.layerGroup().addTo(instance);
    aircraftLayer.current = L.layerGroup().addTo(instance);
    trafficLayer.current = L.layerGroup().addTo(instance);
    hazardLayer.current = L.layerGroup().addTo(instance);
    hazardSimulationLayer.current = L.layerGroup().addTo(instance);
    automaticOverlay.current = L.layerGroup().addTo(instance);

    // Emprise visible : alimente la couverture météo mondiale et le trafic
    // aérien à la demande.
    const reportBounds = () => {
      const next = viewBounds(instance);
      setBounds(next);
      boundsCallback.current?.(next);
    };
    const reportView = () => {
      const next = viewBounds(instance);
      setBounds(next);
      boundsCallback.current?.(next);
      labelsRef.current();
      bordersRef.current();
    };
    instance.on("moveend", reportView);
    instance.on("zoomend", () => {
      setZoom(instance.getZoom());
      // Certains changements de zoom programmatiques ne déclenchent pas
      // `moveend` : on rafraîchit aussi l'emprise ici pour l'air et la météo.
      reportBounds();
      labelsRef.current();
      bordersRef.current();
    });
    reportBounds();

    return () => {
      instance.off("moveend", reportView);
      instance.remove();
      map.current = null;
      baseTile.current = null;
      sensorLayer.current = null;
      weatherLayer.current = null;
      alertLayer.current = null;
      userLayer.current = null;
      labelLayer.current = null;
      borderLayer.current = null;
      aircraftLayer.current = null;
      trafficLayer.current = null;
      hazardLayer.current = null;
      hazardSimulationLayer.current = null;
      radarLayer.current = null;
      nightLayer.current = null;
      automaticOverlay.current = null;
    };
    // The map is created once; props are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Délimitations mondiales (Natural Earth), chargées une seule fois -------
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      loadCountries().catch(() => [] as GeoFeature[]),
      loadAdmin1().catch(() => [] as GeoFeature[]),
    ]).then(([countries, admin1]) => {
      if (cancelled) return;
      countriesData.current = countries;
      admin1Data.current = admin1;
      setBordersReady((value) => value + 1);
    });
    return () => { cancelled = true; };
  }, []);

  /** Libellés vectoriels : pays de loin, villes et régions de près. */
  const renderLabels = useCallback(() => {
    const currentMap = map.current;
    const layer = labelLayer.current;
    if (!currentMap || !layer) return;
    layer.clearLayers();
    if (!showLabels) return;

    const currentZoom = currentMap.getZoom();
    const height = heightForZoom(currentZoom);
    const view = viewBounds(currentMap);
    const width = currentMap.getSize().x;
    const heightPx = currentMap.getSize().y;
    const taken: Array<{ x: number; y: number; w: number; h: number }> = [];

    const addLabel = (name: string, lat: number, lon: number, kind: "country" | "capital" | "city" | "region") => {
      if (lat < view.south || lat > view.north || lon < view.west || lon > view.east) return false;
      const point = currentMap.latLngToContainerPoint([lat, lon]);
      if (point.x < 8 || point.y < 8 || point.x > width - 8 || point.y > heightPx - 8) return false;
      const fontSize = kind === "country" ? 11 : kind === "capital" ? 13 : 12;
      const boxWidth = name.length * fontSize * 0.56 + 10;
      const boxHeight = fontSize * 1.5;
      const box = { x: point.x - boxWidth / 2, y: point.y - boxHeight / 2, w: boxWidth, h: boxHeight };
      for (const other of taken) {
        if (box.x < other.x + other.w && box.x + box.w > other.x && box.y < other.y + other.h && box.y + box.h > other.y) {
          return false;
        }
      }
      taken.push(box);
      L.marker([lat, lon], {
        icon: L.divIcon({
          className: `map-place-label ${kind}`,
          html: `<span>${escapeHtml(kind === "country" ? name.toLocaleUpperCase("fr") : name)}</span>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
        interactive: false,
        keyboard: false,
        zIndexOffset: kind === "country" ? 300 : 350,
      }).addTo(layer);
      return true;
    };

    if (currentZoom <= 4 && countriesData.current.length) {
      const countries = countryLabelAnchors(countriesData.current)
        .filter((feature) => feature.area > 0.25)
        .sort((a, b) => b.area - a.area)
        .slice(0, 55);
      for (const country of countries) {
        addLabel(country.name, country.anchor[1], country.anchor[0], "country");
      }
    }

    const floor = populationFloor(height);
    const budget = Math.min(150, labelBudget(height));
    const visible = placesRef.current
      .filter((place) => place.lat >= view.south && place.lat <= view.north && place.lon >= view.west && place.lon <= view.east)
      .filter((place) => place.capital || place.population >= floor)
      .sort((a, b) => {
        if (a.capital !== b.capital) return a.capital ? -1 : 1;
        return b.population - a.population;
      })
      .slice(0, budget);
    for (const place of visible) {
      addLabel(displayPlaceName(place), place.lat, place.lon, place.capital ? "capital" : "city");
    }
  }, [showLabels]);

  /** Frontières vectorielles : nettes et filtrées sur l'emprise visible. */
  const renderBorders = useCallback(() => {
    const currentMap = map.current;
    const layer = borderLayer.current;
    if (!currentMap || !layer) return;
    layer.clearLayers();
    if (!showBorders) return;
    const height = heightForZoom(currentMap.getZoom());
    const selection = selectBorders(height, viewBounds(currentMap), {
      countries: countriesData.current,
      admin1: admin1Data.current,
    });
    const addFeatures = (features: GeoFeature[], color: string, weight: number, maxPoints: number) => {
      for (const feature of features) {
        for (const ring of feature.rings) {
          if (!drawableRing(ring)) continue;
          const latlngs = decimateRing(ring, maxPoints).map(([lon, lat]) => [lat, lon] as [number, number]);
          if (latlngs.length < 3) continue;
          L.polyline(latlngs, {
            color,
            weight,
            opacity: weight > 1 ? 0.58 : 0.34,
            interactive: false,
            lineCap: "round",
          }).addTo(layer);
        }
      }
    };
    addFeatures(selection.countries, "#9fd8ff", 1.1, 240);
    addFeatures(selection.admin1, "#7fb3d5", 0.7, 160);
  }, [showBorders]);

  useEffect(() => { labelsRef.current = renderLabels; }, [renderLabels]);
  useEffect(() => { bordersRef.current = renderBorders; }, [renderBorders]);
  useEffect(() => {
    labelsRef.current();
    bordersRef.current();
  }, [places, zoom, bounds, bordersReady, showLabels, showBorders]);

  useEffect(() => {
    if (!map.current || !sensorLayer.current || !weatherLayer.current || !alertLayer.current) return;
    sensorLayer.current.clearLayers();
    weatherLayer.current.clearLayers();
    alertLayer.current.clearLayers();
    // La météo est rendue uniquement par points, icônes et radar réel : rien
    // ne recouvre les rues ni le relief.
    // Traitement des alertes capteurs et météo selon les 3 catégories demandées :
    // 1. Simple pluie -> icône orange
    // 2. Inondation -> icône rouge fixe
    // 3. Pluie + Inondation -> icône rouge clignotante
    sensors.forEach((sensor) => {
      const currentMeasurement = sensor.health_status === "online";
      const color = currentMeasurement ? LEVEL_COLOR[sensor.alert_level] : "#7f91a6";
      L.circleMarker([sensor.lat, sensor.lon], {
        radius: 9,
        color: "#ffffff",
        weight: 2,
        fillColor: color,
        fillOpacity: 0.96,
      })
        .bindTooltip(sensor.kind === "rain_gauge"
          ? `${sensor.name} — pluviomètre`
          : `${sensor.name} — ${sensor.water_level_cm == null ? "pas de mesure" : `${sensor.water_level_cm.toFixed(0)} cm`}${currentMeasurement ? "" : " — mesure non actuelle"}`)
        .on("click", () => onSelect?.(sensor.code))
        .addTo(sensorLayer.current!);

      if (currentMeasurement && sensor.alert_level !== "green") {
        const nearbyRain = weather.find(
          (w) => (w.observed_precip_mm_h ?? w.modeled_precip_mm_h ?? 0) > 0 && Math.hypot(w.lat - sensor.lat, w.lon - sensor.lon) < 0.12,
        );
        const isCompound = Boolean(nearbyRain);
        L.marker([sensor.lat, sensor.lon], {
          icon: L.divIcon({
            className: `hazard-map-icon ${isCompound ? "compound-hazard" : "flood-hazard"}`,
            html: `<span aria-hidden="true">${isCompound ? "⛈️" : "🌊"}</span>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          }),
          title: isCompound
            ? `🚨 Pluie + Inondation — ${sensor.name} (${nearbyRain?.name})`
            : `Alerte inondation — ${sensor.name}`,
          keyboard: true,
          zIndexOffset: 1200,
        }).addTo(alertLayer.current!);
      }
    });

    weather.forEach((item) => {
      const observed = item.observed_precip_mm_h;
      const modeled = item.modeled_precip_mm_h;
      const forecast = item.forecast_intensity_3h_mm_h ?? item.intensity_3h_mm_h;
      const level = item.observed_level ?? item.forecast_level ?? item.level;
      const currentRainVal = observed ?? modeled ?? 0;
      const isRaining = currentRainVal > 0;

      // Les points météo restent visibles dès la vue mondiale, mais sous une
      // forme discrète pour ne pas masquer les frontières et les villes.
      if (zoom < WEATHER_MIN_ZOOM) return;
      const worldView = zoom < 4;

      // Zone violette au sol pour les points où il pleut actuellement.
      // Elle n'apparaît qu'à partir d'un zoom régional, où elle est lisible.
      if (isRaining && zoom >= 4) {
        L.circle([item.lat, item.lon], {
          radius: 2600,
          color: "#7700aa",
          weight: 2,
          fillColor: "#7700aa",
          fillOpacity: 0.15,
          dashArray: "6 4",
          interactive: false,
        }).addTo(weatherLayer.current!);
      }

      L.circleMarker([item.lat, item.lon], {
        radius: worldView ? 6 : 17,
        color: LEVEL_COLOR[level],
        weight: worldView ? 1.2 : 2,
        dashArray: worldView ? undefined : "4 5",
        fillColor: LEVEL_COLOR[level],
        fillOpacity: worldView ? 0.05 : 0.08,
      })
        .bindTooltip(
          `${item.name} — ${
            observed != null
              ? `${observed} mm/h rapportés`
              : modeled != null
                ? `${modeled} mm/h estimés maintenant par Open-Meteo`
                : "aucune pluie actuelle rapportée"
          } ; prévision max. à 3 h : ${forecast} mm/h`,
        )
        .addTo(weatherLayer.current!);

      if ((isRaining || forecast >= 10 || level !== "green") && zoom >= HAZARD_MIN_ZOOM) {
        const nearbyFloodSensor = sensors.find(
          (s) => s.health_status === "online" && s.alert_level !== "green" && Math.hypot(s.lat - item.lat, s.lon - item.lon) < 0.12,
        );
        const nearbyAutoFlood = automaticFloods.find(
          (f) => Math.hypot(f.simulation.result.center.lat - item.lat, f.simulation.result.center.lon - item.lon) < 0.12,
        );
        const hasFlood = Boolean(nearbyFloodSensor || nearbyAutoFlood);

        // Classification demandée :
        // - Pluie seule -> Icône orange (rain-simple)
        // - Pluie + inondation -> Icône rouge clignotante (compound-hazard)
        const hazardClass = hasFlood ? "compound-hazard" : "rain-simple";
        const glyph = hasFlood ? "⛈️" : "🌧️";
        const titleText = hasFlood
          ? `🚨 PLUIE + INONDATION — ${item.name} (${currentRainVal.toFixed(1)} mm/h + Inondation active)`
          : `Zone de pluie — ${item.name} (${currentRainVal.toFixed(1)} mm/h)`;

        L.marker([item.lat, item.lon], {
          icon: L.divIcon({
            className: `hazard-map-icon ${hazardClass}`,
            html: `<span aria-hidden="true">${glyph}</span>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          }),
          title: titleText,
          keyboard: true,
          zIndexOffset: hasFlood ? 1100 : 900,
        }).addTo(alertLayer.current!);
      }
    });
  }, [sensors, weather, onSelect, zoom]);

  // Position de l'utilisateur : marqueur pulsé et cercle de précision.
  // Ce calque n'existe que si la localisation a été explicitement autorisée.
  useEffect(() => {
    const layer = userLayer.current;
    if (!layer) return;
    layer.clearLayers();
    if (!userPosition) return;
    const { lat, lon, accuracyM } = userPosition;
    if (accuracyM > 0) {
      L.circle([lat, lon], {
        radius: Math.min(accuracyM, 500_000),
        color: "#37c6f4",
        weight: 1,
        opacity: 0.75,
        fillColor: "#37c6f4",
        fillOpacity: 0.1,
        interactive: false,
      }).addTo(layer);
    }
    L.marker([lat, lon], {
      icon: L.divIcon({
        className: "user-location-marker",
        html: '<span class="user-location-pulse" aria-hidden="true"></span><span class="user-location-dot" aria-hidden="true"></span>',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      }),
      title: `Ma position — ${formatCoordinates(lat, lon)} · ${formatAccuracy(accuracyM)}`,
      keyboard: true,
      zIndexOffset: 2000,
    })
      .bindTooltip(`Ma position · ${formatAccuracy(accuracyM)}`, { permanent: false, direction: "top" })
      .addTo(layer);
  }, [userPosition]);

  // --- Radar mondial animé (RainViewer, via le proxy IntelliFlood) ------------
  useEffect(() => {
    if (!showRadar || radarProduct) return;
    let cancelled = false;
    void fetchRadarProduct().then((product) => {
      if (cancelled) return;
      if (product) setRadarProduct(product);
      else setRadarStatus("indisponible");
    });
    return () => { cancelled = true; };
  }, [showRadar, radarProduct]);

  useEffect(() => {
    const currentMap = map.current;
    if (!currentMap) return;
    if (radarLayer.current) {
      currentMap.removeLayer(radarLayer.current);
      radarLayer.current = null;
    }
    if (!showRadar || !radarProduct) {
      setRadarStatus("");
      return;
    }
    const frames = radarProduct.frames;
    let index = 0;
    const layer = L.tileLayer(radarTileUrlTemplate(frames[0].index), {
      opacity: radarOpacityForHeight(heightForZoom(currentMap.getZoom())),
      maxNativeZoom: 7,
      maxZoom: 19,
      tileSize: 256,
      updateWhenZooming: false,
      keepBuffer: 2,
      attribution: RADAR_ATTRIBUTION,
      zIndex: 250,
    }).addTo(currentMap);
    radarLayer.current = layer;
    setRadarStatus(radarFrameLabel(frames[0].time));
    const started = Date.now();
    const timer = window.setInterval(() => {
      const next = radarFrameIndexAt(Date.now() - started, frames.length, RADAR_FRAME_MS);
      if (next === index) return;
      index = next;
      layer.setUrl(radarTileUrlTemplate(frames[index].index));
      setRadarStatus(radarFrameLabel(frames[index].time));
    }, RADAR_FRAME_MS);
    return () => {
      window.clearInterval(timer);
      if (map.current && radarLayer.current === layer) {
        currentMap.removeLayer(layer);
        radarLayer.current = null;
      }
    };
  }, [showRadar, radarProduct]);

  // Le radar s'efface progressivement quand on descend vers le sol : les
  // tuiles RainViewer sont moins détaillées que le fond de carte et ne doivent
  // pas masquer les rues, bâtiments ou libellés.
  useEffect(() => {
    if (!showRadar) return;
    radarLayer.current?.setOpacity(radarOpacityForHeight(heightForZoom(zoom)));
  }, [showRadar, zoom]);

  // --- Voile jour/nuit calculé (terminateur solaire) --------------------------
  useEffect(() => {
    const currentMap = map.current;
    if (!currentMap) return;
    const removeOverlay = () => {
      if (map.current && nightLayer.current) {
        currentMap.removeLayer(nightLayer.current);
        nightLayer.current = null;
      }
    };
    if (!showNight) {
      removeOverlay();
      return;
    }
    const draw = () => {
      const canvas = createNightOverlayCanvas(720, 360);
      if (!canvas) return;
      const url = canvas.toDataURL();
      if (nightLayer.current) {
        nightLayer.current.setUrl(url);
        applyNightOverlayVisibility(nightLayer.current, currentMap.getZoom());
        return;
      }
      nightLayer.current = L.imageOverlay(url, [
        [-NIGHT_OVERLAY_MAX_LATITUDE, -180],
        [NIGHT_OVERLAY_MAX_LATITUDE, 180],
      ], {
        opacity: nightOverlayOpacity(currentMap.getZoom()),
        interactive: false,
        zIndex: 240,
        className: "night-shade-overlay",
      }).addTo(currentMap);
      applyNightOverlayVisibility(nightLayer.current, currentMap.getZoom());
    };
    draw();
    const timer = window.setInterval(draw, 120_000);
    return () => {
      window.clearInterval(timer);
      removeOverlay();
    };
  }, [showNight]);

  // Le voile nocturne s'allège puis disparaît à mesure qu'on zoome : la nuit
  // reste lisible à l'échelle mondiale sans jamais masquer rues ni bâtiments.
  useEffect(() => {
    if (!showNight) return;
    applyNightOverlayVisibility(nightLayer.current, zoom);
  }, [showNight, zoom]);

  // --- Trafic aérien : positions observées, prolongées entre deux mesures -----
  useEffect(() => {
    const layer = aircraftLayer.current;
    if (!layer) return;
    layer.clearLayers();
    if (!showAircraft) return;

    const markers: Array<{ marker: L.Marker; aircraft: Aircraft }> = [];
    const icon = aircraftIconSvg();
    for (const item of aircraftState.aircraft.slice(0, MAX_2D_AIRCRAFT)) {
      const marker = L.marker([item.lat, item.lon], {
        icon: L.divIcon({
          className: "aircraft-map-icon",
          html: `<span class="aircraft-glyph" style="transform:rotate(${item.headingDeg ?? 0}deg)"><img src="${icon}" alt=""></span>${zoom >= 7 && item.callsign ? `<span class="aircraft-callsign">${escapeHtml(aircraftLabel(item))}</span>` : ""}`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
        title: aircraftDescription(item),
        keyboard: false,
        zIndexOffset: 1200,
      })
        .bindTooltip(escapeHtml(aircraftDescription(item)), { direction: "top", offset: [0, -10] })
        .addTo(layer);
      markers.push({ marker, aircraft: item });
    }
    if (!markers.length) return;
    // Extrapolation continue (≈ 20 images/s) : les observations OpenSky sont
    // espacées, mais l'avion ne doit jamais sembler figé entre deux requêtes.
    let frame = 0;
    let last = 0;
    const tick = (time: number) => {
      frame = window.requestAnimationFrame(tick);
      if (time - last < 50) return;
      last = time;
      const now = Date.now() + aircraftState.clockOffsetMs;
      for (const { marker, aircraft } of markers) {
        const position = extrapolateAircraft(aircraft, now);
        marker.setLatLng([position.lat, position.lon]);
      }
    };
    tick(performance.now());
    return () => window.cancelAnimationFrame(frame);
  }, [showAircraft, zoom, aircraftState.aircraft, aircraftState.clockOffsetMs]);

  // --- Circulation animée : véhicules sur rues réelles et navires ------------
  useEffect(() => {
    const layer = trafficLayer.current;
    if (!layer) return;
    layer.clearLayers();
    if (!showTraffic) return;

    const height = heightForZoom(zoom);
    const roadVisibility = trafficVisibility(height);
    const seaVisibility = seaTrafficVisibility(height);
    const flowVisibility = worldFlowVisibility(height);
    const budget = zoom >= 14 ? 320 : zoom >= 11 ? 220 : 120;

    const vehicles: Array<{ marker: L.CircleMarker; kind: string }> = [];
    const vessels: L.CircleMarker[] = [];
    const flowMarkers: Array<{ marker: L.CircleMarker; kind: string }> = [];

    const sync = () => {
      const now = Date.now();
      const cars = roadVisibility > 0.05 ? buildTraffic(roadsState.roads, now, { budget }) : [];
      while (vehicles.length > cars.length) {
        const entry = vehicles.pop();
        if (entry) layer.removeLayer(entry.marker);
      }
      while (vehicles.length < cars.length) {
        const marker = L.circleMarker([0, 0], {
          radius: 2.4,
          stroke: false,
          fillColor: TRAFFIC_COLORS.car,
          fillOpacity: 0.95,
          interactive: false,
        }).addTo(layer);
        vehicles.push({ marker, kind: "" });
      }
      cars.forEach((car, index) => {
        const entry = vehicles[index];
        entry.marker.setLatLng([car.lat, car.lon]);
        if (entry.kind !== car.kind) {
          entry.marker.setStyle({ fillColor: TRAFFIC_COLORS[car.kind] });
          entry.kind = car.kind;
        }
      });

      const boats = seaVisibility > 0.05 ? buildSeaTraffic(now, 120) : [];
      while (vessels.length > boats.length) {
        const marker = vessels.pop();
        if (marker) layer.removeLayer(marker);
      }
      while (vessels.length < boats.length) {
        vessels.push(
          L.circleMarker([0, 0], {
            radius: 3,
            stroke: false,
            fillColor: "#4dd0e1",
            fillOpacity: 0.95,
            interactive: false,
          }).addTo(layer),
        );
      }
      boats.forEach((boat, index) => vessels[index].setLatLng([boat.lat, boat.lon]));

      // Vue mondiale : flux modélisés entre métropoles réelles, afin que la
      // carte 2D reste animée elle aussi à l'ouverture (zoom < 5).
      const flow = flowVisibility > 0.05 ? buildWorldFlow(now, 200) : [];
      while (flowMarkers.length > flow.length) {
        const entry = flowMarkers.pop();
        if (entry) layer.removeLayer(entry.marker);
      }
      while (flowMarkers.length < flow.length) {
        const marker = L.circleMarker([0, 0], {
          radius: 2.2,
          stroke: false,
          fillColor: TRAFFIC_COLORS.car,
          fillOpacity: 0.9,
          interactive: false,
        }).addTo(layer);
        flowMarkers.push({ marker, kind: "" });
      }
      flow.forEach((point, index) => {
        const entry = flowMarkers[index];
        entry.marker.setLatLng([point.lat, point.lon]);
        if (entry.kind !== point.kind) {
          entry.marker.setStyle({ fillColor: TRAFFIC_COLORS[point.kind] });
          entry.kind = point.kind;
        }
      });
    };

    sync();
    // Temps réel : toutes les positions sont recalculées à chaque image utile.
    // requestAnimationFrame suit le rafraîchissement de l'écran et se met
    // automatiquement en pause dans un onglet masqué, sans requête réseau.
    let frame = 0;
    let last = 0;
    const tick = (time: number) => {
      frame = window.requestAnimationFrame(tick);
      if (time - last < 33) return;
      last = time;
      sync();
    };
    tick(performance.now());
    return () => {
      window.cancelAnimationFrame(frame);
      layer.clearLayers();
    };
  }, [showTraffic, zoom, roadsState.roads]);

  useEffect(() => {
    const currentMap = map.current;
    if (!currentMap) return;
    simulationOverlay.current?.remove();
    simulationOverlay.current = null;
    setSimulationError(null);
    if (!simulation) {
      fittedSimulation.current = null;
      return;
    }
    try {
      const { result } = simulation;
      const canvas = createFloodCanvas(result, frameIndex, true, 4);
      simulationOverlay.current = L.imageOverlay(canvas.toDataURL(), [
        [result.bbox.south, result.bbox.west],
        [result.bbox.north, result.bbox.east],
      ], { opacity: 0.88, interactive: false, className: "flood-overlay" }).addTo(currentMap);
      if (fittedSimulation.current !== result.id) {
        currentMap.fitBounds(simulationOverlay.current.getBounds(), { maxZoom: 15, padding: [28, 28] });
        fittedSimulation.current = result.id;
      }
    } catch (reason) {
      setSimulationError(reason instanceof Error ? reason.message : "Impossible d'afficher la simulation sur la carte 2D.");
    }
    return () => {
      simulationOverlay.current?.remove();
      simulationOverlay.current = null;
    };
  }, [simulation, frameIndex]);

  useEffect(() => {
    const layer = automaticOverlay.current;
    if (!layer) return;
    layer.clearLayers();
    try {
      automaticFloods.forEach((event) => {
        const { result } = event.simulation;
        const canvas = createFloodCanvas(result, 0, true, 4);
        L.imageOverlay(canvas.toDataURL(), [
          [result.bbox.south, result.bbox.west],
          [result.bbox.north, result.bbox.east],
        ], {
          opacity: 0.62,
          interactive: false,
          className: "flood-overlay automatic-flood-overlay",
        }).addTo(layer);
      });
      setSimulationError(null);
    } catch (reason) {
      setSimulationError(reason instanceof Error ? reason.message : "Impossible d'afficher les impacts automatiques.");
    }
  }, [automaticFloods]);

  useEffect(() => {
    const layer = hazardLayer.current;
    const currentMap = map.current;
    if (!layer || !currentMap) return;
    layer.clearLayers();
    if (!showHazards) return;

    const ordered = sortHazards(hazards);
    const cap = zoom < 4 ? 260 : 750;
    let visible = ordered.slice(0, cap);
    if (selectedHazardId && !visible.some((event) => event.id === selectedHazardId)) {
      const selected = ordered.find((event) => event.id === selectedHazardId);
      if (selected) visible = [selected, ...visible.slice(0, Math.max(0, cap - 1))];
    }

    for (const event of visible) {
      if (!Number.isFinite(event.lat) || !Number.isFinite(event.lon)) continue;
      const place = hazardPlaceMap?.get(event.id) ?? resolveHazardPlace(event, places);
      const selected = selectedHazardId === event.id;
      const permanent = selected || zoom >= 5;
      const color = HAZARD_META[event.hazard]?.color ?? "#8daec6";
      const marker = L.marker([event.lat, event.lon], {
        icon: L.divIcon({
          className: `hazard-event-marker${selected ? " is-selected" : ""}${event.severity === "extreme" ? " is-extreme" : ""}`,
          html: `<span class="hazard-event-pin" style="--hazard-color:${color}"><img src="${hazardSprite(event.hazard, event.severity)}" alt=""></span>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        }),
        title: `${place.label} — ${HAZARD_META[event.hazard]?.short ?? event.hazard} · ${event.severity_label}`,
        alt: `${HAZARD_META[event.hazard]?.short ?? event.hazard} — ${place.label}`,
        riseOnHover: true,
        keyboard: true,
        zIndexOffset: selected ? 2200 : event.severity === "extreme" ? 1500 : 900,
      });
      marker
        .bindTooltip(
          `<strong>${escapeHtml(place.label)}</strong><br>${escapeHtml(HAZARD_META[event.hazard]?.short ?? event.hazard)} · ${escapeHtml(event.severity_label)}${place.approximate ? " · lieu approximatif" : ""}`,
          {
            permanent,
            direction: "top",
            className: "hazard-event-tooltip",
            opacity: 0.96,
            offset: [0, -14],
          },
        )
        .on("click", () => onHazardSelect?.(event))
        .addTo(layer);
    }
  }, [hazards, hazardPlaceMap, selectedHazardId, showHazards, zoom, places, onHazardSelect]);

  useEffect(() => {
    const layer = hazardSimulationLayer.current;
    const currentMap = map.current;
    if (!layer || !currentMap) return;
    layer.clearLayers();
    if (!hazardSimulation) {
      fittedHazardSimulation.current = null;
      return;
    }
    const center: [number, number] = [hazardSimulation.center.lat, hazardSimulation.center.lon];
    const color = hazardColor(hazardSimulation.hazard);
    const circle = L.circle(center, {
      radius: Math.max(500, hazardSimulation.radius_km * 1000),
      color,
      weight: 2,
      opacity: 0.9,
      fillColor: color,
      fillOpacity: 0.16,
      dashArray: "8 6",
      interactive: false,
      className: "hazard-sim-footprint",
    }).addTo(layer);
    L.marker(center, {
      interactive: false,
      icon: L.divIcon({
        className: "hazard-sim-center",
        html: `<span style="--hazard-color:${color}">${hazardSimulation.label}</span>`,
        iconSize: [150, 22],
        iconAnchor: [75, 11],
      }),
    }).addTo(layer);
    const key = `${hazardSimulation.hazard}:${hazardSimulation.generated_at}:${center[0]}:${center[1]}`;
    if (fittedHazardSimulation.current !== key) {
      fittedHazardSimulation.current = key;
      currentMap.fitBounds(circle.getBounds(), { maxZoom: 11, padding: [42, 42] });
    }
  }, [hazardSimulation]);

  useEffect(() => {
    const currentMap = map.current;
    if (!currentMap || !sensorLayer.current || !weatherLayer.current || !alertLayer.current) return;
    if (showSensors) sensorLayer.current.addTo(currentMap); else sensorLayer.current.remove();
    if (showWeather) weatherLayer.current.addTo(currentMap); else weatherLayer.current.remove();
    if (showAlerts) alertLayer.current.addTo(currentMap); else alertLayer.current.remove();
    if (hazardLayer.current) {
      if (showHazards) hazardLayer.current.addTo(currentMap);
      else hazardLayer.current.remove();
    }
  }, [showSensors, showWeather, showAlerts, showHazards]);

  useEffect(() => {
    const currentMap = map.current;
    if (!currentMap) return;
    if (baseTile.current) currentMap.removeLayer(baseTile.current);
    baseTile.current = TILE_LAYERS[baseLayer]().addTo(currentMap);
    baseTile.current.bringToBack();
  }, [baseLayer]);

  const layerStatus: string[] = [];
  if (showRadar) {
    layerStatus.push(
      radarStatus && radarStatus !== "indisponible"
        ? `Radar mondial · ${radarStatus} · ${RADAR_ATTRIBUTION}`
        : "Radar mondial · images indisponibles",
    );
  }
  if (showAircraft) {
    if (aircraftState.status === "ready") {
      layerStatus.push(`${aircraftState.aircraft.length} aéronefs${wideZoom ? " · échantillon mondial" : ""} · positions interpolées entre observations · ${aircraftState.attribution}`);
    } else if (aircraftState.status === "loading") {
      layerStatus.push("Trafic aérien · connexion à OpenSky…");
    } else if (aircraftState.status === "unavailable") {
      layerStatus.push("Trafic aérien indisponible pour le moment");
    } else if (aircraftState.status === "paused") {
      layerStatus.push("Trafic aérien : zoomez pour interroger l'emprise visible");
    }
  }
  if (zoom < WEATHER_MIN_ZOOM && weather.length > 0) {
    layerStatus.push(`${weather.length} point(s) météo à partir du zoom ${WEATHER_MIN_ZOOM}`);
  }
  if (showHazards && hazards.length > 0) {
    const shown = zoom < 4 ? Math.min(260, hazards.length) : Math.min(750, hazards.length);
    layerStatus.push(`${shown} aléa(s) réel(s) affiché(s) sur ${hazards.length} · sources officielles`);
  } else if (showHazards) {
    layerStatus.push("Aucun événement d'aléa publié pour le moment");
  }

  return (
    <div className="map-container">
      <div ref={el} className="map" role="region" aria-label="Carte des capteurs" />
      {simulationError && <p className="map-error" role="alert">{simulationError}</p>}
      {hazardSimulation && (
        <p className="map-simulation-caption hazard-simulation-caption">
          Simulation indicative {hazardSimulation.label} · rayon {hazardSimulation.radius_km.toLocaleString("fr-FR")} km · aucun impact confirmé
        </p>
      )}
      {simulation && <p className="map-simulation-caption">Simulation manuelle indicative MNT · bleu clair : étendue possible</p>}
      {!simulation && automaticFloods.length > 0 && <p className="map-simulation-caption">Estimations automatiques MNT · impacts non confirmés sur le terrain</p>}
      {layerStatus.length > 0 && <p className="map-layer-status">{layerStatus.join(" · ")}</p>}
    </div>
  );
}
