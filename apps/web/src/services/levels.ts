export const LEVEL_COLOR = { green: "#2ecc71", orange: "#f28c28", red: "#ff4d5e" } as const;

export const LEVEL_LABEL = { green: "Vert", orange: "Orange", red: "Rouge" } as const;

export type AlertLevelName = keyof typeof LEVEL_COLOR;
