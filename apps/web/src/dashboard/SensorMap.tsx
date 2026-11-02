import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { SensorState, WeatherItem } from "../services/api";
import { createFloodCanvas, FloodRun } from "../services/simulation";
import { LEVEL_COLOR } from "../services/levels";

export { LEVEL_COLOR } from "../services/levels";

const COTE_D_IVOIRE: L.LatLngExpression = [7.54, -5.55];

export type MapHandle = {
  setView: (center: [number, number], zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
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
  frameIndex = 0,
  baseLayer = "osm",
  showSensors = true,
  showWeather = true,
  showAlerts = true,
  mapRef,
}: {
  sensors: SensorState[];
  weather?: WeatherItem[];
  onSelect?: (code: string) => void;
  simulation?: FloodRun | null;
  frameIndex?: number;
  baseLayer?: BaseLayer;
  showSensors?: boolean;
  showWeather?: boolean;
  showAlerts?: boolean;
  mapRef?: React.RefObject<MapHandle | null>;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const sensorLayer = useRef<L.LayerGroup | null>(null);
  const weatherLayer = useRef<L.LayerGroup | null>(null);
  const alertLayer = useRef<L.LayerGroup | null>(null);
  const baseTile = useRef<L.TileLayer | null>(null);
  const simulationOverlay = useRef<L.ImageOverlay | null>(null);
  const fitted = useRef(false);
  const fittedSimulation = useRef<number | null>(null);
  const [simulationError, setSimulationError] = useState<string | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    const instance = L.map(el.current, {
      zoomControl: false,
      preferCanvas: true,
      fadeAnimation: false,
      attributionControl: true,
    }).setView(COTE_D_IVOIRE, 7);
    map.current = instance;
    if (mapRef) {
      mapRef.current = {
        setView: (center, zoom) => instance.setView(center, zoom),
        zoomIn: () => instance.zoomIn(),
        zoomOut: () => instance.zoomOut(),
      };
    }

    baseTile.current = TILE_LAYERS[baseLayer]().addTo(instance);
    sensorLayer.current = L.layerGroup().addTo(instance);
    weatherLayer.current = L.layerGroup().addTo(instance);
    alertLayer.current = L.layerGroup().addTo(instance);

    return () => {
      instance.remove();
      map.current = null;
      baseTile.current = null;
      sensorLayer.current = null;
      weatherLayer.current = null;
      alertLayer.current = null;
    };
    // The map is created once; props are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!map.current || !sensorLayer.current || !weatherLayer.current || !alertLayer.current) return;
    sensorLayer.current.clearLayers();
    weatherLayer.current.clearLayers();
    alertLayer.current.clearLayers();
    sensors.forEach((sensor) => {
      const color = LEVEL_COLOR[sensor.alert_level];
      L.circleMarker([sensor.lat, sensor.lon], {
        radius: 9,
        color: "#ffffff",
        weight: 2,
        fillColor: color,
        fillOpacity: 0.96,
      })
        .bindTooltip(`${sensor.name} — ${sensor.water_level_cm == null ? "pas de mesure" : `${sensor.water_level_cm.toFixed(0)} cm`}`)
        .on("click", () => onSelect?.(sensor.code))
        .addTo(sensorLayer.current!);
      if (sensor.alert_level !== "green") {
        L.marker([sensor.lat, sensor.lon], {
          icon: L.divIcon({ className: "hazard-map-icon flood-hazard", html: "<span aria-hidden=\"true\">⚠</span>", iconSize: [30, 30], iconAnchor: [15, 15] }),
          title: `Alerte inondation — ${sensor.name}`,
          keyboard: true,
        }).addTo(alertLayer.current!);
      }
    });
    weather.forEach((item) => {
      L.circleMarker([item.lat, item.lon], {
        radius: 17,
        color: LEVEL_COLOR[item.level],
        weight: 2,
        dashArray: "4 5",
        fillColor: LEVEL_COLOR[item.level],
        fillOpacity: 0.08,
      })
        .bindTooltip(`${item.name} — pluie : ${item.intensity_3h_mm_h} mm/h (3 h), ${item.accumulated_24h_mm} mm (24 h)`)
        .addTo(weatherLayer.current!);
      if (item.intensity_3h_mm_h > 0 || item.level !== "green") {
        L.marker([item.lat, item.lon], {
          icon: L.divIcon({ className: "hazard-map-icon rain-hazard", html: `<span aria-hidden="true">${item.level === "green" ? "☔" : "⚠"}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
          title: `Risque de pluie — ${item.name}`,
          keyboard: true,
        }).addTo(alertLayer.current!);
      }
    });
    if (sensors.length && !fitted.current) {
      map.current.fitBounds(L.latLngBounds(sensors.map((sensor) => [sensor.lat, sensor.lon] as [number, number])).pad(0.3), { maxZoom: 14 });
      fitted.current = true;
    }
  }, [sensors, weather, onSelect]);

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
    const currentMap = map.current;
    if (!currentMap || !sensorLayer.current || !weatherLayer.current || !alertLayer.current) return;
    if (showSensors) sensorLayer.current.addTo(currentMap); else sensorLayer.current.remove();
    if (showWeather) weatherLayer.current.addTo(currentMap); else weatherLayer.current.remove();
    if (showAlerts) alertLayer.current.addTo(currentMap); else alertLayer.current.remove();
  }, [showSensors, showWeather, showAlerts]);

  useEffect(() => {
    const currentMap = map.current;
    if (!currentMap) return;
    if (baseTile.current) currentMap.removeLayer(baseTile.current);
    baseTile.current = TILE_LAYERS[baseLayer]().addTo(currentMap);
    baseTile.current.bringToBack();
  }, [baseLayer]);

  return (
    <div className="map-container">
      <div ref={el} className="map" role="region" aria-label="Carte des capteurs" />
      {simulationError && <p className="map-error" role="alert">{simulationError}</p>}
      {simulation && <p className="map-simulation-caption">Simulation indicative MNT · jaune : étendue possible</p>}
    </div>
  );
}
