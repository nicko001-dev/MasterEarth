/**
 * Position du soleil et notion de nuit locale.
 *
 * Sert au globe 3D (terminateur jour/nuit, éclairage solaire) et aux libellés
 * de lieux : on peut afficher si une zone est actuellement de nuit. Les calculs
 * sont approximatifs (précision de l'ordre du degré), suffisants pour un rendu
 * cartographique et jamais utilisés pour une décision.
 */

export type SunPosition = {
  /** Latitude du point subsolaire (déclinaison), en degrés. */
  lat: number;
  /** Longitude du point subsolaire, en degrés, dans [-180, 180]. */
  lon: number;
};

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

function normalizeLongitude(value: number): number {
  let lon = value % 360;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return lon;
}

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((date.getTime() - start) / 86_400_000);
}

/**
 * Point subsolaire (là où le soleil est au zénith) à un instant donné.
 * Déclinaison par l'équation de Cooper, longitude par l'équation du temps.
 */
export function subsolarPoint(date: Date): SunPosition {
  const n = dayOfYear(date);
  const declination = 23.44 * Math.sin((360 / 365) * (284 + n) * RAD);
  // Équation du temps (minutes), approximation de Spencer.
  const gamma = ((2 * Math.PI) / 365) * (n - 1);
  const equationOfTime = 229.18 * (
    0.000075
    + 0.001868 * Math.cos(gamma)
    - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma)
    - 0.040849 * Math.sin(2 * gamma)
  );
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const lon = normalizeLongitude((720 - equationOfTime - utcMinutes) / 4);
  return { lat: declination, lon };
}

/** Hauteur du soleil au-dessus de l'horizon, en degrés (négative la nuit). */
export function sunAltitudeDeg(lat: number, lon: number, date: Date = new Date()): number {
  const sun = subsolarPoint(date);
  const hourAngle = (lon - sun.lon) * RAD;
  const phi = lat * RAD;
  const delta = sun.lat * RAD;
  const sinAltitude = Math.sin(phi) * Math.sin(delta)
    + Math.cos(phi) * Math.cos(delta) * Math.cos(hourAngle);
  return Math.asin(Math.max(-1, Math.min(1, sinAltitude))) * DEG;
}

/**
 * Nuit locale : soleil sous l'horizon (crépuscule civil à -6° par défaut).
 * `civilTwilightDeg = 0` donne le coucher du soleil strict.
 */
export function isNightAt(
  lat: number,
  lon: number,
  date: Date = new Date(),
  civilTwilightDeg = -6,
): boolean {
  return sunAltitudeDeg(lat, lon, date) < civilTwilightDeg;
}

/** Libellé court pour une zone : « jour », « crépuscule » ou « nuit ». */
export function dayPhaseLabel(lat: number, lon: number, date: Date = new Date()): "jour" | "crépuscule" | "nuit" {
  const altitude = sunAltitudeDeg(lat, lon, date);
  if (altitude > 6) return "jour";
  if (altitude > -6) return "crépuscule";
  return "nuit";
}
