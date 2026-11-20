/**
 * Console de veille mondiale des aléas.
 *
 * Elle n'invente rien : chaque événement, métrique, statut de source et lien
 * provient du serveur. Les simulations restent des « et si ? » indicatifs,
 * lancés explicitement par un utilisateur authentifié.
 */

import { CSSProperties, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { HazardFeedStatus } from "./useHazards";
import {
  HAZARD_IDS,
  HAZARD_META,
  HazardCatalog,
  HazardCatalogItem,
  HazardEvent,
  HazardId,
  HazardSeverity,
  HazardSimulation,
  HazardSnapshot,
  SEVERITY_COLOR,
  hazardLabel,
  hazardSourceLabel,
  metricValueLabel,
  resolveHazardPlace,
  runHazardSimulation,
  sortHazards,
} from "../services/hazards";
import { hazardSprite } from "../globe/hazardIcons";
import type { Place } from "../globe/places";
import { formatCoordinates, formatDistance } from "../services/geolocation";

type Props = {
  data: HazardSnapshot | null;
  catalog: HazardCatalog | null;
  catalogError: string | null;
  status: HazardFeedStatus;
  error: string | null;
  stale: boolean;
  selectedId: string | null;
  places: readonly Place[];
  placeMap: ReadonlyMap<string, ReturnType<typeof resolveHazardPlace>>;
  simulation: HazardSimulation | null;
  token?: string;
  onSelect: (event: HazardEvent) => void;
  onLocate: (event: HazardEvent) => void;
  onRefresh: () => void;
  onLogin: () => void;
  onSimulation: (simulation: HazardSimulation | null) => void;
};

const KIND_LABEL: Record<string, string> = {
  alert: "Alerte publiée",
  observation: "Observation publiée",
  event: "Événement publié",
};

const METRIC_ALIASES: Partial<Record<HazardId, Record<string, string[]>>> = {
  earthquake: { depth_km: ["profondeur_km", "depth_km"] },
  hurricane: { wind_kmh: ["wind_kmh", "intensite"], pressure_hpa: ["pressure_hpa"], rain_mm_h: ["rain_mm_h"] },
  volcano: { vei: ["vei"] },
  tsunami: { magnitude: ["magnitude"] },
  flood: { rain_mm_h: ["rain_mm_h", "rain"] },
  wildfire: { wind_kmh: ["wind_kmh"] },
  landslide: { slope_deg: ["slope_deg"], rain_mm_h: ["rain_mm_h"] },
  sandstorm: { wind_kmh: ["wind_kmh"] },
  blizzard: { wind_kmh: ["wind_kmh"] },
  heatwave: { temperature_c: ["temperature_c"] },
  storm: { wind_kmh: ["wind_kmh", "intensite"], rain_mm_h: ["rain_mm_h"] },
};

function fieldDefaults(item: HazardCatalogItem | undefined): Record<string, number> {
  if (!item) return {};
  return Object.fromEntries(item.simulation_fields.map((field) => [field.key, field.default]));
}

/** Reprend les valeurs réellement publiées lorsque le champ correspond. */
function eventDefaults(
  item: HazardCatalogItem | undefined,
  event: HazardEvent | null,
): Record<string, number> {
  const base = fieldDefaults(item);
  if (!item || !event || event.hazard !== item.id) return base;
  for (const field of item.simulation_fields) {
    const aliases = METRIC_ALIASES[item.id]?.[field.key] ?? [field.key];
    const metric = event.metrics.find((candidate) => aliases.includes(candidate.key));
    if (!metric || metric.value == null) continue;
    const value = typeof metric.value === "number"
      ? metric.value
      : Number(String(metric.value).replace(",", "."));
    if (!Number.isFinite(value)) continue;
    base[field.key] = Math.max(field.min, Math.min(field.max, value));
  }
  return base;
}

function severityLabel(severity: HazardSeverity): string {
  return {
    extreme: "Extrême",
    high: "Élevée",
    moderate: "Modérée",
    low: "Faible",
    unknown: "Non évaluée",
  }[severity];
}

function timeLabel(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function SourceChips({ data }: { data: HazardSnapshot | null }) {
  if (!data) return null;
  return (
    <div className="hazard-sources" aria-label="État des sources">
      {data.sources.map((source) => (
        <span
          key={source.id}
          className={`hazard-source-chip is-${source.status}`}
          title={source.error || `${source.attribution} · ${source.license}`}
        >
          <i aria-hidden="true" />
          <span>{source.name}</span>
          <b>{source.status === "ok" ? source.count : "—"}</b>
        </span>
      ))}
    </div>
  );
}

export function HazardConsole({
  data,
  catalog,
  catalogError,
  status,
  error,
  stale,
  selectedId,
  places,
  placeMap,
  simulation,
  token,
  onSelect,
  onLocate,
  onRefresh,
  onLogin,
  onSimulation,
}: Props) {
  const [typeFilter, setTypeFilter] = useState<"all" | HazardId>("all");
  const [severityFilter, setSeverityFilter] = useState<"all" | HazardSeverity>("all");
  const [query, setQuery] = useState("");
  const [hazard, setHazard] = useState<HazardId>("earthquake");
  const [lat, setLat] = useState(0);
  const [lon, setLon] = useState(0);
  const [name, setName] = useState("");
  const [inputs, setInputs] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const simSection = useRef<HTMLDetailsElement>(null);

  const events = data?.events ?? [];
  const selected = events.find((event) => event.id === selectedId) ?? null;
  const sorted = useMemo(() => sortHazards(events), [events]);
  const catalogById = useMemo(
    () => new Map((catalog?.hazards ?? []).map((item) => [item.id, item])),
    [catalog],
  );
  const currentCatalog = catalogById.get(hazard);
  const selectedPlace = selected
    ? placeMap.get(selected.id) ?? resolveHazardPlace(selected, places)
    : null;

  // Un nouvel événement choisi devient le point de départ de la simulation.
  useEffect(() => {
    if (!selected) return;
    setHazard(selected.hazard);
    setLat(selected.lat);
    setLon(selected.lon);
    setName(selectedPlace?.label ?? "");
    setSimError(null);
  }, [selected?.id, selectedPlace?.label]);

  useEffect(() => {
    setInputs(eventDefaults(catalogById.get(hazard), selected));
    setSimError(null);
    // Les valeurs saisies ne doivent pas être réinitialisées à chaque frappe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hazard, catalog, selected?.id]);

  const availableTypes = useMemo(
    () => HAZARD_IDS.filter((id) => (data?.counts_by_type[id] ?? 0) > 0),
    [data],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sorted.filter((event) => {
      if (typeFilter !== "all" && event.hazard !== typeFilter) return false;
      if (severityFilter !== "all" && event.severity !== severityFilter) return false;
      if (!needle) return true;
      const place = placeMap.get(event.id)?.label ?? event.place ?? "";
      return `${event.title} ${place} ${event.country ?? ""} ${event.description ?? ""}`
        .toLowerCase()
        .includes(needle);
    });
  }, [sorted, typeFilter, severityFilter, query, placeMap]);

  const visible = filtered.slice(0, 250);

  const submitSimulation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) {
      onLogin();
      return;
    }
    setBusy(true);
    setSimError(null);
    try {
      const result = await runHazardSimulation({
        hazard,
        lat,
        lon,
        name: name.trim() || null,
        inputs,
      }, token);
      onSimulation(result);
    } catch (cause) {
      setSimError(cause instanceof Error ? cause.message : "Simulation indisponible.");
    } finally {
      setBusy(false);
    }
  };

  const openSimulation = () => {
    if (simSection.current) {
      simSection.current.open = true;
      simSection.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };

  const sourceWarnings = data?.sources.filter((source) => source.status !== "ok") ?? [];

  return (
    <section className="rail-panel hazard-console" aria-labelledby="hazards-heading">
      <div className="rail-panel-head">
        <div>
          <div className="hazard-heading-line">
            <h2 id="hazards-heading">Surveillance mondiale</h2>
            <span className={`hazard-live${stale ? " is-stale" : ""}`}>
              <span className="live-dot" />
              {stale ? "CACHE" : "DIRECT"}
            </span>
          </div>
          <p>Événements naturels publiés par les organismes officiels · monde entier</p>
        </div>
        <button
          type="button"
          className={`refresh-action-btn ${status === "loading" ? "spin-active" : ""}`}
          onClick={onRefresh}
          title="Interroger de nouveau les sources"
        >
          <span>{status === "loading" ? "…" : "Actualiser"}</span>
        </button>
      </div>

      <div className="hazard-summary">
        <div>
          <strong>{data?.available ? data.total_events.toLocaleString("fr-FR") : "—"}</strong>
          <span>événements réels</span>
        </div>
        <div>
          <strong>{data?.counts_by_severity.extreme ?? 0}</strong>
          <span>sévérité extrême</span>
        </div>
        <div>
          <strong>{data?.sources.filter((source) => source.status === "ok").length ?? 0}/{data?.sources.length ?? 0}</strong>
          <span>sources en ligne</span>
        </div>
      </div>

      <div className="hazard-freshness">
        <span>
          {data
            ? `Instantané ${timeLabel(data.generated_at)} · il y a ${Math.max(0, Math.round((Date.now() - new Date(data.generated_at).getTime()) / 1000))} s`
            : status === "loading"
              ? "Connexion aux sources officielles…"
              : "Aucune donnée reçue"}
        </span>
        {stale && <em>Valeurs possiblement anciennes</em>}
      </div>

      {!data && status === "unavailable" && (
        <p className="empty-note" role="status">
          La veille mondiale est momentanément injoignable. Aucun événement n'est affiché
          à la place des données réelles. {error ? `Détail : ${error}` : ""}
        </p>
      )}
      {data && !data.available && (
        <p className="empty-note" role="status">
          Aucune source n'a répondu pour le moment. Aucun événement n'est inventé.
          {error ? ` Détail : ${error}` : ""}
        </p>
      )}

      <SourceChips data={data} />
      {sourceWarnings.length > 0 && (
        <p className="hazard-source-warning">
          {sourceWarnings.map((source) => `${source.name} indisponible`).join(" · ")}.
          Les autres sources restent affichées.
        </p>
      )}

      {selected && selectedPlace && (
        <article className="hazard-detail" aria-label="Détail de l'événement sélectionné">
          <div className="hazard-detail-head">
            <img src={hazardSprite(selected.hazard, selected.severity)} alt="" width={38} height={38} />
            <div>
              <strong>{selectedPlace.label}</strong>
              <small>
                {hazardLabel(selected.hazard)} · {severityLabel(selected.severity)} ·{" "}
                {KIND_LABEL[selected.data_kind] ?? selected.data_kind}
              </small>
            </div>
            <span
              className="hazard-severity-dot"
              style={{ background: SEVERITY_COLOR[selected.severity] }}
              title={`Sévérité publiée : ${selected.severity_label}`}
            />
          </div>

          {selectedPlace.approximate && (
            <p className="hazard-approx">
              Lieu non publié par la source : ville réelle la plus proche (GeoNames)
              {selectedPlace.distanceM != null ? `, à ${formatDistance(selectedPlace.distanceM)}` : ""}.
            </p>
          )}

          <p className="hazard-detail-title">{selected.title}</p>
          {selected.description && <p className="hazard-detail-desc">{selected.description}</p>}

          <div className="hazard-detail-meta">
            <span>{formatCoordinates(selected.lat, selected.lon)}</span>
            <span>Publié : {timeLabel(selected.time)}</span>
            {selected.updated && <span>Mis à jour : {timeLabel(selected.updated)}</span>}
            <span>Source : {hazardSourceLabel(selected.source, data?.sources ?? [])}</span>
            {selected.also_reported_by.length > 0 && (
              <span>Aussi rapporté par : {selected.also_reported_by.join(", ")}</span>
            )}
          </div>

          {selected.metrics.length > 0 ? (
            <dl className="hazard-metrics">
              {selected.metrics.map((metric) => (
                <div key={`${metric.key}-${metric.label}`}>
                  <dt>{metric.label}</dt>
                  <dd>{metricValueLabel(metric)}</dd>
                  {metric.basis && <small>{metric.basis}</small>}
                </div>
              ))}
            </dl>
          ) : (
            <p className="hazard-no-metric">
              Aucune valeur chiffrée publiée pour cet événement.
            </p>
          )}

          <div className="hazard-detail-actions">
            <button type="button" className="button button-ghost" onClick={() => onLocate(selected)}>
              Localiser sur le globe
            </button>
            <button type="button" className="button button-primary" onClick={openSimulation}>
              Simuler cet aléa
            </button>
            {selected.url && (
              <a className="button button-ghost" href={selected.url} target="_blank" rel="noopener noreferrer">
                Source
              </a>
            )}
          </div>
          <small className="hazard-attribution">{selected.attribution}</small>
        </article>
      )}

      <div className="hazard-filters">
        <label className="hazard-search">
          <span className="visually-hidden">Rechercher un lieu ou un événement</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un lieu, un pays…"
          />
        </label>
        <label className="hazard-severity-filter">
          <span className="visually-hidden">Filtrer par sévérité</span>
          <select
            value={severityFilter}
            onChange={(event) => setSeverityFilter(event.target.value as "all" | HazardSeverity)}
          >
            <option value="all">Toutes sévérités</option>
            {(["extreme", "high", "moderate", "low", "unknown"] as HazardSeverity[])
              .filter((severity) => (data?.counts_by_severity[severity] ?? 0) > 0)
              .map((severity) => (
                <option key={severity} value={severity}>
                  {severityLabel(severity)} ({data?.counts_by_severity[severity]})
                </option>
              ))}
          </select>
        </label>
      </div>

      <div className="hazard-type-chips" role="group" aria-label="Filtrer par type d'aléa">
        <button
          type="button"
          className={typeFilter === "all" ? "on" : ""}
          aria-pressed={typeFilter === "all"}
          onClick={() => setTypeFilter("all")}
        >
          Tous <b>{data?.total_events ?? 0}</b>
        </button>
        {availableTypes.map((id) => (
          <button
            key={id}
            type="button"
            className={typeFilter === id ? "on" : ""}
            aria-pressed={typeFilter === id}
            onClick={() => setTypeFilter(id)}
            style={{ "--hazard-color": HAZARD_META[id].color } as CSSProperties}
          >
            <i aria-hidden="true" />
            {HAZARD_META[id].short} <b>{data?.counts_by_type[id] ?? 0}</b>
          </button>
        ))}
      </div>

      {filtered.length === 0 && data && (
        <p className="empty-note">
          Aucun événement ne correspond à ce filtre dans l'instantané actuel.
        </p>
      )}

      <ul className="hazard-event-list">
        {visible.map((event) => {
          const place = placeMap.get(event.id) ?? resolveHazardPlace(event, places);
          return (
            <li key={event.id} className={selectedId === event.id ? "is-selected" : ""}>
              <button type="button" onClick={() => onSelect(event)} aria-pressed={selectedId === event.id}>
                <img src={hazardSprite(event.hazard, event.severity)} alt="" width={30} height={30} loading="lazy" />
                <span className="hazard-event-copy">
                  <strong>{place.label}</strong>
                  <small>{event.title !== place.label ? event.title : HAZARD_META[event.hazard].label}</small>
                  <em>
                    {severityLabel(event.severity)} · {hazardSourceLabel(event.source, data?.sources ?? [])} · {timeLabel(event.time)}
                  </em>
                </span>
                <span
                  className="hazard-severity-bar"
                  style={{ background: SEVERITY_COLOR[event.severity] }}
                  title={`Sévérité ${event.severity_label}`}
                />
              </button>
            </li>
          );
        })}
      </ul>
      {filtered.length > visible.length && (
        <p className="hazard-list-note">
          {visible.length.toLocaleString("fr-FR")} événements affichés sur {filtered.length.toLocaleString("fr-FR")}.
          Affinez le filtre pour voir les autres.
        </p>
      )}

      <details className="hazard-simulation" ref={simSection}>
        <summary>
          <span>Simulation indicative « et si ? »</span>
          <small>Tous les aléas · calcul serveur déterministe</small>
        </summary>
        <form className="hazard-sim-form" onSubmit={(event) => void submitSimulation(event)}>
          <p className="hazard-sim-disclaimer">
            Une simulation ne remplace ni une observation, ni une prévision officielle,
            ni une alerte. Suivez toujours les autorités.
          </p>

          <label className="field">
            <span>Type d'aléa</span>
            <select
              value={hazard}
              onChange={(event) => {
                setHazard(event.target.value as HazardId);
                setSimError(null);
              }}
            >
              {(catalog?.hazards ?? HAZARD_IDS.map((id) => ({ id, label: HAZARD_META[id].label })))
                .map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
            </select>
          </label>

          <div className="hazard-sim-coords">
            <label className="field">
              <span>Latitude</span>
              <input
                type="number"
                step="0.0001"
                min={-90}
                max={90}
                value={lat}
                onChange={(event) => setLat(Number(event.target.value))}
                required
              />
            </label>
            <label className="field">
              <span>Longitude</span>
              <input
                type="number"
                step="0.0001"
                min={-180}
                max={180}
                value={lon}
                onChange={(event) => setLon(Number(event.target.value))}
                required
              />
            </label>
          </div>
          <label className="field">
            <span>Nom du point (facultatif)</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              placeholder="Lieu réel, sans invention"
            />
          </label>

          {currentCatalog ? (
            <div className="hazard-sim-fields">
              {currentCatalog.simulation_fields.map((field) => (
                <label className="field" key={field.key}>
                  <span>{field.label} {field.unit && <em>({field.unit})</em>}</span>
                  <input
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={inputs[field.key] ?? field.default}
                    onChange={(event) => setInputs((current) => ({
                      ...current,
                      [field.key]: Number(event.target.value),
                    }))}
                    required
                  />
                </label>
              ))}
            </div>
          ) : (
            <p className="empty-note">
              Catalogue de simulation indisponible{catalogError ? ` : ${catalogError}` : ""}.
              Les événements réels restent consultables.
            </p>
          )}

          {selected && selected.hazard === hazard && selected.metrics.length > 0 && (
            <small className="hazard-sim-values">
              Les champs correspondants reprennent les valeurs publiées par la source lorsque
              leur unité concorde ; les autres restent des valeurs de démonstration modifiables.
            </small>
          )}

          {simError && <p className="err-msg" role="alert">{simError}</p>}

          <div className="hazard-sim-actions">
            <button type="submit" className="button button-primary" disabled={busy || !currentCatalog}>
              {!token ? "Se connecter pour simuler" : busy ? "Calcul…" : "Lancer la simulation"}
            </button>
            {simulation && (
              <button type="button" className="button button-ghost" onClick={() => onSimulation(null)}>
                Effacer
              </button>
            )}
          </div>
          {!token && <small className="hazard-login-note">La simulation est réservée aux comptes authentifiés (rôle viewer).</small>}
        </form>

        {simulation && (
          <div className="hazard-sim-result" aria-live="polite">
            <div className="hazard-sim-result-head">
              <strong>{simulation.label} · {simulation.severity_label}</strong>
              <span>{simulation.radius_km.toLocaleString("fr-FR")} km de rayon indicatif</span>
            </div>
            <small>
              {simulation.center.name || formatCoordinates(simulation.center.lat, simulation.center.lon)} ·{" "}
              modèle {simulation.model} · {timeLabel(simulation.generated_at)}
            </small>
            <div className="hazard-sim-timeline" aria-label="Chronologie indicative">
              {simulation.timeline.map((point) => (
                <span
                  key={point.fraction}
                  style={{ height: `${Math.max(6, point.intensity_index)}%` }}
                  title={`${point.hour.toLocaleString("fr-FR")} h · indice ${point.intensity_index} · ${point.label}`}
                />
              ))}
            </div>
            <dl className="hazard-metrics">
              {simulation.metrics.map((metric) => (
                <div key={`${metric.key}-${metric.label}`}>
                  <dt>{metric.label}</dt>
                  <dd>{metricValueLabel(metric)}</dd>
                  {metric.basis && <small>{metric.basis}</small>}
                </div>
              ))}
            </dl>
            {simulation.statements.map((statement) => <p key={statement}>{statement}</p>)}
            <p className="hazard-sim-disclaimer">{simulation.disclaimer}</p>
            <details>
              <summary>Hypothèses et limites</summary>
              <ul>
                {simulation.assumptions.map((item) => <li key={item}>{item}</li>)}
                {simulation.limitations.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </details>
          </div>
        )}
      </details>

      {data && data.events.length === 0 && data.available && (
        <p className="empty-note">
          Aucun événement actuellement publié par les sources interrogées. Une absence
          d'événement dans ces flux ne signifie pas une absence de risque local.
        </p>
      )}

      {data && (
        <footer className="hazard-credits">
          <span>
            <a href={data.attribution_url} target="_blank" rel="noopener noreferrer">{data.attribution}</a>
            {" "}· {data.license}
          </span>
          <details>
            <summary>Limites des données</summary>
            <ul>
              {data.limitations.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </details>
        </footer>
      )}
    </section>
  );
}
