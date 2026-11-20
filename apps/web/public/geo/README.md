# Données géographiques du globe 3D

Ce dossier contient les **fichiers statiques** qui alimentent le globe CesiumJS
d'IntelliFlood : libellés de villes et de zones dans le monde entier, frontières
des pays et limites administratives de premier niveau. Ils sont **générés** par
`scripts/build_geo_data.py` ; ils ne doivent jamais être modifiés à la main.

Les fichiers sont servis tels quels depuis `apps/web/public/geo/`, donc
accessibles aux URL `/geo/places.json`, `/geo/countries.geojson` et
`/geo/admin1.geojson`. Aucune clé d'API, aucun service de tuiles payant et aucun
compte Cesium ion ne sont nécessaires pour ces trois fichiers.

## Provenance

| Fichier produit | Source | Version / date | Licence |
| --- | --- | --- | --- |
| `places.json` | GeoNames — `cities15000.zip` | dump du 2026-11-04 (34 197 lignes) | CC BY 4.0 |
| `places.json` (noms de régions) | GeoNames — `admin1CodesASCII.txt` | dump du 2026-11-04 | CC BY 4.0 |
| `places.json` (pays, capitales) | GeoNames — `countryInfo.txt` | dump du 2026-11-04 | CC BY 4.0 |
| `countries.geojson` | Natural Earth — `ne_110m_admin_0_countries` | 5.1.1 | domaine public |
| `admin1.geojson` | Natural Earth — `ne_10m_admin_1_states_provinces` | 5.1.1 | domaine public |

URL exactes utilisées par le script :

- `https://download.geonames.org/export/dump/cities15000.zip`
- `https://download.geonames.org/export/dump/admin1CodesASCII.txt`
- `https://download.geonames.org/export/dump/countryInfo.txt`
- `https://naciscdn.org/naturalearth/110m/cultural/ne_110m_admin_0_countries.zip`
- `https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_1_states_provinces.zip`

Natural Earth ne publie pas de couverture mondiale complète de l'admin-1 au
1:50 000 000 : `ne_50m_admin_1_states_provinces.zip` (et sa variante `_lakes`)
ne contiennent que **294 entités pour 9 pays**. Le script essaie ces fichiers
en premier, constate la couverture insuffisante (< 400 entités, < 25 pays) et
bascule automatiquement sur le jeu **1:10m**, seul à couvrir le monde
(4 596 entités, 253 pays). Le fichier `ne_110m_admin_1_states_provinces_lines`
n'est pas utilisé : il ne contient que des polylignes, pas des polygones
remplissables.

Les archives téléchargées sont mises en cache dans `scripts/.geo-cache/`.
Ce cache est **local et non versionné** : il n'est pas couvert par `.gitignore`
(ne pas l'ajouter au dépôt), peut être supprimé à tout moment et sera
re-téléchargé au besoin.

## Licences

- **GeoNames** : données sous licence [Creative Commons Attribution 4.0
  (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). L'attribution
  exigée est intégrée au fichier `places.json` :
  `"attribution": "GeoNames (CC BY 4.0) — https://www.geonames.org/"`.
  Elle doit rester visible dans les mentions du produit (crédits du globe ou
  page « à propos »).
- **Natural Earth** : données du domaine public
  (<https://www.naturalearthdata.com/about/terms-of-use/>). Aucune attribution
  n'est obligatoire ; la mention « Natural Earth » reste une courtoisie
  recommandée.

## Formats exacts

### `places.json`

Objet racine, sans indentation, encodé en UTF-8 (`ensure_ascii=False`),
séparateurs compacts :

```json
{"version":1,"generated":"AAAA-MM-JJ","attribution":"…","fields":["name","lat","lon","population","country_code","country","admin1","capital"],"places":[…]}
```

Chaque entrée de `places` est un **tableau de 8 valeurs**, dans cet ordre :

| # | Champ | Type | Règle |
| --- | --- | --- | --- |
| 0 | `name` | chaîne | nom du lieu, jamais vide |
| 1 | `lat` | nombre | latitude arrondie à 4 décimales, −90…90 |
| 2 | `lon` | nombre | longitude arrondie à 4 décimales, −180…180 |
| 3 | `population` | entier | ≥ 0 ; `0` si inconnue |
| 4 | `country_code` | chaîne | ISO 3166-1 alpha-2 (`CI`, `FR`…) |
| 5 | `country` | chaîne | nom du pays issu de `countryInfo.txt` |
| 6 | `admin1` | chaîne | nom lisible de la région (résolu via `admin1CodesASCII.txt`), `""` si absent |
| 7 | `capital` | booléen | `true` pour le lieu retenu comme capitale du pays |

Règles de construction :

- une ligne par lieu habité de `cities15000` dont la classe est `PPL*` ;
- dédoublonnage sur `(name, round(lat, 2), round(lon, 2))` ; en cas de doublon,
  la population la plus élevée est conservée ;
- tri par population décroissante, puis par nom ;
- lignes écartées : nom vide, coordonnées non numériques ou hors bornes ;
- pour chaque capitale déclarée par `countryInfo.txt`, le **lieu le plus peuplé**
  du pays dont le nom correspond est marqué `capital: true` (correspondance sur
  le nom, le nom ASCII puis les noms alternatifs GeoNames). Une seule capitale
  marquée par pays et par nom de capitale : les homonymes (ex. les autres
  « Washington » des États-Unis) ne sont pas marqués ;
- les noms de pays proviennent de GeoNames, à une exception documentée près :
  la Côte d'Ivoire est libellée `Côte d'Ivoire` (et non l'exonyme anglais
  « Ivory Coast »), pour rester cohérente avec `countries.geojson` et avec
  l'interface francophone.

### `countries.geojson`

`FeatureCollection` GeoJSON standard. `properties` contient **exactement**
`{"name": "<nom Natural Earth>", "iso_a2": "<code ISO A2>"}`.
Le champ `name` privilégie le libellé **français** (`NAME_FR`) quand Natural
Earth le fournit, sinon le nom anglais (`NAME` / `NAME_EN` / `ADMIN`).
Géométries `Polygon` ou `MultiPolygon` uniquement, anneaux extérieurs et trous
conservés. Coordonnées arrondies à 3 décimales, simplification topologique
d'environ 0,05°.

`iso_a2` vaut `"-99"` pour les deux territoires auxquels Natural Earth
n'attribue pas de code ISO : `N. Cyprus` et `Somaliland`. Les codes manquants
des autres entités sont récupérés via `ISO_A2_EH` (France, Norvège, Kosovo).

### `admin1.geojson`

`FeatureCollection` GeoJSON. `properties` contient **exactement**
`{"name": "<région>", "country": "<pays>"}`. Le champ `name` privilégie le
libellé français (`name_fr`) quand Natural Earth le fournit, sinon le nom de la
source. Géométries `Polygon` ou `MultiPolygon`. Coordonnées arrondies à 2
décimales (précision d'environ 1 km à l'équateur), simplification agressive
d'environ 0,15°.

Le budget de 2,5 Mo n'a pas nécessité de suppression : les 4 563 entités
retenues tiennent dans le plafond. Si un jour la source grossit, le script
conserve les entités les plus grandes (aire pondérée par la latitude) jusqu'au
budget, avec un plancher de 400 entités réparties sur au moins 25 pays.

## Tailles et décomptes (build du 2026-11-04)

| Fichier | Contenu | Octets | Taille | Gzip | Plafond |
| --- | --- | ---: | ---: | ---: | ---: |
| `places.json` | 34 194 lieux, dont 243 capitales | 2 437 508 | 2,32 MiB | ≈ 0,83 MiB | 2 800 000 |
| `countries.geojson` | 177 pays | 177 990 | 0,17 MiB | ≈ 0,06 MiB | 900 000 |
| `admin1.geojson` | 4 563 entités, 251 pays | 1 472 867 | 1,40 MiB | ≈ 0,33 MiB | 2 500 000 |

Total : environ 4,1 Mo (≈ 1,2 Mo compressé), chargés **à la demande** et non au
démarrage de l'application.

Autres chiffres du build : 34 197 lignes GeoNames lues → 34 194 lieux ;
1 doublon fusionné ; 2 lignes écartées ; 0 ligne tronquée pour raison de
budget ; 79 codes admin-1 absents de `admin1CodesASCII.txt` (champ `admin1`
laissé vide) ; 33 entités admin-1 écartées (7 sans nom dans Natural Earth,
26 plus petites que la résolution de 2 décimales, principalement des îlots et
des communes de Malte, des Maldives et de Nauru).

Trois capitales déclarées par GeoNames n'ont pas de lieu correspondant dans
`cities15000` et ne sont donc pas marquées : `Willemstad` et `Belgrade`
correspondent aux codes ISO obsolètes `AN` (Antilles néerlandaises) et `CS`
(Serbie-et-Monténégro), qui n'existent plus dans GeoNames ; `Diego Garcia` (IO)
est un territoire actuel mais sa base militaire est absente de `cities15000`.

## Régénérer

Prérequis : Python 3.12 ou plus récent (testé avec 3.14), accès réseau.
`shapely` est facultatif : s'il est installé (testé avec 2.2.0), il assure une
simplification topologique ; sinon un Douglas-Peucker pur Python prend le
relais avec un résultat valide, légèrement moins fidèle (quelques entités
minuscules peuvent en plus être omises et le fichier admin-1 grossit d'environ
30 %).

```powershell
# Reconstruction à partir du cache (télécharge seulement ce qui manque)
python scripts/build_geo_data.py

# Reconstruction complète : re-télécharge toutes les sources
python scripts/build_geo_data.py --force

# Validation seule des fichiers présents (aucun téléchargement)
python scripts/build_geo_data.py --verify
```

Le script est idempotent et reproductible : mêmes sources et même environnement
(version de `shapely`/GEOS incluse) → mêmes octets, à la date `generated` près.
Pour figer cette date (tests, archive) :

```powershell
$env:INTELLIFLOOD_GEO_DATE = "2026-11-04"
python scripts/build_geo_data.py
```

`--verify` contrôle : présence des fichiers, plafonds de taille, JSON UTF-8
valide sans `NaN`/`Infinity`, clés `properties` exactes, types et bornes des
coordonnées, anneaux fermés d'au moins 4 points, nombres d'entités, couverture
minimale de l'admin-1 (400 entités / 25 pays), puis affiche un extrait de
contrôle (`Abidjan`, `Paris`, `Tokyo`, `São Paulo`) et une ligne `PASS`/`FAIL`.
Le code de sortie vaut 0 en cas de succès, 1 en cas d'échec de validation,
2 en cas d'erreur de téléchargement ou de source.

## Consommation par le globe

- `apps/web/src/globe/places.ts` charge `/geo/places.json` via `loadPlaces()`
  (une seule requête, mise en cache mémoire et HTTP) puis filtre les lieux selon
  la hauteur de caméra (`populationFloor`, `labelBudget`) : les capitales
  restent prioritaires, les petites villes n'apparaissent qu'en vue rapprochée.
- `apps/web/src/globe/borders.ts` charge `/geo/countries.geojson` et
  `/geo/admin1.geojson` via `loadCountries()` et `loadAdmin1()`, puis dessine
  les anneaux simplifiés en polylignes vectorielles. Les limites admin-1 ne
  s'affichent qu'en dessous de 2 200 km de hauteur de caméra, dans la limite du
  budget de points.
- Les fichiers sont servis comme assets statiques Vite (`public/`), donc
  disponibles sans backend ni proxy. Le serveur nginx de production peut les
  compresser (gzip/brotli) : le gain est d'environ 3×.

Les positions des lieux sont des points (lat/lon) et les frontières des
polylignes : aucun de ces fichiers ne contient de MNT, de bâtiment ni de raster.

## Limites connues

- **Pas de quartiers ni de villes secondaires.** `cities15000` ne contient que
  les localités de plus de 15 000 habitants ; les quartiers, villages et
  adresses nécessitent des requêtes OpenStreetMap/Nominatim à la demande, que
  ce jeu statique ne remplace pas.
- **Classement uniquement par population.** Il n'y a ni hiérarchie
  administrative réelle, ni score de notoriété, ni pondération par zone
  inondable : le globe affiche les lieux les plus peuplés d'abord.
- **Millésime des limites admin-1.** Natural Earth 1:10m est un instantané
  (édition 5.1.1) dont certaines limites datent d'une dizaine d'années. En
  Côte d'Ivoire, il montre 19 régions historiques alors que le pays compte
  aujourd'hui 33 districts ; les noms `admin1` des lieux, eux, viennent de
  GeoNames et sont plus récents. Les deux couches ne se superposent donc pas
  toujours au niveau régional.
- **Précision géométrique volontairement faible.** Arrondi à 3 décimales pour
  les pays et 2 décimales pour l'admin-1, avec simplification : ces tracés sont
  adaptés à l'affichage mondial, pas à un usage cadastral, juridique ou
  électoral. Les frontières contestées suivent le point de vue de Natural Earth
  et ne constituent pas une prise de position.
- **Territoires sans code ISO.** `N. Cyprus` et `Somaliland` portent
  `iso_a2: "-99"` ; un consommateur qui exige un code ISO à deux lettres doit
  les ignorer ou les regrouper.
- **Petites entités admin-1 perdues.** Les 26 entités plus petites que la
  résolution de 2 décimales (Vatican, Clipperton, îlots, communes de Malte…)
  ne peuvent pas être représentées avec un contour fermé à cette précision et
  sont omises, ainsi que 7 entités sans nom dans Natural Earth. Les capitales et
  les pays correspondants restent présents dans `places.json` et
  `countries.geojson`.
- **Noms de pays en anglais GeoNames**, à l'exception de la Côte d'Ivoire.
  La traduction systématique des libellés est un travail d'interface, pas de
  données.
- **Aucune donnée de population officielle par région.** `admin1.geojson` ne
  contient que le nom et le pays ; toute statistique régionale doit venir de la
  base IntelliFlood, pas de ce jeu statique.
