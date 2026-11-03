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
  const { sensors, alerts, weather, weatherStatus, weatherError, automaticFloods, automaticFloodError, offline, loading, updatedAt, refresh } = useMonitoring();
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
          <span className="status-pill" style={{ borderColor: `${SITUATION_COLOR[situation.level]}66` }}>
            <i style={{ background: SITUATION_COLOR[situation.level] }} />
            <span>
              {situation.level === "unknown"
                ? "Situation : données insuffisantes"
                : `Situation mesurée : ${SITUATION_LABEL[situation.level]}`}
            </span>
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

            {tab === "meteo" && (
              <section className="rail-panel" aria-labelledby="weather-heading">
                <div className="rail-panel-head">
                  <div><h2 id="weather-heading">Météo · observations et prévisions</h2><p>Mesures terrain, estimations météo courantes et prévisions distinguées</p></div>
                  <span className="count-chip">{weather.length}</span>
                </div>
                {weatherError && <p className="err-msg" role="alert">{weatherError} Les valeurs précédentes ne sont pas effacées.</p>}
                {weatherStatus && <ul className="weather-list source-status-list">
                  {weatherStatus.providers.map((provider) => (
                    <li key={provider.source}>
                      <i style={{ background: !offline && provider.status === "current" ? "#35d39a" : !offline && provider.status === "stale" ? "#f5b942" : "#7f91a6" }} />
                      <div><strong>{provider.source}</strong><p>{offline ? "Hors ligne · dernier état connu" : provider.status === "current" ? "Collecte récente" : provider.status === "stale" ? "Données anciennes" : provider.status === "disabled" ? "Désactivé / clé non configurée" : "Aucune donnée reçue"}</p><small>Dernière collecte : {fmt(provider.last_success_at)}</small></div>
                    </li>
                  ))}
                </ul>}
                {!weather.length && <p className="empty-note">{loading ? "Chargement des données météo…" : "Aucune observation météo disponible. Les bulletins et pluviomètres IoT restent utilisables même si un fournisseur est indisponible."}</p>}
                <ul className="weather-list">
                  {weather.map((item) => (
                    <li key={`${item.source}-${item.name}`}>
                      <i style={{ background: LEVEL_COLOR[item.observed_level ?? item.forecast_level ?? item.level] }} />
                      <div>
                        <strong>{item.name}</strong>
                        <p>
                          {offline
                            ? "Dernière valeur connue (cache hors ligne)"
                            : item.observed_precip_mm_h != null
                              ? `${item.observed_precip_mm_h.toFixed(1)} mm/h rapportés`
                              : item.modeled_precip_mm_h != null
                                ? `${item.modeled_precip_mm_h.toFixed(1)} mm/h estimés maintenant par Open-Meteo`
                                : "Aucune pluie actuelle rapportée"}
                          {" · "}prévision max. à 3 h : {item.forecast_intensity_3h_mm_h ?? item.intensity_3h_mm_h} mm/h
                          {" · "}{item.source_kind === "weather_model" ? "cumul modèle 24 h" : "cumul mesuré 24 h"} : {
                            item.source_kind === "weather_model"
                              ? item.modeled_24h_mm ?? 0
                              : item.observed_24h_mm ?? 0
                          } mm
                        </p>
                        <small>
                          Niveau actuel : {offline
                            ? "non disponible hors ligne"
                            : item.observed_level
                              ? LEVEL_LABEL[item.observed_level]
                              : item.modeled_precip_mm_h != null
                                ? `estimation ${LEVEL_LABEL[item.level]}`
                                : "non déterminé"}
                          {" · "}prévision : {LEVEL_LABEL[item.forecast_level ?? item.level]}
                        </small>
                        <small>
                          {WEATHER_SOURCE_LABEL[item.source_kind ?? ""] ?? item.source} · {item.source}
                          {" · "}donnée : {fmt(item.observed_at ?? item.modeled_at ?? null)}
                          {" · "}collecte : {fmt(item.updated_at)}
                        </small>
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
