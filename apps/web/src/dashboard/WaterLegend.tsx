import { useMemo } from "react";
import { DEPTH_CLASSES, depthClassAreas, FloodRun } from "../services/simulation";

const areaFormat = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function WaterLegend({ run, frameIndex }: { run: FloodRun | null; frameIndex: number }) {
  const classes = useMemo(() => {
    if (!run) return [];
    try {
      return depthClassAreas(run.result, frameIndex);
    } catch {
      return [];
    }
  }, [run, frameIndex]);

  const byKey = new Map(classes.map((depthClass) => [depthClass.key, depthClass]));

  return (
    <aside className={`water-legend${run ? "" : " is-idle"}`} aria-label="Légende des hauteurs d'eau">
      <header>
        <span className="legend-dot" />
        <strong>Hauteur d'eau</strong>
        <em>m</em>
      </header>
      <ul>
        {DEPTH_CLASSES.map((depthClass) => {
          const area = byKey.get(depthClass.key);
          return (
            <li key={depthClass.key}>
              <i style={{ background: depthClass.color }} />
              <span>{depthClass.range}</span>
              <small>{area && area.cells > 0 ? `${areaFormat.format(area.areaKm2)} km²` : "—"}</small>
            </li>
          );
        })}
      </ul>
      <p>{run ? "Estimation sur la grille du MNT" : "Aucune simulation active"}</p>
    </aside>
  );
}
