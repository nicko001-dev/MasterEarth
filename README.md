# MasterEarth

MasterEarth is an offline-first planetary hazard monitoring platform built around real-time geospatial data, 2D maps and 3D globes, flood analysis, worldwide natural-hazard tracking, synchronization, simulation, knowledge retrieval, and controlled AI assistance.

## Current status

**État du code vérifié le 19 novembre 2026 :** le dépôt contient une API FastAPI avec comptes/rôles, révocation serveur des sessions, observations terrain, capteurs, météo, règles d'alerte, simulation indicative, agrégation mondiale d'aléas réels (USGS, GDACS, NASA EONET, NOAA), adaptateurs IoT et Intelligence Engine optionnel; une plateforme React/Leaflet/Cesium, une page d'accueil vidéo et une application distincte `apps/world`. L'assistant utilise des fournisseurs gratuits configurables, demande un consentement explicite et conserve un mode local déterministe. Cela ne signifie pas que le produit est prêt pour les opérations d'urgence : les tests PostgreSQL, l'isolation multi-organisation générale, les politiques de modération, la synchronisation offline, les notifications, la validation terrain et le déploiement restent incomplets ou non vérifiés. Voir la [matrice BOATIKS](docs/BOATIKS_REQUIREMENTS_MATRIX.md).

The living repository is this directory (`Current/IntelliFlood/`). It establishes the modular internal architecture of both the backend (FastAPI, layered structure: `api/`, `schemas/`, `services/`, `domain/`, `core/`, `infrastructure/db/`) and frontend (React + Vite: `app/`, `components/`, `services/`). All configuration mechanisms from M0.2, internal architecture from M0.3, quality tooling from M0.4, data infrastructure from M1 (PostgreSQL/PostGIS, SQLAlchemy 2.x, Alembic migrations), and transversal core foundations from M2.1 are strictly preserved.

## Roadmap et niveau de préparation

Les jalons M0–M11 demeurent le plan historique; les anciennes listes « à venir »
ne reflètent plus l'état actuel du code. Les fonctionnalités présentes et leurs
lacunes sont inventoriées dans la [matrice de traçabilité](docs/BOATIKS_REQUIREMENTS_MATRIX.md).
Les seuils d'alerte et de pluie restent provisoires. Ne pas utiliser MasterEarth
pour diffuser des alertes opérationnelles avant validation par les autorités et
les experts compétents.

## Quality & Architecture Documentation

Pour une présentation complète des décisions architecturales, des procédures de test, de la qualité et de l'infrastructure de données :
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Architecture interne de référence (M0.3)
- [`docs/QUALITY.md`](docs/QUALITY.md) — Guide de qualité, tests et outillage (M0.4)
- [`docs/DATA_INFRASTRUCTURE.md`](docs/DATA_INFRASTRUCTURE.md) — Guide complet de l'infrastructure de données, configuration PostgreSQL/PostGIS et migrations Alembic (M1)
- [`docs/BOATIKS_REQUIREMENTS_MATRIX.md`](docs/BOATIKS_REQUIREMENTS_MATRIX.md) — Audit des 51 documents, exigences, tests, état et décisions ouvertes
- [`docs/AI_ENGINE.md`](docs/AI_ENGINE.md) — Fournisseurs IA, chiffrement, consentement, confidentialité et limites hors ligne
- [`docs/WORLDWIDE_PLATFORM.md`](docs/WORLDWIDE_PLATFORM.md) — Portée mondiale, globe temps réel, localisation et assistant intégré
- [`database/README.md`](database/README.md) — Parcours de démarrage rapide et structure de la base de données

---

## Prerequisites & Tools (Outils à installer)

1. **Python 3.11+** (avec pip et venv)
2. **Node.js 20+** (avec npm)
3. **Docker & Docker Compose** (pour exécuter PostgreSQL/PostGIS localement au jalon M1)

Aucune clé externe n'est requise pour le développement local. Les usages
commerciaux des sources cartographiques ou météo doivent toutefois respecter
leurs licences, quotas et conditions d'utilisation (voir `docs/WEATHER.md` et
`docs/INTELLIFLOOD_WORLD_AUDIT.md`).

---

## Backend — Configuration, Qualité & Démarrage

### 1. Création et activation de l'environnement virtuel Python

Depuis `Current/IntelliFlood/apps/api` :

```bash
# Windows PowerShell
python -m venv .venv
.venv\Scripts\Activate.ps1

# Linux / macOS
# python3 -m venv .venv
# source .venv/bin/activate
```

### 2. Installation des dépendances backend

```bash
.venv\Scripts\python.exe -m pip install -e ".[dev]"
```

Les dépendances incluent FastAPI, Uvicorn, Pydantic-Settings, ainsi que pytest, httpx et ruff en mode développement.

### 3. Préparation du fichier `.env` backend

Copiez le fichier d'exemple sécurisé :

```bash
cp .env.example .env
```

Variables supportées par le backend (`app/config.py`) :

| Variable | Type | Valeur par défaut locale | Description |
|---|---|---|---|
| `APP_NAME` | string | `MasterEarth API` | Nom du service |
| `API_VERSION` | string | `0.1.0` | Version du service |
| `APP_ENV` | string | `development` | Environnement (`development`, `test`, `production`) |
| `API_HOST` | string | `127.0.0.1` | Hôte d'écoute du serveur |
| `API_PORT` | integer | `8000` | Port d'écoute du serveur |
| `API_DEBUG` | boolean | `false` | Mode debug |
| `CORS_ORIGINS` | string / JSON | `http://localhost:5173,http://127.0.0.1:5173` | Origines CORS autorisées (séparées par virgules ou JSON) |
| `POSTGRES_HOST` | string | `127.0.0.1` | Hôte PostgreSQL |
| `POSTGRES_PORT` | integer | `5432` | Port PostgreSQL |
| `POSTGRES_USER` | string | `intelliflood` | Utilisateur PostgreSQL |
| `POSTGRES_PASSWORD` | string | `change-me` | Mot de passe PostgreSQL (fictif par défaut) |
| `POSTGRES_DB` | string | `intelliflood` | Nom de la base de données |
| `POSTGRES_POOL_SIZE` | integer | `5` | Taille du pool de connexions SQLAlchemy |
| `POSTGRES_MAX_OVERFLOW` | integer | `10` | Connexions supplémentaires autorisées au-delà du pool |
| `AI_ENCRYPTION_KEY` | Fernet key | *(absente par défaut)* | Clé maître privée indispensable au chiffrement des clés fournisseurs IA |
| `AI_REQUEST_TIMEOUT_SECONDS` | integer | `12` | Délai maximal d'une tentative IA distante (3–30 secondes) |

### 4. Démarrage du serveur FastAPI

```bash
# Via uvicorn
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Ou directement
.venv\Scripts\python.exe -m app.main
```

Endpoints techniques disponibles :
- `GET http://127.0.0.1:8000/health` (état du service)
- `GET http://127.0.0.1:8000/api/v1` (version et informations d'environnement)
- `GET http://127.0.0.1:8000/docs` (documentation interactive OpenAPI)

### 5. Base de données PostgreSQL/PostGIS (M1)

#### 5.1 Démarrage de PostgreSQL/PostGIS

Si Docker et Docker Compose sont disponibles :

```bash
# Depuis la racine du dépôt
docker compose up -d postgres

# Vérifier que le conteneur tourne
docker ps
```

#### 5.2 Application des migrations Alembic

```bash
# Vérifier la révision courante
alembic current

# Appliquer les migrations
alembic upgrade head

# Vérifier PostGIS
docker exec -it intelliflood-postgres psql -U intelliflood -d intelliflood -c "SELECT postgis_version();"
```

Pour plus de détails, consulter [`docs/DATA_INFRASTRUCTURE.md`](docs/DATA_INFRASTRUCTURE.md).

---

### 6. Exécution des tests et contrôles de qualité backend

```bash
# Exécution de la suite de tests pytest
.venv\Scripts\python.exe -m pytest -v

# Vérification du lintage (optionnel, si ruff est installé)
.venv\Scripts\python.exe -m ruff check app/ tests/
```

---

## Frontend — Configuration & Démarrage

### 1. Installation des dépendances frontend

Depuis `Current/IntelliFlood/apps/web` :

```bash
npm install
```

### 2. Préparation du fichier `.env` frontend

Copiez le fichier d'exemple sécurisé :

```bash
cp .env.example .env
```

Variables supportées par le frontend (`src/config.ts` et `vite.config.ts`) :

| Variable | Type | Valeur par défaut locale | Description |
|---|---|---|---|
| `VITE_API_BASE_URL` | string | `http://127.0.0.1:8000` | URL racine de l'API backend |
| `VITE_INTELLIFLOOD_WORLD_URL` | string | `http://127.0.0.1:4173` | URL de l'application MasterEarth World |
| `VITE_PORT` | integer | `5173` | Port d'écoute du serveur de développement Vite |

*Note : Seules les variables préfixées par `VITE_` sont exposées au code client par Vite.*

### 3. Démarrage du frontend (serveur de développement)

```bash
npm run dev
```

L'application est accessible sur `http://localhost:5173` (ou le port défini dans `VITE_PORT`).

Depuis la racine sous Windows, `.\start.bat` démarre l'API, le frontend Web
et l'application autonome MasterEarth World. Cette dernière est accessible
sur `http://localhost:4173`; pour ne démarrer qu'elle, utilisez
`.\start.bat world`. Elle nécessite Node.js 24.14 ou plus récent.
`.\start.bat health` sonde les 11 endpoints de l'API (`/health`, capteurs,
alertes, météo, pluie mondiale, avions mondiaux et régionaux, radar,
inondations automatiques) sans passer par le proxy HTTP local. Les fichiers
`.env` fixent `WEATHER_ENABLED=true`, `VITE_API_BASE_URL`, les origines CORS
et `NO_PROXY`/`no_proxy` pour les hôtes locaux.

### 4. Vérification des types TypeScript et build de production

```bash
npm run typecheck
npm run build
```

### 5. Données géographiques mondiales (carte 2D et globe 3D)

La carte 2D et le globe chargent les noms de lieux, les frontières et les
régions depuis `apps/web/public/geo/` (déjà générés et versionnés). Pour les
reconstruire à partir des sources libres (GeoNames, Natural Earth) :

```bash
python scripts/build_geo_data.py --force   # télécharge et reconstruit
python scripts/build_geo_data.py --verify  # contrôle tailles, décomptes et formats
```

Le script met les téléchargements en cache dans `scripts/.geo-cache/` (ignoré par
Git). Provenance, licences et formats : `apps/web/public/geo/README.md`.

### 6. Comportement mondial, circulation animée et localisation

La plateforme n'est plus limitée à un pays : vue initiale mondiale, météo et
radar à l'échelle de la carte 2D comme du globe 3D, noms GeoNames, frontières
Natural Earth et jour/nuit calculé. Le trafic aérien observé provient d'OpenSky
Network (CC BY-NC 4.0, attribution obligatoire) : un proxy régional sert les
vues rapprochées et `GET /api/v1/live/aircraft/global` fournit un échantillon
mondial réparti sur tous les continents, avec cache et limite de débit ; les
positions sont interpolées entre observations et aucune vue ne vide la couche.

La circulation (voitures, motos, camions, bus, navires) est animée en continu
sur le **réseau routier réel** d'OpenStreetMap, servi par
`GET /api/v1/live/roads` (cache, miroirs Overpass, chargement en arrière-plan).
En vue planétaire, des flux de mobilité entre métropoles et les navires
prennent le relais. Le tracé est réel, le déplacement est un modèle assumé :
aucun flux mondial de véhicules en direct n'est disponible sans clé, et rien
n'est présenté comme une observation. La nuit, un voile calculé assombrit la
zone nocturne sans jamais masquer rues et bâtiments au zoom ; le radar
s'efface au niveau des rues.

Le système de pluie et d'inondation est mondial de bout en bout : sondages
météo à la demande pour l'emprise visible, **aucun maillage ni grille affichée**
(supprimés de la 2D, de la 3D et de l'assistant), pictogrammes pluie /
inondation / pluie + inondation en 2D comme en 3D, et simulation d'inondation
sur un MNT global (vérifié à Paris, Abidjan et Jakarta). Les voitures, avions,
navires et flux mondiaux sont animés en continu (30 images/s en 3D, rafraîchies
à chaque image utile en 2D). Les statistiques du scan mondial
`GET /api/v1/weather/global-rain` (198 points de sondage, précipitation
courante) affinent jusqu'à 8 zones arrosées par des sondages rapprochés puis
nomment en parallèle les points les plus arrosés via OpenStreetMap / Photon :
`rain_places` donne la rue,
le quartier ou la localité, son intensité et son niveau de vigilance. Une donnée
indisponible affiche « — » et non un zéro ; un point isolé reste anonyme avec
ses coordonnées plutôt qu'un nom de ville trompeur.
Si le quota quotidien de l'hôte Open-Meteo principal est épuisé (429), le scan
bascule sur un second hôte Open-Meteo au quota distinct ; si toutes les sources
échouent, la dernière mesure valide reste affichée avec son âge exact, marquée
périmée, sans jamais être remplacée par un zéro.

Le monitoring interroge chaque source séparément : une panne partielle conserve
les dernières valeurs et laisse toutes les couches actives, et le bandeau
« Hors ligne » n'apparaît que si l'API entière est injoignable.

La position de l'utilisateur est proposée à l'entrée, avec consentement et sans
envoi de coordonnées au serveur ; elle s'affiche sur la carte 2D, le globe 3D et
l'application séparée MasterEarth World, avec un bouton de recentrage. Voir
[`docs/WORLDWIDE_PLATFORM.md`](docs/WORLDWIDE_PLATFORM.md).

---

## Sécurité & Gestion des secrets

1. **Règle absolue : aucun secret dans le code ou les exemples** :
   Les fichiers `.env.example` ne doivent contenir que des valeurs fictives ou locales non sensibles.
2. **Fichiers ignorés par Git** :
   Le fichier `.gitignore` à la racine ignore strictly tous les fichiers `.env` et `.env.*`, à l'exception explicite des `.env.example`.
3. **Valeurs par défaut sûres** :
   Le backend et le frontend disposent de valeurs locales par défaut sécurisées, permettant une exécution immédiate sans configuration critique préalable.

---

## Packages partagés

- `packages/shared`: constantes réutilisables minimales (`INTELLIFLOOD_VERSION`).
- `packages/contracts`: types minimaux partagés pour les échanges API (`ApiStatus`, `HealthStatus`, `ApiRootInfo`).

---

## Développement & Gouvernance

Consultez `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/QUALITY.md` et les documents de référence dans `docs/` avant toute modification d'architecture. Ne commencez pas les jalons futurs sans mandat explicite.


## Démarrage rapide
Prérequis : Docker, ou Python 3.12 + Node 22 + PostgreSQL/PostGIS.

**Avec Docker (Windows, macOS, Linux)**
```
cp .env.example .env     # puis renseigner INGEST_API_KEY, JWT_SECRET (>= 32 car.), ADMIN_EMAIL, ADMIN_PASSWORD
docker compose --profile full up -d --build
python scripts/seed_demo.py http://localhost:8080 <ADMIN_EMAIL> <ADMIN_PASSWORD>   # données fictives (optionnel)
```
Ouvrir http://localhost:8080. Le premier administrateur est créé au démarrage avec ADMIN_EMAIL / ADMIN_PASSWORD (retirer le mot de passe du .env ensuite).
Secret JWT : `python -c "import secrets; print(secrets.token_urlsafe(48))"`.

**Sans Docker** : `docker compose up -d postgres` ; `cd apps/api && pip install -e .[dev]` ; depuis la racine `PYTHONPATH=apps/api alembic upgrade head` puis `uvicorn app.main:app` (dans apps/api) ; `cd apps/web && npm install && npm run dev`.

Documentation : `docs/RELEASE_M2.2.md` (historique), `docs/WEATHER.md` (météo), `docs/INTELLIFLOOD_WORLD_AUDIT.md` (MasterEarth World et globe), `docs/WORLDWIDE_PLATFORM.md` (surveillance mondiale des aléas, sources et provenance).
