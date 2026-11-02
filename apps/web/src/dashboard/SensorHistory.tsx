import { useEffect, useId, useState } from "react";
import { fetchReadings, SensorReading } from "../services/api";

type LoadState = "loading" | "ready" | "error";
const WIDTH = 420;
const HEIGHT = 150;
const PAD = 24;
const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

export function SensorHistory({ code }: { code: string }) {
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [attempt, setAttempt] = useState(0);
  const id = useId();
  const titleId = `history-title-${id}`;
  const descriptionId = `history-description-${id}`;

  useEffect(() => {
    let active = true;
    setState("loading");
    fetchReadings(code)
      .then((items) => {
        if (!active) return;
        setReadings(items);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [code, attempt]);

  const ordered = readings
    .filter((reading) => Number.isFinite(reading.water_level_cm) && Number.isFinite(Date.parse(reading.measured_at)))
    .slice()
    .sort((a, b) => Date.parse(a.measured_at) - Date.parse(b.measured_at));
  const levels = ordered.map((reading) => reading.water_level_cm);
  const min = levels.length ? Math.min(...levels) : 0;
  const max = levels.length ? Math.max(...levels) : 0;
  const firstTime = ordered.length ? Date.parse(ordered[0].measured_at) : 0;
  const lastTime = ordered.length ? Date.parse(ordered[ordered.length - 1].measured_at) : 0;
  const timeRange = lastTime - firstTime;
  const levelRange = max - min || 1;
  const coordinates = ordered.map((reading, index) => {
    const time = Date.parse(reading.measured_at);
    const x = timeRange
      ? PAD + ((time - firstTime) / timeRange) * (WIDTH - PAD * 2)
      : PAD + (index / Math.max(1, ordered.length - 1)) * (WIDTH - PAD * 2);
    const y = HEIGHT - PAD - ((reading.water_level_cm - min) / levelRange) * (HEIGHT - PAD * 2);
    return { x, y };
  });
  const latest = ordered[ordered.length - 1];

  return (
    <section className="sensor-history" aria-labelledby={`${titleId}-heading`}>
      <h3 id={`${titleId}-heading`}>Historique · {code}</h3>
      {state === "loading" && <p role="status">Chargement de l’historique…</p>}
      {state === "error" && (
        <p className="err-msg" role="alert">
          Historique indisponible.
          <button type="button" className="history-retry" onClick={() => setAttempt((value) => value + 1)}>
            Réessayer
          </button>
        </p>
      )}
      {state === "ready" && ordered.length === 0 && <p className="muted">Aucune mesure enregistrée.</p>}
      {state === "ready" && latest && (
        <>
          <p className="history-summary">
            {ordered.length} mesures · de {min.toFixed(0)} à {max.toFixed(0)} cm · dernière {latest.water_level_cm.toFixed(0)} cm
          </p>
          <svg
            className="history-chart"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-labelledby={`${titleId} ${descriptionId}`}
          >
            <title id={titleId}>Historique du niveau d’eau pour {code}</title>
            <desc id={descriptionId}>
              {ordered.length} mesures du {formatTime(ordered[0].measured_at)} au {formatTime(latest.measured_at)}.
              Niveau entre {min.toFixed(0)} et {max.toFixed(0)} centimètres.
            </desc>
            <line x1={PAD} y1={HEIGHT - PAD} x2={WIDTH - PAD} y2={HEIGHT - PAD} className="chart-axis" />
            <polyline
              points={coordinates.map(({ x, y }) => `${x},${y}`).join(" ")}
              className="chart-line"
            />
            {coordinates.map(({ x, y }, index) => (
              <circle key={`${ordered[index].measured_at}-${index}`} cx={x} cy={y} r="3" className="chart-point">
                <title>{`${ordered[index].water_level_cm.toFixed(0)} cm — ${formatTime(ordered[index].measured_at)}`}</title>
              </circle>
            ))}
          </svg>
          <p className="history-dates">
            <span>{formatTime(ordered[0].measured_at)}</span>
            <span>{formatTime(latest.measured_at)}</span>
          </p>
        </>
      )}
    </section>
  );
}
