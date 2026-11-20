/**
 * Bandeau de veille continue affiché sur l'onglet Carte.
 *
 * Il résume les événements réels les plus graves sans masquer la carte et
 * donne accès à la console complète. Aucun événement de démonstration n'est
 * ajouté quand les sources sont indisponibles.
 */

import type { HazardSnapshot, ResolvedHazardPlace } from "../services/hazards";
import { sortHazards } from "../services/hazards";
import { hazardSprite } from "../globe/hazardIcons";

type Props = {
  data: HazardSnapshot | null;
  stale: boolean;
  error: string | null;
  placeMap: ReadonlyMap<string, ResolvedHazardPlace>;
  onOpen: () => void;
  onSelect: (id: string) => void;
};

export function HazardLiveCard({ data, stale, error, placeMap, onOpen, onSelect }: Props) {
  const top = data ? sortHazards(data.events).slice(0, 4) : [];
  return (
    <section className="rail-panel hazard-live-card" aria-labelledby="hazard-live-heading">
      <div className="rail-panel-head">
        <div>
          <div className="hazard-heading-line">
            <h2 id="hazard-live-heading">Monde en direct</h2>
            <span className={`hazard-live${stale ? " is-stale" : ""}`}>
              <span className="live-dot" />
              {stale ? "CACHE" : "LIVE"}
            </span>
          </div>
          <p>
            {data?.available
              ? `${data.total_events.toLocaleString("fr-FR")} aléas réels publiés · ${data.sources.filter((source) => source.status === "ok").length}/${data.sources.length} sources`
              : error ?? "Connexion aux sources officielles…"}
          </p>
        </div>
        <button type="button" className="button button-ghost hazard-open-button" onClick={onOpen}>
          Console
        </button>
      </div>

      {top.length > 0 ? (
        <ul className="hazard-mini-list">
          {top.map((event) => {
            const place = placeMap.get(event.id);
            return (
              <li key={event.id}>
                <button type="button" onClick={() => onSelect(event.id)}>
                  <img src={hazardSprite(event.hazard, event.severity)} alt="" width={25} height={25} />
                  <span>
                    <strong>{place?.label ?? event.place ?? event.title}</strong>
                    <small>{event.title !== place?.label ? event.title : event.severity_label}</small>
                  </span>
                  <em style={{ color: event.severity === "unknown" ? undefined : "#ffb36b" }}>
                    {event.severity_label}
                  </em>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="empty-note">
          {data?.available
            ? "Aucun événement actuellement publié dans les flux interrogés."
            : "Aucun événement inventé : la veille reprend dès qu'une source répond."}
        </p>
      )}

      <small className="hazard-live-attribution">
        {data?.attribution ?? "USGS · GDACS · NASA EONET · NOAA"} · cliquez un événement pour l'ouvrir en 3D
      </small>
    </section>
  );
}
