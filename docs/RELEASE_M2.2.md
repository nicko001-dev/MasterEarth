# Release M2.2 — domaine de surveillance, API v1, plateforme web

Date : 31 octobre 2026. Les releases M0.1 à M2.1 restent intactes (`Releases/`).

## Audit préalable (constats)
- Tests backend : 54 collectés, 54 réussis sur la base M2.1 (aucun échec ni erreur de collecte) ; 60 réussis après M2.2.
- **Défaut corrigé** : la migration M1 utilisait un identifiant de révision de 38 caractères, alors que `alembic_version.version_num` est limité à 32 → `alembic upgrade head` échouait sur un vrai PostgreSQL. Renommée `20261027_1030_initial`. Vérifié (up/down/up) sur PostgreSQL 16 + PostGIS 3.4. Test ajouté (≤ 32 caractères).
- L'état M1 ne contenait que l'extension PostGIS : aucune table métier.

## Livré
- **Base de données** : tables `sensors` (géométrie POINT 4326 + index GiST), `readings`, `alerts` ; migration `20261031_1200_domain` réversible.
- **Moteur d'alerte** (`app/domain/alerting.py`, pur et testé) : médiane de la rafale, niveau d'eau, vitesse de montée, Vert/Orange/Rouge, persistance sur N cycles, sans doublon d'alerte.
- **API v1** : `GET/POST /api/v1/sensors`, `POST /api/v1/sensors/{code}/readings`, `GET .../readings`, `GET /api/v1/alerts`. Écritures protégées par clé d'API (`X-API-Key`).
- **Web** (React + Vite, deux pages) : `/` accueil immersif (Three.js embarqué, utilisable hors ligne), `/app/` plateforme (carte Leaflet, capteurs, alertes, cache local si hors ligne). PWA installable.
- **Multi-plateforme** : Docker Compose (profil `full`), script de démonstration en Python standard.

## Décisions à valider (« À DÉFINIR », non inventées)
- Les seuils (40 cm / 80 cm, 5 / 10 cm/min, 3 cycles) sont des **valeurs provisoires** configurables (`ALERT_*`).
- Clé d'API simple en attendant les comptes, rôles, organisations et l'audit (M2.3+).

## Non réalisé (jalons suivants)
Authentification et permissions, organisations, observations humaines et photos, météo, notifications SMS/push, monde 3D MasterEarth World (M5), synchronisation hors ligne des écritures (M7), simulation (M10), durcissement production (M11).

## Ajout M3 — météo (31 octobre 2026)
Collecte Open-Meteo, saisie de bulletins officiels (SODEXAM…), risque pluie, onglet « Météo » et anneaux sur la carte. Détails, limites et licences : `docs/WEATHER.md`. Migration `20261031_1400_weather`. 65 tests réussis sur PostgreSQL/PostGIS réel.

## Ajout M2.3 + M5 (31 octobre 2026)
- **M2.3 comptes** : organisations, utilisateurs (rôles lecteur < opérateur < administrateur), mots de passe scrypt, jetons JWT, journal d'audit, limitation des tentatives de connexion. La consultation reste publique ; créer des capteurs, saisir des bulletins ou lancer la collecte exige un opérateur ; les capteurs envoient leurs mesures avec une clé d'appareil.
- **M5 monde 3D** : voir `docs/INTELLIFLOOD_WORLD_AUDIT.md`. Écran de gestion et de connexion dans la plateforme.
- 70 tests réussis sur PostgreSQL/PostGIS réel. Migrations : `20261031_1600_auth`.

## Ajout M10 + IoT + monde 3D (1er novembre 2026)
- **Simulation d'inondation** (`/api/v1/simulations/flood`) : niveau d'eau, pluie ou capteur ; MNT Terrarium (cache disque, utilisable hors ligne) ; remplissage de cuvette avec connectivité ; zone « possible » (erreur du MNT) ; montée progressive en plusieurs images ; exécutions tracées. **Modèle simplifié, non hydrodynamique** — voir `app/domain/flood_model.py`.
- **IoT** : adaptateurs générique / The Things Network / ChirpStack (`/api/v1/ingest/{adapter}`), pont MQTT, firmware de référence ESP32 + JSN-SR04T (non testé sur matériel), profil Docker `iot`.
- **Monde 3D** (`apps/world`) : application dérivée et renommée « MasterEarth World » ; module `src/intelliflood/` (capteurs, météo, alertes, pluie 3D, simulation d'inondation). Node 24 requis. Voir `apps/world/NOTICE-INTELLIFLOOD.md` pour l'attribution et les licences.
- Migrations : `20261031_1800_simulation`. 87 tests réussis sur PostgreSQL/PostGIS réel.
