import type { SVGProps } from "react";

export type IconName =
  | "map"
  | "sensors"
  | "alert"
  | "weather"
  | "observations"
  | "ai"
  | "settings"
  | "globe"
  | "play"
  | "pause"
  | "refresh"
  | "user"
  | "search"
  | "close"
  | "droplet"
  | "clock"
  | "chart"
  | "layers"
  | "world"
  | "check"
  | "warning"
  | "info"
  | "zoom-in"
  | "zoom-out"
  | "logout"
  | "chevron"
  | "mic"
  | "mic-on";

const paths: Record<IconName, string[]> = {
  map: ["M3 6.5 9 3l6 3.5L21 3v14.5L15 21l-6-3.5L3 21V6.5Z", "M9 3v14.5M15 6.5V21"],
  sensors: ["M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z", "M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"],
  alert: ["M12 3 2.8 20h18.4L12 3Z", "M12 9v5", "M12 17.2v.1"],
  weather: ["M7 18h10a4 4 0 0 0 .7-7.9A6 6 0 0 0 6.2 9.1 4.5 4.5 0 0 0 7 18Z", "M8 21l1-2M12 21l1-2M16 21l1-2"],
  observations: ["M2.5 12s3.6-6 9.5-6 9.5 6 9.5 6-3.6 6-9.5 6-9.5-6-9.5-6Z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"],
  ai: ["M12 3.5 13.6 9l5.4 1.7-5.4 1.6L12 18l-1.6-5.7L5 10.7 10.4 9 12 3.5Z", "M19 16.5l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1Z"],
  settings: ["M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z", "M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"],
  globe: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M3.5 9h17M3.5 15h17", "M12 3c2.4 2.4 3.6 5.4 3.6 9S14.4 18.6 12 21c-2.4-2.4-3.6-5.4-3.6-9S9.6 5.4 12 3Z"],
  play: ["M8 5.5v13l10-6.5-10-6.5Z"],
  pause: ["M8 5h3v14H8zM13 5h3v14h-3z"],
  refresh: ["M20 11a8 8 0 0 0-14.7-4L3 9", "M3 4v5h5", "M4 13a8 8 0 0 0 14.7 4L21 15", "M21 20v-5h-5"],
  user: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M4 21a8 8 0 0 1 16 0"],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "m21 21-4.3-4.3"],
  close: ["M6 6l12 12M18 6 6 18"],
  droplet: ["M12 2.8s6.5 6.1 6.5 11.2a6.5 6.5 0 0 1-13 0C5.5 8.9 12 2.8 12 2.8Z", "M9 14.5a3 3 0 0 0 3 3"],
  clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 7v5l3.5 2"],
  chart: ["M4 20V4", "M4 20h16", "m7 15 4-4 3 2 5-6"],
  layers: ["M12 3 3 8l9 5 9-5-9-5Z", "m3 13 9 5 9-5", "m3 18 9 5 9-5"],
  world: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M3.5 12h17", "M12 3a14.5 14.5 0 0 1 0 18 14.5 14.5 0 0 1 0-18Z"],
  check: ["m4 12.5 5 5L20 6.5"],
  warning: ["M12 3 2.8 20h18.4L12 3Z", "M12 9v5", "M12 17.2v.1"],
  info: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 11v5", "M12 7.5v.1"],
  "zoom-in": ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "m21 21-4.3-4.3", "M11 8v6M8 11h6"],
  "zoom-out": ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "m21 21-4.3-4.3", "M8 11h6"],
  logout: ["M9 3H4v18h5", "M16 17l5-5-5-5", "M21 12H9"],
  chevron: ["m9 6 6 6-6 6"],
  mic: ["M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z", "M19 10v2a7 7 0 0 1-14 0v-2"],
  "mic-on": ["M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z", "M19 10v2a7 7 0 0 1-14 0v-2", "M12 19a3 3 0 0 1-3-3h6a3 3 0 0 1-3 3Z"],
};

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {paths[name].map((d, index) => <path key={index} d={d} />)}
    </svg>
  );
}
