/**
 * Demande de consentement à la localisation, affichée à l'entrée dans
 * MasterEarth. Tant que l'utilisateur n'a pas répondu, aucune position n'est
 * demandée au navigateur ; en cas de refus, rien ne s'active.
 */
import { useEffect, useRef } from "react";
import { Icon } from "./Icon";

type Props = {
  open: boolean;
  onAllow: () => void;
  onLater: () => void;
  onDeny: () => void;
};

export function LocationPrompt({ open, onAllow, onLater, onDeny }: Props) {
  const allowRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => allowRef.current?.focus(), 60);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onLater();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onLater]);

  if (!open) return null;

  return (
    <div className="location-prompt-backdrop" role="presentation" onClick={onLater}>
      <div
        className="location-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-prompt-title"
        aria-describedby="location-prompt-body"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="location-prompt-icon" aria-hidden="true">
          <Icon name="locate" size={26} />
        </div>
        <h2 id="location-prompt-title">Afficher votre position sur les cartes ?</h2>
        <p id="location-prompt-body">
          MasterEarth peut centrer la carte 2D et le globe 3D sur votre position,
          où que vous soyez dans le monde, et afficher votre position en temps réel.
        </p>
        <ul className="location-prompt-points">
          <li>La position reste dans votre navigateur : elle n'est ni enregistrée sur le serveur, ni envoyée à un fournisseur IA.</li>
          <li>Vous pouvez la désactiver à tout moment ; les boutons de localisation sont alors inactifs.</li>
          <li>Sans autorisation, les cartes restent entièrement utilisables.</li>
        </ul>
        <div className="location-prompt-actions">
          <button ref={allowRef} type="button" className="button button-primary" onClick={onAllow}>
            <Icon name="locate" size={16} />
            Autoriser ma position
          </button>
          <button type="button" className="button button-ghost" onClick={onLater}>
            Plus tard
          </button>
          <button type="button" className="location-prompt-deny" onClick={onDeny}>
            Ne plus me demander
          </button>
        </div>
      </div>
    </div>
  );
}
