"""Catalogue produit MasterEarth (couche domaine, sans dépendance framework).

Ce module décrit ce que la plateforme fait réellement : pages, cartes, couches,
sources de données, simulation, alertes, assistant, comptes, confidentialité et
limites. Il alimente le contexte de l'assistant IA, qui doit pouvoir répondre
sur le produit sans inventer de chiffres ni de feuille de route.

Règles de contenu :
  * uniquement des faits constatés dans le dépôt et la documentation;
  * aucun chiffre de performance, date de livraison ou engagement inventé;
  * tout élément non décidé reste explicitement marqué « À DÉFINIR ».
"""

from __future__ import annotations

import json
import unicodedata

PRODUCT_NAME = "MasterEarth"

#: Identifiants des pages de l'interface web (`apps/web/src/app/App.tsx`).
PAGE_IDS = (
    "carte",
    "surveillance",
    "capteurs",
    "alertes",
    "meteo",
    "observations",
    "ia",
    "gestion",
)

#: Identifiants des couches acceptées par le contrat d'actions d'interface.
LAYER_IDS = (
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
    "hazards",
)

#: Identifiants des fonds de carte 2D et 3D.
BASEMAP_IDS = ("osm", "esri", "nasa")

PLATFORM_CATALOG: dict = {
    "product": {
        "name": PRODUCT_NAME,
        "role": (
            "Surveillance planétaire des risques naturels et aide à la décision : "
            "événements mondiaux réels (séismes, tsunamis, volcans, cyclones, "
            "inondations, feux, sécheresses, glissements, tempêtes de sable, "
            "blizzards, canicules, tornades et orages), capteurs de niveau d'eau "
            "et pluviomètres, météo et radar mondiaux, alertes déterministes, "
            "simulations indicatives et observations de terrain."
        ),
        "scope": (
            "Le globe et les couches géographiques couvrent le monde entier. Le "
            "réseau de capteurs physiques est déployé en Côte d'Ivoire et "
            "s'étend selon les installations; ailleurs, la météo, le radar et "
            "les observations restent disponibles."
        ),
        "audience": (
            "Visiteurs, citoyens, agents de terrain, analystes, responsables "
            "opérationnels et administrateurs."
        ),
        "language": "Interface et réponses en français.",
        "access": (
            "Carte, capteurs, alertes, météo et observations vérifiées sont "
            "consultables sans compte. Un compte citoyen est requis pour "
            "lancer une simulation. La gestion est réservée aux rôles "
            "agent de terrain et administrateur."
        ),
        "core_principle": (
            "Les seuils, alertes et simulations sont calculés de façon "
            "déterministe. L'IA est informative : elle ne confirme aucune "
            "crue et ne modifie aucune alerte."
        ),
        "maturity": (
            "Plusieurs capacités sont partielles et non validées en "
            "production ; la matrice BOATIKS fait foi pour le statut."
        ),
    },
    "pages": [
        {
            "id": "carte",
            "label": "Carte",
            "content": (
                "Vue principale : carte 2D Leaflet ou globe 3D Cesium, "
                "capteurs, météo, alertes, radar, simulation d'inondation, "
                "recherche de lieu et localisation de l'utilisateur."
            ),
            "access": "public",
        },
        {
            "id": "surveillance",
            "label": "Surveillance",
            "content": (
                "Console mondiale des aléas réels : événements dédupliqués et "
                "attribués, filtres par type et sévérité, fraîcheur et état de "
                "chaque source, fiche détaillée avec mesures publiées, "
                "localisation sur le globe et simulation indicative."
            ),
            "access": "public en lecture ; simulation avec compte",
        },
        {
            "id": "capteurs",
            "label": "Capteurs",
            "content": (
                "Liste des capteurs de niveau d'eau et pluviomètres avec "
                "fraîcheur de mesure, état de santé et historique des "
                "100 dernières mesures du capteur sélectionné."
            ),
            "access": "public",
        },
        {
            "id": "alertes",
            "label": "Alertes",
            "content": (
                "50 dernières alertes déclenchées par les seuils "
                "déterministes, avec niveau Vert/Orange/Rouge, message, "
                "capteur et horodatage."
            ),
            "access": "public",
        },
        {
            "id": "meteo",
            "label": "Météo",
            "content": (
                "Observatoire météorologique : estimations Open-Meteo, "
                "conditions rapportées OpenWeather, bulletins saisis et "
                "pluviomètres IoT, avec recherche, filtres et distinction "
                "entre mesure, modèle et prévision."
            ),
            "access": "public",
        },
        {
            "id": "observations",
            "label": "Observations",
            "content": (
                "Signalements de terrain (catégorie, description, position) "
                "et modération par un opérateur ou un administrateur."
            ),
            "access": "public en lecture vérifiée",
        },
        {
            "id": "ia",
            "label": "Assistant IA",
            "content": (
                "Panneau Intelligence Engine : question/réponse écrite et "
                "vocale, synthèse ou rapport, analyse d'image facultative, "
                "mode local déterministe, fournisseurs destinataires et "
                "consentement."
            ),
            "access": "public",
        },
        {
            "id": "gestion",
            "label": "Gestion",
            "content": (
                "Administration : comptes et rôles, configuration des "
                "fournisseurs IA gratuits, gestion des capteurs et des "
                "observations."
            ),
            "access": "agent de terrain ou administrateur",
        },
    ],
    "maps": {
        "2d": {
            "engine": (
                "Leaflet, fond tuilé, zoom maximum 19 (NASA limité au niveau 9)."
            ),
            "basemaps": [
                "osm : plan OpenStreetMap (© contributeurs OSM, ODbL).",
                "esri : imagerie satellite Esri (attribution Esri).",
                "nasa : image du jour NASA GIBS / VIIRS (domaine public).",
            ],
            "overlays": [
                "capteurs (couleur selon le niveau d'alerte)",
                "points météo mondiaux de l'emprise visible",
                "icônes de risque pluie / inondation",
                "radar RainViewer animé, avec attribution",
                "frontières Natural Earth et noms de lieux GeoNames",
                "couche des aléas mondiaux réels, placés à leur position publiée",
                "voile jour/nuit calculé à partir du soleil",
                "véhicules routiers animés le long des rues OpenStreetMap",
                "flux de mobilité modélisés entre métropoles en vue mondiale",
                "trafic aérien OpenSky observé, régional ou mondial selon le zoom",
                "couche de simulation d'inondation",
                "emprises automatiques dérivées de mesures",
                "position de l'utilisateur, si elle est autorisée",
            ],
            "interactions": [
                "déplacement et zoom",
                "sélection d'un capteur",
                "sélection d'un événement mondial et fiche de provenance",
                "recherche de lieu mondiale, sans compte",
                "recentrage sur une simulation ou sur la position",
            ],
            "limits": [
                "les noms de quartiers restent fournis par le fond de carte",
                "le flux aérien régional n'est demandé qu'au zoom 5 ou plus ; "
                "en deçà, le flux mondial partagé prend le relais",
            ],
        },
        "3d": {
            "engine": (
                "CesiumJS, globe entier; la vue par défaut est mondiale."
            ),
            "features": [
                "imagerie osm, esri ou nasa et noms de villes GeoNames",
                "relief facultatif via Cesium ion ; sinon ellipsoïde",
                "radar de précipitations mondial animé (RainViewer), effacé "
                "en vue rapprochée pour ne pas masquer les rues",
                "jour/nuit : éclairage solaire Cesium et lumières nocturnes "
                "NASA visibles uniquement côté nuit ; l'éclairage s'efface en "
                "vue rapprochée pour garder l'imagerie, le relief et les "
                "libellés nets",
                "frontières et limites administratives Natural Earth",
                "noms de villes du monde (GeoNames) selon la hauteur de caméra",
                "trafic aérien OpenSky observé, positions interpolées : flux "
                "régional sous 4 000 km et échantillon mondial réparti au-delà",
                "circulation animée en continu : voitures, motos, camions et "
                "bus sur le réseau routier OpenStreetMap, navires entre ports "
                "réels et flux de mobilité entre métropoles en vue mondiale ; "
                "le tracé est réel, le déplacement est modélisé",
                "couche des aléas mondiaux et effets 3D propres à chaque "
                "famille (anneaux sismiques, panache volcanique, spirale "
                "cyclonique, mur de vague, couloir de tornade, etc.)",
                "rideau de pluie et cumulonimbus pour les zones pluvieuses",
                "simulation d'inondation en 3D et emprises automatiques",
                "capteurs, météo, alertes et position de l'utilisateur",
            ],
            "not_implemented": [
                "prévision hydrologique issue du radar",
            ],
        },
        "world": {
            "app": "MasterEarth World (`apps/world`), application Cesium séparée.",
            "features": [
                "vols, navires, satellites et autres couches du logiciel dérivé",
                "trafic routier simulé ou fourni par un tiers, jamais présenté "
                "comme une observation mondiale en direct",
                "module MasterEarth : capteurs, météo, alertes, pluie, "
                "simulation et assistant partagé",
                "localisation utilisateur avec consentement, marqueur et "
                "recentrage, comme la carte et le globe de la plateforme",
            ],
        },
        "attribution": (
            "Crédits affichés : USGS, GDACS, NASA EONET, NOAA, OpenStreetMap, "
            "Esri, NASA GIBS, RainViewer, Natural Earth, GeoNames, OpenSky "
            "Network, Open-Meteo (CC BY 4.0) ; seuils provisoires et "
            "simulations indicatives signalés dans l'interface."
        ),
    },
    "layers": [
        {
            "id": "sensors",
            "label": "Capteurs",
            "scope": "2D et 3D",
            "default_enabled": True,
            "availability": "Activable sur la carte 2D et sur le globe 3D.",
        },
        {
            "id": "weather",
            "label": "Météo",
            "scope": "2D et 3D",
            "default_enabled": True,
            "availability": (
                "Activable en 2D et en 3D ; les points suivent l'emprise "
                "visible, avec un plafond de points."
            ),
        },
        {
            "id": "alerts",
            "label": "Alertes",
            "scope": "2D et 3D",
            "default_enabled": True,
            "availability": (
                "Activable en 2D et en 3D : icônes pluie, inondation et "
                "pluie+inondation."
            ),
        },
        {
            "id": "hazards",
            "label": "Aléas mondiaux",
            "scope": "2D et 3D",
            "default_enabled": True,
            "availability": (
                "Événements réels USGS, GDACS, EONET et NOAA, dédupliqués "
                "avec provenance. Un clic vole vers le lieu et ouvre la fiche."
            ),
        },
        {
            "id": "radar",
            "label": "Radar de pluie",
            "scope": "2D et 3D",
            "default_enabled": True,
            "availability": (
                "Images RainViewer passées et courte prévision, animées image "
                "par image sur la carte 2D et le globe 3D."
            ),
        },
        {
            "id": "rain",
            "label": "Pluie 3D",
            "scope": "3D",
            "default_enabled": True,
            "availability": (
                "Rideau de pluie et cumulonimbus sur les zones pluvieuses."
            ),
        },
        {
            "id": "flood",
            "label": "Inondation simulée",
            "scope": "2D et 3D",
            "default_enabled": True,
            "availability": (
                "Surcouche 2D et couche 3D dès qu'une simulation est chargée."
            ),
        },
        {
            "id": "labels",
            "label": "Noms de lieux",
            "scope": "2D et 3D",
            "default_enabled": True,
            "availability": (
                "Villes du monde (GeoNames) affichées selon le zoom ou la "
                "hauteur de caméra, plus les noms Esri des fonds satellite."
            ),
        },
        {
            "id": "borders",
            "label": "Frontières",
            "scope": "2D et 3D",
            "default_enabled": True,
            "availability": (
                "Frontières des pays et limites administratives Natural Earth, "
                "tracées en vectoriel sur la carte 2D et le globe 3D."
            ),
        },
        {
            "id": "night",
            "label": "Mode nuit",
            "scope": "2D et 3D",
            "default_enabled": True,
            "availability": (
                "Terminateur solaire réel en 3D : éclairage Cesium à distance "
                "et lumières urbaines NASA côté nuit uniquement. En vue "
                "rapprochée, l'éclairage s'efface pour que rues, relief et "
                "libellés restent nets. En 2D, voile jour/nuit calculé."
            ),
        },
        {
            "id": "traffic",
            "label": "Circulation",
            "scope": "2D et 3D",
            "default_enabled": True,
            "availability": (
                "Voitures, motos, camions et bus animés en continu le long du "
                "réseau routier OpenStreetMap, dès que la vue est locale "
                "(moins de 420 km d'altitude) ; navires modélisés entre ports "
                "réels, visibles aussi en vue mondiale ; flux de mobilité "
                "accélérés entre métropoles réelles au-dessus de 650 km. La "
                "géométrie des rues est réelle (ODbL) ; le déplacement est un "
                "modèle, jamais une observation de trafic."
            ),
        },
        {
            "id": "aircraft",
            "label": "Trafic aérien",
            "scope": "2D et 3D",
            "default_enabled": True,
            "availability": (
                "Avions observés par OpenSky Network, positions interpolées "
                "jusqu'à deux minutes. Deux flux : `/api/v1/live/aircraft` pour "
                "l'emprise visible et `/api/v1/live/aircraft/global` (une "
                "requête monde, 600 appareils répartis par secteurs de 6°) en "
                "vue planétaire. Le globe en dessine au plus 420 ; aucune vue "
                "ne vide la couche."
            ),
        },
    ],
    "data_sources": [
        {
            "id": "iot_water_level",
            "label": "Capteurs IoT de niveau d'eau",
            "nature": "mesure terrain (ultrasons)",
            "license": "donnée propre à MasterEarth",
            "status": (
                "Actif : ingestion authentifiée par clé d'appareil ou jeton "
                "d'opérateur ; les capteurs de démonstration DEMO- sont exclus."
            ),
        },
        {
            "id": "iot_rain_gauge",
            "label": "Pluviomètres IoT",
            "nature": "mesure terrain (cumul horaire en mm)",
            "license": "donnée propre à MasterEarth",
            "status": (
                "Actif via `POST /api/v1/sensors/{code}/rainfall`, avec "
                "provenance `iot-rain-gauge`."
            ),
        },
        {
            "id": "usgs_earthquakes",
            "label": "USGS Earthquake Hazards",
            "nature": "observations sismiques mondiales",
            "license": "domaine public (USGS), attribution affichée",
            "status": (
                "Actif : flux GeoJSON mondial M ≥ 2,5 sur 24 h, position, "
                "magnitude, profondeur et heure publiées. Cache serveur de 90 s."
            ),
        },
        {
            "id": "gdacs",
            "label": "GDACS (Commission européenne / JRC)",
            "nature": "alertes multi-aléas précoces",
            "license": "attribution GDACS requise",
            "status": (
                "Actif : flux RSS/XML pour séismes, cyclones, inondations, feux "
                "et volcans. Une alerte signale un risque potentiel, pas une "
                "catastrophe confirmée ; une page anti-robot renvoie une source "
                "indisponible, jamais des événements inventés."
            ),
        },
        {
            "id": "nasa_eonet",
            "label": "NASA EONET",
            "nature": "événements naturels ouverts",
            "license": "domaine public (NASA), attribution affichée",
            "status": (
                "Actif : événements ouverts des 30 derniers jours. Le nom de "
                "lieu ou la sévérité peuvent manquer et restent marqués comme "
                "non évalués."
            ),
        },
        {
            "id": "usgs_volcanoes",
            "label": "USGS Volcano Hazards",
            "nature": "niveaux d'alerte volcanique des observatoires américains",
            "license": "domaine public (USGS), attribution affichée",
            "status": "Actif : volcans et niveaux d'alerte publiés par l'USGS.",
        },
        {
            "id": "noaa_tsunami",
            "label": "NOAA Tsunami Warning Centers",
            "nature": "alertes tsunami",
            "license": "domaine public (NOAA), attribution affichée",
            "status": (
                "Actif : flux PTWC/NTWC. Un flux vide est affiché comme vide ; "
                "l'absence d'alerte ne prouve jamais une absence de risque."
            ),
        },
        {
            "id": "nhc",
            "label": "NOAA National Hurricane Center",
            "nature": "cyclones tropicaux suivis",
            "license": "domaine public (NOAA), attribution affichée",
            "status": "Actif : tempêtes et ouragans en cours dans l'Atlantique et le Pacifique est.",
        },
        {
            "id": "open_meteo",
            "label": "Open-Meteo",
            "nature": "estimations de modèle et prévisions",
            "license": "CC BY 4.0, attribution affichée",
            "status": (
                "Actif : points de sondage du réseau déployé collectés toutes "
                "les 30 minutes, échantillonnage mondial de l'emprise visible "
                "(60 points au plus) et scan de pluie mondial "
                "`/api/v1/weather/global-rain` sur 198 points, avec la "
                "précipitation courante (jamais la prévision). Aucun maillage "
                "ni grille n'est affiché : jusqu'à 8 zones arrosées sont affinées "
                "par des sondages rapprochés puis nommées en parallèle (rue, "
                "quartier, localité) via Photon / OpenStreetMap. "
                "Repli d'hôte automatique : si `api.open-meteo.com` renvoie "
                "429 (quota quotidien), le scan interroge "
                "historical-forecast-api.open-meteo.com (quota distinct, même "
                "modèle, même licence) et l'hôte saturé est ignoré pendant le "
                "Retry-After annoncé. Cache de 10 minutes, aucune écriture en "
                "base. Gratuit pour un usage non commercial; un usage "
                "commercial exige une licence ou un serveur auto-hébergé. Ce "
                "ne sont pas des mesures terrain."
            ),
        },
        {
            "id": "openweather",
            "label": "OpenWeather",
            "nature": "conditions rapportées par le fournisseur",
            "license": "conditions du compte OpenWeather",
            "status": (
                "Facultatif : actif seulement si une clé serveur est "
                "configurée. Quota, couverture et conditions d'usage à "
                "vérifier avant activation."
            ),
        },
        {
            "id": "bulletins",
            "label": "Bulletins météo saisis",
            "nature": "observation humaine",
            "license": "source saisie par l'opérateur",
            "status": (
                "Actif : saisie opérateur avec source et heure de validité "
                "conservées ; aucune API SODEXAM/ONPC n'est présumée."
            ),
        },
        {
            "id": "field_observations",
            "label": "Observations de terrain",
            "nature": "signalement humain",
            "license": "contenu MasterEarth",
            "status": (
                "Actif : statuts nouveau, en revue, vérifié, rejeté ; "
                "taxonomie et critères de modération à définir."
            ),
        },
        {
            "id": "openstreetmap",
            "label": "OpenStreetMap",
            "nature": "fond cartographique",
            "license": "ODbL, attribution requise",
            "status": "Actif en 2D et en 3D.",
        },
        {
            "id": "esri",
            "label": "Esri World Imagery et World Boundaries and Places",
            "nature": "imagerie satellite et noms de lieux",
            "license": "conditions Esri et fournisseurs cités",
            "status": "Actif en 2D et en 3D ; couverture dépendante du service.",
        },
        {
            "id": "nasa_gibs",
            "label": "NASA GIBS / VIIRS",
            "nature": "image satellite du jour et lumières nocturnes",
            "license": "domaine public (données NASA), attribution recommandée",
            "status": (
                "Actif : image du jour en 2D/3D (zoom limité au niveau 9) et "
                "lumières nocturnes VIIRS CityLights dans le mode nuit 3D."
            ),
        },
        {
            "id": "natural_earth",
            "label": "Natural Earth",
            "nature": "frontières, limites administratives et zone du réseau déployé",
            "license": "domaine public",
            "status": (
                "Actif : frontières des pays et limites admin-1 en 2D et sur "
                "le globe (fichiers `/geo/*.geojson` générés par script), et "
                "filtre de la frontière ivoirienne pour les points de sondage "
                "collectés périodiquement."
            ),
        },
        {
            "id": "geonames",
            "label": "GeoNames",
            "nature": "noms et population des villes du monde",
            "license": "CC BY 4.0, attribution affichée",
            "status": (
                "Actif : jeu `cities15000` converti en `/geo/places.json`, "
                "affiché par la carte 2D et le globe selon le zoom ou la "
                "hauteur de caméra, et utilisé par la recherche de lieu."
            ),
        },
        {
            "id": "rainviewer",
            "label": "RainViewer",
            "nature": "radar de précipitations mondial",
            "license": (
                "usage gratuit réservé au personnel, éducatif et communautaire "
                "à petite échelle ; attribution obligatoire « Weather data by "
                "RainViewer » avec lien ; usage commercial à négocier"
            ),
            "status": (
                "Actif en 2D et sur le globe 3D : images passées récentes et "
                "courte prévision, sans garantie de disponibilité (pas de SLA). "
                "Ce sont des images de précipitation, pas des mesures de débit "
                "ni une prévision hydrologique."
            ),
        },
        {
            "id": "opensky",
            "label": "OpenSky Network",
            "nature": "observations de trafic aérien (positions ADS-B)",
            "license": (
                "CC BY-NC 4.0 ; attribution obligatoire ; usage non commercial "
                "gratuit avec quota, usage commercial à négocier"
            ),
            "status": (
                "Actif en 2D et en 3D : proxy régional autour de l'emprise "
                "visible (400 aéronefs au plus) et flux mondial "
                "`/api/v1/live/aircraft/global` (une requête sans bbox, 600 "
                "états au plus répartis par secteurs de 6°, `scope=worldwide`). "
                "Cache 45 s, repli sur 15 min, 60 requêtes par minute et par "
                "hôte pour chaque endpoint. Les positions entre deux "
                "observations sont interpolées et signalées comme telles ; "
                "aucun flux mondial de véhicules routiers en direct n'est "
                "disponible."
            ),
        },
        {
            "id": "cesium_ion",
            "label": "Cesium ion",
            "nature": "relief 3D facultatif",
            "license": "conditions du compte Cesium ion",
            "status": (
                "Facultatif : utilisé seulement si un jeton navigateur est "
                "configuré ; sinon le globe reste sur son ellipsoïde."
            ),
        },
        {
            "id": "terrarium_dem",
            "label": "MNT Terrarium",
            "nature": "altitudes pour la simulation",
            "license": "source de tuiles d'altitude, conditions à vérifier",
            "status": (
                "Actif avec cache local ; zoom 13 ; couverture et précision "
                "non validées."
            ),
        },
    ],
    "simulation": {
        "engine": (
            "Modèle indicatif sur modèle numérique de terrain (MNT Terrarium), "
            "pas un modèle hydrodynamique."
        ),
        "modes": [
            (
                "level : l'eau monte d'une hauteur donnée au-dessus du sol de "
                "la cellule source et remplit les cellules basses connectées."
            ),
            (
                "rain : un volume de pluie ruisselée est rassemblé autour du "
                "point bas."
            ),
            (
                "sensor : la montée est déduite du niveau mesuré et du niveau "
                "de débordement (bankfull_cm) du capteur."
            ),
        ],
        "inputs": [
            "centre lat/lon",
            "rayon jusqu'à 5 000 m (1 500 m par défaut)",
            "résolution 120×120 en manuel, 80×80 en automatique",
            "images successives (steps) pour l'animation",
            "coefficient de ruissellement 0,6 en mode pluie (provisoire)",
        ],
        "outputs": [
            "profondeur par point de calcul et étendue possible",
            "profondeur maximale, surface en km², volume en m³, cote de surface",
            "emprise géographique et statistiques",
            "images horodatées pour la timeline",
        ],
        "limits": [
            "écoulement dynamique, ouvrages, drainage et infiltration non simulés",
            "incertitude verticale du MNT d'environ ±1,5 m (valeur provisoire)",
            "aucune validation hydraulique ni topographique",
            "résultat indicatif, jamais une mesure ni une prévision de crue",
        ],
        "access": (
            "Compte citoyen requis ; maximum 10 simulations par minute et par "
            "utilisateur."
        ),
        "automatic": (
            "Des emprises automatiques peuvent être calculées lorsque des "
            "mesures récentes ou des estimations dépassent les seuils "
            "provisoires ; aucune ne confirme une inondation réelle."
        ),
    },
    "alerts": {
        "engine": (
            "Règles déterministes : médiane des relevés, classification par "
            "niveau et vitesse de montée, persistance sur plusieurs cycles."
        ),
        "levels": {
            "green": "sous les seuils de vigilance",
            "orange": "vigilance : seuil orange de niveau ou de montée atteint",
            "red": "alerte : seuil rouge de niveau ou de montée atteint",
        },
        "thresholds": {
            "orange_cm": 40,
            "red_cm": 80,
            "orange_rise_cm_min": 5,
            "red_rise_cm_min": 10,
            "persistence_cycles": 3,
            "status": (
                "Valeurs par défaut provisoires, configurables et à valider "
                "opérationnellement."
            ),
        },
        "rain_risk": {
            "orange_mm_h": 10,
            "red_mm_h": 30,
            "orange_24h_mm": 50,
            "red_24h_mm": 100,
            "status": (
                "Seuils provisoires, à valider avec un hydrologue ou la SODEXAM."
            ),
        },
        "scope": (
            "Les alertes ne couvrent que les capteurs suivis ; une absence de "
            "mesure ne prouve pas une absence de risque."
        ),
        "notification": (
            "Aucun canal de notification (SMS, e-mail, astreinte) n'est "
            "implémenté ; les alertes sont consultables dans l'interface."
        ),
        "ai_boundary": (
            "L'IA ne déclenche, ne modifie et ne confirme aucune alerte."
        ),
    },
    "runtime": {
        "availability": (
            "Le monitoring interroge chaque source séparément (capteurs, "
            "alertes, météo, inondations automatiques) et utilise `/health` "
            "comme témoin. Une panne partielle affiche un bandeau dédié, "
            "conserve les dernières valeurs connues et ne désactive aucune "
            "couche ni animation. Le bandeau « Hors ligne » ne s'affiche que "
            "si l'API entière est injoignable ; il conserve lui aussi le cache "
            "local. Les capteurs de démonstration DEMO- sont filtrés des "
            "réponses fraîches et du cache."
        ),
        "statistics": (
            "L'interface distingue les compteurs des zones affichées et ceux "
            "du monde entier. Ces derniers viennent de "
            "`GET /api/v1/weather/global-rain` : 198 points de sondage, "
            "précipitation courante, points en échec comptés comme inconnus, "
            "`rain_points=null` et `available=false` si tout échoue. Aucun "
            "zéro n'est affiché à la place d'une donnée indisponible. Les "
            "zones arrosées sont affinées puis `rain_places` donne le nom de "
            "la rue, du quartier ou de la localité (Photon / OpenStreetMap) ; "
            "un point isolé reste anonyme avec ses coordonnées. Aucun maillage "
            "n'est rendu. Hors "
            "quota Open-Meteo : repli sur un second hôte (quota distinct) ; "
            "si toutes les sources échouent, la dernière mesure valide reste "
            "affichée avec son âge exact, marquée périmée."
        ),
        "global_aircraft": (
            "`GET /api/v1/live/aircraft/global` : une requête OpenSky monde, "
            "600 états au plus répartis par secteurs de 6°, cache 45 s, repli "
            "sur 900 s, `scope=worldwide`. Le client bascule entre flux "
            "régional et flux mondial selon le zoom ou la hauteur de caméra."
        ),
        "world_flows": (
            "`buildWorldFlow()` anime des flux de mobilité entre métropoles "
            "réelles dès que la caméra dépasse 650 km d'altitude, en 3D comme "
            "en 2D. C'est un modèle déterministe accéléré, jamais une "
            "observation ; les navires restent eux aussi visibles en vue "
            "mondiale."
        ),
        "startup": (
            "`start.bat` lance l'API via le Python du `.venv` sur "
            "`0.0.0.0:8000`, attend `/health`, puis démarre le web et "
            "MasterEarth World. `start.bat health` sonde 11 endpoints avec "
            "`curl --noproxy *`. Les fichiers `.env` alignent "
            "`WEATHER_ENABLED=true`, `VITE_API_BASE_URL`, les origines CORS et "
            "`NO_PROXY`/`no_proxy` pour localhost, 127.0.0.1 et ::1."
        ),
        "verification": (
            "Les tests web, le typecheck TypeScript et le build de production "
            "couvrent ces comportements ; les services globaux ont des tests "
            "backend dédiés (`test_global_rain.py`, `test_global_aircraft.py`)."
        ),
    },
    "ai": {
        "role": (
            "Assistant informatif : réponse, synthèse ou rapport, analyse "
            "d'image facultative et détection statistique d'anomalies."
        ),
        "providers": (
            "Cinq fournisseurs configurables (Gemini, Groq, Mistral, xKiro, "
            "OpenRouter), modèles gratuits uniquement, au plus cinq tentatives "
            "par requête, aucun repli payant."
        ),
        "offline": (
            "Sans fournisseur ou hors ligne, un résumé déterministe est produit "
            "et marqué `offline_deterministic` ; il n'est jamais présenté comme "
            "une réponse IA. Le client reconnaît aussi localement quelques "
            "commandes simples (navigation, couches, onglets) sans réseau. "
            "Côté interface, « hors ligne » signifie que toute l'API est "
            "injoignable : une seule source en échec conserve les dernières "
            "valeurs et les couches actives (voir `runtime`)."
        ),
        "context": (
            "Le modèle reçoit les agrégats capteurs/météo/alertes, au plus "
            "quatre extraits documentaires, ce catalogue produit et un contexte "
            "d'écran borné (vue, onglet, capteur sélectionné, centre caméra, "
            "couches, langue, état en ligne). La position de l'utilisateur "
            "n'est jamais transmise."
        ),
        "actions": (
            "La réponse peut contenir jusqu'à 6 actions d'interface : fly_to, "
            "set_view, open_tab, select_sensor, set_layer, set_basemap, "
            "locate_user, open_simulation, zoom, reset_view. Elles déplacent "
            "ou configurent l'interface uniquement : aucun calcul, aucune "
            "alerte, aucune écriture en base."
        ),
        "voice": (
            "Le champ `spoken` (600 caractères au plus) fournit une version "
            "courte destinée à la synthèse vocale du navigateur."
        ),
        "anomalies": (
            "Détection par écart absolu médian (MAD, seuil 3,5) : candidat "
            "statistique, jamais un incident confirmé."
        ),
        "image": (
            "Analyse opt-in d'une photo JPEG/PNG/WebP de 4 Mio au plus, "
            "réencodée sans métadonnées, limitée à 2 048 pixels de côté et "
            "non conservée."
        ),
        "quotas": (
            "8 requêtes IA par 5 minutes et par identité ou adresse IP ; "
            "question limitée à 2 000 caractères."
        ),
    },
    "accounts": {
        "public": (
            "Carte, capteurs, alertes, météo, observations vérifiées, "
            "assistant IA et signalement anonyme sont accessibles sans compte."
        ),
        "registration": (
            "Inscription publique limitée au rôle citoyen : nom, e-mail "
            "et mot de passe d'au moins 10 caractères (hachage scrypt). "
            "L'e-mail n'est pas vérifié automatiquement."
        ),
        "roles": {
            "citoyen": "lecture, assistant IA, observations, simulation",
            "agent_terrain": "gestion terrain, modération des observations",
            "analyste": "analyse et gestion élargie",
            "responsable": "pilotage opérationnel",
            "admin": "administration complète, fournisseurs IA et comptes",
        },
        "aliases": "Les anciens rôles viewer et operator restent acceptés.",
        "simulation_access": "Compte citoyen requis pour lancer un calcul.",
        "audit": (
            "Les créations et actions IA sont journalisées (identité, type "
            "d'action, fournisseur et modèle) ; les questions ne le sont pas."
        ),
    },
    "privacy": {
        "principle": (
            "Minimisation des données : seules des données nécessaires à la "
            "réponse sont transmises, et seulement après consentement explicite."
        ),
        "consent": (
            "Consentement obligatoire à chaque requête, réinitialisé après "
            "chaque tentative ; les destinataires sont affichés avant l'envoi."
        ),
        "transmitted": [
            "la question saisie",
            (
                "des agrégats de capteurs, d'alertes et de météo, sans noms, "
                "codes, coordonnées ni identifiants"
            ),
            "au plus quatre extraits des documents de conception",
            "le catalogue produit et le contexte d'écran borné",
        ],
        "client_context": (
            "Vue, onglet, code du capteur sélectionné, centre de caméra, vingt "
            "couches booléennes au plus, langue et état en ligne. Les chaînes "
            "sont tronquées à 64 caractères et les nombres non finis sont "
            "rejetés. La position de l'utilisateur est acceptée par le schéma "
            "mais retirée avant l'envoi au fournisseur."
        ),
        "location": (
            "La position reste stockée dans le navigateur (consentement local, "
            "révocable) et n'est jamais transmise : ni au serveur MasterEarth, "
            "ni à un fournisseur IA. La question « où suis-je ? » est résolue "
            "localement avec cette position."
        ),
        "excluded": (
            "Nom, e-mail, téléphone, texte d'observation et identifiants "
            "d'alerte sont exclus ; e-mails et numéros de téléphone sont "
            "rejetés par validation préalable."
        ),
        "retention": (
            "Questions et réponses ne sont ni stockées ni auditées ; une image "
            "analysée n'est pas conservée."
        ),
        "keys": (
            "Les clés fournisseurs sont chiffrées côté serveur (Fernet) et ne "
            "sont jamais renvoyées au navigateur."
        ),
    },
    "limits": [
        "Aucune prévision de crue validée : la simulation n'est pas hydrodynamique.",
        "Seuils d'alerte et de pluie provisoires, à valider (hydrologue, SODEXAM).",
        "Le radar est une image de précipitations, pas un débit ni une prévision.",
        "Météo mondiale : estimation Open-Meteo d'environ 250 km, pas une mesure.",
        "Scan de pluie mondial : 198 points de sondage, ordre de grandeur planétaire ; les zones arrosées sont affinées puis nommées (rue/quartier/localité). Les points en échec restent inconnus et aucune statistique n'est affichée si tout échoue.",
        "Flux aérien mondial : échantillon réparti de 600 appareils au plus, pas le trafic complet.",
        "Flux de mobilité en vue mondiale : modèle accéléré entre métropoles, jamais une observation.",
        "Capteurs seulement là où ils sont déployés; ailleurs, pas de mesure.",
        "Aucun canal de notification ni file de validation formelle des sorties IA.",
        "Pas de synchronisation hors ligne en écriture; lectures seules en cache.",
        "Conservation des données et permissions métier fines à définir (À DÉFINIR).",
        "Licences à vérifier (Open-Meteo et RainViewer non commerciaux, Esri, MNT).",
    ],
}


#: Formes très courtes des sources, pour rester sous la limite du prompt.
_SOURCE_SUMMARY = {
    "iot_water_level": "capteurs ultrasons, mesure terrain",
    "iot_rain_gauge": "pluviomètres, cumul horaire",
    "open_meteo": "CC BY 4.0; estimations, repli d'hôte, lieux OSM nommés",
    "openweather": "conditions du compte; facultatif",
    "bulletins": "saisie opérateur, source conservée",
    "field_observations": "signalements humains modérés",
    "openstreetmap": "ODbL; fond 2D/3D",
    "esri": "conditions Esri; imagerie et noms",
    "nasa_gibs": "domaine public; image du jour et nuit",
    "natural_earth": "domaine public; frontières",
    "geonames": "CC BY 4.0; villes du monde",
    "rainviewer": "attribution; gratuit non commercial",
    "opensky": "CC BY-NC 4.0; avions monde, quota",
    "cesium_ion": "compte Cesium ion; relief facultatif",
    "terrarium_dem": "altitudes; conditions à vérifier",
    "hazards": "USGS/GDACS/EONET/NOAA; aléas réels dédupliqués",
}


def catalog_summary() -> dict:
    """Version compacte du catalogue, injectée dans les prompts.

    Le JSON produit reste sous 3 500 caractères.
    """
    product = PLATFORM_CATALOG["product"]
    alerts = PLATFORM_CATALOG["alerts"]
    return {
        "produit": (
            f"{product['name']} — veille mondiale des aléas et de l'hydrométéo : "
            "événements réels, capteurs, météo, radar, alertes calculées, "
            "simulations indicatives. L'IA est informative, jamais une autorité."
        ),
        "pages": {
            page["id"]: page["label"] for page in PLATFORM_CATALOG["pages"]
        },
        "cartes": {
            "2d": (
                "Leaflet; fonds osm/esri/nasa; aléas, capteurs, météo, alertes, "
                "radar, nuit, frontières, noms, circulation, avions, simulation"
            ),
            "3d": (
                "CesiumJS; imagerie; aléas et effets 3D; radar/nuit; frontières; "
                "noms; pluie 3D; circulation; avions; simulation; position"
            ),
        },
        "world": (
            "MasterEarth World : Cesium, vols, navires, satellites; même assistant."
        ),
        "couches": {
            layer["id"]: (
                f"{layer['label']} ({layer['scope']})"
            )
            for layer in PLATFORM_CATALOG["layers"]
        },
        "sources": _SOURCE_SUMMARY,
        "simulation": (
            "MNT indicatif, pas hydrodynamique; modes level/rain/sensor; "
            "rayon ≤5000 m; erreur verticale ±1,5 m provisoire; citoyen requis; "
            "jamais une prévision."
        ),
        "alertes": {
            "niveaux": ["green", "orange", "red"],
            "seuils": {
                "orange_cm": alerts["thresholds"]["orange_cm"],
                "red_cm": alerts["thresholds"]["red_cm"],
                "orange_rise_cm_min": alerts["thresholds"]["orange_rise_cm_min"],
                "red_rise_cm_min": alerts["thresholds"]["red_rise_cm_min"],
                "persistance_cycles": alerts["thresholds"]["persistence_cycles"],
                "statut": "provisoires, à valider",
            },
            "pluie": {
                "orange_mm_h": alerts["rain_risk"]["orange_mm_h"],
                "red_mm_h": alerts["rain_risk"]["red_mm_h"],
                "orange_24h_mm": alerts["rain_risk"]["orange_24h_mm"],
                "red_24h_mm": alerts["rain_risk"]["red_24h_mm"],
                "statut": "provisoires",
            },
            "ia": "ne déclenche ni ne confirme aucune alerte",
        },
        "ia": (
            "Réponse, rapport, vision opt-in non conservée, anomalies MAD; "
            "6 actions max; spoken ≤600 caractères; 8 requêtes/5 min; "
            "hors ligne = résumé déterministe."
        ),
        "comptes": (
            "Sans compte: carte, capteurs, alertes, météo, observations, "
            "assistant. Simulation: citoyen. Gestion: agent_terrain/admin."
        ),
        "confidentialite": (
            "Consentement par requête; agrégats sans noms ni coordonnées, ≤4 "
            "extraits, catalogue et contexte borné; position jamais transmise "
            "(navigateur seulement); question non stockée; clés chiffrées "
            "côté serveur."
        ),
        "limites": [
            "aucune prévision de crue validée",
            "seuils d'alerte et de pluie provisoires",
            "radar = image de pluie, pas un débit",
            "météo = estimation de modèle",
            "avions OpenSky: flux monde échantillonné; pas de véhicules "
            "en direct",
            "capteurs seulement là où ils sont déployés",
            "ni notification ni synchronisation hors ligne en écriture",
            "conservation des données et permissions à définir",
        ],
    }


def catalog_text() -> str:
    """Rendu court en Markdown, utilisé par le mode hors ligne déterministe."""
    product = PLATFORM_CATALOG["product"]
    pages = " · ".join(page["label"] for page in PLATFORM_CATALOG["pages"])
    layers = ", ".join(
        f"{layer['id']} ({layer['scope']})"
        for layer in PLATFORM_CATALOG["layers"]
    )
    return (
        f"**{product['name']}** — {product['role']}\n\n"
        f"**Portée** : {product['scope']}\n\n"
        f"**Pages** : {pages}.\n\n"
        "**Cartes** : carte 2D Leaflet (OSM, Esri, NASA) et globe 3D Cesium "
        "(imagerie, relief facultatif, radar mondial, jour/nuit, frontières, "
        "noms de villes, avions OpenSky, pluie 3D, simulation, localisation).\n\n"
        f"**Couches** : {layers}.\n\n"
        "**Déterminisme** : seuils, alertes et simulations sont calculés; "
        "l'assistant IA ne confirme aucune crue et ne déclenche aucune alerte.\n\n"
        "**Limites** : simulation indicative non hydrodynamique, seuils "
        "provisoires, radar non hydrologique, météo mondiale estimée."
    )


# --- Détail ciblé -----------------------------------------------------------
#
# `catalog_summary()` est volontairement plafonné (3 500 caractères JSON) car il
# part à chaque question. Ce plafond empêchait d'ajouter des connaissances : le
# prompt ne pouvait plus grandir. `catalog_detail()` apporte la réponse : au lieu
# d'allonger la version compacte, on joint les sections complètes du catalogue
# qui correspondent réellement à la question posée, dans un budget séparé.
#
# Le résultat reste du contenu de confiance (couche domaine), jamais une
# instruction : l'assistant doit s'y appuyer sans le transformer en consigne.

#: Budget JSON de la section détaillée ajoutée au prompt.
DETAIL_BUDGET_CHARS = 4_000

#: (sujet, mots-clés, clés du catalogue) — l'ordre fixe la priorité.
_DETAIL_TOPICS: tuple[tuple[str, tuple[str, ...], tuple[str, ...]], ...] = (
    # L'exécution passe en premier : les questions de disponibilité ou de
    # statistiques contiennent souvent « pluie », qui déclenche aussi « couches ».
    # Sans cette priorité, les sections génériques épuisent le budget avant elle.
    (
        "execution",
        (
            "hors ligne", "offline", "indisponible", "statistique",
            "compteur", "zero", "198", "demarrage", "health", "panne",
            "monitoring", "pluie mondiale", "points en pluie",
            "maillage", "grille", "rue", "quartier", "nom du lieu",
        ),
        ("runtime",),
    ),
    (
        "couches",
        (
            "couche", "circulation", "voiture", "vehicule", "moto", "camion",
            "navire", "bateau", "radar", "pluie", "inondation", "nuit",
            "avion", "capteur", "frontiere", "maillage", "icone", "legende",
            "globe", "carte",
        ),
        ("layers", "maps"),
    ),
    (
        "sources",
        (
            "source", "openmeteo", "openstreetmap", "photon", "opensky",
            "geonames", "nasa", "rainviewer", "licence", "attribution",
        ),
        ("data_sources",),
    ),
    (
        "simulation",
        ("simulation", "mnt", "montee", "ruissellement", "profondeur", "rayon"),
        ("simulation",),
    ),
    (
        "alertes",
        ("alerte", "seuil", "vigilance", "orange", "rouge", "vert"),
        ("alerts",),
    ),
    (
        "assistant",
        ("assistant", "ia", "prompt", "action", "modele"),
        ("ai",),
    ),
    (
        "comptes",
        ("compte", "role", "connexion", "inscription", "administrateur"),
        ("accounts",),
    ),
    (
        "confidentialite",
        ("position", "geolocalisation", "rgpd", "privee"),
        ("privacy",),
    ),
    (
        "limites",
        ("limite", "incertitude", "erreur", "precision", "fiable"),
        ("limits",),
    ),
)


def _normalize_text(value: str) -> str:
    """Minuscules sans diacritiques, pour comparer des mots-clés."""
    decomposed = unicodedata.normalize("NFKD", value or "")
    stripped = "".join(
        char for char in decomposed if not unicodedata.combining(char)
    )
    return " ".join(stripped.casefold().split())


def _matches(keywords: tuple[str, ...], words: list[str], text: str) -> bool:
    """Vrai si un mot-clé apparaît comme mot (ou début de mot) dans la question."""
    for keyword in keywords:
        if " " in keyword:
            if keyword in text:
                return True
            continue
        if any(word == keyword or word.startswith(keyword) for word in words):
            return True
    return False


def _cap_lists(payload, limit: int):
    """Réduit chaque liste à ``limit`` éléments, récursivement."""
    if isinstance(payload, list):
        return [_cap_lists(item, limit) for item in payload[:limit]]
    if isinstance(payload, dict):
        return {key: _cap_lists(value, limit) for key, value in payload.items()}
    return payload


def _fit(payload, limit: int):
    """Ajuste une section au budget, en réduisant les listes si nécessaire.

    Retourne ``None`` quand même la version la plus courte ne tient pas : mieux
    vaut ne rien joindre qu'un contenu tronqué au milieu d'une phrase.
    """
    if len(json.dumps(payload, ensure_ascii=False)) <= limit:
        return payload
    size = 8
    while size >= 1:
        candidate = _cap_lists(payload, size)
        if len(json.dumps(candidate, ensure_ascii=False)) <= limit:
            return candidate
        size //= 2
    return None


def catalog_detail(
    question: str, budget: int = DETAIL_BUDGET_CHARS
) -> dict:
    """Sections complètes du catalogue pertinentes pour la question.

    Retourne un dictionnaire vide si la question ne porte pas sur le produit :
    dans ce cas le prompt reste identique à ce qu'il était. Le budget est
    appliqué sur la taille JSON réelle, pour ne jamais dépasser le plafond fixé.
    """
    text = _normalize_text(question)
    if not text:
        return {}
    words = text.split()
    detail: dict = {}
    for _topic, keywords, keys in _DETAIL_TOPICS:
        if not _matches(keywords, words, text):
            continue
        for key in keys:
            if key in detail:
                continue
            payload = PLATFORM_CATALOG.get(key)
            if payload is None:
                continue
            remaining = budget - len(json.dumps(detail, ensure_ascii=False))
            fitted = _fit(payload, remaining)
            if fitted is None:
                continue
            detail[key] = fitted
    return detail
