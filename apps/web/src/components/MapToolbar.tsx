import { PlaceSearch } from "./PlaceSearch";
import { Icon } from "./Icon";
import { config } from "../config";

type BaseLayer = "osm" | "esri" | "nasa";
type MapHandle = {
  setView: (center: [number, number], zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

type Props = {
  view: "map" | "globe";
  onViewChange: (view: "map" | "globe") => void;
  baseLayer: BaseLayer;
  onBaseLayerChange: (layer: BaseLayer) => void;
  showSensors: boolean;
  onShowSensorsChange: (value: boolean) => void;
  showWeather: boolean;
  onShowWeatherChange: (value: boolean) => void;
  showAlerts: boolean;
  onShowAlertsChange: (value: boolean) => void;
  mapRef: React.RefObject<MapHandle | null>;
  token?: string;
  onPlaceSelect: (place: { lat: number; lon: number }) => void;
  onGlobePreload: () => void;
};

export function MapToolbar({
  view,
  onViewChange,
  baseLayer,
  onBaseLayerChange,
  showSensors,
  onShowSensorsChange,
  showWeather,
  onShowWeatherChange,
  showAlerts,
  onShowAlertsChange,
  mapRef,
  token,
  onPlaceSelect,
  onGlobePreload,
}: Props) {
  return (
    <div className="map-toolbar" role="toolbar" aria-label="Outils cartographiques">
      <div className="view-switch" role="group" aria-label="Vues cartographiques">
        <button type="button" className={view === "map" ? "on" : ""} aria-pressed={view === "map"} onClick={() => onViewChange("map")}>
          <Icon name="map" size={16} />Carte 2D
        </button>
        <button
          type="button"
          className={view === "globe" ? "on" : ""}
          aria-pressed={view === "globe"}
          onPointerEnter={onGlobePreload}
          onFocus={onGlobePreload}
          onClick={() => onViewChange("globe")}
        >
          <Icon name="globe" size={16} />Globe 3D
        </button>
      </div>

      {view === "map" && (
        <>
          <span className="toolbar-divider" aria-hidden="true" />
          <label className="toolbar-select">
            <Icon name="layers" size={16} />
            <span className="visually-hidden">Fond de carte</span>
            <select aria-label="Fond de carte" value={baseLayer} onChange={(event) => onBaseLayerChange(event.target.value as BaseLayer)}>
              <option value="osm">Plan</option>
              <option value="esri">Satellite</option>
              <option value="nasa">NASA</option>
            </select>
          </label>
          <div className="layer-toggles" role="group" aria-label="Couches de la carte">
            <button type="button" aria-pressed={showSensors} className={showSensors ? "on" : ""} onClick={() => onShowSensorsChange(!showSensors)}>
              <i className="layer-dot sensor" />Capteurs
            </button>
            <button type="button" aria-pressed={showWeather} className={showWeather ? "on" : ""} onClick={() => onShowWeatherChange(!showWeather)}>
              <i className="layer-dot weather" />Météo
            </button>
            <button type="button" aria-pressed={showAlerts} className={showAlerts ? "on" : ""} onClick={() => onShowAlertsChange(!showAlerts)}>
              <i className="layer-dot alert" />Alertes
            </button>
          </div>
          <span className="toolbar-divider" aria-hidden="true" />
          <div className="zoom-controls" role="group" aria-label="Zoom de la carte">
            <button type="button" aria-label="Zoom avant" title="Zoom avant" onClick={() => mapRef.current?.zoomIn()}><Icon name="zoom-in" size={16} /></button>
            <button type="button" aria-label="Zoom arrière" title="Zoom arrière" onClick={() => mapRef.current?.zoomOut()}><Icon name="zoom-out" size={16} /></button>
          </div>
          {token && <PlaceSearch token={token} onSelect={onPlaceSelect} />}
        </>
      )}

      <a className="toolbar-world" href={config.intelliFloodWorldUrl} target="_blank" rel="noopener noreferrer">
        <Icon name="world" size={16} /><span>IntelliFlood World</span>
      </a>
    </div>
  );
}
