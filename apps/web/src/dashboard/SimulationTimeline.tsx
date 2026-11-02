import { FloodRun, frameLabel, simulationDurationMinutes } from "../services/simulation";
import { Icon } from "../components/Icon";

type Props = {
  run: FloodRun | null;
  frameIndex: number;
  playing: boolean;
  onTogglePlaying: () => void;
  onFrameChange: (index: number) => void;
};

export function SimulationTimeline({ run, frameIndex, playing, onTogglePlaying, onFrameChange }: Props) {
  const duration = simulationDurationMinutes(run);
  const frames = run?.result.frames ?? [];
  const count = frames.length || (run ? 1 : 0);
  const safeIndex = count ? Math.min(Math.max(0, frameIndex), count - 1) : 0;
  const fraction = count ? (frames[safeIndex]?.fraction ?? (count === 1 ? 1 : safeIndex / (count - 1))) : 0;
  const marks = [0, 1 / 3, 2 / 3, 1];

  if (!run || count === 0) {
    return (
      <div className="timeline timeline-empty" role="group" aria-label="Chronologie de la simulation">
        <button type="button" className="timeline-play" disabled aria-label="Lire la simulation"><Icon name="play" size={18} /></button>
        <div className="timeline-track">
          <div className="timeline-empty-track" aria-hidden="true" />
          <div className="timeline-marks" aria-hidden="true">
            <span>0 min</span><span>30 min</span><span>1 h</span><span>2 h</span>
          </div>
        </div>
        <span className="timeline-chip">En attente</span>
      </div>
    );
  }

  return (
    <div className="timeline" role="group" aria-label="Chronologie de la simulation">
      <button
        type="button"
        className="timeline-play"
        onClick={onTogglePlaying}
        disabled={count < 2}
        aria-label={playing ? "Mettre en pause" : "Lire la simulation"}
        title={playing ? "Mettre en pause" : "Lire la simulation"}
      >
        <Icon name={playing ? "pause" : "play"} size={18} />
      </button>
      <div className="timeline-track">
        <input
          className="timeline-range"
          aria-label="Progression de la simulation"
          type="range"
          min={0}
          max={Math.max(0, count - 1)}
          step={1}
          value={safeIndex}
          disabled={count < 2}
          onChange={(event) => onFrameChange(Number(event.target.value))}
        />
        <div className="timeline-marks" aria-hidden="true">
          {marks.map((mark) => <span key={mark}>{frameLabel(mark, duration)}</span>)}
        </div>
      </div>
      <span className="timeline-chip">{frameLabel(fraction, duration)}</span>
    </div>
  );
}
