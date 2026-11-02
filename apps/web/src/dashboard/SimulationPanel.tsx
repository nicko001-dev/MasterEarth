import { FormEvent, useEffect, useState } from "react";
import { SensorState } from "../services/api";
import {
  FloodInput,
  FloodRun,
  runFloodSimulation,
  scenarioLabel,
  simulationDurationMinutes,
} from "../services/simulation";
import { Icon } from "../components/Icon";

type Props = {
  position?: "left" | "right";
  token?: string;
  sensors: SensorState[];
  run: FloodRun | null;
  frameIndex: number;
  onLogin: () => void;
  onRunChange: (run: FloodRun | null) => void;
  onFrameChange: (index: number) => void;
};

type PanelTab = "parametres" | "resultats" | "analyse";

const INITIAL_LAT = 5.359; // Cocody center
const INITIAL_LON = -3.985;
const COCODY_PRESET = { lat: 5.359, lon: -3.985, name: "Cocody" };
const ABIDJAN_PRESET = { lat: 5.32, lon: -4.02, name: "Plateau (Abidjan centre)" };
const YOPOUGON_PRESET = { lat: 5.35, lon: -4.09, name: "Yopougon" };
const ABBO_PRESET = { lat: 5.42, lon: -4.02, name: "Abobo" };

const PRESETS = [COCODY_PRESET, ABIDJAN_PRESET, YOPOUGON_PRESET, ABBO_PRESET];
const DEFAULT_EXPANDED = typeof window === "undefined" || window.innerWidth >= 960;

export function SimulationPanel({
  position = "left",
  token,
  sensors,
  run,
  frameIndex,
  onLogin,
  onRunChange,
  onFrameChange,
}: Props) {
  const [expanded, setExpanded] = useState(DEFAULT_EXPANDED);
  const [tab, setTab] = useState<PanelTab>("parametres");
  const [mode, setMode] = useState<FloodInput["mode"]>("rain");
  const [lat, setLat] = useState(INITIAL_LAT);
  const [lon, setLon] = useState(INITIAL_LON);
  const [rain, setRain] = useState(80);
  const [hours, setHours] = useState(2);
  const [rise, setRise] = useState(1.5);
  const [sensorCode, setSensorCode] = useState("");
  const [radius, setRadius] = useState(1500);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preset, setPreset] = useState<string>("Cocody");

  useEffect(() => {
    if (run) setTab("resultats");
  }, [run]);

  const applyPreset = (p: typeof PRESETS[0]) => {
    setLat(p.lat);
    setLon(p.lon);
    setPreset(p.name);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) {
      onLogin();
      return;
    }
    if (mode === "sensor" && !sensorCode) {
      setError("Choisissez un capteur pour lancer ce scénario.");
      return;
    }
    setBusy(true);
    setError("");
    onRunChange(null);
    const input: FloodInput = {
      mode,
      ...(mode === "sensor" ? { sensor_code: sensorCode } : { lat, lon }),
      ...(mode === "rain" ? { rain_mm_h: rain, hours } : {}),
      ...(mode === "level" ? { rise_m: rise } : {}),
      radius_m: radius,
      cells: 120,
      steps: 6,
    };
    try {
      const result = await runFloodSimulation(token, input);
      onRunChange({ input, result });
      onFrameChange(Math.max(0, result.frames.length - 1));
      setTab("resultats");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "La simulation a échoué.");
    } finally {
      setBusy(false);
    }
  };

  const duration = simulationDurationMinutes(run);
  const clear = () => {
    onRunChange(null);
    setTab("parametres");
  };

  return (
    <aside className={`simulation-panel simulation-${position}${expanded ? " expanded" : ""}`} aria-label="Simulation de pluie et d'inondation">
      <button
        type="button"
        className="simulation-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="simulation-heading">
          <span className="simulation-icon"><Icon name="weather" size={20} /></span>
          <span>
            <strong>Simulation pluie et inondation</strong>
            <small>MNT indicatif · résultats non prédictifs</small>
          </span>
        </span>
        <span className="simulation-chevron" aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>

      {expanded && (
        <>
          <div className="simulation-tabs" role="tablist" aria-label="Sections de la simulation">
            {([
              ["parametres", "Paramètres"],
              ["resultats", "Résultats"],
              ["analyse", "Analyse"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={tab === key ? "on" : ""}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="simulation-content">
            {tab === "parametres" && (
              <form onSubmit={(event) => void submit(event)}>
                <p className="simulation-disclaimer">
                  MNT indicatif — ni mesure ni prévision. Le ruissellement, les ouvrages, le drainage et l'infiltration ne sont pas simulés.
                </p>

                <label className="field">
                  <span>Scénario</span>
                  <select id="simulation-mode" value={mode} onChange={(event) => setMode(event.target.value as FloodInput["mode"])}>
                    <option value="rain">Pluie sur la zone</option>
                    <option value="level">Montée d'eau au point choisi</option>
                    <option value="sensor">D'après un capteur</option>
                  </select>
                </label>

                {mode === "sensor" ? (
                  <label className="field">
                    <span>Capteur</span>
                    <select value={sensorCode} onChange={(event) => setSensorCode(event.target.value)} required>
                      <option value="">Choisir un capteur</option>
                      {sensors.map((sensor) => <option key={sensor.code} value={sensor.code}>{sensor.name} ({sensor.code})</option>)}
                    </select>
                    {sensors.length === 0 && <small>Aucun capteur disponible pour ce scénario.</small>}
                  </label>
                ) : (
                  <>
                    <div className="zone-presets">
                      <strong>Zone d'étude</strong>
                      <div className="preset-chips">
                        {PRESETS.map((p) => (
                          <button type="button" key={p.name} className={preset === p.name ? "on" : ""} onClick={() => applyPreset(p)}>
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    <details className="advanced">
                      <summary>Coordonnées précises</summary>
                      <div className="simulation-coordinates">
                        <label className="field">
                          <span>Latitude</span>
                          <input type="number" step="any" min={-90} max={90} required value={lat} onChange={(event) => setLat(Number(event.target.value))} />
                        </label>
                        <label className="field">
                          <span>Longitude</span>
                          <input type="number" step="any" min={-180} max={180} required value={lon} onChange={(event) => setLon(Number(event.target.value))} />
                        </label>
                      </div>
                    </details>
                  </>
                )}

                {mode === "rain" && (
                  <>
                    <label className="control">
                      <span className="control-label"><Icon name="droplet" size={15} />Intensité des précipitations</span>
                      <span className="control-row">
                        <input aria-label="Intensité des précipitations" type="range" min={0} max={300} step={1} value={rain} onChange={(event) => setRain(Number(event.target.value))} />
                        <output>{rain} mm/h</output>
                      </span>
                    </label>
                    <label className="control">
                      <span className="control-label"><Icon name="clock" size={15} />Durée</span>
                      <span className="control-row">
                        <input aria-label="Durée" type="range" min={0.5} max={24} step={0.5} value={hours} onChange={(event) => setHours(Number(event.target.value))} />
                        <output>{hours} h</output>
                      </span>
                    </label>
                  </>
                )}

                {mode === "level" && (
                  <>
                    <label className="control">
                      <span className="control-label"><Icon name="chart" size={15} />Hausse au point central</span>
                      <span className="control-row">
                        <input aria-label="Hausse au point central" type="range" min={0} max={15} step={0.1} value={rise} onChange={(event) => setRise(Number(event.target.value))} />
                        <output>{rise.toFixed(1)} m</output>
                      </span>
                    </label>
                    <p className="fine-print">
                      Le modèle applique cette cote aux cellules plus basses qui sont connectées. La profondeur locale calculée peut donc dépasser cette hausse.
                    </p>
                  </>
                )}

                <label className="control">
                  <span className="control-label"><Icon name="layers" size={15} />Rayon de calcul</span>
                  <span className="control-row">
                    <input aria-label="Rayon de calcul" type="range" min={200} max={5000} step={100} value={radius} onChange={(event) => setRadius(Number(event.target.value))} />
                    <output>{radius.toLocaleString("fr-FR")} m</output>
                  </span>
                </label>

                <button type="submit" className="button button-primary simulation-submit" disabled={busy || (mode === "sensor" && sensors.length === 0)}>
                  {busy ? <><span className="spinner" aria-hidden="true" />Calcul du terrain…</> : <><Icon name="play" size={16} />Lancer la simulation</>}
                </button>
              </form>
            )}

            {tab === "parametres" && !token && (
              <div className="simulation-gate">
                <Icon name="info" size={18} />
                <div>
                  <strong>Un compte suffit pour lancer le calcul</strong>
                  <p>La simulation utilise le serveur et le MNT. L'assistant IA et les observations restent accessibles sans compte.</p>
                </div>
                <button type="button" className="button button-ghost" onClick={onLogin}>Se connecter</button>
              </div>
            )}

            {tab === "resultats" && (
              run ? (
                <div className="simulation-result" aria-live="polite">
                  <div className="result-head">
                    <span className="run-badge"><i />Simulation terminée</span>
                    <small>{scenarioLabel(run.input)}</small>
                  </div>
                  <div className="result-stats">
                    <div><span>Profondeur max.</span><strong>{run.result.stats.max_depth_m.toFixed(2)} <em>m</em></strong></div>
                    <div><span>Surface inondée</span><strong>{run.result.stats.area_km2.toFixed(3)} <em>km²</em></strong></div>
                    <div><span>Volume d'eau</span><strong>{Math.round(run.result.stats.volume_m3).toLocaleString("fr-FR")} <em>m³</em></strong></div>
                    <div><span>Étendue possible</span><strong>{run.result.stats.possible_area_km2.toFixed(3)} <em>km²</em></strong></div>
                  </div>
                  {run.input.mode === "level" && run.result.stats.max_depth_m > (run.input.rise_m ?? 0) + 0.05 && (
                    <p className="simulation-disclaimer">
                      La profondeur maximale dépasse la hausse choisie au point central car le MNT comporte des cellules connectées plus basses. Ce résultat n'est pas une hauteur d'eau mesurée ni une prévision.
                    </p>
                  )}
                  <p className="fine-print">
                    Lecture : image {Math.min(frameIndex + 1, Math.max(1, run.result.frames.length))} / {Math.max(1, run.result.frames.length)}
                    {duration ? ` · durée ${duration} min` : ""} · surface et profondeur issues de la grille de calcul.
                  </p>
                  <details>
                    <summary>Hypothèses du calcul</summary>
                    <ul>{run.result.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>
                  </details>
                  <p className="simulation-disclaimer">{run.result.disclaimer}</p>
                  <button type="button" className="button button-ghost" onClick={clear}>Effacer la simulation</button>
                </div>
              ) : (
                <div className="panel-empty">
                  <Icon name="chart" size={26} />
                  <strong>Aucun résultat pour le moment</strong>
                  <p>Renseignez un scénario puis lancez le calcul. Les résultats et la chronologie apparaîtront ici.</p>
                  <button type="button" className="button button-primary" onClick={() => setTab("parametres")}>Configurer un scénario</button>
                </div>
              )
            )}

            {tab === "analyse" && (
              run ? (
                <div className="simulation-analysis">
                  <h3>Lecture du résultat</h3>
                  <ul className="check-list">
                    <li><Icon name="check" size={14} />Surface inondée : {run.result.stats.area_km2.toFixed(3)} km² sur l'emprise simulée.</li>
                    <li><Icon name="check" size={14} />Étendue possible : {run.result.stats.possible_area_km2.toFixed(3)} km² en tenant compte de l'incertitude verticale du MNT.</li>
                    <li><Icon name="check" size={14} />Profondeur maximale : {run.result.stats.max_depth_m.toFixed(2)} m au point le plus bas connecté.</li>
                    <li><Icon name="check" size={14} />{run.result.frames.length > 1 ? `${run.result.frames.length} images décrivent la montée progressive.` : "Une seule image a été calculée."}</li>
                  </ul>
                  <h3>Limites à conserver en tête</h3>
                  <ul className="plain-list">
                    <li>Le ruissellement dynamique, le drainage, les ouvrages et l'infiltration ne sont pas simulés.</li>
                    <li>Le résultat dépend de la qualité et de la résolution du MNT.</li>
                    <li>La profondeur locale peut dépasser la hausse imposée lorsque des cellules basses sont connectées.</li>
                    <li>Cette analyse est indicative et ne remplace pas une expertise hydraulique.</li>
                  </ul>
                  <p className="simulation-disclaimer">{run.result.disclaimer}</p>
                </div>
              ) : (
                <div className="panel-empty">
                  <Icon name="info" size={26} />
                  <strong>Aucune analyse disponible</strong>
                  <p>Lancez d'abord une simulation. Cette section expliquera les hypothèses, l'étendue possible et les limites du modèle.</p>
                </div>
              )
            )}

            {error && <p className="err-msg" role="alert">{error}</p>}
          </div>
        </>
      )}
    </aside>
  );
}
