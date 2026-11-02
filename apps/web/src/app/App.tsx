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
import { LEVEL_COLOR, LEVEL_LABEL } from "../services/levels";
import { FloodRun } from "../services/simulation";

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

export function App() {
  const { sensors, alerts, weather, offline, loading, updatedAt, refresh } = useMonitoring();
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

  const worst = sensors.some((sensor) => sensor.alert_level === "red")
    ? "red"
    : sensors.some((sensor) => sensor.alert_level === "orange")
      ? "orange"
      : "green";
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
          <span className="status-pill" style={{ borderColor: `${LEVEL_COLOR[worst]}66` }}>
            <i style={{ background: LEVEL_COLOR[worst] }} />
            <span>Situation : {LEVEL_LABEL[worst]}</span>
          </span>
          <button type="button" className="icon-button" aria-label="Actualiser" title="Actualiser les données" onClick={() => void refresh()}>
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

      <main className={`workspace tab-${tab}`}>
        <div className="map-stage">
          {view === "map" ? (
            <SensorMap
              sensors={sensors}
              weather={weather}
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
              <GlobeView sensors={sensors} weather={weather} simulation={floodRun} frameIndex={simulationFrame} />
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
              setView("map");
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
                worst={worst}
                sensors={sensors}
                alerts={alerts}
                weather={weather}
                updatedAt={updatedAt}
                offline={offline}
                loading={loading}
                onSelectSensor={setSelectedSensor}
                onShowSensors={() => setTab("capteurs")}
              />
            )}

            {tab === "capteurs" && (
              <section className="rail-panel" aria-labelledby="sensors-heading">
                <div className="rail-panel-head">
                  <div><h2 id="sensors-heading">Capteurs</h2><p>Niveaux d'eau et fraîcheur des mesures</p></div>
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
                      <i style={{ background: LEVEL_COLOR[sensor.alert_level] }} />
                      <button type="button" className="sensor-select" aria-pressed={activeSensor?.code === sensor.code} onClick={() => setSelectedSensor(sensor.code)}>
                        <strong>{sensor.name}</strong>
                        <small>{sensor.code} · {HEALTH_LABEL[sensor.health_status]} · {fmt(sensor.last_measured_at)}</small>
                      </button>
                      <span className="sensor-value">{sensor.water_level_cm == null ? "—" : `${sensor.water_level_cm.toFixed(0)} cm`}</span>
                    </li>
                  ))}
                </ul>
                {activeSensor && <SensorHistory code={activeSensor.code} />}
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

            {tab === "meteo" && (
              <section className="rail-panel" aria-labelledby="weather-heading">
                <div className="rail-panel-head">
                  <div><h2 id="weather-heading">Météo · risque pluie</h2><p>Prévisions et bulletins disponibles</p></div>
                  <span className="count-chip">{weather.length}</span>
                </div>
                {!weather.length && <p className="empty-note">Aucune donnée météo. Activez la collecte (WEATHER_ENABLED) ou saisissez un bulletin.</p>}
                <ul className="weather-list">
                  {weather.map((item) => (
                    <li key={`${item.source}-${item.name}`}>
                      <i style={{ background: LEVEL_COLOR[item.level] }} />
                      <div>
                        <strong>{item.name}</strong>
                        <p>{item.intensity_3h_mm_h} mm/h dans 3 h · {item.accumulated_24h_mm} mm sur 24 h</p>
                        <small>{item.source} · {fmt(item.updated_at)}</small>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

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
