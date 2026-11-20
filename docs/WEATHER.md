# Données météo (M3)

MasterEarth n'est pas limité aux capteurs : la pluie est une source de données à part entière.

| Source | Mode | Statut |
|---|---|---|
| **Open-Meteo** | Automatique (toutes les 30 min par défaut, `WEATHER_ENABLED=true`) sur des points de sondage espacés d'environ 50 km, plus les 7 villes configurées et les capteurs actifs | Collecte activée par défaut. Les coordonnées sont regroupées par lots de 100; environ 96 requêtes/jour pour ces sondages seuls au rythme actuel, plus les lots nécessaires aux villes/capteurs. Gratuit sans clé pour un usage **non commercial** (~10 000 requêtes/jour) ; un usage commercial exige une licence ou un serveur auto-hébergé. Données CC BY 4.0 (attribution affichée). La précipitation courante et les heures passées/prévues sont des estimations de modèle, pas des mesures de pluviomètres. |
| **OpenWeather** | Conditions actuelles via `WEATHER_OPENWEATHER_API_KEY` (clé exclusivement côté serveur) | Connecteur disponible et facultatif; aucune clé n'est incluse. Conditions d'accès, quota et couverture du compte doivent être vérifiés avant activation. |
| **SODEXAM / ONPC / autres bulletins** | Saisie via `POST /api/v1/weather/observations` par un opérateur | Conservé. La source et l'heure valide restent associées au bulletin; aucune API publique n'est présumée. |
| **Pluviomètres IoT** | `POST /api/v1/sensors/{code}/rainfall` avec clé d'appareil ou compte opérateur | Voie distincte des capteurs de niveau d'eau; cumuls horaires et horodatages sont stockés avec la provenance `iot-rain-gauge`. |

**Risque pluie** (par point) = max(intensité des 3 prochaines heures, cumul des 24 dernières heures) comparé à des seuils **provisoires** (10 / 30 mm/h, 50 / 100 mm sur 24 h) configurables (`RAIN_*`) — à valider avec la SODEXAM ou un hydrologue.
Une collecte en échec (réseau, quota) n'interrompt ni l'API ni les autres points ; les anciennes valeurs restent affichées et leur fraîcheur est visible via `GET /api/v1/weather/status`. Les observations de terrain, les estimations courantes Open-Meteo et les prévisions sont affichées séparément. Une heure passée Open-Meteo n'est jamais présentée comme une mesure de terrain.

Un pluviomètre s'enregistre comme capteur `rain_gauge`, puis transmet un cumul
horaire en millimètres avec `POST /api/v1/sensors/{code}/rainfall`. L'ingestion
accepte la clé configurée dans `INGEST_API_KEY` (en-tête `X-API-Key`) ou le
jeton d'un agent terrain/opérateur. Exemple de corps :

```json
{
  "precip_mm": 12.5,
  "measured_at": "2026-10-31T12:00:00Z"
}
```

Cette route est distincte de l'envoi des mesures de niveau d'eau. Les seuils de
déclenchement automatique sont provisoires et sont à confirmer pour chaque
déploiement.

**Vérifié** : analyse des formats, enregistrement idempotent, tolérance aux pannes, saisie de bulletins et tests de l'ingestion des pluviomètres (tests sur PostGIS). Les connecteurs réseau sont testés avec des réponses simulées.
**À vérifier au déploiement** : connectivité sortante, abonnement/quota OpenWeather, licence Open-Meteo et fraîcheur réelle des sources.

## Affichage automatique et limites scientifiques

La visualisation de pluie affiche les précipitations courantes rapportées par
OpenWeather, les bulletins et les pluviomètres, ainsi que l'estimation courante
du modèle Open-Meteo, avec une provenance distincte. Une pluie positive peut
ainsi apparaître sur la carte sans être présentée comme une mesure de terrain.
Les prévisions restent séparées. La simulation MNT automatique est calculée
pour les points où des mesures récentes ou une estimation courante dépassent
les seuils provisoires; une pluie légère peut être visualisée sans qu'une
emprise d'inondation soit simulée. Aucune de ces emprises ne confirme une
inondation réelle.

La couleur de la situation globale n'utilise que des mesures récentes de
capteurs de niveau actifs et des observations de pluie non prévisionnelles.
Les prévisions et les estimations de modèle Open-Meteo ne peuvent pas rendre
la situation globale orange ou rouge. Sans mesure actuelle disponible, l'état
est « Données insuffisantes », et non « Vert ». Même avec des mesures, cette
synthèse ne vaut que pour les points effectivement suivis; elle ne prouve pas
l'absence de risque dans les zones non couvertes.

La collecte Open-Meteo couvre désormais la Côte d'Ivoire avec des points de
sondage espacés d'environ 50 km, filtrés par la frontière nationale Natural
Earth, puis fusionnés
avec les sept villes configurées et les emplacements des capteurs non démo.
Cet espacement donne une estimation régionale, pas une précision de crue locale;
les points ajoutés ne sont ni des pluviomètres ni des observations terrain.
OpenWeather reste limité aux villes et capteurs, afin de ne pas multiplier les
requêtes d'un compte utilisateur sur tous les points. La collecte reste
périodique (30 minutes par défaut), pas un flux temps réel garanti.
La frontière est issue de Natural Earth 10m, jeu `ne_10m_admin_0_countries`,
commit [`ca96624`](https://github.com/nvkelso/natural-earth-vector/tree/ca96624a56bd078437bca8184e78163e5039ad19),
licence domaine public; le statut météo expose l'espacement et le nombre de
points de sondage. Aucun maillage ni grille n'est affiché dans l'interface.
Open-Meteo est retenu pour l'instant dans un contexte non commercial; sa licence
doit être réévaluée avant tout usage commercial.

Les capteurs dont le code commence par `DEMO-` (notamment Caniveau A, B et C)
et leurs alertes sont exclus des listes, cartes, statistiques et simulations
automatiques. Les enregistrements historiques restent conservés dans la base;
aucune donnée n'est supprimée.

Les seuils de pluie et le modèle MNT restent provisoires et ne constituent pas
un modèle hydrodynamique validé. Toute emprise calculée à partir de pluie doit
être présentée comme une estimation illustrative, liée à ses sources,
horodatages et hypothèses; elle ne doit pas être décrite comme une observation
d'inondation. Les simulations créées manuellement restent disponibles et
distinctes des données météo automatiques.

Open-Meteo est collecté sans clé. OpenWeather est facultatif jusqu'à
l'obtention d'une clé. Pour l'activer, définir
`WEATHER_OPENWEATHER_API_KEY` dans `apps/api/.env` puis redémarrer l'API. Ne
jamais placer cette clé dans le frontend, un dépôt Git ou les journaux.
L'endpoint courant OpenWeather fournit une pluie cumulée sur une heure lorsqu'elle
est rapportée; une absence de champ pluie est interprétée comme zéro par ce
fournisseur.

## Couverture mondiale à la demande

La carte météo n'est plus limitée à la Côte d'Ivoire :
`GET /api/v1/weather/viewport?west=…&south=…&east=…&north=…` échantillonne
Open-Meteo pour l'emprise visible, sans authentification et sans écriture en
base (donc sans passer par la collecte périodique ni par PostgreSQL).

- **Paramètres** : `west`, `south`, `east`, `north` en degrés décimaux. Latitude
  dans [-90, 90], longitude dans [-180, 180], `west < east` et `south < north`.
  La limite couvre la surface terrestre (~510,1 millions de km²) : une vue
  mondiale entière est acceptée et le pas des sondages s'élargit automatiquement.
  Le franchissement de l'antiméridien reste refusé en HTTP 422 avec un message
  français ; la carte conserve alors les points déjà affichés.
- **Alignement et cache** : l'emprise demandée est alignée sur un pas de
  sondage mondial stable, qui part de 250 km et s'élargit pour les grandes
  emprises (`spacing_km` renvoyé). Deux vues identiques ou voisines réutilisent
  ainsi la même entrée de cache (10 minutes, 64 emprises au maximum, en mémoire
  du processus). Le centre de l'emprise est toujours inclus.
- **Bornes** : entre 1 et 60 points, donc un seul appel Open-Meteo (100 lieux
  maximum par requête HTTP).
- **Réponse** : `generated_at`, `bbox`, `spacing_km`, `points` (contrat
  `WeatherItem` du frontend, `source_kind` = `weather_model`, `source` =
  `open-meteo`), `degraded`, `failed_points`, `attribution`
  (`Open-Meteo (CC BY 4.0)`) et `limitations` (courtes, en français). En cas
  d'échec total du fournisseur, la route répond `degraded: true`, `points: []`
  et `error: "Open-Meteo indisponible"` au lieu d'une erreur 500 ; un échec
  partiel conserve les points réussis et renseigne `failed_points`.
- **Anti-abus** : au plus 20 requêtes par minute et par hôte (HTTP 429,
  `Retry-After: 60`), compteur en mémoire du processus.
- **Statut** : `GET /api/v1/weather/status` expose `coverage.scope` =
  `worldwide`, `coverage.worldwide_sampling` (pas initial, 60 points,
  ~510,1 millions de km²) et `coverage.anchored_points` (zone du réseau déployé,
  pas de 50 km, nombre de points). Aucun maillage ni grille n'est rendu.

Les points de sondage ancrés d'environ 50 km, ainsi que l'historique stocké en
base, restent **nationaux et provisoires** : la collecte périodique ne couvre
toujours que la Côte d'Ivoire. La vue mondiale est une estimation de modèle à la
demande, pas une mesure de terrain ni une couverture temps réel garantie ; les
deux modes ne doivent pas être confondus dans l'interface.

## Radar de précipitations mondial (proxy)

La carte 2D et le globe affichent un radar de précipitations animé fourni par
RainViewer (composite mondial, images passées récentes et courte prévision). Le
navigateur ne contacte **jamais** RainViewer : les tuiles sont demandées à
l'API MasterEarth. Ce proxy est nécessaire parce que les réponses de tuiles
de RainViewer ne portent pas d'en-tête CORS fiable, ce qui bloque tout chargement
direct par Cesium ou Leaflet ; il permet aussi de mettre en cache les images et
d'appliquer notre propre limitation de débit. Aucune clé n'est requise.

Les deux vues utilisent les mêmes routes et les mêmes images. La carte 2D
ajoute un voile jour/nuit calculé localement, des noms GeoNames et des frontières
Natural Earth ; le trafic aérien OpenSky est une couche distincte, documentée
dans [`WORLDWIDE_PLATFORM.md`](WORLDWIDE_PLATFORM.md).

### Endpoints

- `GET /api/v1/weather/radar/frames` — public, sans authentification, sans accès
  base. Renvoie la liste validée des images :

  ```json
  {
    "generated_at": "2026-11-04T05:55:00+00:00",
    "attribution": "Weather data by RainViewer",
    "attribution_url": "https://www.rainviewer.com/",
    "frames": [
      {"index": 0, "time": 1760000000, "forecast": false},
      {"index": 13, "time": 1760003600, "forecast": true}
    ],
    "limitations": ["…"]
  }
  ```

  Au plus 16 images : les 13 dernières images passées et 3 images de prévision
  (nowcast), triées par heure. `index` est l'indice stable à réutiliser dans
  l'URL des tuiles. En cas d'indisponibilité totale du fournisseur, la route
  répond `503` avec un message français.

- `GET /api/v1/weather/radar/tiles/{index}/{z}/{x}/{y}.png` — public, sans
  authentification, sans accès base. Renvoie une tuile PNG transparente avec
  `Cache-Control: public, max-age=600` et
  `Access-Control-Allow-Origin: *`. Le gabarit d'URL que le frontend doit
  utiliser est donc :

  `/api/v1/weather/radar/tiles/{index}/{z}/{x}/{y}.png`

  (`index` vient de `frames[].index` ; `z` est limité à 0–7, et
  `0 <= x,y < 2^z`). Une coordonnée invalide répond `422` (message français),
  un index négatif `422`, un index inconnu `404`, une panne amont `503`.

### Cache et limites

- Liste des images : cache mémoire du processus pendant **5 minutes** ; si le
  fournisseur échoue ensuite, le dernier produit connu est resservi (les images
  peuvent donc être légèrement périmées).
- Tuiles : cache LRU de **256 tuiles**, TTL de **10 minutes**, clé
  `(chemin d'image, z, x, y)`. Une tuile de plus de **512 Kio** ou dont le type
  n'est pas `image/png` est refusée. L'hôte amont est imposé
  (`https://tilecache.rainviewer.com`) et le chemin doit suivre
  `/v2/radar/<identifiant>` : aucune URL arbitraire n'est construite.
- Anti-abus : au plus **600 requêtes de tuile par minute et par hôte** (HTTP 429,
  `Retry-After: 60`), compteur en mémoire du processus. La liste des images
  n'est pas limitée de la même manière. Cette limite couvre le chargement normal
  d'une animation (plusieurs images et niveaux de zoom) tout en arrêtant les
  abus.
- La route des tuiles peut répondre `503` ; le frontend doit alors désactiver
  ou masquer la couche radar sans interrompre le globe. Une liste d'images vide
  ou invalide est déjà écartée par le service : la route `frames` renvoie `503`
  plutôt qu'une liste vide.

### Attribution et limites scientifiques

L'attribution **« Weather data by RainViewer »** avec un lien vers
<https://www.rainviewer.com/> est obligatoire et affichée avec la couche radar.
Ces images sont des **échos radar de précipitations**, pas des mesures de débit,
de hauteur d'eau ou de pluie au sol, et elles ne constituent pas une prévision
hydrologique. La couverture dépend des **réseaux radar nationaux** : certaines
régions, en particulier les océans et les zones sans radar, restent sans image.
Les images de prévision (nowcast) sont des extrapolations, pas des observations.
