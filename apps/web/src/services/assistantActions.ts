/**
 * Actions que l'assistant peut déclencher dans l'interface.
 *
 * Deux sources produisent ces actions :
 *  1. le serveur (bloc JSON validé renvoyé par `/api/v1/ai/assistant`), pour une
 *     compréhension fine du langage naturel ;
 *  2. l'analyse locale de commandes (ce module), qui rend l'assistant vocal
 *     utilisable immédiatement, sans fournisseur IA, sans consentement et sans
 *     réseau.
 *
 * Le contrat est volontairement fermé : toute action inconnue ou mal formée est
 * ignorée, et seules les actions listées ici sont exécutables. L'IA ne peut donc
 * jamais déclencher une alerte, modifier un seuil ou lancer un calcul métier :
 * elle déplace la vue et ouvre des panneaux, l'utilisateur reste maître.
 */
import { displayPlaceName, findPlace, nearestPlace, Place } from "../globe/places";

export const ASSISTANT_TABS = [
  "carte",
  "capteurs",
  "alertes",
  "meteo",
  "observations",
  "ia",
  "gestion",
] as const;

export type AssistantTab = (typeof ASSISTANT_TABS)[number];

export const ASSISTANT_LAYERS = [
  "radar",
  "rain",
  "flood",
  "labels",
  "borders",
  "night",
  "traffic",
  "aircraft",
  "sensors",
  "weather",
  "alerts",
] as const;

export type AssistantLayer = (typeof ASSISTANT_LAYERS)[number];

export const BASEMAPS = ["osm", "esri", "nasa"] as const;
export type Basemap = (typeof BASEMAPS)[number];

export type AssistantAction =
  | { type: "fly_to"; lat: number; lon: number; height?: number | null; label?: string | null }
  | { type: "set_view"; view: "map" | "globe" }
  | { type: "open_tab"; tab: AssistantTab }
  | { type: "select_sensor"; code: string }
  | { type: "set_layer"; layer: AssistantLayer; enabled: boolean }
  | { type: "set_basemap"; basemap: Basemap }
  | { type: "locate_user" }
  | { type: "open_simulation"; mode: "level" | "rain" | "sensor"; lat?: number | null; lon?: number | null }
  | { type: "zoom"; direction: "in" | "out" }
  | { type: "reset_view" };

const TAB_LABELS: Record<AssistantTab, string> = {
  carte: "la carte",
  capteurs: "les capteurs",
  alertes: "les alertes",
  meteo: "la météo",
  observations: "les observations",
  ia: "l'assistant IA",
  gestion: "la gestion",
};

const TAB_TITLES: Record<AssistantTab, string> = {
  carte: "carte",
  capteurs: "capteurs",
  alertes: "alertes",
  meteo: "météo",
  observations: "observations",
  ia: "assistant IA",
  gestion: "gestion",
};

const LAYER_TITLES: Record<AssistantLayer, string> = {
  radar: "radar de précipitations",
  rain: "pluie",
  flood: "inondation simulée",
  labels: "noms de lieux",
  borders: "frontières",
  night: "mode nuit",
  traffic: "circulation (véhicules et navires)",
  aircraft: "trafic aérien",
  sensors: "capteurs",
  weather: "points météo",
  alerts: "alertes",
};

const BASE_LABELS: Record<Basemap, string> = {
  osm: "le plan OpenStreetMap",
  esri: "le fond satellite",
  nasa: "le fond satellite NASA",
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validTab(value: unknown): value is AssistantTab {
  return typeof value === "string" && (ASSISTANT_TABS as readonly string[]).includes(value);
}

function validLayer(value: unknown): value is AssistantLayer {
  return typeof value === "string" && (ASSISTANT_LAYERS as readonly string[]).includes(value);
}

/**
 * Valide la liste d'actions renvoyée par le serveur. Les entrées invalides sont
 * ignorées individuellement, la liste est plafonnée à six actions.
 */
export function parseAssistantActions(value: unknown, limit = 6): AssistantAction[] {
  if (!Array.isArray(value)) return [];
  const actions: AssistantAction[] = [];
  for (const raw of value) {
    const action = normalizeAction(raw);
    if (action) actions.push(action);
    if (actions.length >= limit) break;
  }
  return actions;
}

/** Convertit une action brute en action valide, ou null. */
export function normalizeAction(raw: unknown): AssistantAction | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const type = item.type;
  switch (type) {
    case "fly_to": {
      const { lat, lon } = item;
      if (!finite(lat) || !finite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
      const height = finite(item.height) && item.height > 100 && item.height < 40_000_000 ? item.height : null;
      const label = typeof item.label === "string" ? item.label.slice(0, 80) : null;
      return { type: "fly_to", lat, lon, height, label };
    }
    case "set_view":
      return item.view === "map" || item.view === "globe" ? { type: "set_view", view: item.view } : null;
    case "open_tab":
      return validTab(item.tab) ? { type: "open_tab", tab: item.tab } : null;
    case "select_sensor": {
      const code = typeof item.code === "string" ? item.code.slice(0, 64).trim() : "";
      return code ? { type: "select_sensor", code } : null;
    }
    case "set_layer":
      return validLayer(item.layer) && typeof item.enabled === "boolean"
        ? { type: "set_layer", layer: item.layer, enabled: item.enabled }
        : null;
    case "set_basemap":
      return typeof item.basemap === "string" && (BASEMAPS as readonly string[]).includes(item.basemap)
        ? { type: "set_basemap", basemap: item.basemap as Basemap }
        : null;
    case "locate_user":
      return { type: "locate_user" };
    case "open_simulation": {
      const mode = item.mode;
      if (mode !== "level" && mode !== "rain" && mode !== "sensor") return null;
      const lat = finite(item.lat) && item.lat >= -90 && item.lat <= 90 ? item.lat : null;
      const lon = finite(item.lon) && item.lon >= -180 && item.lon <= 180 ? item.lon : null;
      return { type: "open_simulation", mode, lat, lon };
    }
    case "zoom":
      return item.direction === "in" || item.direction === "out"
        ? { type: "zoom", direction: item.direction }
        : null;
    case "reset_view":
      return { type: "reset_view" };
    default:
      return null;
  }
}

/** Phrase courte décrivant une action, pour l'historique et la confirmation orale. */
export function describeAction(action: AssistantAction): string {
  switch (action.type) {
    case "fly_to":
      return action.label ? `vol vers ${action.label}` : `vol vers ${action.lat.toFixed(2)}, ${action.lon.toFixed(2)}`;
    case "set_view":
      return action.view === "globe" ? "bascule sur le globe 3D" : "bascule sur la carte 2D";
    case "open_tab":
      return `ouverture : ${TAB_TITLES[action.tab]}`;
    case "select_sensor":
      return `sélection du capteur ${action.code}`;
    case "set_layer":
      return `${action.enabled ? "affichage" : "masquage"} : ${LAYER_TITLES[action.layer]}`;
    case "set_basemap":
      return `fond de carte : ${BASE_LABELS[action.basemap]}`;
    case "locate_user":
      return "centrage sur votre position";
    case "open_simulation":
      return `ouverture de la simulation (${action.mode === "rain" ? "pluie" : action.mode === "sensor" ? "capteur" : "niveau"})`;
    case "zoom":
      return action.direction === "in" ? "zoom avant" : "zoom arrière";
    case "reset_view":
      return "retour à la vue mondiale";
  }
}

export type LocalCommandContext = {
  places?: readonly Place[];
  sensors?: readonly { code: string; name: string }[];
  userPosition?: { lat: number; lon: number; accuracyM?: number; timestamp?: number } | null;
};

export type LocalCommandResolution = {
  intent: string;
  actions: AssistantAction[];
  answer: string;
};

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Retire les formules de politesse et verbes d'action pour isoler la cible. */
function extractTarget(input: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match && match[1]) {
      const target = match[1].replace(/\b(s'il te plait|stp|merci|pour moi)\b/g, "").trim();
      if (target.length >= 2) return target;
    }
  }
  return null;
}

const NAVIGATION_PATTERNS = [
  /\b(?:va|aller|vais|rends toi|rendez vous|deplace toi|deplace|navigue|naviguer)\s+(?:a|au|aux|vers|sur|dans)?\s*(.+)$/,
  /\b(?:centre|centrer|centrez|recentre|recentrer|zoome|zoomer|zoom|montre|montrer|affiche|afficher|localise|localiser|trouve|trouver|cherche|chercher)\s+(?:la carte sur |le carte sur |sur |vers |a |au |aux )?(.+)$/,
  /\bou (?:se trouve|est situe|est|se situe)\s+(.+)$/,
];

const LAYER_WORDS: Array<[AssistantLayer, RegExp]> = [
  ["radar", /\bradars?\b/],
  ["borders", /\b(frontieres?|limites? administratives?|delimitations?)\b/],
  ["labels", /\b(noms? (?:de |des )?(?:villes?|lieux?|pays)|libelles?|etiquettes?)\b/],
  ["flood", /\b(inondations? simulee?s?|eau simulee|nappe|flood)\b/],
  ["rain", /\b(pluie|precipitations?)\b/],
  ["night", /\b(nuit|obscurite|eclairage solaire|jour et nuit)\b/],
  ["aircraft", /\b(avions?|aeronefs?|trafic aerien|vols? en cours)\b/],
  [
    "traffic",
    /\b(voitures?|motos?|camions?|vehicules?|circulation|trafic routier|embouteillages?|bateaux?|navires?|maritime|ports?)\b/,
  ],
  ["sensors", /\b(capteurs?|stations? de mesure)\b/],
  ["weather", /\b(points? meteo|stations? meteo)\b/],
  ["alerts", /\b(alertes?|vigilance)\b/],
];

const TAB_WORDS: Array<[AssistantTab, RegExp]> = [
  ["meteo", /\b(meteo|observatoire|previsions?)\b/],
  ["capteurs", /\b(capteurs|stations?)\b/],
  ["alertes", /\b(alertes?|vigilance)\b/],
  ["observations", /\b(observations?|terrain|signalements?)\b/],
  ["ia", /\b(assistant|intelligence|ia)\b/],
  ["gestion", /\b(gestion|administration|comptes?|reglages?)\b/],
  ["carte", /\b(carte|plan)\b/],
];

/**
 * Analyse une commande vocale ou écrite en français et renvoie les actions
 * correspondantes. Retourne `null` quand la phrase n'est pas une commande :
 * elle suit alors le chemin habituel de l'assistant.
 */
export function resolveLocalCommand(
  input: string,
  context: LocalCommandContext = {},
): LocalCommandResolution | null {
  const text = normalize(input);
  if (!text) return null;

  // 1. Position de l'utilisateur.
  if (/\b(ou suis je|ma position|ma localisation|localise moi|localise-moi|centre sur moi|recentre sur moi|je suis ou)\b/.test(text)) {
    const position = context.userPosition;
    if (!position) {
      return {
        intent: "locate_user",
        actions: [{ type: "locate_user" }],
        answer:
          "Je n'ai pas encore votre position. Autorisez la localisation : je vous situe alors sur la carte 2D comme sur le globe 3D.",
      };
    }
    const near = context.places?.length ? nearestPlace(context.places, position) : null;
    const where = near
      ? ` Vous êtes à environ ${Math.round(near.distanceM / 1000)} km de ${displayPlaceName(near.place)}${near.place.country ? ` (${near.place.country})` : ""}.`
      : "";
    return {
      intent: "locate_user",
      actions: [
        { type: "locate_user" },
        { type: "fly_to", lat: position.lat, lon: position.lon, height: 2_500, label: "Ma position" },
      ],
      answer: `Je centre la carte sur votre position.${where}`,
    };
  }

  // 2. Vue mondiale / réinitialisation.
  if (/\b(vue (mondiale|monde|globale)|globe entier|monde entier|reinitialise|reinitialiser|reset|dezoome tout)\b/.test(text)) {
    return {
      intent: "reset_view",
      actions: [{ type: "reset_view" }],
      answer: "Retour à la vue mondiale : le globe entier est visible, avec les couches actives.",
    };
  }

  // 3. Bascule 2D / 3D.
  if (/\b(carte 2d|carte deux d|vue 2d|carte plate)\b/.test(text)) {
    return { intent: "set_view", actions: [{ type: "set_view", view: "map" }], answer: "Je bascule sur la carte 2D." };
  }
  if (/\b(globe 3d|globe|3d|trois d|vue 3d)\b/.test(text)) {
    return { intent: "set_view", actions: [{ type: "set_view", view: "globe" }], answer: "Je bascule sur le globe 3D." };
  }

  // 4. Navigation vers un lieu : résolue avant le zoom pour que « zoome sur
  //    Paris » soit compris comme un déplacement, pas comme un zoom générique.
  const target = extractTarget(text, NAVIGATION_PATTERNS);
  if (target && context.places?.length) {
    const place = findPlace(context.places, target);
    if (place) {
      return {
        intent: "fly_to",
        actions: [
          { type: "set_view", view: "globe" },
          { type: "fly_to", lat: place.lat, lon: place.lon, height: 60_000, label: displayPlaceName(place) },
        ],
        answer: `Je vous emmène à ${displayPlaceName(place)}${place.country ? `, ${place.country}` : ""}.`,
      };
    }
  }

  // 5. Sélection d'un capteur nommé (avant les interrupteurs de couche, sinon
  //    « affiche le capteur Cocody » ne ferait qu'allumer la couche capteurs).
  if (context.sensors?.length && /\bcapteur\b/.test(text)) {
    const query = text
      .replace(/\b(capteur|capteurs|selectionne|selectionner|choisis|choisir|affiche|afficher|montre|montrer|le|la|les|du|de)\b/g, " ")
      .trim();
    const match = context.sensors.find((sensor) => {
      const name = normalize(sensor.name);
      return Boolean(query) && (name.includes(query) || query.includes(name));
    });
    if (match) {
      return {
        intent: "select_sensor",
        actions: [{ type: "select_sensor", code: match.code }, { type: "open_tab", tab: "capteurs" }],
        answer: `J'ouvre la fiche du capteur ${match.name}.`,
      };
    }
  }

  // 6. Zoom.
  if (/\b(zoom avant|zoome|rapproche|avance)\b/.test(text)) {
    return { intent: "zoom", actions: [{ type: "zoom", direction: "in" }], answer: "Je zoome." };
  }
  if (/\b(zoom arriere|dezoome|eloigne|recul)\b/.test(text)) {
    return { intent: "zoom", actions: [{ type: "zoom", direction: "out" }], answer: "Je dézoome." };
  }

  // 6. Fond de carte.
  if (/\b(satellite|imagerie)\b/.test(text) && /\b(affiche|montre|passe|mets|fond|utilise)\b/.test(text)) {
    return {
      intent: "set_basemap",
      actions: [{ type: "set_basemap", basemap: /\bnasa\b/.test(text) ? "nasa" : "esri" }],
      answer: "J'affiche le fond satellite.",
    };
  }
  if (/\b(plan|osm|openstreetmap)\b/.test(text) && /\b(affiche|montre|passe|mets|fond|utilise|carte)\b/.test(text)) {
    return {
      intent: "set_basemap",
      actions: [{ type: "set_basemap", basemap: "osm" }],
      answer: "J'affiche le plan OpenStreetMap.",
    };
  }

  // 6. Couches : « affiche le radar », « cache les frontières », « désactive la nuit ».
  const hiding = /\b(cache|cacher|masque|masquer|desactive|desactiver|enleve|enlever|retire|retirer)\b/.test(text);
  const showing = /\b(affiche|afficher|montre|montrer|active|activer|mets|met|ajoute|ajouter)\b/.test(text);
  for (const [layer, pattern] of LAYER_WORDS) {
    if (!pattern.test(text)) continue;
    if (!showing && !hiding) continue;
    return {
      intent: `set_layer:${layer}`,
      actions: [{ type: "set_layer", layer, enabled: showing && !hiding }],
      answer: `${showing && !hiding ? "J'affiche" : "Je masque"} : ${LAYER_TITLES[layer]}.`,
    };
  }

  // 7. Onglets.
  if (/\b(ouvre|ouvrir|va|aller|affiche|montre|passe)\b/.test(text)) {
    for (const [tab, pattern] of TAB_WORDS) {
      if (!pattern.test(text)) continue;
      if (tab === "carte") continue;
      return {
        intent: `open_tab:${tab}`,
        actions: [{ type: "open_tab", tab }],
        answer: `J'ouvre ${TAB_LABELS[tab]}.`,
      };
    }
  }

  // 8. Simulation.
  if (/\bsimulations?\b|\bsimule\b/.test(text)) {
    const mode = /\bpluie\b/.test(text) ? "rain" : /\bcapteur\b/.test(text) ? "sensor" : "level";
    return {
      intent: "open_simulation",
      actions: [{ type: "open_simulation", mode }],
      answer: "J'ouvre le panneau de simulation. Les valeurs restent indicatives et ne sont pas une prévision.",
    };
  }

  // 9. Sélection d'un capteur par nom.
  if (context.sensors?.length && /\bcapteur\b/.test(text)) {
    const query = text.replace(/\b(capteur|capteurs|selectionne|selectionner|choisis|choisir|affiche|montre|le|la|les)\b/g, " ").trim();
    const match = context.sensors.find((sensor) => query && normalize(sensor.name).includes(query));
    if (match) {
      return {
        intent: "select_sensor",
        actions: [{ type: "select_sensor", code: match.code }, { type: "open_tab", tab: "capteurs" }],
        answer: `J'ouvre la fiche du capteur ${match.name}.`,
      };
    }
  }

  return null;
}

/** Commandes proposées dans l'interface vocale (aide immédiate). */
export const COMMAND_EXAMPLES: readonly string[] = [
  "Va à Paris",
  "Où suis-je ?",
  "Affiche le radar",
  "Masque les frontières",
  "Passe en carte 2D",
  "Vue mondiale",
  "Ouvre la météo",
  "Que sais-tu faire ?",
  "Zoom avant",
];
