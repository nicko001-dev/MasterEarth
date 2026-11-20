import { PlaceSearch } from "./PlaceSearch";
import { Icon } from "./Icon";
import { config } from "../config";
import type { GlobeLayerKey, GlobeLayers } from "../globe/GlobeView";
import {
  formatAccuracy,
  formatCoordinates,
  GeolocationStatus,
  UserPosition,
} from "../services/geolocation";

type BaseLayer = "osm" | "esri" | "nasa";
type MapHandle = {
  setView: (center: [number, number], zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitSensors?: () => void;
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
  layers: GlobeLayers;
  onLayerChange: (layer: GlobeLayerKey, enabled: boolean) => void;
  mapRef: React.RefObject<MapHandle | null>;
  onPlaceSelect: (place: { lat: number; lon: number }) => void;
  onGlobePreload: () => void;
  userLocation: UserPosition | null;
  locationStatus: GeolocationStatus;
  onLocate: () => void;
  onWorldView: () => void;
  onFitSensors?: () => void;
};

/** Libellé et infobulle du bouton de localisation selon l'état réel. */
export function locateButtonState(
  status: GeolocationStatus,
  position: UserPosition | null,
): { disabled: boolean; label: string; title: string } {
  switch (status) {
    case "unsupported":
      return {
        disabled: true,
        label: "Ma position",
        title: "Ce navigateur ne fournit pas de position géographique.",
      };
    case "denied":
      return {
        disabled: false,
        label: "Réactiver",
        title: "Localisation refusée. Cliquez pour redemander l'autorisation (ou autorisez-la dans les réglages du navigateur).",
      };
    case "locating":
      return { disabled: true, label: "Localisation…", title: "Recherche de votre position en cours." };
    case "error":
      return {
        disabled: false,
        label: "Réessayer",
        title: "La position n'a pas pu être obtenue. Cliquez pour réessayer.",
      };
    case "ready":
      return {
        disabled: false,
        label: "Ma position",
        title: position
          ? `Centrer sur ma position (${formatCoordinates(position.lat, position.lon)} · ${formatAccuracy(position.accuracyM)}).`
          : "Centrer sur ma position.",
      };
    default:
      return {
        disabled: false,
        label: "Ma position",
        title: "Autoriser la localisation et centrer la carte sur ma position.",
      };
  }
}

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
  layers,
  onLayerChange,
  mapRef,
  onPlaceSelect,
  onGlobePreload,
  userLocation,
  locationStatus,
  onLocate,
  onWorldView,
  onFitSensors,
}: Props) {
  const locate = locateButtonState(locationStatus, userLocation);
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

      <span className="toolbar-divider" aria-hidden="true" />
      <div className="locate-controls" role="group" aria-label="Localisation">
        <button
          type="button"
          className={`locate-button ${locationStatus === "ready" ? "on" : ""} ${locationStatus === "locating" ? "busy" : ""}`}
          aria-label={locate.label}
          aria-pressed={locationStatus === "ready"}
          title={locate.title}
          disabled={locate.disabled}
          onClick={onLocate}
        >
          <Icon name="locate" size={16} />
          <span>{locate.label}</span>
        </button>
        {userLocation && (
          <span className="locate-readout" title={`Position : ${formatCoordinates(userLocation.lat, userLocation.lon)} · ${formatAccuracy(userLocation.accuracyM)}`}>
            <i aria-hidden="true" />
            {formatCoordinates(userLocation.lat, userLocation.lon)}
          </span>
        )}
        <button type="button" className="world-button" title="Revenir à la vue mondiale" aria-label="Vue mondiale" onClick={onWorldView}>
          <Icon name="world" size={16} />
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
            <button type="button" aria-pressed={layers.hazards} className={layers.hazards ? "on" : ""} onClick={() => onLayerChange("hazards", !layers.hazards)}>
              <i className="layer-dot hazard" />Aléas
            </button>
          </div>
          <span className="toolbar-divider" aria-hidden="true" />
          <div className="zoom-controls" role="group" aria-label="Zoom de la carte">
            <button type="button" aria-label="Zoom avant" title="Zoom avant" onClick={() => mapRef.current?.zoomIn()}><Icon name="zoom-in" size={16} /></button>
            <button type="button" aria-label="Zoom arrière" title="Zoom arrière" onClick={() => mapRef.current?.zoomOut()}><Icon name="zoom-out" size={16} /></button>
          </div>
          {onFitSensors && (
            <button type="button" className="fit-sensors-button" title="Cadrer le réseau de capteurs" aria-label="Cadrer le réseau de capteurs" onClick={onFitSensors}>
              <Icon name="sensors" size={16} />
            </button>
          )}
        </>
      )}

      <span className="toolbar-divider" aria-hidden="true" />
      <PlaceSearch onSelect={onPlaceSelect} />

      <details className="layer-menu">
        <summary title="Autres couches mondiales">
          <Icon name="layers" size={16} />
          <span>Couches</span>
        </summary>
        <div className="layer-menu-panel" role="group" aria-label="Couches mondiales">
          {([
            ["radar", "Radar mondial", "radar"],
            ["labels", "Noms de lieux", "labels"],
            ["borders", "Frontières", "borders"],
            ["night", "Jour / nuit", "night"],
            ["traffic", "Circulation", "traffic"],
            ["aircraft", "Avions en direct", "aircraft"],
            ["hazards", "Aléas mondiaux", "hazard"],
          ] as Array<[GlobeLayerKey, string, string]>).map(([key, label, dot]) => (
            <button
              key={key}
              type="button"
              aria-pressed={layers[key]}
              className={layers[key] ? "on" : ""}
              onClick={() => onLayerChange(key, !layers[key])}
            >
              <i className={`layer-dot ${dot}`} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </details>

      <a className="toolbar-world" href={config.intelliFloodWorldUrl} target="_blank" rel="noopener noreferrer">
        <Icon name="world" size={16} /><span>MasterEarth World</span>
      </a>
    </div>
  );
}
