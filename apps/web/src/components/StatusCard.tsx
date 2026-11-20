/** StatusCard component displaying application milestone and configuration state. */

import { config } from "../config";

interface StatusCardProps {
  milestone?: string;
  title?: string;
  description?: string;
}

export function StatusCard({
  milestone = "M0.3",
  title = "MasterEarth",
  description = "Surveillance planétaire des risques naturels en temps réel.",
}: StatusCardProps) {
  return (
    <section className="card">
      <p>{milestone}</p>
      <h1>{title}</h1>
      <p>{description}</p>
      <p>
        API configurée : <code>{config.apiBaseUrl}</code>
      </p>
    </section>
  );
}

export default StatusCard;
