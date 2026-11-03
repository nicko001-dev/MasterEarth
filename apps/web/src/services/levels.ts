export const LEVEL_COLOR = { green: "#2ecc71", orange: "#f28c28", red: "#ff4d5e" } as const;

export const LEVEL_LABEL = { green: "Vert", orange: "Orange", red: "Rouge" } as const;

export type AlertLevelName = keyof typeof LEVEL_COLOR;
export type SituationLevel = AlertLevelName | "unknown";

export const SITUATION_COLOR: Record<SituationLevel, string> = {
  ...LEVEL_COLOR,
  unknown: "#7f91a6",
};

export const SITUATION_LABEL: Record<SituationLevel, string> = {
  ...LEVEL_LABEL,
  unknown: "Données insuffisantes",
};
