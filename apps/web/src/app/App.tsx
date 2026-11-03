/** Plateforme IntelliFlood : carte plein écran, simulation, alertes et observations. */

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { SensorMap } from "../dashboard/SensorMap";
import { useMonitoring } from "../dashboard/useMonitoring";
import { Login } from "../dashboard/Login";
import { Manage } from "../dashboard/Manage";
import { ObservationsPanel } from "../dashboard/ObservationsPanel";
import { SensorHistory } from "../dashboard/SensorHistory";
import { SimulationPanel } from "../dashboard/SimulationPanel";
import { SimulationInsights } from "../dashboard/SimulationInsights";
import { SimulationTimeline } from "../dashboard/SimulationTimeline";
import { WaterLegend } from "../dashboard/WaterLegend";
import { AssistantPanel } from "../components/AssistantPanel";
import { MapToolbar } from "../components/MapToolbar";
import { Icon, IconName } from "../components/Icon";
import { can, loadSession, logout } from "../services/auth";
import {
  LEVEL_COLOR,
  LEVEL_LABEL,
  SITUATION_COLOR,
  SITUATION_LABEL,
} from "../services/levels";
import { FloodRun } from "../services/simulation";
import { currentSituation } from "../services/situation";

let globeModulePromise: Promise<typeof import("../globe/GlobeView")> | undefined;
const loadGlobeView = () => {
  globeModulePromise ??= import("../globe/GlobeView").catch((error: unknown) => {
    globeModulePromise = undefined;
    throw error;
  });
  return globeModulePromise;
};
const GlobeView = lazy(loadGlobeView);

type Tab = "carte" | "capteurs" | "alertes" | "meteo" | "observations" | "gestion" | "ia";
type BaseLayer = "osm" | "esri" | "nasa";
type MapHandle = {
  setView: (center: [number, number], zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

const NAV: ReadonlyArray<{ key: Tab; label: string; short: string; icon: IconName; minimum?: "agent_terrain" }> = [
  { key: "carte", label: "Carte", short: "Carte", icon: "map" },
  { key: "capteurs", label: "Capteurs", short: "Capteurs", icon: "sensors" },
  { key: "alertes", label: "Alertes", short: "Alertes", icon: "alert" },
  { key: "meteo", label: "Météo", short: "Météo", icon: "weather" },
  { key: "observations", label: "Observations", short: "Observations", icon: "observations" },
  { key: "ia", label: "Assistant IA", short: "IA", icon: "ai" },
  { key: "gestion", label: "Gestion", short: "Gestion", icon: "settings", minimum: "agent_terrain" },
];
const TABS = NAV.map((item) => item.key);
const readTab = (): Tab => TABS.find((tab) => location.hash === `#${tab}`) ?? "carte";
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
    automaticFloods,
    automaticFloodError,
    offline,
    loading,
    isRefreshing,
    updatedAt,
    liveDate,
    secondsSinceLastUpdate,
    liveTicker,
    liveMetrics,
    refresh,
  } = useMonitoring();
  const situation = currentSituation(sensors, weather, offline || loading);
  const [tab, setTab] = useState<Tab>(readTab);
  const [session, setSession] = useState(loadSession);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [selectedSensor, setSelectedSensor] = useState<string | null>(null);
  const [view, setView] = useState<"map" | "globe">(() => (location.hash === "#globe" ? "globe" : "map"));
  const [floodRun, setFloodRun] = useState<FloodRun | null>(null);
  const [simulationFrame, setSimulationFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [baseLayer, setBaseLayer] = useState<BaseLayer>("osm");
  const [showSensors, setShowSensors] = useState(true);
  const [showWeather, setShowWeather] = useState(true);
  const [showAlerts, setShowAlerts] = useState(true);
  const [weatherSearch, setWeatherSearch] = useState("");
  const [weatherFilter, setWeatherFilter] = useState<"all" | "rain" | "alert">("all");
  const [flyToTarget, setFlyToTarget] = useState<{ lat: number; lon: number; height?: number; timestamp?: number } | null>(null);
  const mapRef = useRef<MapHandle | null>(null);

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

  const showSimulationPanel = tab !== "observations" && tab !== "ia" && tab !== "gestion";
  const visibleNav = NAV.filter((item) => !item.minimum || can(session?.user, item.minimum));

  const panelTitle = NAV.find((item) => item.key === tab)?.label ?? "Carte";

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Retour à l'accueil">
          <img className="brand-logo" src="/brand/intelliflood-logo.png" alt="" />
        </a>

        <nav className="topnav" aria-label="Sections principales">
          {visibleNav.map((item) => (
            <a key={item.key} href={`#${item.key}`} className={tab === item.key ? "on" : ""} onClick={() => setTab(item.key)}>
              <Icon name={item.icon} size={17} />
              <span>{item.label}</span>
              {item.key === "alertes" && alerts.length > 0 && <em className="nav-count">{alerts.length}</em>}
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
      {offline && <div className="banner" role="status">Hors ligne — dernières données connues{updatedAt ? ` (${fmt(updatedAt)})` : ""}. Les mesures reprendront dès le retour du réseau.</div>}
      {automaticFloodError && <div className="banner banner-warning" role="alert">Les impacts automatiques sont temporairement indisponibles : {automaticFloodError}</div>}

      <main className={`workspace tab-${tab}`}>
        <div className="map-stage">
          {view === "map" ? (
            <SensorMap
              sensors={offline ? [] : sensors}
              weather={offline ? [] : weather}
              automaticFloods={offline ? [] : automaticFloods?.events ?? []}
              onSelect={setSelectedSensor}
              simulation={floodRun}
              frameIndex={simulationFrame}
              baseLayer={baseLayer}
              showSensors={showSensors}
              showWeather={showWeather}
              showAlerts={showAlerts}
              mapRef={mapRef}
            />
          ) : (
            <Suspense fallback={<div className="globe-loading"><span className="spinner" />Chargement du globe…</div>}>
              <GlobeView
                sensors={offline ? [] : sensors}
                weather={offline ? [] : weather}
                simulation={floodRun}
                automaticFloods={offline ? [] : automaticFloods?.events ?? []}
                frameIndex={simulationFrame}
                flyToTarget={flyToTarget}
              />
            </Suspense>
          )}

          <MapToolbar
            view={view}
            onViewChange={setView}
            baseLayer={baseLayer}
            onBaseLayerChange={setBaseLayer}
            showSensors={showSensors}
            onShowSensorsChange={setShowSensors}
            showWeather={showWeather}
            onShowWeatherChange={setShowWeather}
            showAlerts={showAlerts}
            onShowAlertsChange={setShowAlerts}
            mapRef={mapRef}
            token={session?.token}
            onPlaceSelect={(place) => {
              setView("globe");
              setTab("carte");
              setFlyToTarget({ lat: place.lat, lon: place.lon, timestamp: Date.now() });
              mapRef.current?.setView([place.lat, place.lon], 13);
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
                onLogin={() => setShowLogin(true)}
                onRunChange={handleRunChange}
                onFrameChange={setSimulationFrame}
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
              <SimulationInsights
                run={floodRun}
                frameIndex={simulationFrame}
                situation={situation}
                sensors={sensors}
                alerts={alerts}
                weather={weather}
                automaticFloods={offline ? null : automaticFloods}
                automaticFloodError={automaticFloodError}
                weatherError={weatherError}
                weatherStatus={weatherStatus}
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
              const filteredWeather = weather.filter((item) => {
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
                          <span>1 Hz CONTINU</span>
                        </span>
                      </div>
                      <p>Surveillance hydrométéorologique haute précision · seconde par seconde</p>
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

                  {/* Télémétrie en temps réel · KPI Cards */}
                  <div className="weather-kpi-grid">
                    <div className="weather-kpi-card highlight">
                      <div className="kpi-icon"><Icon name="droplet" size={18} /></div>
                      <div className="kpi-body">
                        <span className="kpi-value">{liveMetrics.instantaneousMaxMmH.toFixed(1)} <small>mm/h</small></span>
                        <span className="kpi-label">Pic Instantané Max</span>
                      </div>
                    </div>
                    <div className="weather-kpi-card">
                      <div className="kpi-icon"><Icon name="activity" size={18} /></div>
                      <div className="kpi-body">
                        <span className="kpi-value">{liveMetrics.activeRainCount} <small>/ {weather.length}</small></span>
                        <span className="kpi-label">Stations en Pluie</span>
                      </div>
                    </div>
                    <div className="weather-kpi-card">
                      <div className="kpi-icon"><Icon name="chart" size={18} /></div>
                      <div className="kpi-body">
                        <span className="kpi-value">{liveMetrics.totalEstimated24hMm.toFixed(0)} <small>mm</small></span>
                        <span className="kpi-label">Cumul 24h National</span>
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
                  </div>

                  {weatherError && <p className="err-msg" role="alert">{weatherError} Les valeurs précédentes ne sont pas effacées.</p>}

                  {weatherStatus && (
                    <div className="weather-sources-bar">
                      <small className="sources-label">Sources en direct :</small>
                      {weatherStatus.providers.map((provider) => (
                        <span key={provider.source} className={`source-tag ${provider.status}`}>
                          <i />
                          <span>{provider.source}</span>
                          <small>({provider.status === "current" ? "En ligne" : provider.status})</small>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Barre de recherche et filtres rapides */}
                  <div className="weather-filter-bar">
                    <div className="weather-search-input-wrap">
                      <Icon name="search" size={15} />
                      <input
                        type="search"
                        placeholder="Rechercher une station, commune…"
                        value={weatherSearch}
                        onChange={(e) => setWeatherSearch(e.target.value)}
                        aria-label="Rechercher une station météo"
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
                        Toutes ({weather.length})
                      </button>
                      <button
                        type="button"
                        className={`filter-pill ${weatherFilter === "rain" ? "active" : ""}`}
                        onClick={() => setWeatherFilter("rain")}
                      >
                        En pluie ({liveMetrics.activeRainCount})
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

                      return (
                        <li key={`${item.source}-${item.name}`} className="weather-station-card">
                          <div className="station-card-top">
                            <div className="station-identity">
                              <i className="level-dot" style={{ background: LEVEL_COLOR[effectiveLevel] }} />
                              <div>
                                <strong className="station-name">{item.name}</strong>
                                <span className="station-coords">
                                  {item.lat.toFixed(2)}°N, {item.lon.toFixed(2)}°W · {item.source}
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
                              <span className="stat-val">{isObserved ? "Mesure IoT" : "Radar modèle"}</span>
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
                              Observé : {fmt(item.observed_at ?? item.modeled_at ?? item.updated_at)}
                            </small>
                            <button
                              type="button"
                              className="locate-map-btn"
                              title="Localiser et survoler en 3D"
                              onClick={() => {
                                setView("globe");
                                setTab("carte");
                                setFlyToTarget({ lat: item.lat, lon: item.lon, timestamp: Date.now() });
                                mapRef.current?.setView([item.lat, item.lon], 12);
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
              <AssistantPanel token={session?.token} sensors={sensors} alerts={alerts} weather={weather} />
            )}

            {tab === "gestion" && (
              session && can(session.user, "agent_terrain")
                ? <div className="rail-panel manage-panel"><Manage token={session.token} user={session.user} onDone={() => void refresh()} /></div>
                : <section className="rail-panel"><p className="empty-note">Connectez-vous avec un compte agent, analyste, responsable ou administrateur pour accéder à la gestion.</p></section>
            )}

            <p className="credits-line">
              Pluie : Open-Meteo.com (CC BY 4.0) et bulletins saisis · seuils provisoires, à valider · fonds © OpenStreetMap / Esri / NASA.
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

      {showLogin && <Login onLogged={() => { setSession(loadSession()); setShowLogin(false); }} onCancel={() => setShowLogin(false)} />}
    </div>
  );
}

export default App;
