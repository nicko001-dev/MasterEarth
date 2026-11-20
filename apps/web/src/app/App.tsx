/** Plateforme MasterEarth : carte plein écran, veille des aléas, simulation, alertes et observations. */

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SensorMap } from "../dashboard/SensorMap";
import { useMonitoring } from "../dashboard/useMonitoring";
import { useUserLocation } from "../dashboard/useUserLocation";
import { useWorldWeather } from "../dashboard/useWorldWeather";
import { formatAgeSeconds, useGlobalRain } from "../dashboard/useGlobalRain";
import { Login } from "../dashboard/Login";
import { Manage } from "../dashboard/Manage";
import { ObservationsPanel } from "../dashboard/ObservationsPanel";
import { SensorHistory } from "../dashboard/SensorHistory";
import { SimulationPanel } from "../dashboard/SimulationPanel";
import type { SimulationRequest } from "../dashboard/SimulationPanel";
import { SimulationInsights } from "../dashboard/SimulationInsights";
import { SimulationTimeline } from "../dashboard/SimulationTimeline";
import { WaterLegend } from "../dashboard/WaterLegend";
import { HazardConsole } from "../dashboard/HazardConsole";
import { HazardLiveCard } from "../dashboard/HazardLiveCard";
import { useHazards } from "../dashboard/useHazards";
import { AssistantPanel } from "../components/AssistantPanel";
import { LocationPrompt } from "../components/LocationPrompt";
import { MapToolbar } from "../components/MapToolbar";
import { Icon, IconName } from "../components/Icon";
import { can, loadSession, logout } from "../services/auth";
import { AssistantAction } from "../services/assistantActions";
import { AssistantClientContext } from "../services/ai";
import { loadPlaces, Place } from "../globe/places";
import { mergeWeather } from "../services/weatherMerge";
import { centerFromBounds } from "../services/assistantContext";
import type { Bounds } from "../globe/borders";
import type { GlobeHandle, GlobeLayerKey, GlobeLayers } from "../globe/GlobeView";
import {
  LEVEL_COLOR,
  LEVEL_LABEL,
  SITUATION_COLOR,
  SITUATION_LABEL,
} from "../services/levels";
import { FloodRun } from "../services/simulation";
import { currentSituation } from "../services/situation";
import { formatCoordinates } from "../services/geolocation";
import {
  HazardEvent,
  HazardSimulation,
  resolveHazardPlaceMap,
} from "../services/hazards";

let globeModulePromise: Promise<typeof import("../globe/GlobeView")> | undefined;
const loadGlobeView = () => {
  globeModulePromise ??= import("../globe/GlobeView").catch((error: unknown) => {
    globeModulePromise = undefined;
    throw error;
  });
  return globeModulePromise;
};
const GlobeView = lazy(loadGlobeView);

type Tab = "carte" | "surveillance" | "capteurs" | "alertes" | "meteo" | "observations" | "gestion" | "ia";
type BaseLayer = "osm" | "esri" | "nasa";
type MapHandle = {
  setView: (center: [number, number], zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitSensors: () => void;
};

const NAV: ReadonlyArray<{ key: Tab; label: string; short: string; icon: IconName; minimum?: "agent_terrain" }> = [
  { key: "carte", label: "Carte", short: "Carte", icon: "map" },
  { key: "surveillance", label: "Surveillance", short: "Veille", icon: "world" },
  { key: "capteurs", label: "Capteurs", short: "Capteurs", icon: "sensors" },
  { key: "alertes", label: "Alertes", short: "Alertes", icon: "alert" },
  { key: "meteo", label: "Météo", short: "Météo", icon: "weather" },
  { key: "observations", label: "Observations", short: "Observations", icon: "observations" },
  { key: "ia", label: "Assistant IA", short: "IA", icon: "ai" },
  { key: "gestion", label: "Gestion", short: "Gestion", icon: "settings", minimum: "agent_terrain" },
];
const TABS = NAV.map((item) => item.key);
/** Alias d'URL conservés pour les liens d'accueil et les anciens favoris. */
const TAB_ALIASES: Readonly<Record<string, Tab>> = {
  risques: "surveillance",
  veille: "surveillance",
};
const readTab = (): Tab => {
  const hash = location.hash.replace(/^#/, "");
  const key = TAB_ALIASES[hash] ?? hash;
  return TABS.find((tab) => tab === key) ?? "carte";
};
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");
const HEALTH_LABEL = {
  never_reported: "Aucune mesure",
  online: "Mesure récente",
  stale: "Mesure en retard",
  clock_skew: "Horodatage à vérifier",
} as const;
const WEATHER_SOURCE_LABEL: Record<string, string> = {
  weather_model: "Modèle Open-Meteo (estimation, pas une mesure terrain)",
  provider_report: "Conditions rapportées par OpenWeather",
  iot_gauge: "Pluviomètre IoT",
  bulletin: "Bulletin météo saisi",
};

export function App() {
  const {
    sensors,
    alerts,
    weather,
    weatherStatus,
    weatherError,
    dataError,
    automaticFloods,
    automaticFloodError,
    offline,
    loading,
    isRefreshing,
    updatedAt,
    liveDate,
    secondsSinceLastUpdate,
    liveTicker,
    refresh,
  } = useMonitoring();
  const locationState = useUserLocation();
  const [tab, setTab] = useState<Tab>(readTab);
  const [session, setSession] = useState(loadSession);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [selectedSensor, setSelectedSensor] = useState<string | null>(null);
  const [view, setView] = useState<"map" | "globe">(() => (location.hash === "#globe" ? "globe" : "map"));
  const [floodRun, setFloodRun] = useState<FloodRun | null>(null);
  const [simulationRequest, setSimulationRequest] = useState<SimulationRequest | null>(null);
  const [simulationFrame, setSimulationFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedHazardId, setSelectedHazardId] = useState<string | null>(null);
  const [hazardSimulation, setHazardSimulation] = useState<HazardSimulation | null>(null);
  const [baseLayer, setBaseLayer] = useState<BaseLayer>("osm");
  const [showSensors, setShowSensors] = useState(true);
  const [showWeather, setShowWeather] = useState(true);
  const [showAlerts, setShowAlerts] = useState(true);
  const [weatherSearch, setWeatherSearch] = useState("");
  const [weatherFilter, setWeatherFilter] = useState<"all" | "rain" | "alert">("all");
  const [flyToTarget, setFlyToTarget] = useState<{ lat: number; lon: number; height?: number; timestamp?: number } | null>(null);
  const mapRef = useRef<MapHandle | null>(null);
  const globeRef = useRef<GlobeHandle | null>(null);

  // Couches du globe 3D (contrôlables par l'interface et par l'assistant).
  const [globeLayers, setGlobeLayers] = useState<GlobeLayers>({
    radar: true,
    rain: true,
    flood: true,
    labels: true,
    borders: true,
    night: true,
    traffic: true,
    aircraft: true,
    sensors: true,
    weather: true,
    alerts: true,
    hazards: true,
  });

  // Couverture météo mondiale de la zone regardée.
  const [worldBounds, setWorldBounds] = useState<Bounds | null>(null);
  // Les sondages météo de l'emprise sont indépendants du réseau de capteurs :
  // ils continuent même si une autre source est momentanément en panne.
  const worldWeather = useWorldWeather(worldBounds, { enabled: true });
  // Statistiques de pluie mondiales : scan de la planète puis affinage local
  // des zones arrosées, avec le nom du lieu où il pleut le plus.
  const globalRain = useGlobalRain();
  // Veille mondiale des aléas réels : sources officielles, cache serveur 90 s.
  const hazards = useHazards();
  const hazardEvents = hazards.data?.events ?? [];
  const displayWeather = useMemo(
    () => mergeWeather(weather, worldWeather.points),
    [weather, worldWeather.points],
  );
  /**
   * Statistiques calculées sur exactement les points affichés, y compris
   * l'échantillonnage mondial à la demande. Un cumul n'a de sens que par point :
   * on affiche donc le maximum, pas une somme de valeurs locales.
   */
  const displayMetrics = useMemo(() => {
    let maxIntensity = 0;
    let activeRainCount = 0;
    let max24hMm = 0;
    for (const item of displayWeather) {
      const intensity = item.observed_precip_mm_h ?? item.modeled_precip_mm_h ?? 0;
      if (intensity > maxIntensity) maxIntensity = intensity;
      if (intensity > 0) activeRainCount += 1;
      const cumulative = item.observed_24h_mm ?? item.modeled_24h_mm ?? item.accumulated_24h_mm ?? 0;
      if (cumulative > max24hMm) max24hMm = cumulative;
    }
    return { maxIntensity, activeRainCount, max24hMm };
  }, [displayWeather]);
  const situation = currentSituation(sensors, displayWeather, offline || loading);

  // Lieux mondiaux : chargés en arrière-plan, ils alimentent les commandes
  // vocales locales (« va à Paris ») sans bloquer l'affichage.
  const [places, setPlaces] = useState<Place[]>([]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPlaces()
        .then((dataset) => setPlaces(dataset.places))
        .catch(() => undefined);
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, []);

  const hazardPlaceMap = useMemo(
    () => resolveHazardPlaceMap(hazardEvents, places),
    // `hazards.data` change à chaque instantané ; les événements en sont la
    // seule source utile, avec le jeu GeoNames chargé en arrière-plan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hazards.data, places],
  );
  const selectedHazard = useMemo(
    () => hazardEvents.find((event) => event.id === selectedHazardId) ?? null,
    [hazardEvents, selectedHazardId],
  );

  /**
   * Ouvre un aléa : la console, le globe et un cadrage adapté à l'échelle du
   * phénomène. La hauteur de caméra est un choix de lecture, pas une donnée.
   */
  const focusHazard = useCallback((event: HazardEvent) => {
    const heights: Record<HazardEvent["hazard"], number> = {
      earthquake: 280_000,
      tsunami: 900_000,
      volcano: 130_000,
      hurricane: 1_700_000,
      flood: 220_000,
      wildfire: 150_000,
      drought: 900_000,
      landslide: 90_000,
      sandstorm: 650_000,
      blizzard: 800_000,
      heatwave: 800_000,
      tornado: 100_000,
      storm: 320_000,
    };
    setSelectedHazardId(event.id);
    setHazardSimulation(null);
    setTab("surveillance");
    setView("globe");
    setFlyToTarget({
      lat: event.lat,
      lon: event.lon,
      height: heights[event.hazard] ?? 300_000,
      timestamp: Date.now(),
    });
  }, []);

  const focusHazardById = useCallback((id: string) => {
    const event = hazardEvents.find((candidate) => candidate.id === id);
    if (event) focusHazard(event);
  }, [hazardEvents, focusHazard]);

  const focusHazardSimulation = useCallback((result: HazardSimulation | null) => {
    setHazardSimulation(result);
    if (!result) return;
    setView("globe");
    setTab("surveillance");
    setFlyToTarget({
      lat: result.center.lat,
      lon: result.center.lon,
      height: Math.min(2_000_000, Math.max(35_000, result.radius_km * 1000 * 7)),
      timestamp: Date.now(),
    });
  }, []);

  useEffect(() => {
    const onHash = () => setTab(readTab());
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!playing || !floodRun || floodRun.result.frames.length < 2) return;
    const count = floodRun.result.frames.length;
    const timer = window.setInterval(() => {
      setSimulationFrame((current) => (current + 1) % count);
    }, 1050);
    return () => window.clearInterval(timer);
  }, [playing, floodRun]);

  const activeSensor = sensors.find((sensor) => sensor.code === selectedSensor) ?? sensors[0];

  const handleRunChange = useCallback((run: FloodRun | null) => {
    setFloodRun(run);
    setPlaying(false);
    setSimulationFrame(run ? Math.max(0, run.result.frames.length - 1) : 0);
  }, []);

  const clearSimulationRequest = useCallback(() => setSimulationRequest(null), []);

  // Référence stable : évite de relancer le recentrage 3D à chaque rendu
  // (l'horloge temps réel provoque un rendu par seconde).
  const clearFlyToTarget = useCallback(() => setFlyToTarget(null), []);

  const handleViewChange = useCallback((next: "map" | "globe") => {
    setView(next);
    // Quitter le globe libère la localisation : au retour, la caméra reste libre.
    if (next === "map") setFlyToTarget(null);
  }, []);

  /** Applique une couche demandée par l'assistant (ou par un interrupteur). */
  const applyLayer = useCallback((layer: GlobeLayerKey, enabled: boolean) => {
    if (layer === "sensors") setShowSensors(enabled);
    else if (layer === "weather") setShowWeather(enabled);
    else if (layer === "alerts") setShowAlerts(enabled);
    else setGlobeLayers((current) => ({ ...current, [layer]: enabled }));
  }, []);

  /**
   * Centre la carte sur la position de l'utilisateur. Si la localisation a été
   * refusée, le bouton redemande l'autorisation ; sans elle, rien ne s'active.
   */
  const handleLocate = useCallback(async () => {
    if (locationState.status === "denied") locationState.forgetLocation();
    const target = locationState.position ?? await locationState.requestLocation();
    if (!target) return;
    if (view === "globe") {
      setFlyToTarget({ lat: target.lat, lon: target.lon, height: 12_000, timestamp: Date.now() });
    } else {
      mapRef.current?.setView([target.lat, target.lon], 12);
    }
  }, [locationState, view]);

  /** Retour à la vue mondiale sur la carte active. */
  const handleWorldView = useCallback(() => {
    setFlyToTarget(null);
    if (view === "globe") globeRef.current?.resetView();
    else mapRef.current?.setView([20, 0], 2);
  }, [view]);

  /**
   * Exécute les actions d'interface renvoyées par l'assistant. Ces actions sont
   * volontairement limitées : navigation, couches, onglets, zoom. L'assistant ne
   * peut ni déclencher une alerte ni modifier un seuil ou lancer un calcul.
   */
  const applyAssistantActions = useCallback((actions: AssistantAction[]) => {
    for (const action of actions) {
      switch (action.type) {
        case "fly_to":
          // On ne change pas d'onglet : l'assistant reste ouvert et le vol est
          // visible sur la carte, qui demeure affichée derrière les panneaux.
          setView("globe");
          setFlyToTarget({
            lat: action.lat,
            lon: action.lon,
            height: action.height ?? 40_000,
            timestamp: Date.now(),
          });
          break;
        case "set_view":
          setView(action.view);
          if (action.view === "map") setFlyToTarget(null);
          break;
        case "open_tab":
          setTab(action.tab as Tab);
          break;
        case "select_sensor":
          setSelectedSensor(action.code);
          setTab("capteurs");
          break;
        case "set_layer":
          applyLayer(action.layer, action.enabled);
          break;
        case "set_basemap":
          setBaseLayer(action.basemap);
          break;
        case "locate_user":
          void handleLocate();
          break;
        case "open_simulation":
          setTab("carte");
          setSimulationRequest({
            mode: action.mode,
            lat: action.lat ?? null,
            lon: action.lon ?? null,
            timestamp: Date.now(),
          });
          if (action.lat != null && action.lon != null) {
            setView("globe");
            setFlyToTarget({ lat: action.lat, lon: action.lon, height: 6_000, timestamp: Date.now() });
          }
          break;
        case "zoom":
          if (view === "globe") {
            if (action.direction === "in") globeRef.current?.zoomIn();
            else globeRef.current?.zoomOut();
          } else if (action.direction === "in") mapRef.current?.zoomIn();
          else mapRef.current?.zoomOut();
          break;
        case "reset_view":
          handleWorldView();
          break;
      }
    }
  }, [applyLayer, handleLocate, handleWorldView, view]);

  /** Contexte transmis à l'assistant : ce que l'utilisateur regarde maintenant. */
  const assistantContext = useMemo<AssistantClientContext>(() => {
    // Sur le globe, la caméra donne le centre réel (y compris au-dessus de
    // l'océan). En 2D, l'emprise visible est la seule source fiable : elle est
    // mise à jour à chaque déplacement et ne dépend pas d'une référence de carte.
    const camera = view === "globe" ? globeRef.current?.getCenter() ?? null : null;
    const center = camera ?? (worldBounds ? { ...centerFromBounds(worldBounds), height: null } : null);
    return {
      view,
      tab,
      selected_sensor: selectedSensor,
      center,
      layers: {
        ...globeLayers,
        sensors: showSensors,
        weather: showWeather,
        alerts: showAlerts,
      },
      user_location: locationState.position
        ? { lat: locationState.position.lat, lon: locationState.position.lon }
        : null,
      online: !offline && navigator.onLine,
      locale: "fr",
    };
  }, [
    view,
    tab,
    selectedSensor,
    worldBounds,
    globeLayers,
    showSensors,
    showWeather,
    showAlerts,
    locationState.position,
    offline,
  ]);

  const handleScrub = (index: number) => {
    setPlaying(false);
    setSimulationFrame(index);
  };

  const handleLogout = async () => {
    if (!session) return;
    setLogoutError(null);
    try {
      await logout(session.token);
    } catch (reason) {
      setLogoutError(reason instanceof Error ? reason.message : "Déconnexion locale effectuée, mais la session serveur n'a pas pu être révoquée.");
    } finally {
      setSession(null);
    }
  };

  const showSimulationPanel = tab !== "observations" && tab !== "ia" && tab !== "gestion" && tab !== "surveillance";
  const visibleNav = NAV.filter((item) => !item.minimum || can(session?.user, item.minimum));

  const panelTitle = NAV.find((item) => item.key === tab)?.label ?? "Carte";

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Retour à l'accueil">
          <img className="brand-logo" src="/brand/masterearth-logo.png" alt="" />
        </a>

        <nav className="topnav" aria-label="Sections principales">
          {visibleNav.map((item) => (
            <a key={item.key} href={`#${item.key}`} className={tab === item.key ? "on" : ""} onClick={() => setTab(item.key)}>
              <Icon name={item.icon} size={17} />
              <span>{item.label}</span>
              {item.key === "alertes" && alerts.length > 0 && <em className="nav-count">{alerts.length}</em>}
              {item.key === "surveillance" && (hazards.data?.total_events ?? 0) > 0 && (
                <em className="nav-count nav-count-hazards">{hazards.data?.total_events}</em>
              )}
            </a>
          ))}
        </nav>

        <div className="topbar-actions">
          <span className="live-clock-pill" title="Horloge temps réel seconde par seconde (1 Hz)">
            <span className="live-dot" />
            <span>{liveDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
            <small>· {secondsSinceLastUpdate === 0 ? "synchro" : `${secondsSinceLastUpdate}s`}</small>
          </span>
          <span className="status-pill" style={{ borderColor: `${SITUATION_COLOR[situation.level]}66` }}>
            <i style={{ background: SITUATION_COLOR[situation.level] }} />
            <span>
              {situation.level === "unknown"
                ? "Situation : données insuffisantes"
                : `Situation mesurée : ${SITUATION_LABEL[situation.level]}`}
            </span>
          </span>
          <button
            type="button"
            className={`icon-button ${isRefreshing ? "spin-active" : ""}`}
            aria-label="Actualiser"
            title="Actualiser les données immédiatement"
            onClick={() => void refresh()}
          >
            <Icon name="refresh" size={17} />
          </button>
          {session ? (
            <div className="user-chip" title={session.user.email}>
              <span className="user-avatar"><Icon name="user" size={15} /></span>
              <span className="user-copy">
                <strong>{session.user.full_name || session.user.email}</strong>
                <small>{session.user.role}</small>
              </span>
              <button type="button" className="icon-button" aria-label="Déconnexion" title="Déconnexion" onClick={() => void handleLogout()}>
                <Icon name="logout" size={16} />
              </button>
            </div>
          ) : (
            <button type="button" className="button button-primary topbar-login" onClick={() => setShowLogin(true)}>
              Connexion
            </button>
          )}
        </div>
      </header>

      {logoutError && <div className="banner banner-warning" role="alert">{logoutError}</div>}
      {offline && <div className="banner" role="status">Hors ligne — dernières données connues{updatedAt ? ` (${fmt(updatedAt)})` : ""}. Les couches et les dernières mesures restent affichées ; la reprise est automatique.</div>}
      {dataError && !offline && <div className="banner banner-warning" role="status">Source partiellement indisponible : {dataError} Les autres données restent à jour.</div>}
      {automaticFloodError && <div className="banner banner-warning" role="alert">Les impacts automatiques sont temporairement indisponibles : {automaticFloodError}</div>}

      <main className={`workspace tab-${tab}`}>
        <div className={`map-stage${view === "globe" ? " globe-view" : ""}`}>
          {view === "map" ? (
            <SensorMap
              sensors={sensors}
              weather={displayWeather}
              automaticFloods={automaticFloods?.events ?? []}
              onSelect={setSelectedSensor}
              simulation={floodRun}
              frameIndex={simulationFrame}
              baseLayer={baseLayer}
              showSensors={showSensors}
              showWeather={showWeather}
              showAlerts={showAlerts}
              mapRef={mapRef}
              userPosition={locationState.position}
              onBoundsChange={setWorldBounds}
              places={places}
              showRadar={globeLayers.radar}
              showLabels={globeLayers.labels}
              showBorders={globeLayers.borders}
              showNight={globeLayers.night}
              showTraffic={globeLayers.traffic}
              showAircraft={globeLayers.aircraft}
              hazards={hazardEvents}
              hazardPlaceMap={hazardPlaceMap}
              selectedHazardId={selectedHazardId}
              onHazardSelect={focusHazard}
              showHazards={globeLayers.hazards}
              hazardSimulation={hazardSimulation}
            />
          ) : (
            <Suspense fallback={<div className="globe-loading"><span className="spinner" />Chargement du globe…</div>}>
              <GlobeView
                sensors={sensors}
                weather={displayWeather}
                simulation={floodRun}
                automaticFloods={automaticFloods?.events ?? []}
                frameIndex={simulationFrame}
                flyToTarget={flyToTarget}
                onClearFlyToTarget={clearFlyToTarget}
                layers={globeLayers}
                onLayerChange={(layer, enabled) => applyLayer(layer, enabled)}
                userPosition={locationState.position}
                onLocate={() => void handleLocate()}
                onBoundsChange={setWorldBounds}
                handleRef={globeRef}
                worldWeatherAttribution={worldWeather.attribution}
                hazards={hazardEvents}
                hazardPlaceMap={hazardPlaceMap}
                selectedHazard={selectedHazard}
                hazardSimulation={hazardSimulation}
                onHazardSelect={focusHazard}
              />
            </Suspense>
          )}

          <MapToolbar
            view={view}
            onViewChange={handleViewChange}
            baseLayer={baseLayer}
            onBaseLayerChange={setBaseLayer}
            showSensors={showSensors}
            onShowSensorsChange={setShowSensors}
            showWeather={showWeather}
            onShowWeatherChange={setShowWeather}
            showAlerts={showAlerts}
            onShowAlertsChange={setShowAlerts}
            layers={globeLayers}
            onLayerChange={applyLayer}
            mapRef={mapRef}
            userLocation={locationState.position}
            locationStatus={locationState.status}
            onLocate={() => void handleLocate()}
            onWorldView={handleWorldView}
            onFitSensors={() => mapRef.current?.fitSensors()}
            onPlaceSelect={(place) => {
              if (view === "map") mapRef.current?.setView([place.lat, place.lon], 13);
              setView("globe");
              setTab("carte");
              setFlyToTarget({ lat: place.lat, lon: place.lon, timestamp: Date.now() });
            }}
            onGlobePreload={() => { void loadGlobeView().catch(() => undefined); }}
          />

          <div className="left-rail">
            {showSimulationPanel && (
              <SimulationPanel
                position="left"
                token={session?.token}
                sensors={sensors}
                run={floodRun}
                frameIndex={simulationFrame}
                request={simulationRequest}
                onLogin={() => setShowLogin(true)}
                onRunChange={handleRunChange}
                onFrameChange={setSimulationFrame}
                onRequestHandled={clearSimulationRequest}
              />
            )}
            {floodRun && <WaterLegend run={floodRun} frameIndex={simulationFrame} />}
          </div>

          <aside className={`insight-rail${tab !== "carte" ? " panel-mode" : ""}`} aria-label={tab === "carte" ? "Synthèse et impact" : `Panneau ${panelTitle}`}>
            {tab !== "carte" && (
              <div className="rail-toolbar">
                <button type="button" className="back-button" onClick={() => setTab("carte")}>
                  <Icon name="chevron" size={15} style={{ transform: "rotate(180deg)" }} />Carte
                </button>
                <strong>{panelTitle}</strong>
                <button type="button" className="icon-button" aria-label="Fermer le panneau" title="Fermer" onClick={() => setTab("carte")}>
                  <Icon name="close" size={15} />
                </button>
              </div>
            )}

            {tab === "carte" && (
              <>
                <HazardLiveCard
                  data={hazards.data}
                  stale={hazards.stale}
                  error={hazards.error}
                  placeMap={hazardPlaceMap}
                  onOpen={() => setTab("surveillance")}
                  onSelect={focusHazardById}
                />
                <SimulationInsights
                  run={floodRun}
                  frameIndex={simulationFrame}
                  situation={situation}
                  sensors={sensors}
                  alerts={alerts}
                  weather={displayWeather}
                  automaticFloods={automaticFloods}
                  automaticFloodError={automaticFloodError}
                  weatherError={weatherError}
                  weatherStatus={weatherStatus}
                  globalRain={globalRain.data}
                  globalRainUnavailable={globalRain.status === "unavailable"}
                  globalRainStale={globalRain.stale}
                  updatedAt={updatedAt}
                  offline={offline}
                  loading={loading}
                  liveDate={liveDate}
                  secondsSinceLastUpdate={secondsSinceLastUpdate}
                  liveTicker={liveTicker}
                  isRefreshing={isRefreshing}
                  onRefreshWeather={() => void refresh()}
                  onSelectSensor={setSelectedSensor}
                  onShowSensors={() => setTab("capteurs")}
                />
              </>
            )}

            {tab === "surveillance" && (
              <HazardConsole
                data={hazards.data}
                catalog={hazards.catalog}
                catalogError={hazards.catalogError}
                status={hazards.status}
                error={hazards.error}
                stale={hazards.stale}
                selectedId={selectedHazardId}
                places={places}
                placeMap={hazardPlaceMap}
                simulation={hazardSimulation}
                token={session?.token}
                onSelect={focusHazard}
                onLocate={focusHazard}
                onRefresh={hazards.refresh}
                onLogin={() => setShowLogin(true)}
                onSimulation={focusHazardSimulation}
              />
            )}

            {tab === "capteurs" && (
              <section className="rail-panel" aria-labelledby="sensors-heading">
                <div className="rail-panel-head">
                  <div><h2 id="sensors-heading">Capteurs</h2><p>Niveaux d'eau, pluviomètres et fraîcheur des mesures</p></div>
                  <span className="count-chip">{sensors.length}</span>
                </div>
                {!sensors.length && (
                  <p className="empty-note">
                    {loading ? "Chargement…" : offline ? "Serveur injoignable pour le moment : aucune donnée en mémoire." : "Aucun capteur enregistré. Ajoutez-en via l'API (POST /api/v1/sensors)."}
                  </p>
                )}
                <ul className="sensor-list">
                  {sensors.map((sensor) => (
                    <li key={sensor.code} className={activeSensor?.code === sensor.code ? "is-active" : ""}>
                      <i style={{ background: sensor.health_status === "online" ? LEVEL_COLOR[sensor.alert_level] : "#7f91a6" }} />
                      <button type="button" className="sensor-select" aria-pressed={activeSensor?.code === sensor.code} onClick={() => setSelectedSensor(sensor.code)}>
                        <strong>{sensor.name}</strong>
                        <small>{sensor.code} · {sensor.kind === "rain_gauge" ? "Pluviomètre" : "Niveau d'eau"} · {HEALTH_LABEL[sensor.health_status]} · {fmt(sensor.last_measured_at)}</small>
                      </button>
                      <span className="sensor-value">{sensor.kind === "rain_gauge" ? sensor.rain_mm_h == null ? "—" : `${sensor.rain_mm_h.toFixed(1)} mm/h` : sensor.water_level_cm == null ? "—" : `${sensor.water_level_cm.toFixed(0)} cm`}</span>
                    </li>
                  ))}
                </ul>
                {activeSensor && activeSensor.kind !== "rain_gauge" && <SensorHistory code={activeSensor.code} />}
              </section>
            )}

            {tab === "alertes" && (
              <section className="rail-panel" aria-labelledby="alerts-heading">
                <div className="rail-panel-head">
                  <div><h2 id="alerts-heading">Alertes récentes</h2><p>Déclenchées par les seuils déterministes</p></div>
                  <span className="count-chip">{alerts.length}</span>
                </div>
                {!alerts.length && <p className="empty-note">Aucune alerte enregistrée.</p>}
                <ul className="alert-list">
                  {alerts.map((alert) => (
                    <li key={alert.id}>
                      <i style={{ background: LEVEL_COLOR[alert.level] }} />
                      <div>
                        <strong>{LEVEL_LABEL[alert.level]}</strong>
                        <p>{alert.message}</p>
                        <small>{alert.sensor_code} · {fmt(alert.triggered_at)}</small>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {tab === "meteo" && (() => {
              const query = weatherSearch.trim().toLowerCase();
              const filteredWeather = displayWeather.filter((item) => {
                if (query && !item.name.toLowerCase().includes(query) && !item.source.toLowerCase().includes(query)) {
                  return false;
                }
                const intensity = item.observed_precip_mm_h ?? item.modeled_precip_mm_h ?? 0;
                if (weatherFilter === "rain") {
                  return intensity > 0;
                }
                if (weatherFilter === "alert") {
                  const lvl = item.observed_level ?? item.forecast_level ?? item.level;
                  return lvl === "orange" || lvl === "red";
                }
                return true;
              });

              return (
                <section className="rail-panel weather-observatory-panel" aria-labelledby="weather-heading">
                  <div className="rail-panel-head">
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <h2 id="weather-heading">Observatoire Météorologique</h2>
                        <span className="live-pill-badge">
                          <span className="live-dot" />
                          <span>HORLOGE 1 Hz</span>
                        </span>
                      </div>
                      <p>Surveillance hydrométéorologique mondiale · données fournisseur, horloge locale</p>
                    </div>
                    <button
                      type="button"
                      className={`refresh-action-btn ${isRefreshing ? "spin-active" : ""}`}
                      onClick={() => void refresh()}
                      title="Forcer l'actualisation immédiate des données"
                    >
                      <Icon name="refresh" size={14} />
                      <span>{isRefreshing ? "Actualisation…" : "Actualiser"}</span>
                    </button>
                  </div>

                  {/* Indicateurs météo : l'échelle de chaque compteur est explicite.
                      Un 0 n'est affiché que si des données fraîches existent ;
                      sinon on affiche « — » (données indisponibles). */}
                  <div className="weather-kpi-grid">
                    <div className="weather-kpi-card highlight">
                      <div className="kpi-icon"><Icon name="droplet" size={18} /></div>
                      <div className="kpi-body">
                        <span className="kpi-value">{displayMetrics.maxIntensity.toFixed(1)} <small>mm/h</small></span>
                        <span className="kpi-label">Pic instantané · zones affichées</span>
                      </div>
                    </div>
                    <div className="weather-kpi-card">
                      <div className="kpi-icon"><Icon name="activity" size={18} /></div>
                      <div className="kpi-body">
                        <span className="kpi-value">
                          {displayWeather.length ? displayMetrics.activeRainCount : "—"} <small>/ {displayWeather.length}</small>
                        </span>
                        <span className="kpi-label">Points en pluie · zones affichées</span>
                      </div>
                    </div>
                    <div className="weather-kpi-card">
                      <div className="kpi-icon"><Icon name="chart" size={18} /></div>
                      <div className="kpi-body">
                        <span className="kpi-value">{displayMetrics.max24hMm.toFixed(0)} <small>mm</small></span>
                        <span className="kpi-label">Cumul 24h max · zones affichées</span>
                      </div>
                    </div>
                    <div className="weather-kpi-card">
                      <div className="kpi-icon"><Icon name="clock" size={18} /></div>
                      <div className="kpi-body">
                        <span className="kpi-value">
                          {liveDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>
                        <span className="kpi-label">Horloge (synchro {secondsSinceLastUpdate}s)</span>
                      </div>
                    </div>
                    <div className="weather-kpi-card highlight">
                      <div className="kpi-icon"><Icon name="droplet" size={18} /></div>
                      <div className="kpi-body">
                        <span className="kpi-value">
                          {globalRain.data?.available && globalRain.data.rain_points != null
                            ? globalRain.data.rain_points
                            : "—"} <small>/ {globalRain.data?.valid_points ?? globalRain.data?.sampled_points ?? 0}</small>
                        </span>
                        <span className="kpi-label">Points en pluie · monde entier</span>
                      </div>
                    </div>
                    <div className="weather-kpi-card">
                      <div className="kpi-icon"><Icon name="world" size={18} /></div>
                      <div className="kpi-body">
                        <span className="kpi-value">
                          {globalRain.data?.available && globalRain.data.max_precip_mm_h != null
                            ? globalRain.data.max_precip_mm_h.toFixed(1)
                            : "—"} <small>mm/h</small>
                        </span>
                        <span className="kpi-label">Pic de pluie · scan mondial</span>
                      </div>
                    </div>
                  </div>
                  <p className="kpi-scale-note">
                    Compteurs « monde entier » : {globalRain.data?.sampled_points ?? 198} points de sondage, puis affinage local des zones arrosées
                    {globalRain.data ? ` · ${globalRain.data.attribution}` : " · Open-Meteo"}{globalRain.data?.source && globalRain.data.source !== "Open-Meteo" ? ` · ${globalRain.data.source}` : ""}.
                    {globalRain.data?.failed_points
                      ? ` ${globalRain.data.failed_points} point(s) sans donnée, jamais comptés comme secs.`
                      : " Les points sans donnée ne sont jamais comptés comme secs."}
                    {globalRain.stale && globalRain.data?.available
  ? ` Dernière mesure ${formatAgeSeconds(globalRain.data.age_seconds)}, actualisation momentanément indisponible.`
  : ""}
                  </p>
                  {globalRain.data?.available && !!globalRain.data.rain_places?.length && (
                    <div className="rain-places" role="region" aria-label="Lieux où il pleut dans le monde">
                      <p className="rain-places-title">Où il pleut le plus fort dans le monde</p>
                      <ul className="rain-places-list">
                        {globalRain.data.rain_places.map((place) => (
                          <li key={`${place.lat},${place.lon}`}>
                            <span className="rain-place-name">{place.name}</span>
                            {place.detail && <span className="rain-place-detail">{place.detail}</span>}
                            <span className="rain-place-tag">
                              {place.precision === "street" ? "rue"
                                : place.precision === "district" ? "quartier"
                                : place.precision === "locality" ? "localité"
                                : "coordonnées"}
                            </span>
                            {place.risk_level && place.risk_level !== "green" && (
                              <span className={`rain-place-risk is-${place.risk_level}`}>
                                {place.risk_level === "red" ? "vigilance rouge" : "vigilance orange"}
                              </span>
                            )}
                            <span className="rain-place-value">{place.precip_mm_h.toFixed(1)} mm/h</span>
                          </li>
                        ))}
                      </ul>
                      <p className="rain-places-source">Lieux : {globalRain.data.rain_places[0]?.attribution ?? "OpenStreetMap / Photon (ODbL)"} · mesure : {globalRain.data.attribution}</p>
                    </div>
                  )}
                  {(globalRain.status === "unavailable" || globalRain.data?.degraded) && (
                    <p className="err-msg" role="status">
                      Scan de pluie mondial {globalRain.data?.available ? "partiellement" : "momentanément"} indisponible
                      {globalRain.error ? ` : ${globalRain.error}` : ""}{globalRain.data?.available
  ? ". La dernière mesure valide reste affichée, marquée périmée."
  : ". Aucun zéro n'est affiché à la place d'une donnée manquante."}
                      <button type="button" className="ghost" onClick={globalRain.retry}>Réessayer</button>
                    </p>
                  )}

                  {weatherError && <p className="err-msg" role="alert">{weatherError} Les valeurs précédentes ne sont pas effacées.</p>}

                  {(weatherStatus || worldWeather.status !== "idle") && (
                    <div className="weather-sources-bar">
                      <small className="sources-label">Sources météo :</small>
                      {weatherStatus?.providers.map((provider) => (
                        <span key={provider.source} className={`source-tag ${provider.status}`}>
                          <i />
                          <span>{provider.source}</span>
                          <small>({provider.status === "current" ? "En ligne" : provider.status})</small>
                        </span>
                      ))}
                      {worldWeather.status === "ready" && (
                        <span className="source-tag current" title={worldWeather.attribution}>
                          <i />
                          <span>Open-Meteo · emprise visible</span>
                          <small>({worldWeather.points.length} point{worldWeather.points.length > 1 ? "s" : ""})</small>
                        </span>
                      )}
                      {worldWeather.status === "loading" && (
                        <span className="source-tag">
                          <i />
                          <span>Open-Meteo · emprise visible</span>
                          <small>(échantillonnage…)</small>
                        </span>
                      )}
                      {worldWeather.status === "unavailable" && (
                        <span className="source-tag stale" title={worldWeather.error ?? undefined}>
                          <i />
                          <span>Open-Meteo · emprise visible</span>
                          <small>(indisponible)</small>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Barre de recherche et filtres rapides */}
                  <div className="weather-filter-bar">
                    <div className="weather-search-input-wrap">
                      <Icon name="search" size={15} />
                      <input
                        type="search"
                        placeholder="Rechercher une ville ou un point météo…"
                        value={weatherSearch}
                        onChange={(e) => setWeatherSearch(e.target.value)}
                        aria-label="Rechercher une ville ou un point météo"
                      />
                      {weatherSearch && (
                        <button type="button" className="clear-search-btn" onClick={() => setWeatherSearch("")}>
                          <Icon name="close" size={12} />
                        </button>
                      )}
                    </div>
                    <div className="weather-filter-pills">
                      <button
                        type="button"
                        className={`filter-pill ${weatherFilter === "all" ? "active" : ""}`}
                        onClick={() => setWeatherFilter("all")}
                      >
                        Toutes ({displayWeather.length})
                      </button>
                      <button
                        type="button"
                        className={`filter-pill ${weatherFilter === "rain" ? "active" : ""}`}
                        onClick={() => setWeatherFilter("rain")}
                      >
                        En pluie ({displayMetrics.activeRainCount})
                      </button>
                      <button
                        type="button"
                        className={`filter-pill ${weatherFilter === "alert" ? "active" : ""}`}
                        onClick={() => setWeatherFilter("alert")}
                      >
                        Vigilance
                      </button>
                    </div>
                  </div>

                  {!filteredWeather.length && (
                    <p className="empty-note">
                      {loading
                        ? "Chargement des flux météo…"
                        : weatherSearch
                          ? `Aucune station météo ne correspond à « ${weatherSearch} ».`
                          : "Aucune donnée disponible dans cette catégorie."}
                    </p>
                  )}

                  <ul className="weather-cards-list">
                    {filteredWeather.map((item) => {
                      const intensity = item.observed_precip_mm_h ?? item.modeled_precip_mm_h ?? 0;
                      const isObserved = item.observed_precip_mm_h != null;
                      const gaugePercent = Math.min(100, Math.round((intensity / 40) * 100));
                      const effectiveLevel = item.observed_level ?? item.forecast_level ?? item.level;
                      const modeLabel = item.source_kind === "iot_gauge"
                        ? "Pluviomètre IoT"
                        : item.source_kind === "provider_report"
                          ? "Rapport fournisseur"
                          : item.source_kind === "bulletin"
                            ? "Bulletin officiel"
                            : "Modèle Open-Meteo";

                      return (
                        <li key={`${item.source}-${item.name}`} className="weather-station-card">
                          <div className="station-card-top">
                            <div className="station-identity">
                              <i className="level-dot" style={{ background: LEVEL_COLOR[effectiveLevel] }} />
                              <div>
                                <strong className="station-name">{item.name}</strong>
                                <span className="station-coords">
                                  {formatCoordinates(item.lat, item.lon)} · {item.source}
                                </span>
                              </div>
                            </div>
                            <div className="station-telemetry-badge">
                              <span className="station-intensity">{intensity.toFixed(1)}</span>
                              <span className="station-unit">mm/h</span>
                            </div>
                          </div>

                          {/* Gauge bar de précipitation */}
                          <div className="station-gauge-track" title={`Intensité : ${intensity.toFixed(1)} mm/h`}>
                            <div
                              className="station-gauge-fill"
                              style={{
                                width: `${Math.max(3, gaugePercent)}%`,
                                background: intensity >= 30 ? "#ff4d4d" : intensity >= 10 ? "#f5b942" : "#37c6f4",
                              }}
                            />
                          </div>

                          <div className="station-stats-row">
                            <div className="stat-col">
                              <span className="stat-label">Mode</span>
                              <span className="stat-val">{modeLabel}</span>
                            </div>
                            <div className="stat-col">
                              <span className="stat-label">Prévision +3h</span>
                              <span className="stat-val">{item.forecast_intensity_3h_mm_h ?? item.intensity_3h_mm_h} mm/h</span>
                            </div>
                            <div className="stat-col">
                              <span className="stat-label">Cumul 24h</span>
                              <span className="stat-val">
                                {item.source_kind === "weather_model" ? item.modeled_24h_mm ?? 0 : item.observed_24h_mm ?? 0} mm
                              </span>
                            </div>
                            <div className="stat-col">
                              <span className="stat-label">Vigilance</span>
                              <span className="stat-val" style={{ color: LEVEL_COLOR[effectiveLevel] }}>
                                {LEVEL_LABEL[effectiveLevel]}
                              </span>
                            </div>
                          </div>

                          <div className="station-footer-row">
                            <small className="update-time">
                              {isObserved && item.observed_at
                                ? `Observé : ${fmt(item.observed_at)}`
                                : item.modeled_at
                                  ? `Estimation modèle : ${fmt(item.modeled_at)}`
                                  : `Actualisé : ${fmt(item.updated_at)}`}
                            </small>
                            <button
                              type="button"
                              className="locate-map-btn"
                              title="Localiser et survoler en 3D"
                              onClick={() => {
                                if (view === "map") mapRef.current?.setView([item.lat, item.lon], 12);
                                setView("globe");
                                setTab("carte");
                                setFlyToTarget({ lat: item.lat, lon: item.lon, timestamp: Date.now() });
                              }}
                            >
                              <Icon name="globe" size={13} />
                              <span>Localiser 3D</span>
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })()}

            {tab === "observations" && (
              <ObservationsPanel token={session?.token} user={session?.user} />
            )}

            {tab === "ia" && (
              <AssistantPanel
                token={session?.token}
                sensors={sensors}
                alerts={alerts}
                weather={displayWeather}
                clientContext={assistantContext}
                onActions={applyAssistantActions}
                places={places}
                userPosition={locationState.position}
              />
            )}

            {tab === "gestion" && (
              session && can(session.user, "agent_terrain")
                ? <div className="rail-panel manage-panel"><Manage token={session.token} user={session.user} onDone={() => void refresh()} /></div>
                : <section className="rail-panel"><p className="empty-note">Connectez-vous avec un compte agent, analyste, responsable ou administrateur pour accéder à la gestion.</p></section>
            )}

            <p className="credits-line">
              Pluie : Open-Meteo.com (CC BY 4.0) et bulletins saisis · radar : Weather data by RainViewer ·
              lieux GeoNames (CC BY 4.0) · frontières Natural Earth · fonds © OpenStreetMap / Esri / NASA ·
              seuils provisoires, à valider.
            </p>
          </aside>

          <SimulationTimeline
            run={floodRun}
            frameIndex={simulationFrame}
            playing={playing}
            onTogglePlaying={() => setPlaying((value) => !value)}
            onFrameChange={handleScrub}
          />
        </div>
      </main>

      <LocationPrompt
        open={locationState.promptVisible && !showLogin}
        onAllow={() => { void locationState.requestLocation(); }}
        onLater={locationState.postponePrompt}
        onDeny={locationState.refuseLocation}
      />

      {showLogin && <Login onLogged={() => { setSession(loadSession()); setShowLogin(false); }} onCancel={() => setShowLogin(false)} />}
    </div>
  );
}

export default App;
