# Portée mondiale, temps réel et localisation

Ce document décrit la portée mondiale de la plateforme web (`apps/web`), le
globe 3D temps réel, la localisation de l'utilisateur et l'intégration de
l'assistant IA à l'interface. Il complète [`INTELLIFLOOD_WORLD_AUDIT.md`](INTELLIFLOOD_WORLD_AUDIT.md)
(choix CesiumJS) et [`AI_ENGINE.md`](AI_ENGINE.md) (fournisseurs et
consentement).

## 1. La plateforme n'est plus limitée à un pays

| Élément | Avant | Maintenant |
|---|---|---|
| Vue initiale du globe | Côte d'Ivoire, altitude 1 300 km | Monde entier, altitude ~23 000 km |
| Vue initiale de la carte 2D | Côte d'Ivoire, zoom 7 | Monde, zoom 2 |
| Noms de lieux | Liste locale d'environ 40 villes ivoiriennes | 34 194 lieux du monde (GeoNames), niveau de détail selon l'altitude |
| Frontières | Fond raster Esri avec libellés incrustés | 177 frontières de pays + 4 563 régions (Natural Earth) en vectoriel |
| Précipitations | Points météo du réseau ivoirien | Radar mondial + échantillonnage météo de l'emprise visible |
| Statistiques de pluie | Compteurs des seules zones affichées | Scan mondial de 198 points, affinage local et lieux nommés, distinct des compteurs « zones affichées » |
| Trafic aérien | Emprise locale uniquement | Proxy régional + flux mondial réparti sur tous les continents |
| Animation en vue mondiale | Couches mises en pause | Avions mondiaux, navires et flux de mobilité animés en continu |
| Recherche de lieu | Côte d'Ivoire | Monde (GeoNames embarqué, sans compte) |
| Assistant | Données ivoiriennes | Connaissance produit + contexte d'écran + actions |

Les **capteurs physiques** restent ceux du réseau déployé (pour l'instant en
Côte d'Ivoire) : ailleurs, la plateforme affiche la météo, le radar et les
observations, et l'interface l'indique explicitement plutôt que d'inventer des
mesures.

## 2. Globe 3D (`apps/web/src/globe/`)

### Netteté et délimitations

- **Rendu à la résolution physique de l'écran** (`viewer.resolutionScale` borné à
  2) : sans cela, Cesium rend en pixels CSS et le globe paraît flou sur les
  écrans HiDPI.
- **Anticrénelage** : `msaaSamples: 4` et FXAA ; cache de tuiles augmenté (512),
  préchargement des tuiles voisines (`preloadSiblings`) et
  `maximumScreenSpaceError` **abaissé dynamiquement** (1,25 en vue mondiale,
  1,0 en vue régionale, 0,8 sous 250 km) : Cesium charge alors des tuiles plus
  fines exactement là où l'on regarde.
- **Brume désactivée** (`scene.fog.enabled = false`) : elle voilait les tuiles en
  vue rapprochée.
- **Frontières vectorielles** (`globe/borders.ts`), dessinées en polylignes
  plaquées au sol : elles restent nettes à tout zoom, contrairement aux noms
  incrustés dans les tuiles raster. Les pays apparaissent de loin, les régions
  (premier niveau administratif) en vue rapprochée, filtrées sur l'emprise
  visible et plafonnées pour la fluidité.
- **Zones de pluie** : le dégradé écran flou est remplacé par une ellipse de
  remplissage, un **anneau vectoriel** de rayon exact (`circlePositions`, 160
  segments) et un halo extérieur translucide qui donne du relief au tracé sans
  le rendre flou.
- **Inondation simulée** : la texture MNT est suréchantillonnée (facteur 4) et un
  **contour net** est tracé sur la limite de l'eau (`drawFloodOutline`), au lieu
  d'un dégradé agrandi.

### Noms de villes, zones et quartiers — monde entier

- `scripts/build_geo_data.py` construit `apps/web/public/geo/*` à partir de
  sources libres : **GeoNames** (villes, capitales, population, CC BY 4.0),
  **Natural Earth** (pays et régions, domaine public). Voir
  [`apps/web/public/geo/README.md`](../apps/web/public/geo/README.md).
- `globe/places.ts` charge les lieux une seule fois, sélectionne un sous-ensemble
  selon la hauteur de caméra (seuil de population + budget), puis applique un
  **anti-chevauchement écran** : chaque libellé est projeté et rejeté s'il
  recouvre un libellé déjà placé. Le résultat reste lisible et net à tous les
  niveaux.
- Les **quartiers** ne peuvent pas être embarqués pour le monde entier
  (millions de lieux) : à très forte proximité, les noms de quartiers restent
  fournis par le fond de carte (OpenStreetMap/Esri). Le placement vectoriel
  couvre les pays, les régions et 34 194 villes.
- **Recherche de lieux via l'API** (`GET /api/v1/geocoding/search`,
  `/geocoding/reverse`) : `app/services/geocoding.py` interroge **Photon**
  (OpenStreetMap, libre et auto-hébergeable), met en cache 10 minutes et limite
  le débit à 30 requêtes/minute par hôte. Si Photon est injoignable, la réponse
  se rabat sur une liste locale du réseau déployé et le signale par
  `degraded=true` : l'endpoint ne renvoie jamais 500 et ne prétend jamais
  couvrir le monde quand ce n'est pas le cas.

### Temps réel et animation

- **Radar de précipitations mondial** : images RainViewer (deux dernières heures
  + courte prévision) servies par l'API MasterEarth
  (`/api/v1/weather/radar/frames` et `/api/v1/weather/radar/tiles/...`) car les
  tuiles ne sont pas accessibles directement depuis le navigateur (CORS). Le
  globe charge toutes les images puis les affiche en séquence (~0,6 s par
  image). Attribution obligatoire « Weather data by RainViewer » avec lien.
- **Jour / nuit net et contrasté** : Cesium reçoit l'éclairage solaire réel
  (`globe.enableLighting`), avec un terminateur visible en vue mondiale. Pour
  conserver la netteté des infrastructures et du paysage en approche, cet
  éclairage s'efface progressivement entre 7 000 km et 9 500 km d'altitude : en
  vue rapprochée, l'imagerie, le relief, les routes et les libellés restent
  lisibles quelle que soit l'heure locale. Les lumières nocturnes NASA
  (`VIIRS CityLights`) ne s'affichent que côté nuit (`nightAlpha = 0,92`,
  `dayAlpha = 0`) ; leur fond noir est rendu transparent (`colorToAlpha`). Le
  voile nocturne 2D reste calculé par `services/nightOverlay.ts` ; le voile
  écran expérimental du globe a été supprimé.
- **Surveillance des aléas** : la couche `aleas-mondiaux` place chaque
  événement réel à sa position publiée. Les pictogrammes SVG distinguent les
  13 familles et le globe ajoute un effet 3D propre à chacune (anneaux
  sismiques, panache volcanique, spirale cyclonique, mur de houle, couloir de
  tornade, etc.). Un clic vole vers le lieu, ouvre la fiche de provenance et
  propose une simulation indicative.
- **Radar lisible à tous les zooms** : son opacité est recalculée à chaque
  mouvement de caméra, avec une courbe convexe. Forte à l'échelle mondiale
  (0,82), elle devient **nulle sous 25 km d'altitude** : les tuiles radar, de
  résolution limitée, agrandies au niveau des rues, formaient un voile flou qui
  masquait les infrastructures. La carte 2D applique exactement la même
  fonction (`radarOpacityForHeight`).
- **Pluie 3D** : cumulonimbus et rideau de pluie animés (shader) ancrés sur la
  zone pluvieuse.
- **Capteurs et alertes** : points et halos, labels affichés selon la distance.

Aucune observation n'est inventée pour « animer » la carte : les images radar,
la position du soleil, les observations aériennes et les données météo/capteurs
évoluent réellement. Deux flux sont en revanche **modélisés** et signalés comme
tels : la circulation sur rues réelles (vue locale) et les flux de mobilité
entre métropoles (vue mondiale). Le globe n'est donc jamais figé à aucune
échelle, sans jamais présenter un modèle comme une mesure.

### Surveillance mondiale des aléas

- **Sources réelles uniquement** : `app/services/hazards.py` agrège l'USGS
  Earthquake Hazards, GDACS, NASA EONET, USGS Volcano Hazards, les flux tsunami
  NOAA (PTWC/NTWC) et le National Hurricane Center. Chaque événement conserve
  sa source, son identifiant d'origine, sa position publiée, son horodatage et
  son lien. Aucune zone, aucun nom de lieu et aucune statistique ne sont
  inventés.
- **Déduplication et provenance** : une fiche par événement, priorité aux
  sources spécialisées, fenêtre de rapprochement propre à chaque aléa. La
  réponse expose `sources` (état, nombre, attribution, licence), `degraded`,
  `stale` et `failures`. Un cache serveur d'environ 90 secondes limite les
  appels ; une source indisponible est signalée et un cache antérieur peut être
  servi avec `stale=true`.
- **13 familles** : séisme, tsunami, volcan, cyclone, inondation, feu de
  forêt, sécheresse, glissement de terrain, tempête de sable, blizzard,
  canicule, tornade et orage violent. La sévérité absente reste `unknown` :
  elle n'est jamais déduite d'une magnitude ou d'un titre.
- **Carte et globe** : `SensorMap.tsx` affiche les marqueurs Leaflet, les
  regroupe et résout un nom de lieu réel (GeoNames) lorsqu'il manque ; le globe
  Cesium ajoute les effets 3D (`hazardFx.ts`). Un clic sélectionne l'événement,
  vole vers lui, ouvre la fiche et permet de lancer une simulation.
- **Simulation indicative** : `POST /api/v1/simulations/hazard` (compte
  `viewer` requis) valide les entrées puis délègue à
  `app/domain/hazard_model.py`. Le résultat est explicitement un « et si ? »
  déterministe, jamais une prévision officielle. L'API existante
  `/api/v1/simulations/flood` reste disponible pour l'inondation.
- **Limites honnêtes** : GDACS peut renvoyer une page anti-robot (source
  `unavailable`), les flux NOAA peuvent être vides, et les noms de lieux
  manquants sont résolus approximativement puis signalés. Les catégories EONET
  sans équivalent dans les 13 familles (icebergs, etc.) et les feux prescrits
  sont écartés plutôt que classés dans un mauvais aléa. Une absence
  d'événement dans un flux ne prouve jamais une absence de risque.

### Circulation animée en temps réel (véhicules et navires)

- **Tracé réel** : `GET /api/v1/live/roads?west=&south=&east=&north=` relaie le
  réseau routier OpenStreetMap (Overpass) pour l'emprise visible. Le serveur
  valide l'emprise (≤ 2 500 km²), normalise la géométrie (classe de voie, sens,
  vitesse déclarée, décimation à 48 points), met en cache 30 minutes, réutilise
  un voisin déjà chargé (recouvrement ≥ 55 %), essaie plusieurs miroirs Overpass
  et limite à 30 requêtes par minute et par hôte. Le navigateur ne contacte
  jamais Overpass.
- **Chargement non bloquant** : Overpass répond souvent en 20 à 40 secondes ; la
  première demande renvoie donc **202** (`status = "loading"`) et démarre un fil
  de chargement. Le client réessaie toutes les 4 secondes et affiche la
  progression dans le panneau du globe.
- **Mouvement continu** : `globe/traffic.ts` calcule la position de chaque
  véhicule comme une **fonction de l'heure courante** le long du tracé
  (abscisse curviligne, vitesse par classe de voie, espacement, sens de
  circulation, variante déterministe par véhicule). Rien à télécharger pour
  avancer : le flux ne gèle jamais, même réseau coupé, et deux onglets ouverts
  à la même heure montrent les mêmes positions.
- **Véhicules** : voitures, taxis, motos, camions et bus, rendus en
  `BillboardCollection` (bien plus rapide que des entités) et mis à jour à
  ~12 images par seconde. Budget adaptatif (850 sous 80 km, 460 sous 250 km,
  180 au-delà) ; la couche s'éteint au-dessus de 650 km d'altitude.
- **Navires** : liaisons entre 63 ports réels, chaque port relié à son voisin le
  plus proche, vitesse de croisière 12 nœuds, aller-retour continu. Ils ne
  disparaissent plus en vue mondiale : `seaTrafficVisibility` conserve une
  opacité d'au moins 0,62 au-delà de 4 000 km d'altitude.
- **Vue mondiale animée** (`buildWorldFlow`) : `GLOBAL_HUBS` liste des
  métropoles réelles, `globalCorridors()` les relie sans franchissement de
  l'antiméridien, et `buildWorldFlow()` produit des points déterministes
  accélérés le long de ces corridors. `worldFlowVisibility()` active la couche
  au-dessus de 650 km d'altitude (pleine à 2 500 km). En 3D, un
  `BillboardCollection` dédié est synchronisé toutes les 60 ms ; en 2D, des
  `circleMarker` animés prennent le relais. Ces flux sont un **modèle de
  mobilité**, pas des véhicules observés : l'attribution ODbL et le panneau du
  globe le précisent.
- **Avions en vue mondiale** : le globe n'attend plus le zoom régional pour
  montrer des appareils réels (section 3).
- **Honnêteté** : le tracé des rues et les ports sont réels, les
  **déplacements sont des modèles**. Aucun flux mondial de véhicules routiers en
  direct n'est disponible sans clé : ni la circulation locale ni les flux
  planétaires ne sont présentés comme des observations de trafic.
- **Carte 2D** : mêmes véhicules et navires, en `circleMarker` sur le moteur
  canvas de Leaflet, rafraîchis deux fois par seconde à partir du zoom 11 ; en
  vue mondiale, les flux entre métropoles et les avions du flux mondial prennent
  le relais.

### Fond de carte et couches

- Fonds : satellite Esri (défaut), plan OSM, satellite NASA GIBS ; bascule
  automatique vers OSM si les tuiles satellite échouent en masse.
- Couches activables : radar, pluie, inondation simulée, jour/nuit, noms,
  frontières, circulation, avions, capteurs, météo, alertes. Les interrupteurs
  sont contrôlés par `App` : l'assistant peut les actionner, l'utilisateur les
  voit et peut les rétablir.

## 3. Carte 2D et trafic aérien

### Carte 2D (`apps/web/src/dashboard/SensorMap.tsx`)

La carte Leaflet reprend les mêmes sources mondiales que le globe :

- fonds plan OSM, satellite Esri ou NASA GIBS ;
- **noms de lieux GeoNames** et **frontières Natural Earth** en vectoriel ;
- **radar RainViewer animé**, avec attribution et état de chargement ;
- **voile jour/nuit** calculé à partir de la position du soleil ;
- **trafic aérien** observé, local ou mondial selon le zoom ;
- **flux de mobilité** animés en vue planétaire ;
- marqueur de position utilisateur et bouton de recentrage.

Les noms et frontières sont redessinés après chaque zoom (`zoomend`) comme après
chaque déplacement, afin que la couverture reste correcte même quand Leaflet ne
déclenche pas `moveend`.

### Trafic aérien observé (OpenSky Network)

`GET /api/v1/live/aircraft?west=&south=&east=&north=` relaie les observations
ADS-B d'OpenSky. Le serveur valide l'emprise (surface ≤ 30 000 000 km², largeur
≤ 120°, `west < east`), plafonne la réponse à 400 appareils, met en cache 45 s,
conserve un repli de 900 s si le fournisseur échoue et limite à 60 requêtes par
minute et par hôte. Le client attend un déplacement stable (anti-rebond 700 ms),
rafraîchit toutes les 45 s et interpole les positions entre deux observations.

**Flux mondial.** En vue planétaire, la couche ne doit pas se vider :
`GET /api/v1/live/aircraft/global` effectue **une seule** requête OpenSky sans
bbox, répartit les états dans des cellules de 6° et en sélectionne au plus 600
par round-robin (`distribute_states`), ce qui évite la concentration sur
l'Europe et l'Amérique du Nord. Réponse mise en cache 45 s, repli de 900 s,
`scope: "worldwide"` et bbox -180…180 / -85…85 explicites. Le client choisit sa
source selon l'échelle : `useLiveAircraft` sous 4 000 km d'altitude (2D : zoom ≥
5), `useGlobalAircraft` au-delà. Les deux conservent les dernières positions
connues en cas de panne. Un relevé réel a renvoyé 600 appareils de -44,8° à
69,2° de latitude et de -171,8° à 177,9° de longitude.

Pour protéger le quota :

- une seule requête mondiale est partagée par tous les clients via le cache
  serveur ;
- la requête régionale reste bornée (≤ 30 000 000 km², ≤ 120° de largeur) ;
- le globe dessine au plus 420 appareils à la fois (les observations restent
  comptées dans le panneau) ;
- chaque endpoint applique sa propre limite de 60 requêtes par minute et par
  hôte.

Les positions sont **interpolées entre observations** et ne constituent pas une
prévision de trajectoire. Le trafic routier n'est pas fourni en direct : aucune
source mondiale libre et sans clé ne le permet. Les couches de véhicules de
`apps/world` restent des simulations ou des sources tierces clairement
identifiées, jamais présentées comme des observations en direct.

## 4. Localisation de l'utilisateur (2D et 3D)

- **À l'entrée**, une boîte de dialogue explicite (`LocationPrompt`) propose
  d'afficher la position. Le navigateur ne demande l'autorisation qu'après ce
  choix ; « Plus tard » n'active rien, « Ne plus me demander » mémorise le refus.
- Le choix est stocké sous `intelliflood.geolocation.v1` (`localStorage`). Si
  l'autorisation navigateur est déjà accordée, le suivi démarre sans nouvelle
  question. Le bouton **« Ma position »** de la barre d'outils recentre la carte
  active ; si l'utilisateur avait refusé, il redemande l'autorisation
  (« Réactiver »).
- **Carte 2D** : marqueur pulsé + cercle de précision (Leaflet).
- **Globe 3D** : point, étiquette « Ma position » et ellipse de précision ; le
  premier repérage rapproche la caméra.
- **MasterEarth World (`apps/world`)** : le module d'extension affiche sa propre
  demande de consentement à l'entrée, mémorisée sous
  `intelliflood.world.location.v1`. En cas d'accord, il ajoute un point, une
  étiquette et une ellipse de précision au viewer Cesium, puis propose
  **« Recentrer »** (12 km, inclinaison -42°). En cas de refus, aucun marqueur
  n'est créé et le bouton reste inactif jusqu'à une nouvelle autorisation.
- **Vie privée** : la position reste dans le navigateur. Elle n'est ni stockée
  côté serveur, ni incluse dans le contexte de l'assistant, ni transmise à un
  fournisseur IA (`user_location` est toujours `null` dans les requêtes).

## 5. Météo et statistiques mondiales

`GET /api/v1/weather/viewport?west=&south=&east=&north=` interroge
Open-Meteo sur des points espacés d'environ 250 km (≤ 60 points, une requête,
cache 10 min) pour l'emprise visible. La vue mondiale entière est acceptée : le
pas s'élargit automatiquement (environ 4 000 km à l'échelle du globe) pour
rester sous 60 points. Le front fusionne ces points avec la base historisée
(`services/weatherMerge.ts`, dédoublonnage ~5 km) et les affiche dans le globe,
la carte 2D et l'onglet Météo. Détails et limites : [`WEATHER.md`](WEATHER.md).

### 5.1 Aucun maillage visible, seulement des points nommés

- **Maillage supprimé** : `weatherMesh.ts` n'existe plus ; plus aucune ligne de
  grille n'est tracée en 2D (`SensorMap.tsx`) ni en 3D (`GlobeView.tsx`), et
  l'assistant répond désormais qu'il n'y a aucun maillage. Côté serveur, le
  module `weather_grid.py` est devenu `weather_sampling.py` : il ne produit que
  des points de sondage isolés, sans cellule ni trame de fond. La météo est
  rendue par des points, des icônes de risque et le radar de précipitations réel.
- **Pictogrammes** : `apps/web/src/globe/hazardIcons.ts` fournit trois symboles
  vectoriels — pluie (bleu), inondation (rouge), pluie + inondation (rose) —
  utilisés en 3D comme en 2D. Ils n'apparaissent que lorsqu'une précipitation ou
  une inondation est effectivement constatée, et sont donc valables pour
  n'importe quelle région du globe.

### 5.2 Statistiques de pluie réellement mondiales

Les compteurs de l'interface ne mélangent plus deux échelles : les cartes
« zones affichées » décrivent les capteurs et points météo de l'emprise visible,
les cartes « monde entier » viennent de
`GET /api/v1/weather/global-rain` (`app/services/global_rain.py`).

- **Balayage de 198 points de sondage** : 11 latitudes de -75° à +75° par pas
  de 15°, 18 longitudes de -180° à +160° par pas de 20°, interrogés par lots
  Open-Meteo avec la précipitation **courante**, jamais la prévision.
- **Affinage local et lieux nommés** : jusqu'à 8 zones arrosées et espacées sont
  réinterrogées sur 9 points rapprochés (≈ 13 km) chacune, soit 72 sondages en
  **une seule requête groupée** ; les 8 lieux sont ensuite géocodés en parallèle
  (4 workers au maximum) via Photon / OpenStreetMap pour que la latence du
  géocodeur ne s'additionne pas. `rain_places` expose le
  nom de la rue (avec numéro), du quartier ou de la localité, le détail
  administratif, l'intensité, la distance au lieu OSM et le niveau de
  vigilance (`risk_level`) calculé avec les seuils de la plateforme. Si le lieu
  le plus proche est à plus de 30 km (océan, désert), le point reste anonyme
  avec ses coordonnées : aucun nom n'est inventé. L'interface liste ces lieux
  dans les KPI « monde entier » et dans le panneau d'analyse.
- `rain_points`, `rain_fraction`, `max_precip_mm_h` et `wettest` sont calculés
  sur les seuls points valides. Les points en échec sont comptés dans
  `failed_points` et restent **inconnus**, pas secs.
- **Repli d'hôte Open-Meteo** (`fetch_current_many`) : le quota quotidien de
  `api.open-meteo.com` est compté par hôte et par IP ; un 429 « Daily API
  request limit exceeded » (Retry-After de plusieurs heures) faisait échouer
  les 198 points d'un coup. La requête ne demande plus que
  `current=precipitation` (plus de série horaire ni de jours passés/à venir,
  donc beaucoup moins de quota), chaque lot essaie l'hôte principal puis
  `historical-forecast-api.open-meteo.com` (quota distinct, même modèle, même
  licence), et un hôte en 429 est **refroidi** jusqu'au `Retry-After` annoncé
  (plafonné à 6 h) pour ne plus perdre de requêtes.
- La charge utile expose la provenance (`source` : hôte principal ou de
  repli), un indicateur `stale` et l'**âge exact** (`age_seconds`) de la
  mesure, calculés côté serveur.
- Si toutes les sources échouent, `available=false` et `rain_points=null`.
  L'interface affiche « — » ou « données indisponibles », **jamais un zéro**,
  avec un bouton « Réessayer ». Le hook `useGlobalRain` ne remplace pas la
  dernière mesure valide par une réponse vide : elle reste affichée, marquée
  périmée (« dernière mesure à 19:42 (il y a 2 h 05 min), actualisation
  indisponible »), et un nouvel essai a lieu toutes les 60 s au lieu de 10 min.
- Cache 10 minutes, repli serveur jusqu'à 6 h sur le dernier scan valide
  (marqué `stale`), 30 requêtes/minute par hôte, rafraîchissement client de
  10 minutes.

Un relevé réel a donné **25 points en pluie sur 198 points valides** : le
« 0 point en pluie » de l'ancien écran était un artefact de l'emprise affichée,
pas un état du monde.

### 5.3 Tolérance aux pannes partielles et configuration d'exécution

- `useMonitoring.ts` n'utilise plus un `Promise.all` global : chaque source
  (capteurs, alertes, météo, inondations) est attendue séparément, `/health`
  sert de témoin de disponibilité et la dernière valeur connue est conservée.
  Une source en échec produit un bandeau « Source partiellement indisponible »,
  pas un « Hors ligne » qui vidait les cartes ; les couches et animations ne
  sont plus désactivées par `offline`. Les données de démonstration `DEMO-` sont
  filtrées aussi bien sur les réponses fraîches que sur le cache.
- Les fichiers `.env` (racine, `apps/web/.env`, `apps/api/.env`) alignent
  `WEATHER_ENABLED=true`, `WEATHER_REFRESH_MINUTES=15`, un
  `VITE_API_BASE_URL=http://127.0.0.1:8000` explicite, des origines CORS pour
  5173 / 4173 / 8080 et `NO_PROXY` / `no_proxy` pour `localhost`, `127.0.0.1`,
  `::1`. Un proxy HTTP local intercepte sinon les appels du navigateur et de
  `curl`, ce qui faisait croire à une panne totale de l'API.
- `start.bat` démarre l'API avec l'interpréteur du `.venv` sur `0.0.0.0:8000`,
  attend `/health`, puis lance le web et `apps/world`. `start.bat health`
  vérifie 11 endpoints (`/health`, capteurs, alertes, météo, statut météo,
  pluie mondiale, avions mondiaux, avions régionaux, météo d'emprise, images
  radar, inondations automatiques) avec `curl --noproxy *`. Les URL contenant
  des paramètres sont entre guillemets : dans un fichier `.bat`, le `^` serait
  littéral à l'intérieur des guillemets et casserait la chaîne de requête.
- **Deux profils de base, volontairement distincts** : le `.env` racine sert au
  profil Docker Compose (port 5432, base `intelliflood`) ; `apps/api/.env` est
  prioritaire pour l'exécution locale (`start.bat`, uvicorn) et pointe sur le
  port 5433, base `intelliflood_workspace`. La configuration réellement chargée
  est `postgresql+psycopg://…@127.0.0.1:5433/intelliflood_workspace`. Il ne
  faut pas aligner ces valeurs sans distinguer les deux profils.

## 6. Assistant intégré

L'assistant n'est plus seulement conversationnel :

- **Connaissance produit** : le serveur injecte un catalogue de la plateforme
  (`app/domain/platform_catalog.py`) — pages, cartes, couches, sources,
  simulation, alertes, comptes, vie privée, exécution, limites — en plus des
  agrégats et des extraits documentaires. La version compacte (≤ 3 500
  caractères) reste permanente ; `catalog_detail()` ajoute les sections
  **complètes** du domaine concerné quand la question le justifie
  (`platform_detail`, budget 4 000 caractères), sans alourdir les questions hors
  sujet.
- **Contexte d'écran** : vue, onglet, capteur sélectionné, couches actives,
  centre de caméra, état réseau. La position de l'utilisateur en est exclue.
- **Actions d'interface** : la réponse peut contenir jusqu'à six actions
  validées (`fly_to`, `set_view`, `open_tab`, `select_sensor`, `set_layer`,
  `set_basemap`, `locate_user`, `open_simulation`, `zoom`, `reset_view`).
  `App.applyAssistantActions` les exécute ; l'IA ne peut ni déclencher une
  alerte, ni modifier un seuil, ni lancer un calcul.
- **Commandes locales** (`services/assistantActions.ts`) : « va à Paris »,
  « affiche le radar », « cache les frontières », « où suis-je », « vue
  mondiale », « ouvre la météo », « zoom avant »… Comprises sans fournisseur IA,
  sans consentement et hors ligne ; elles s'exécutent immédiatement.
- **Réponses locales** (`services/platformKnowledge.ts`) : les questions
  factuelles sur le produit, la circulation, l'absence de maillage, les lieux
  nommés, la recherche de lieux, les sources, les seuils, les statistiques de
  pluie mondiales, la disponibilité partielle et les limites reçoivent une
  réponse déterministe,
  sans réseau ni modèle. La circulation et les flux mondiaux y sont
  explicitement décrits comme modélisés, jamais comme des observations.
- **Voix** : dictée, mode conversationnel, et restitution d'une version courte
  (`spoken`) renvoyée par le serveur.
- **Connaissance tenue à jour** : toute nouvelle fonctionnalité est ajoutée aux
  deux catalogues (serveur et local) pour que l'assistant puisse en parler sans
  inventer : scan de pluie mondial, flux d'avions mondial, flux de mobilité en
  vue planétaire, tolérance aux pannes partielles et `start.bat health` y sont
  décrits.

## 7. Provenance et licences

| Donnée | Source | Licence |
|---|---|---|
| Villes, capitales, population | GeoNames `cities15000` | CC BY 4.0 |
| Frontières pays et régions | Natural Earth | Domaine public |
| Imagerie satellite et lumières nocturnes | NASA GIBS | Domaine public |
| Radar de précipitations | RainViewer | Gratuit avec attribution obligatoire (« Weather data by RainViewer ») ; conditions commerciales à vérifier |
| Réseau routier (circulation) | OpenStreetMap / Overpass | ODbL 1.0 : attribution et partage à l'identique |
| Trafic aérien | OpenSky Network | CC BY-NC 4.0 : attribution obligatoire, usage non commercial, quota du fournisseur |
| Météo et scan de pluie mondial | Open-Meteo / OpenWeather | CC BY 4.0 / conditions du fournisseur |
| Recherche de lieux (API) | Photon / OpenStreetMap | ODbL 1.0 : attribution et partage à l'identique |
| Fonds de carte | Esri, OpenStreetMap | Conditions des fournisseurs |

## 8. Vérifications

- Web : `cd apps/web; npx vitest run` (194 tests), `npx tsc --noEmit`, puis
  `npx vite build` — lieux, frontières, radar, fusion météo, localisation,
  trafic aérien, circulation (mouvement, déterminisme, budget, sens de
  circulation, flux mondiaux), clients et hooks de pluie/avions mondiaux,
  tolérance aux pannes partielles, commandes locales et connaissance produit.
- API : `cd apps/api; python -m pytest -q` — radar proxifié, météo mondiale,
  `/weather/global-rain` (`tests/test_global_rain.py`),
  `/live/aircraft/global` (`tests/test_global_aircraft.py`), proxy routier,
  géocodage mondial, catalogue produit (`tests/test_platform_catalog.py`) et
  assistant (`tests/test_ai_engine.py` et `tests/test_weather.py` exigent une
  base PostgreSQL accessible).
- Exécution : `start.bat health` (11 endpoints) ou, hors Windows, les mêmes
  `curl --noproxy '*' http://127.0.0.1:8000/...`.
- World : `cd apps/world; node --test src/intelliflood/location.test.mjs` —
  consentement, validation et formatage de la localisation. La suite complète
  (`npm test`) exige Node 24.
- Régénération des données géographiques :
  `python scripts/build_geo_data.py --force` puis `--verify`.

## 9. Limites connues

- La couverture radar dépend des réseaux nationaux : certaines régions
  (notamment une partie de l'Afrique) n'ont aucune image exploitable.
- Les lieux affichés sont les villes de plus de 15 000 habitants ; les quartiers
  dépendent du fond de carte. La recherche instantanée de l'interface utilise ce
  jeu embarqué et ne dépend d'aucun service externe ; l'endpoint d'API, lui,
  interroge Photon et se rabat sur une liste locale si le service est
  injoignable.
- Le relief 3D (Cesium ion) reste facultatif ; l'inondation simulée est
  indicative et ne suit pas un modèle hydrodynamique.
- Les seuils d'alerte et de pluie restent provisoires.
- OpenSky ne couvre que les aéronefs équipés et visibles par des récepteurs
  bénévoles ; la couverture est inégale, surtout au-dessus des océans et de
  certaines régions. Le flux mondial est un **échantillon réparti** d'au plus
  600 appareils, pas l'intégralité du trafic ; les positions restent
  interpolées entre deux observations.
- Le scan de pluie mondial repose sur 198 points espacés puis sur un affinage
  local des zones arrosées : il donne un ordre de grandeur planétaire et des
  lieux nommés, pas une cartographie fine, et ne remplace ni un pluviomètre ni
  le radar. Les points en échec sont signalés comme inconnues ;
  si tout échoue, aucune statistique n'est affichée plutôt qu'un zéro trompeur.
- Les flux de mobilité en vue mondiale (`buildWorldFlow`) sont un modèle
  accéléré entre métropoles réelles : ils animent le globe mais ne mesurent
  aucun déplacement réel.
- Aucun flux mondial de véhicules routiers en direct n'est disponible sans clé
  ni conditions restrictives. MasterEarth n'en invente pas : la circulation
  animée suit des rues réelles mais son déplacement est un modèle, jamais une
  observation, et les véhicules tiers de `apps/world` ne le sont pas non plus.
- Le réseau routier dépend d'Overpass, service public parfois saturé : la
  première vue d'une zone peut demander plusieurs dizaines de secondes, puis
  reste en cache. Les quartiers très récents peuvent manquer.
- Les collectes périodiques et les **inondations automatiques** restent
  adossées aux observations stockées du réseau déployé (Côte d'Ivoire). Ailleurs,
  la plateforme affiche la météo et le radar à la demande, ainsi que la
  simulation locale, mais ne fabrique pas d'inondation automatique faute de
  capteurs. Les points météo échantillonnés pour la vue ne sont pas historisés.
- Le globe 3D limite le nombre d'appareils dessinés à 420 ; le panneau indique
  le nombre d'observations reçues.
