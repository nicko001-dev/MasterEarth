/**
 * Connaissance de la plateforme MasterEarth, utilisable sans réseau ni modèle
 * IA.
 *
 * L'assistant vocal s'appuie sur ce module pour répondre immédiatement sur le
 * produit, les pages, les cartes, les sources de données et les limites. Il
 * décrit exactement ce que l'interface expose aujourd'hui : aucune
 * fonctionnalité annoncée n'est absente de l'application, et les seuils,
 * simulations et estimations sont toujours présentés comme provisoires.
 *
 * Le serveur possède son propre catalogue (`app/domain/platform_catalog.py`)
 * pour les réponses envoyées à un fournisseur IA ; les deux restent alignés
 * sur les mêmes faits produit.
 */
import type { AlertItem, SensorState, WeatherItem } from "./api";
import { dayPhaseLabel, isNightAt } from "./daynight";
import { formatAccuracy, formatCoordinates, UserPosition } from "./geolocation";

export const PLATFORM_NAME = "MasterEarth";
export const PLATFORM_SCOPE = "le monde entier";

export type PlatformSection = {
  key: string;
  title: string;
  lines: string[];
};

export const PLATFORM_SECTIONS: readonly PlatformSection[] = [
  {
    key: "pages",
    title: "Pages de la plateforme",
    lines: [
      "Carte : vue plein écran, carte 2D (Leaflet) ou globe 3D (Cesium) au choix.",
      "Surveillance : veille mondiale des aléas réels (séismes, tsunamis, volcans, cyclones, inondations, feux, sécheresses, glissements, tempêtes de sable, blizzards, canicules, tornades et orages), avec provenance et fraîcheur des sources.",
      "Capteurs : niveaux d'eau, pluviomètres, fraîcheur des mesures et historique.",
      "Alertes : alertes déclenchées par les seuils déterministes vert / orange / rouge.",
      "Météo : observatoire météo, intensités, prévision à 3 h et cumuls 24 h.",
      "Observations : signalements de terrain, avec statut de vérification.",
      "Assistant IA : conversation écrite et vocale, avec actions sur la carte.",
      "Gestion : comptes, capteurs, observations et fournisseurs IA (rôles autorisés).",
    ],
  },
  {
    key: "maps",
    title: "Cartes 2D et 3D",
    lines: [
      "Carte 2D : fonds OpenStreetMap, Esri ou NASA, capteurs, points météo et couches de simulation.",
      "Globe 3D : imagerie satellite, relief, radar de précipitations mondial animé, jour/nuit calculé, frontières et noms de lieux du monde entier.",
      "La carte couvre le monde entier : météo, radar, simulation et statistiques ne sont plus limités à un pays.",
      "Aucun maillage n'est affiché : la météo est rendue par points, icônes de risque et radar réel, avec des lieux nommés dans les statistiques de pluie.",
      "Icônes de risque : un pictogramme bleu signale la pluie, un rouge l'inondation, un rose les deux à la fois, en 2D comme en 3D.",
      "Localisation : après autorisation, la position de l'utilisateur est affichée sur les deux cartes, avec un bouton pour la recentrer.",
      "Les couches (radar, pluie, inondation simulée, aléas mondiaux, noms, frontières, nuit, circulation, avions, capteurs, météo, alertes) sont activables séparément.",
      "Nuit : le globe utilise l'éclairage solaire Cesium, avec les lumières urbaines NASA uniquement côté nuit ; en vue rapprochée l'éclairage s'efface pour garder les rues, le relief et les libellés nets.",
      "Aléas : chaque événement réel est placé à sa position publiée, avec un pictogramme et un effet 3D propres à sa famille ; un clic vole vers le lieu, ouvre sa fiche et sa simulation indicative.",
      "Circulation : voitures, motos, camions et bus avancent en continu sur les rues réelles d'OpenStreetMap, et des navires relient de vrais ports. Le tracé est réel, le déplacement est modélisé.",
      "Vue mondiale : des flux de mobilité relient les métropoles en continu, et les navires restent visibles ; ce sont des modèles accélérés, jamais des véhicules observés.",
      "Avions : positions observées par OpenSky, prolongées entre deux observations. Le flux suit l'emprise en vue régionale ; en vue mondiale, un échantillon réparti sur tous les continents prend le relais sans jamais vider la couche.",
      "Statistiques de pluie : l'interface distingue les zones affichées du scan mondial de 198 points ; une donnée indisponible affiche « — », jamais un zéro, et les zones arrosées sont nommées par rue ou quartier.",
    ],
  },
  {
    key: "data",
    title: "Sources de données",
    lines: [
      "Capteurs IoT : niveau d'eau ultrason et pluviomètres, horodatés, avec contrôle de fraîcheur.",
      "USGS Earthquake Hazards, GDACS, NASA EONET, USGS Volcanoes et NOAA Tsunami/NHC : événements mondiaux réels, dédupliqués et attribués, cache serveur d'environ 90 s ; aucune donnée inventée en cas de panne.",
      "Open-Meteo (CC BY 4.0) : estimations de modèle, jamais des mesures terrain.",
      "OpenWeather : conditions rapportées, uniquement si une clé est configurée.",
      "Radar RainViewer : composite mondial de précipitations, passé récent et courte prévision ; il s'efface en vue rapprochée pour ne pas masquer les rues.",
      "OpenStreetMap (ODbL) : géométrie des rues utilisée par la circulation animée.",
      "OpenSky Network (CC BY-NC 4.0) : observations de trafic aérien, avec un flux mondial réparti par secteurs de 6°.",
      "Scan de pluie mondial : GET /api/v1/weather/global-rain interroge Open-Meteo sur 198 points avec la précipitation courante, affine jusqu'à 8 zones arrosées puis les nomme en parallèle via OpenStreetMap ; les points en échec restent inconnus.",
      "NASA GIBS et Natural Earth : imagerie et délimitations (domaine public).",
      "GeoNames (CC BY 4.0) : noms et population des villes du monde.",
      "Observations de terrain : saisies par des agents, avec statut de vérification.",
    ],
  },
  {
    key: "calculations",
    title: "Calculs déterministes",
    lines: [
      "Les seuils d'alerte et la simulation d'inondation sont calculés par le serveur, jamais par l'IA.",
      "La simulation multi-aléas utilise un modèle indicatif déterministe côté serveur : elle matérialise un « et si ? » et ne représente ni une prévision officielle ni une alerte.",
      "La simulation utilise le modèle numérique de terrain : elle est indicative, sans hydrodynamique, ouvrages ni drainage.",
      "Les seuils de pluie et de niveau restent provisoires jusqu'à validation par les autorités compétentes.",
    ],
  },
  {
    key: "ai",
    title: "Intelligence Engine",
    lines: [
      "Fournisseurs gratuits configurables par un administrateur ; aucune clé exposée au navigateur.",
      "Consentement explicite avant tout envoi ; mode local déterministe toujours disponible.",
      "L'IA ne confirme jamais une crue, ne déclenche aucune alerte et ne prend aucune décision opérationnelle.",
      "L'assistant peut déplacer la carte, changer de vue, ouvrir un panneau ou activer une couche, mais ces actions restent visibles et réversibles.",
    ],
  },
  {
    key: "privacy",
    title: "Vie privée",
    lines: [
      "La position de l'utilisateur reste dans le navigateur : elle n'est ni stockée côté serveur ni transmise à un fournisseur IA.",
      "Le consentement de géolocalisation est mémorisé localement et peut être retiré à tout moment.",
      "Les questions envoyées à un fournisseur IA ne sont ni stockées ni écrites dans les journaux d'audit.",
    ],
  },
  {
    key: "availability",
    title: "Disponibilité et démarrage",
    lines: [
      "« Hors ligne » signifie que l'API entière est injoignable, pas qu'une source a échoué.",
      "Chaque source est interrogée séparément : une panne partielle conserve les dernières valeurs connues et laisse toutes les couches et animations actives.",
      "start.bat health vérifie 11 endpoints ; les fichiers .env alignent la météo, l'URL d'API, les origines CORS et NO_PROXY pour les appels locaux.",
    ],
  },
  {
    key: "limits",
    title: "Limites connues",
    lines: [
      "Les capteurs de niveau couvrent une partie du réseau : ailleurs, seules la météo, le radar et les observations sont disponibles.",
      "Le radar est une image de précipitation, pas une mesure de débit ni une prévision hydrologique.",
      "Les fonds de carte, le radar et la météo dépendent de services externes gratuits et de la connexion réseau.",
      "Aucun flux mondial de véhicules routiers en direct n'est disponible sans clé : la circulation est un modèle sur des rues réelles, pas une observation.",
      "Le réseau routier met quelques dizaines de secondes à se charger la première fois, puis reste en cache.",
    ],
  },
];

/** Réponse « que sais-tu faire / présente-moi la plateforme ». */
export function platformOverview(): string {
  return [
    "MasterEarth est une plateforme ouverte de surveillance planétaire et de prévention des risques naturels.",
    "Elle réunit des événements mondiaux réels publiés par les organismes officiels, des capteurs de niveau d'eau, des estimations météo, un radar de précipitations, des observations de terrain, des alertes déterministes et des simulations indicatives.",
    "La carte existe en 2D et en globe 3D, tous deux à l'échelle du monde entier : le globe affiche les aléas réels à leur position, avec un effet 3D propre à chaque famille, le jour et la nuit, les frontières, les noms de villes, la circulation animée et les avions, et peut centrer la vue sur votre position si vous l'autorisez.",
    "L'assistant peut agir sur l'application : « va à Paris », « affiche le radar », « ouvre la météo », « où suis-je », « vue mondiale ».",
    "Les seuils et les simulations restent provisoires et ne remplacent jamais une alerte officielle ni une décision humaine.",
  ].join(" ");
}

/** Réponse d'aide : pages, commandes, limites. */
export function platformHelp(): string {
  const pages = PLATFORM_SECTIONS.find((section) => section.key === "pages")?.lines ?? [];
  return [
    "Voici ce que je peux faire, et ce que contient la plateforme.",
    ...pages,
    "Commandes utiles : « va à <lieu> », « où suis-je », « affiche le radar », « affiche la circulation », « masque les frontières », « passe en carte 2D », « vue mondiale », « ouvre la météo », « simulation pluie ».",
    "Je ne déclenche aucune alerte et je ne remplace pas les calculs du serveur.",
  ].join(" ");
}

export type SituationInputs = {
  sensors: readonly SensorState[];
  alerts: readonly AlertItem[];
  weather: readonly WeatherItem[];
  offline?: boolean;
  position?: UserPosition | null;
  now?: Date;
};

const rainOf = (item: WeatherItem) => item.observed_precip_mm_h ?? item.modeled_precip_mm_h ?? 0;

/** Nombre à la française (virgule décimale). */
const num = (value: number, digits = 1) =>
  value.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Synthèse déterministe de la situation, à l'échelle mondiale. */
export function situationSummary({
  sensors,
  alerts,
  weather,
  offline = false,
  position = null,
  now = new Date(),
}: SituationInputs): string {
  const rainy = weather.filter((item) => rainOf(item) > 0);
  const maxRain = weather.reduce((max, item) => Math.max(max, rainOf(item)), 0);
  const strongest = rainy.reduce<WeatherItem | null>(
    (best, item) => (!best || rainOf(item) > rainOf(best) ? item : best),
    null,
  );
  const alertSensors = sensors.filter(
    (sensor) => sensor.health_status === "online" && sensor.alert_level !== "green",
  );
  const redSensors = alertSensors.filter((sensor) => sensor.alert_level === "red");
  const current = alerts.filter((alert) => alert.level !== "green");
  const night = position ? isNightAt(position.lat, position.lon, now) : null;

  const parts: string[] = [];
  if (offline) {
    parts.push("Mode local : aucune donnée n'est confirmée comme actuelle sans connexion à l'API.");
  }
  parts.push(
    `${sensors.length} capteur(s) suivi(s) dont ${alertSensors.length} hors niveau vert`
      + `${redSensors.length ? `, dont ${redSensors.length} en rouge` : ""}.`,
  );
  parts.push(
    rainy.length
      ? `${rainy.length} zone(s) de pluie détectée(s) sur ${weather.length} point(s) météo, avec un maximum de ${num(maxRain)} mm/h`
        + `${strongest ? ` près de ${strongest.name}` : ""}.`
      : `${weather.length} point(s) météo suivis, aucune précipitation signalée pour le moment.`,
  );
  if (current.length) {
    parts.push(`${current.length} alerte(s) récente(s) non vertes dans l'historique.`);
  }
  if (position) {
    parts.push(
      `Votre position est connue (${formatCoordinates(position.lat, position.lon)}, ${formatAccuracy(position.accuracyM)}), actuellement de ${night ? "nuit" : dayPhaseLabel(position.lat, position.lon, now)} locale.`,
    );
  }
  parts.push("Synthèse indicative : les seuils restent provisoires et l'IA ne déclenche aucune alerte.");
  return parts.join(" ");
}

export type LocalQuestion = {
  answer: string;
  intent: string;
  usedFallback?: boolean;
};

const RULES: Array<[string, RegExp]> = [
  ["help", /\b(que (peux tu|sais tu) faire|aide|commandes?|comment (ca marche|utiliser)|a quoi sers? tu)\b/],
  ["overview", /\b(c.est quoi (intelliflood|masterearth)|presente (la plateforme|intelliflood|masterearth)|qu.est ce que (intelliflood|masterearth)|explique (la plateforme|intelliflood|masterearth))\b/],
  ["privacy", /\b(donnees personnelles|vie privee|position (est elle|reste)|geolocalisation (privee|securisee)|rgpd)\b/],
  ["sources", /\b(sources? (de donnees|utilisees)|open meteo|openweather|rainviewer|natural earth|geonames|nasa)\b/],
  ["traffic", /\b(circulation|voitures?|vehicules?|motos?|camions?|navires?|bateaux?|trafic routier|embouteillages?)\b/],
  ["sampling", /\b(maillage|grille|maille|echantillonnage|points? de sondage)\b/],
  ["search", /\b(recherche (de )?(lieu|ville)|rechercher (un|une) (lieu|ville)|trouver (un|une) (lieu|ville)|barre de recherche|geocodage)\b/],
  ["globalrain", /\b(points? en pluie|statistiques? (de|sur la) pluie|pluie (dans le|sur le|a l.echelle du) monde|scan (de pluie )?mondial|combien (de )?points? (de )?pluie|0 point|198 (mailles|points)|rain places|ou pleut)\b/],
  ["availability", /\b(hors ligne|offline|source (partiellement )?indisponible|bandeau|pannes? partielles?|donnees? indisponibles?|start\.bat|health)\b/],
  ["simulation", /\b(simulation|mnt|modele numerique|comment est calculee l.inondation)\b/],
  ["alerts", /\b(alertes?|vigilance|danger|seuils?)\b/],
  ["rain", /\b(pluie|pleut|meteo|precipitations?|orage)\b/],
  ["sensors", /\b(capteurs?|stations? de mesure|niveau d.eau)\b/],
  ["account", /\b(compte|connexion|connexion requise|roles?|administrateur|inscription)\b/],
];

/**
 * Répond localement, sans modèle IA, aux questions factuelles sur la
 * plateforme et sur les données chargées. Retourne `null` si la question doit
 * suivre le chemin IA habituel.
 */
export function answerLocalQuestion(question: string, inputs: SituationInputs): LocalQuestion | null {
  const text = question
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[’'`\-\u2013\u2014]/g, " ")
    .replace(/\s+/g, " ");
  const matched = RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
  if (!matched) return null;

  switch (matched) {
    case "help":
      return { answer: platformHelp(), intent: "help" };
    case "overview":
      return { answer: platformOverview(), intent: "overview" };
    case "privacy":
      return {
        intent: "privacy",
        answer:
          "La position reste dans votre navigateur : elle n'est ni enregistrée côté serveur, ni transmise à un fournisseur IA, ni incluse dans les agrégats. Vous pouvez retirer l'autorisation à tout moment ; les boutons de localisation sont alors désactivés. Les questions envoyées à un fournisseur IA ne sont pas stockées et les journaux d'audit ne retiennent que le fournisseur et le modèle utilisés.",
      };
    case "sources":
      return {
        intent: "sources",
        answer:
          "Données utilisées : capteurs IoT (niveau d'eau ultrason, pluviomètres) ; Open-Meteo sous licence CC BY 4.0 pour les estimations de modèle ; OpenWeather pour les conditions rapportées, uniquement si une clé est configurée ; radar RainViewer pour le composite mondial de précipitations ; NASA GIBS pour l'imagerie satellite ; Natural Earth pour les frontières ; GeoNames (CC BY 4.0) pour les villes ; OpenStreetMap (ODbL) pour le réseau routier et la recherche de lieux ; OpenSky Network (CC BY-NC 4.0) pour le trafic aérien. Les estimations de modèle ne sont jamais présentées comme des mesures terrain.",
      };
    case "traffic":
      return {
        intent: "traffic",
        answer:
          "La circulation est animée en continu : voitures, motos, camions et bus avancent sur le réseau routier réel d'OpenStreetMap, servi par l'API (cache, miroirs, chargement en arrière-plan), et des navires relèvent de vrais ports. Le tracé des rues est réel ; le déplacement des véhicules est un modèle calculé à partir de l'heure, pas une observation du trafic, et il est présenté comme tel. En vue mondiale, des flux de mobilité entre métropoles prennent le relais : eux aussi sont un modèle, jamais une observation. Activez la couche « Circulation » dans la barre d'outils, ou dites « affiche la circulation ».",
      };
    case "sampling":
      return {
        intent: "sampling",
        answer:
          "Il n'y a plus aucun maillage ni grille affichée : la météo est rendue par des points et des icônes de risque, et le radar de précipitations réel couvre le monde entier. Sous le capot, le serveur interroge Open-Meteo à des coordonnées précises pour l'emprise regardée, puis affine localement jusqu'à 8 zones où il pleut et géocode en parallèle les points les plus arrosés pour afficher le nom de la rue, du quartier ou de la localité dans les statistiques. Aucune valeur n'est inventée entre deux points, et rien n'est limité à un pays.",
      };
    case "search":
      return {
        intent: "search",
        answer:
          "La recherche de lieux est mondiale. L'interface filtre instantanément un jeu GeoNames embarqué (villes de plus de 15 000 habitants), sans réseau ni compte. L'API expose aussi une recherche et un géocodage inverse qui interrogent Photon, basé sur OpenStreetMap, avec cache, limite de débit et repli local si le service est injoignable. Les quartiers très fins restent fournis par le fond de carte.",
      };
    case "simulation":
      return {
        intent: "simulation",
        answer:
          "La simulation est calculée par le serveur à partir du modèle numérique de terrain : elle estime une profondeur d'eau sur une zone et un rayon donnés, avec plusieurs images de montée. Elle ignore volontairement l'hydrodynamique, les ouvrages, le drainage et l'infiltration, et l'erreur verticale du relief est incertaine. C'est un outil indicatif, pas une prévision opérationnelle.",
      };
    case "alerts":
      return {
        intent: "alerts",
        answer: `${situationSummary(inputs)} Les seuils vert, orange et rouge sont déterministes et provisoires : ils doivent être validés par les autorités compétentes avant tout usage opérationnel.`,
      };
    case "globalrain":
      return {
        intent: "globalrain",
        answer:
          "Les statistiques distinguent deux échelles. « Zones affichées » compte les capteurs et points météo visibles ; « Monde entier » vient de GET /api/v1/weather/global-rain, qui interroge Open-Meteo sur 198 points répartis de -75° à +75° et de -180° à +160°, avec la précipitation courante, jamais la prévision. Jusqu'à 8 zones où il pleut sont ensuite affinées par des sondages rapprochés et rain_places donne le nom de la rue, du quartier ou de la localité (OpenStreetMap via Photon) avec l'intensité et le niveau de vigilance ; un point isolé reste anonyme avec ses coordonnées. Les points en échec restent inconnus et sont comptés dans failed_points ; si aucun ne répond, rain_points vaut null et l'interface affiche « — » ou « données indisponibles », jamais un zéro.",
      };
    case "availability":
      return {
        intent: "availability",
        answer:
          "« Hors ligne » signifie désormais que l'API entière est injoignable, pas qu'une source a échoué. Chaque source est interrogée séparément ; une panne partielle affiche un bandeau « Source partiellement indisponible », conserve les dernières valeurs connues et laisse toutes les couches et animations actives. start.bat health vérifie 11 endpoints avec curl --noproxy *, et les fichiers .env alignent WEATHER_ENABLED, VITE_API_BASE_URL, les origines CORS et NO_PROXY.",
      };
    case "rain":
    case "sensors":
      return { intent: matched, answer: situationSummary(inputs) };
    case "account":
      return {
        intent: "account",
        answer:
          "La carte, la météo, les alertes, les observations publiées et l'assistant restent accessibles sans compte. Un compte est nécessaire pour la gestion, la simulation d'inondation et la publication d'observations selon le rôle : citoyen, agent de terrain, analyste, responsable ou administrateur.",
      };
    default:
      return null;
  }
}
