import { useMemo } from "react";
import { AlertItem, SensorState, WeatherItem, WeatherStatus } from "../services/api";
import {
  AutomaticFloodsResponse,
  bboxAreaKm2,
  depthClassAreas,
  floodedAreaKm2,
  floodedAreaShare,
  FloodRun,
  frameLabel,
  frameMaxDepth,
  simulationDurationMinutes,
  scenarioLabel,
} from "../services/simulation";
import { LEVEL_COLOR, LEVEL_LABEL, SITUATION_COLOR, SITUATION_LABEL } from "../services/levels";
import { CurrentSituation } from "../services/situation";
import { Icon } from "../components/Icon";

type Props = {
  run: FloodRun | null;
  frameIndex: number;
  situation: CurrentSituation;
  sensors: SensorState[];
  alerts: AlertItem[];
  weather: WeatherItem[];
  weatherError?: string | null;
  weatherStatus?: WeatherStatus | null;
  automaticFloods?: AutomaticFloodsResponse | null;
  automaticFloodError?: string | null;
  updatedAt: string;
  offline: boolean;
  loading: boolean;
  onSelectSensor?: (code: string) => void;
  onShowSensors?: () => void;
};

const numberFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const decimalFormat = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatTime(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function EvolutionChart({ run, frameIndex }: { run: FloodRun; frameIndex: number }) {
  const width = 300;
  const height = 104;
  const padX = 4;
  const padY = 8;
  const duration = simulationDurationMinutes(run);
  const frames = run.result.frames.length
    ? run.result.frames
    : [{ fraction: 1, area_km2: run.result.stats.area_km2, depth_cm_b64: "", max_depth_m: run.result.stats.max_depth_m }];
  const total = bboxAreaKm2(run.result.bbox);
  const shares = frames.map((frame) => (total > 0 ? (frame.area_km2 / total) * 100 : 0));
  const maxShare = Math.max(1, ...shares);
  const currentIndex = Math.min(Math.max(0, frameIndex), frames.length - 1);
  const x = (index: number) => padX + (frames.length === 1 ? 0 : (index / (frames.length - 1)) * (width - padX * 2));
  const y = (value: number) => height - padY - (value / maxShare) * (height - padY * 2);
  const points = shares.map((value, index) => `${x(index)},${y(value)}`).join(" ");
  const area = `M ${x(0)} ${height - padY} L ${shares.map((value, index) => `${x(index)} ${y(value)}`).join(" L ")} L ${x(shares.length - 1)} ${height - padY} Z`;

  return (
    <div className="evolution-chart">
      <div className="chart-head">
        <span>Part de la zone simulée</span>
        <strong>{shares[currentIndex]?.toFixed(1) ?? "0,0"} %</strong>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Évolution de la surface inondée dans le temps">
        <title>Évolution de la surface inondée</title>
        <desc>{`${frames.length} image(s), de 0 à ${maxShare.toFixed(1)} pour cent de la zone simulée.`}</desc>
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1={padX}
            x2={width - padX}
            y1={padY + ratio * (height - padY * 2)}
            y2={padY + ratio * (height - padY * 2)}
            className="chart-grid"
          />
        ))}
        <path d={area} className="chart-area" />
        <polyline points={points} className="chart-line" />
        <circle cx={x(currentIndex)} cy={y(shares[currentIndex] ?? 0)} r="4.5" className="chart-current" />
      </svg>
      <div className="chart-scale">
        <span>{frameLabel(0, duration)}</span>
        <span>{frameLabel(0.5, duration)}</span>
        <span>{frameLabel(1, duration)}</span>
      </div>
    </div>
  );
}

export function SimulationInsights({
  run,
  frameIndex,
  situation,
  sensors,
  alerts,
  weather,
  weatherError,
  weatherStatus,
  automaticFloods,
  automaticFloodError,
  updatedAt,
  offline,
  loading,
  onSelectSensor,
  onShowSensors,
}: Props) {
  const classes = useMemo(() => {
    if (!run) return [];
    try {
      return depthClassAreas(run.result, frameIndex);
    } catch {
      return [];
    }
  }, [run, frameIndex]);

  if (!run) {
    const activeSensors = offline ? [] : sensors.slice(0, 3);
    const activeWaterAlerts = offline ? [] : sensors.filter(
      (sensor) => sensor.kind !== "rain_gauge"
        && sensor.status === "active"
        && sensor.health_status === "online"
        && sensor.alert_level !== "green",
    );
    const activeRain = offline ? [] : weather.filter((item) => (item.observed_precip_mm_h ?? 0) > 0);
    const modeledRain = offline ? [] : weather.filter((item) => (item.modeled_precip_mm_h ?? 0) > 0);
    const forecastRain = weather.filter((item) => (item.forecast_intensity_3h_mm_h ?? item.intensity_3h_mm_h) > 0);
    const allRainPoints = [...activeRain, ...modeledRain.filter((m) => !activeRain.some((a) => a.name === m.name && a.source === m.source))];
    const strongestRain = activeRain.reduce<WeatherItem | null>(
      (strongest, item) => !strongest || (item.observed_precip_mm_h ?? 0) > (strongest.observed_precip_mm_h ?? 0) ? item : strongest,
      null,
    );
    const strongestModeled = modeledRain.reduce<WeatherItem | null>(
      (strongest, item) => !strongest || (item.modeled_precip_mm_h ?? 0) > (strongest.modeled_precip_mm_h ?? 0) ? item : strongest,
      null,
    );
    const maxObservedIntensity = strongestRain?.observed_precip_mm_h ?? 0;
    const maxModeledIntensity = strongestModeled?.modeled_precip_mm_h ?? 0;
    const maxIntensity = Math.max(maxObservedIntensity, maxModeledIntensity);
    const autoEvents = automaticFloods?.events ?? [];
    return (
      <>
        {/* Carte Météo Temps Réel — toujours visible */}
        <section className="insight-card weather-realtime-card">
          <header className="card-head">
            <span className="card-icon" style={{ color: "#64b4ff", background: "#64b4ff1f" }}>
              <Icon name="weather" />
            </span>
            <div>
              <h3>Météo temps réel</h3>
              <small>Côte d'Ivoire · données actualisées automatiquement</small>
            </div>
          </header>
          <div className="overview-metrics">
            <div><strong>{weather.length}</strong><span>points météo</span></div>
            <div><strong>{allRainPoints.length}</strong><span>points en pluie</span></div>
            <div className={maxIntensity >= 30 ? "metric-alert" : maxIntensity >= 10 ? "metric-warning" : ""}>
              <strong>{maxIntensity > 0 ? maxIntensity.toFixed(1) : "0,0"}</strong>
              <span>mm/h max</span>
            </div>
            <div><strong>{forecastRain.length}</strong><span>prévision pluie</span></div>
          </div>
          {allRainPoints.length > 0 && (
            <ul className="mini-list rain-mini-list">
              {allRainPoints.slice(0, 5).map((item) => {
                const intensity = item.observed_precip_mm_h ?? item.modeled_precip_mm_h ?? 0;
                const isObserved = item.observed_precip_mm_h != null;
                return (
                  <li key={`${item.source}-${item.name}`}>
                    <i style={{ background: intensity >= 30 ? "#ff4d4d" : intensity >= 10 ? "#f5b942" : "#35d39a" }} />
                    <div>
                      <span>{item.name}</span>
                      <small>{intensity.toFixed(1)} mm/h {isObserved ? "rapportés" : "estimés"} · {item.source}</small>
                    </div>
                  </li>
                );
              })}
              {allRainPoints.length > 5 && <li className="more-items">… et {allRainPoints.length - 5} autre(s)</li>}
            </ul>
          )}
          {allRainPoints.length === 0 && !offline && !loading && (
            <p className="empty-note">Aucune pluie détectée actuellement sur les points surveillés.</p>
          )}
          {weatherError && <p className="err-msg" role="alert">Météo : {weatherError}</p>}
          {weatherStatus && <small className="card-footer">
            Collecte : {weatherStatus.refresh_interval_minutes} min · {
              weatherStatus.providers.map((provider) => `${provider.source} : ${provider.status}`).join(" · ")
            }
          </small>}
        </section>

        {/* Impacts automatiques — visible quand il y a des événements */}
        {autoEvents.length > 0 && (
          <section className="insight-card auto-impact-card">
            <header className="card-head">
              <span className="card-icon warning">
                <Icon name="warning" />
              </span>
              <div>
                <h3>Simulations automatiques en cours</h3>
                <small>{autoEvents.length} zone(s) impactée(s) selon les données réelles</small>
              </div>
            </header>
            <ul className="mini-list">
              {autoEvents.slice(0, 6).map((event) => (
                <li key={event.id}>
                  <i style={{
                    background: event.simulation.result.stats.max_depth_m >= 1
                      ? "#0a28a0"
                      : event.simulation.result.stats.max_depth_m >= 0.5
                        ? "#1450c8"
                        : "#64b4ff",
                  }} />
                  <div>
                    <span>{event.name}</span>
                    <small>
                      {event.type === "rain_impact_estimate"
                        ? `${event.trigger_basis === "24h" ? `${event.rain_24h_mm} mm/24h` : `${event.simulation.input.rain_mm_h} mm/h`}`
                        : `${event.measured_water_level_cm} cm`}
                      {" · "}max {decimalFormat.format(event.simulation.result.stats.max_depth_m)} m
                      {" · "}{decimalFormat.format(event.simulation.result.stats.area_km2)} km²
                      {" · "}{new Date(event.observed_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    </small>
                  </div>
                </li>
              ))}
              {autoEvents.length > 6 && <li className="more-items">… et {autoEvents.length - 6} autre(s)</li>}
            </ul>
            <p className="fine-print">
              Ces simulations sont calculées automatiquement à partir des données météo réelles. Elles ne sont pas des confirmations terrain.
            </p>
          </section>
        )}

        {/* Situation globale */}
        <section className="insight-card">
          <header className="card-head">
            <span className="card-icon" style={{ color: SITUATION_COLOR[situation.level], background: `${SITUATION_COLOR[situation.level]}1f` }}>
              <Icon name="check" />
            </span>
            <div>
              <h3>Situation globale</h3>
              <small>Mesures actuelles reçues · couverture géographique partielle</small>
            </div>
            <span className="level-chip" style={{ color: SITUATION_COLOR[situation.level], borderColor: `${SITUATION_COLOR[situation.level]}66` }}>
              <i style={{ background: SITUATION_COLOR[situation.level] }} />{SITUATION_LABEL[situation.level]}
            </span>
          </header>
          <div className="overview-metrics">
            <div><strong>{sensors.length}</strong><span>capteurs</span></div>
            <div><strong>{activeWaterAlerts.length}</strong><span>alertes niveau</span></div>
            <div><strong>{activeRain.length}</strong><span>pluies rapportées</span></div>
            <div><strong>{autoEvents.length}</strong><span>simulations auto</span></div>
          </div>
          <p className="empty-note" role="status">
            {situation.level === "unknown"
              ? "Aucune mesure terrain récente ne permet de qualifier la situation globale. Les prévisions et estimations météo ne sont pas comptées comme des observations."
              : `Synthèse fondée sur ${situation.currentSensorCount} capteur(s) de niveau à jour et ${situation.observedRainCount} point(s) de pluie mesurés. Elle ne représente pas les zones sans source de données.`}
          </p>
          {automaticFloodError && <p className="err-msg" role="alert">Impacts automatiques : {automaticFloodError}</p>}
          {automaticFloods?.failures.map((failure) => (
            <p key={`${failure.source}-${failure.name}`} className="err-msg" role="alert">
              {failure.name} ({failure.source}) : {failure.error}
            </p>
          ))}
          {activeSensors.length > 0 ? (
            <ul className="mini-list">
              {activeSensors.map((sensor) => (
                <li key={sensor.code}>
                  <i style={{ background: sensor.health_status === "online" ? LEVEL_COLOR[sensor.alert_level] : "#7f91a6" }} />
                  <button type="button" onClick={() => onSelectSensor?.(sensor.code)}>
                    <span>{sensor.name}</span>
                    <small>{sensor.water_level_cm == null ? "aucune mesure" : `${sensor.water_level_cm.toFixed(0)} cm`}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-note">{loading ? "Chargement des capteurs…" : offline ? "Serveur injoignable : les dernières données connues sont affichées." : "Aucun capteur enregistré pour le moment."}</p>
          )}
          <div className="card-footer">
            <small>{offline ? "Hors ligne" : `Actualisé à ${formatTime(updatedAt)}`} · mesures et prévisions distinguées</small>
            {onShowSensors && <button type="button" className="link-button" onClick={onShowSensors}>Tous les capteurs</button>}
          </div>
        </section>

        <section className="insight-card subtle-card">
          <header className="card-head compact">
            <span className="card-icon"><Icon name="droplet" /></span>
            <div><h3>Prêt pour une simulation</h3><small>Impact, chronologie et zones à risque</small></div>
          </header>
          <p className="empty-note">
            Lancez un scénario de pluie, de montée d'eau ou issu d'un capteur. Les cartes d'impact
            apparaîtront ici, calculées sur le modèle numérique de terrain.
          </p>
          <ul className="check-list">
            <li><Icon name="check" size={14} />Hauteurs d'eau par classe</li>
            <li><Icon name="check" size={14} />Étendue possible selon l'incertitude du MNT</li>
            <li><Icon name="check" size={14} />Lecture chronologique du scénario</li>
          </ul>
        </section>
      </>
    );
  }

  const areaKm2 = floodedAreaKm2(run.result, frameIndex);
  const share = floodedAreaShare(run.result, frameIndex);
  const maxDepth = frameMaxDepth(run.result, frameIndex);
  const frameCount = run.result.frames.length || 1;
  const currentFrame = Math.min(frameIndex, frameCount - 1) + 1;
  const nonEmptyClasses = classes.filter((depthClass) => depthClass.cells > 0);
  const maxClassArea = Math.max(0.0001, ...classes.map((depthClass) => depthClass.areaKm2));

  return (
    <>
      {(automaticFloodError || (automaticFloods?.events.length ?? 0) > 0 || (automaticFloods?.failures.length ?? 0) > 0) && (
        <section className="insight-card">
          <header className="card-head">
            <span className="card-icon warning"><Icon name="warning" /></span>
            <div><h3>Impacts automatiques</h3><small>Données météo récentes et calcul MNT indicatif</small></div>
          </header>
          {automaticFloodError && <p className="err-msg" role="alert">{automaticFloodError}</p>}
          {automaticFloods?.events.map((event) => (
            <p key={event.id} className="empty-note">
              {event.name} · {event.source} · {new Date(event.observed_at).toLocaleString("fr-FR")} · {
                event.type === "rain_impact_estimate"
                  ? `${event.trigger_basis === "24h" ? `${event.rain_24h_mm} mm/24 h` : `${event.simulation.input.rain_mm_h} mm/h`} rapportés`
                  : `${event.measured_water_level_cm} cm mesurés`
              } · surface estimée {decimalFormat.format(event.simulation.result.stats.area_km2)} km²,
              profondeur max. {decimalFormat.format(event.simulation.result.stats.max_depth_m)} m,
              volume {numberFormat.format(event.simulation.result.stats.volume_m3)} m³,
              étendue possible {decimalFormat.format(event.simulation.result.stats.possible_area_km2)} km².
              Ce résultat n'est pas une confirmation terrain.
            </p>
          ))}
          {automaticFloods?.failures.map((failure) => (
            <p key={`${failure.source}-${failure.name}`} className="err-msg" role="alert">
              {failure.name} ({failure.source}) : {failure.error}
            </p>
          ))}
        </section>
      )}
      <section className="insight-card">
        <header className="card-head">
          <span className="card-icon accent"><Icon name="chart" /></span>
          <div>
            <h3>Impact estimé</h3>
            <small>{scenarioLabel(run.input)} · zone de {run.input.radius_m.toLocaleString("fr-FR")} m</small>
          </div>
        </header>
        <div className="impact-grid">
          <div>
            <span>Surface inondée</span>
            <strong>{decimalFormat.format(areaKm2)} <em>km²</em></strong>
            <small>{share > 0 ? `${(share * 100).toFixed(1)} % de la zone simulée` : "aucune eau détectée"}</small>
          </div>
          <div>
            <span>Profondeur max.</span>
            <strong>{decimalFormat.format(maxDepth)} <em>m</em></strong>
            <small>au point le plus bas</small>
          </div>
          <div>
            <span>Volume d'eau</span>
            <strong>{numberFormat.format(run.result.stats.volume_m3)} <em>m³</em></strong>
            <small>volume cumulé du modèle</small>
          </div>
          <div>
            <span>Étendue possible</span>
            <strong>{decimalFormat.format(run.result.stats.possible_area_km2)} <em>km²</em></strong>
            <small>avec l'incertitude du relief</small>
          </div>
        </div>
        <div className="card-footer">
          <span className="run-badge"><i />Image {currentFrame} / {frameCount}</span>
          <small>Simulation indicative · {formatTime(updatedAt)}</small>
        </div>
      </section>

      <section className="insight-card">
        <header className="card-head">
          <span className="card-icon"><Icon name="clock" /></span>
          <div><h3>Évolution dans le temps</h3><small>Surface inondée par image</small></div>
        </header>
        <EvolutionChart run={run} frameIndex={frameIndex} />
      </section>

      <section className="insight-card">
        <header className="card-head">
          <span className="card-icon warning"><Icon name="warning" /></span>
          <div><h3>Zones à risque</h3><small>{nonEmptyClasses.length} classe(s) avec eau sur {classes.length}</small></div>
        </header>
        {nonEmptyClasses.length === 0 ? (
          <p className="empty-note">Aucune eau détectée sur cette image.</p>
        ) : (
          <ul className="risk-list">
            {classes.map((depthClass) => (
              <li key={depthClass.key} className={depthClass.cells === 0 ? "is-empty" : undefined}>
                <span className="risk-label">
                  <i style={{ background: depthClass.color }} />
                  <span>{depthClass.label}<small>{depthClass.range}</small></span>
                </span>
                <span className="risk-bar" aria-hidden="true">
                  <i style={{ width: `${Math.max(2, (depthClass.areaKm2 / maxClassArea) * 100)}%`, background: depthClass.color }} />
                </span>
                <strong>{depthClass.cells === 0 ? "—" : decimalFormat.format(depthClass.areaKm2)} <em>km²</em></strong>
              </li>
            ))}
          </ul>
        )}
        <p className="fine-print">
          Répartition calculée sur la grille du MNT. La somme des classes peut différer légèrement
          de la surface affichée à cause de l'arrondi au centimètre.
        </p>
      </section>
    </>
  );
}
