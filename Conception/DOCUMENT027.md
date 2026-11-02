# DOCUMENT027 — Schéma détaillé PostgreSQL/PostGIS

**Projet : IntelliFlood**
**Type : Conception de la base de données**
**Version : 1.0**
**Statut : Conception détaillée**

---

# 1. Objet

Ce document définit le modèle relationnel détaillé de la base de données principale d'IntelliFlood.

Il transforme le modèle conceptuel défini dans DOCUMENT008 et le modèle de domaine défini dans DOCUMENT007 en structure exploitable par PostgreSQL/PostGIS.

Il définit :

* les schémas logiques ;
* les tables ;
* les colonnes ;
* les types ;
* les clés primaires ;
* les clés étrangères ;
* les contraintes ;
* les relations ;
* les index ;
* les données géospatiales ;
* les données temporelles ;
* la version des données ;
* la provenance ;
* l'audit ;
* la synchronisation ;
* les règles d'intégrité.

---

# 2. SGBD cible

Le SGBD principal est :

**PostgreSQL + PostGIS**

PostGIS fournit les types et fonctions nécessaires à la gestion des géométries spatiales et aux requêtes géographiques.

Les données géométriques seront principalement représentées avec le type `geometry`, avec un système de référence spatiale explicitement défini.

Les index spatiaux utiliseront principalement **GiST**.

---

# 3. Principes de modélisation

La base doit respecter les principes suivants :

1. Intégrité référentielle.
2. Normalisation raisonnable.
3. Traçabilité.
4. Versionnement.
5. Historisation lorsque nécessaire.
6. Support spatial natif.
7. Support temporel.
8. Indexation adaptée.
9. Pas de duplication inutile.
10. Séparation entre données métier et données techniques.
11. Pas de logique métier complexe dans les triggers.
12. Compatibilité avec le fonctionnement offline-first.
13. Compatibilité avec la synchronisation.
14. Possibilité d'évolution par migrations.

---

# 4. Organisation logique de la base

La base sera organisée conceptuellement en domaines.

```text
intelliflood
│
├── identity
│
├── geography
│
├── data
│
├── observations
│
├── events
│
├── risk
│
├── alerts
│
├── simulation
│
├── intelligence
│
├── reports
│
├── synchronization
│
└── audit
```

Le découpage physique en schemas PostgreSQL pourra être appliqué progressivement.

---

# 5. Convention générale des identifiants

Les entités principales utiliseront des identifiants UUID.

Exemple :

```text
550e8400-e29b-41d4-a716-446655440000
```

Avantages :

* génération côté client possible ;
* fonctionnement offline ;
* réduction des collisions ;
* synchronisation facilitée ;
* absence de dépendance à une séquence centrale.

---

# 6. Colonnes techniques communes

Les tables métier principales pourront contenir :

```text
id
created_at
updated_at
version
created_by
updated_by
```

Signification :

| Colonne    | Signification                     |
| ---------- | --------------------------------- |
| id         | identifiant unique                |
| created_at | date de création                  |
| updated_at | dernière modification             |
| version    | version de l'objet                |
| created_by | utilisateur créateur              |
| updated_by | dernier utilisateur ayant modifié |

---

# 7. Temps

Les timestamps seront stockés avec fuseau horaire.

Type :

```text
TIMESTAMPTZ
```

Les données temporelles doivent permettre de distinguer :

* date de création ;
* date d'observation ;
* début d'un événement ;
* fin d'un événement ;
* période de validité ;
* date de calcul ;
* date de simulation ;
* date de synchronisation.

---

# 8. Domaine Identity

## 8.1 USER

Table :

```text
identity.user
```

Colonnes :

| Colonne       | Type        | Contraintes      |
| ------------- | ----------- | ---------------- |
| id            | UUID        | PK               |
| username      | VARCHAR     | UNIQUE, NOT NULL |
| email         | VARCHAR     | UNIQUE           |
| password_hash | TEXT        | NOT NULL         |
| first_name    | VARCHAR     | NOT NULL         |
| last_name     | VARCHAR     | NOT NULL         |
| status        | VARCHAR     | NOT NULL         |
| created_at    | TIMESTAMPTZ | NOT NULL         |
| updated_at    | TIMESTAMPTZ | NOT NULL         |
| version       | INTEGER     | NOT NULL         |

---

# 9. PROFILE

Table :

```text
identity.profile
```

Colonnes :

| Colonne     | Type        |
| ----------- | ----------- |
| id          | UUID PK     |
| name        | VARCHAR     |
| description | TEXT        |
| created_at  | TIMESTAMPTZ |
| updated_at  | TIMESTAMPTZ |

Profils initiaux :

```text
CITIZEN
FIELD_AGENT
ANALYST
OPERATIONAL_MANAGER
ADMINISTRATOR
```

---

# 10. PERMISSION

Table :

```text
identity.permission
```

Colonnes :

| Colonne     | Type           |
| ----------- | -------------- |
| id          | UUID PK        |
| code        | VARCHAR UNIQUE |
| name        | VARCHAR        |
| description | TEXT           |

Exemples :

```text
OBSERVATION_CREATE
OBSERVATION_READ
SIMULATION_CREATE
SIMULATION_RUN
ALERT_MANAGE
USER_MANAGE
SYSTEM_CONFIGURE
```

---

# 11. USER_PROFILE

Relation :

```text
User N ───────── N Profile
```

Table associative :

```text
identity.user_profile
```

Colonnes :

| Colonne     | Type        |
| ----------- | ----------- |
| user_id     | UUID FK     |
| profile_id  | UUID FK     |
| assigned_at | TIMESTAMPTZ |

Clé primaire :

```text
(user_id, profile_id)
```

---

# 12. PROFILE_PERMISSION

Table :

```text
identity.profile_permission
```

Colonnes :

| Colonne       | Type    |
| ------------- | ------- |
| profile_id    | UUID FK |
| permission_id | UUID FK |

Clé primaire :

```text
(profile_id, permission_id)
```

---

# 13. SESSION

Table :

```text
identity.session
```

Colonnes :

| Colonne     | Type             |
| ----------- | ---------------- |
| id          | UUID PK          |
| user_id     | UUID FK          |
| token_hash  | TEXT             |
| created_at  | TIMESTAMPTZ      |
| expires_at  | TIMESTAMPTZ      |
| revoked_at  | TIMESTAMPTZ NULL |
| device_info | JSONB            |

Les tokens bruts ne seront jamais stockés.

---

# 14. Domaine Geography

## 14.1 ZONE

Table :

```text
geography.zone
```

Colonnes :

| Colonne       | Type                     |
| ------------- | ------------------------ |
| id            | UUID PK                  |
| name          | VARCHAR                  |
| description   | TEXT                     |
| zone_type     | VARCHAR                  |
| geometry      | geometry(Geometry, SRID) |
| elevation_min | DOUBLE PRECISION         |
| elevation_max | DOUBLE PRECISION         |
| created_at    | TIMESTAMPTZ              |
| updated_at    | TIMESTAMPTZ              |
| version       | INTEGER                  |

Types possibles :

```text
ADMINISTRATIVE
FLOOD
RISK
OBSERVATION
SIMULATION
CUSTOM
```

---

# 15. GEO_OBJECT

Table :

```text
geography.geo_object
```

Colonnes :

| Colonne     | Type                     |
| ----------- | ------------------------ |
| id          | UUID PK                  |
| name        | VARCHAR                  |
| object_type | VARCHAR                  |
| description | TEXT                     |
| geometry    | geometry(Geometry, SRID) |
| properties  | JSONB                    |
| created_at  | TIMESTAMPTZ              |
| updated_at  | TIMESTAMPTZ              |

Exemples :

```text
BUILDING
ROAD
BRIDGE
RIVER
CANAL
DRAIN
HOSPITAL
SCHOOL
POWER_INFRASTRUCTURE
WATER_INFRASTRUCTURE
```

---

# 16. Données géométriques

La géométrie doit préciser son type lorsque cela est connu.

Exemples :

```text
geometry(Point, SRID)
geometry(LineString, SRID)
geometry(Polygon, SRID)
geometry(MultiPolygon, SRID)
```

Pour les entités réellement variables, un type générique pourra être utilisé avec validation applicative.

---

# 17. Index spatial

Les colonnes géométriques importantes devront recevoir un index spatial.

Conceptuellement :

```text
GIST(geometry)
```

Exemples :

```text
zone.geometry
geo_object.geometry
observation.geometry
event.geometry
risk.geometry
```

---

# 18. OBSERVATION

Table :

```text
observations.observation
```

Colonnes :

| Colonne          | Type                  |
| ---------------- | --------------------- |
| id               | UUID PK               |
| user_id          | UUID FK               |
| zone_id          | UUID FK NULL          |
| source_id        | UUID FK NULL          |
| observation_type | VARCHAR               |
| description      | TEXT                  |
| observed_at      | TIMESTAMPTZ           |
| geometry         | geometry(Point, SRID) |
| status           | VARCHAR               |
| confidence       | NUMERIC               |
| metadata         | JSONB                 |
| created_at       | TIMESTAMPTZ           |
| updated_at       | TIMESTAMPTZ           |
| version          | INTEGER               |

---

# 19. États d'une observation

```text
NEW
 ↓
IN_VERIFICATION
 ├──────→ VERIFIED
 │
 └──────→ REJECTED
```

Une observation rejetée reste conservée pour assurer la traçabilité.

---

# 20. MEDIA

Table :

```text
observations.media
```

Colonnes :

| Colonne        | Type        |
| -------------- | ----------- |
| id             | UUID PK     |
| observation_id | UUID FK     |
| media_type     | VARCHAR     |
| storage_key    | TEXT        |
| file_name      | VARCHAR     |
| mime_type      | VARCHAR     |
| file_size      | BIGINT      |
| checksum       | VARCHAR     |
| captured_at    | TIMESTAMPTZ |
| metadata       | JSONB       |

Le fichier lui-même est stocké dans le stockage objet.

La base contient ses métadonnées.

---

# 21. SOURCE

Table :

```text
data.source
```

Colonnes :

| Colonne     | Type         |
| ----------- | ------------ |
| id          | UUID PK      |
| name        | VARCHAR      |
| source_type | VARCHAR      |
| provider    | VARCHAR      |
| description | TEXT         |
| url         | TEXT NULL    |
| license     | TEXT NULL    |
| reliability | NUMERIC NULL |
| metadata    | JSONB        |
| created_at  | TIMESTAMPTZ  |

Exemples :

```text
SATELLITE
WEATHER
HYDROLOGY
TOPOGRAPHY
SENSOR
USER
PARTNER
IMPORT
```

---

# 22. DATASET

Table :

```text
data.dataset
```

Colonnes :

| Colonne      | Type             |
| ------------ | ---------------- |
| id           | UUID PK          |
| source_id    | UUID FK          |
| name         | VARCHAR          |
| dataset_type | VARCHAR          |
| version      | VARCHAR          |
| valid_from   | TIMESTAMPTZ      |
| valid_to     | TIMESTAMPTZ NULL |
| metadata     | JSONB            |
| created_at   | TIMESTAMPTZ      |

Cette table permet de conserver la provenance d'un ensemble de données.

---

# 23. DATA RECORD

Pour les données externes ou importées nécessitant une représentation générique :

```text
data.data_record
```

Colonnes :

| Colonne       | Type                          |
| ------------- | ----------------------------- |
| id            | UUID PK                       |
| dataset_id    | UUID FK                       |
| external_id   | VARCHAR                       |
| geometry      | geometry(Geometry, SRID) NULL |
| observed_at   | TIMESTAMPTZ NULL              |
| attributes    | JSONB                         |
| raw_reference | TEXT NULL                     |

---

# 24. EVENT

Table :

```text
events.event
```

Colonnes :

| Colonne        | Type                          |
| -------------- | ----------------------------- |
| id             | UUID PK                       |
| event_type     | VARCHAR                       |
| source_id      | UUID FK NULL                  |
| observation_id | UUID FK NULL                  |
| zone_id        | UUID FK NULL                  |
| geometry       | geometry(Geometry, SRID) NULL |
| severity       | VARCHAR                       |
| started_at     | TIMESTAMPTZ                   |
| ended_at       | TIMESTAMPTZ NULL              |
| status         | VARCHAR                       |
| metadata       | JSONB                         |
| created_at     | TIMESTAMPTZ                   |

Exemples :

```text
FLOOD_DETECTED
HEAVY_RAIN
WATER_LEVEL_RISE
DRAINAGE_FAILURE
INFRASTRUCTURE_INCIDENT
```

---

# 25. RISK

Table :

```text
risk.risk
```

Colonnes :

| Colonne       | Type                     |
| ------------- | ------------------------ |
| id            | UUID PK                  |
| zone_id       | UUID FK                  |
| risk_type     | VARCHAR                  |
| level         | VARCHAR                  |
| score         | NUMERIC NULL             |
| geometry      | geometry(Geometry, SRID) |
| calculated_at | TIMESTAMPTZ              |
| valid_from    | TIMESTAMPTZ              |
| valid_to      | TIMESTAMPTZ NULL         |
| methodology   | TEXT                     |
| metadata      | JSONB                    |

---

# 26. VULNERABILITY

Table :

```text
risk.vulnerability
```

Colonnes :

| Colonne            | Type         |
| ------------------ | ------------ |
| id                 | UUID PK      |
| zone_id            | UUID FK      |
| vulnerability_type | VARCHAR      |
| level              | VARCHAR      |
| score              | NUMERIC NULL |
| description        | TEXT         |
| calculated_at      | TIMESTAMPTZ  |
| metadata           | JSONB        |

---

# 27. ALERT

Table :

```text
alerts.alert
```

Colonnes :

| Colonne         | Type             |
| --------------- | ---------------- |
| id              | UUID PK          |
| event_id        | UUID FK          |
| zone_id         | UUID FK NULL     |
| level           | VARCHAR          |
| title           | VARCHAR          |
| message         | TEXT             |
| status          | VARCHAR          |
| created_at      | TIMESTAMPTZ      |
| acknowledged_at | TIMESTAMPTZ NULL |
| resolved_at     | TIMESTAMPTZ NULL |
| closed_at       | TIMESTAMPTZ NULL |

---

# 28. États d'une alerte

```text
CREATED
   ↓
ACTIVE
   ↓
ACKNOWLEDGED
   ↓
RESOLVED
   ↓
CLOSED
```

Une alerte ne doit pas être supprimée pour masquer son historique.

---

# 29. NOTIFICATION

Table :

```text
alerts.notification
```

Colonnes :

| Colonne      | Type             |
| ------------ | ---------------- |
| id           | UUID PK          |
| alert_id     | UUID FK          |
| user_id      | UUID FK          |
| channel      | VARCHAR          |
| status       | VARCHAR          |
| sent_at      | TIMESTAMPTZ NULL |
| delivered_at | TIMESTAMPTZ NULL |
| read_at      | TIMESTAMPTZ NULL |
| metadata     | JSONB            |

Canaux possibles :

```text
IN_APP
PUSH
EMAIL
SMS
```

Le système ne dépend pas obligatoirement d'un fournisseur spécifique.

---

# 30. SCENARIO

Table :

```text
simulation.scenario
```

Colonnes :

| Colonne       | Type        |
| ------------- | ----------- |
| id            | UUID PK     |
| created_by    | UUID FK     |
| name          | VARCHAR     |
| description   | TEXT        |
| zone_id       | UUID FK     |
| start_time    | TIMESTAMPTZ |
| end_time      | TIMESTAMPTZ |
| parameters    | JSONB       |
| assumptions   | JSONB       |
| model_version | VARCHAR     |
| status        | VARCHAR     |
| created_at    | TIMESTAMPTZ |
| updated_at    | TIMESTAMPTZ |
| version       | INTEGER     |

---

# 31. SIMULATION

Table :

```text
simulation.simulation
```

Colonnes :

| Colonne       | Type             |
| ------------- | ---------------- |
| id            | UUID PK          |
| scenario_id   | UUID FK          |
| started_at    | TIMESTAMPTZ NULL |
| completed_at  | TIMESTAMPTZ NULL |
| status        | VARCHAR          |
| worker_job_id | VARCHAR NULL     |
| model_version | VARCHAR          |
| parameters    | JSONB            |
| error_message | TEXT NULL        |
| created_at    | TIMESTAMPTZ      |

---

# 32. RESULT

Table :

```text
simulation.result
```

Colonnes :

| Colonne          | Type                          |
| ---------------- | ----------------------------- |
| id               | UUID PK                       |
| simulation_id    | UUID FK                       |
| result_type      | VARCHAR                       |
| geometry         | geometry(Geometry, SRID) NULL |
| value            | DOUBLE PRECISION NULL         |
| unit             | VARCHAR NULL                  |
| time_start       | TIMESTAMPTZ NULL              |
| time_end         | TIMESTAMPTZ NULL              |
| raster_reference | TEXT NULL                     |
| metadata         | JSONB                         |

Exemples :

```text
FLOOD_EXTENT
WATER_DEPTH
FLOW_SPEED
DURATION
AFFECTED_AREA
AFFECTED_OBJECT
```

---

# 33. ANALYSIS

Table :

```text
intelligence.analysis
```

Colonnes :

| Colonne         | Type             |
| --------------- | ---------------- |
| id              | UUID PK          |
| user_id         | UUID FK          |
| analysis_type   | VARCHAR          |
| model_id        | UUID FK NULL     |
| input_reference | JSONB            |
| result          | JSONB            |
| confidence      | NUMERIC NULL     |
| created_at      | TIMESTAMPTZ      |
| validated_by    | UUID FK NULL     |
| validated_at    | TIMESTAMPTZ NULL |

---

# 34. MODEL

Table :

```text
intelligence.model
```

Colonnes :

| Colonne        | Type        |
| -------------- | ----------- |
| id             | UUID PK     |
| name           | VARCHAR     |
| model_type     | VARCHAR     |
| version        | VARCHAR     |
| provider       | VARCHAR     |
| local          | BOOLEAN     |
| path_reference | TEXT NULL   |
| metadata       | JSONB       |
| created_at     | TIMESTAMPTZ |

Exemples :

```text
LLM
VISION
CLASSIFICATION
DETECTION
EMBEDDING
PREDICTION
```

---

# 35. REPORT

Table :

```text
reports.report
```

Colonnes :

| Colonne               | Type         |
| --------------------- | ------------ |
| id                    | UUID PK      |
| created_by            | UUID FK      |
| report_type           | VARCHAR      |
| title                 | VARCHAR      |
| content               | TEXT         |
| source_references     | JSONB        |
| generated_by_analysis | UUID FK NULL |
| created_at            | TIMESTAMPTZ  |
| version               | INTEGER      |

---

# 36. ANNOTATION

Table :

```text
geography.annotation
```

Colonnes :

| Colonne    | Type                          |
| ---------- | ----------------------------- |
| id         | UUID PK                       |
| user_id    | UUID FK                       |
| zone_id    | UUID FK NULL                  |
| geometry   | geometry(Geometry, SRID) NULL |
| content    | TEXT                          |
| created_at | TIMESTAMPTZ                   |
| updated_at | TIMESTAMPTZ                   |

---

# 37. SYNC OPERATION

Table :

```text
synchronization.sync_operation
```

Colonnes :

| Colonne        | Type             |
| -------------- | ---------------- |
| id             | UUID PK          |
| device_id      | UUID             |
| user_id        | UUID FK          |
| entity_type    | VARCHAR          |
| entity_id      | UUID             |
| operation_type | VARCHAR          |
| payload        | JSONB            |
| created_at     | TIMESTAMPTZ      |
| processed_at   | TIMESTAMPTZ NULL |
| status         | VARCHAR          |
| retry_count    | INTEGER          |
| error_message  | TEXT NULL        |

Types :

```text
CREATE
UPDATE
DELETE
UPLOAD
DOWNLOAD
LINK
UNLINK
```

---

# 38. SYNC CONFLICT

Table :

```text
synchronization.sync_conflict
```

Colonnes :

| Colonne             | Type             |
| ------------------- | ---------------- |
| id                  | UUID PK          |
| sync_operation_id   | UUID FK          |
| entity_type         | VARCHAR          |
| entity_id           | UUID             |
| local_version       | INTEGER          |
| remote_version      | INTEGER          |
| local_payload       | JSONB            |
| remote_payload      | JSONB            |
| resolution_strategy | VARCHAR NULL     |
| resolution_status   | VARCHAR          |
| resolved_by         | UUID FK NULL     |
| resolved_at         | TIMESTAMPTZ NULL |

---

# 39. AUDIT LOG

Table :

```text
audit.audit_log
```

Colonnes :

| Colonne     | Type         |
| ----------- | ------------ |
| id          | UUID PK      |
| user_id     | UUID FK NULL |
| action      | VARCHAR      |
| entity_type | VARCHAR      |
| entity_id   | UUID NULL    |
| timestamp   | TIMESTAMPTZ  |
| ip_address  | INET NULL    |
| device_id   | UUID NULL    |
| before_data | JSONB NULL   |
| after_data  | JSONB NULL   |
| metadata    | JSONB        |

L'audit sert à conserver les actions importantes.

---

# 40. Relations principales

```text
USER
 │
 ├── N:N ── PROFILE
 │             │
 │             └── N:N ── PERMISSION
 │
 ├── 1:N ── OBSERVATION
 │             │
 │             └── 1:N ── MEDIA
 │
 ├── 1:N ── ANALYSIS
 │
 ├── 1:N ── REPORT
 │
 └── 1:N ── SYNC_OPERATION


ZONE
 │
 ├── 1:N ── OBSERVATION
 ├── 1:N ── RISK
 ├── 1:N ── VULNERABILITY
 ├── 1:N ── EVENT
 ├── 1:N ── ALERT
 └── 1:N ── SCENARIO


SCENARIO
 │
 └── 1:N ── SIMULATION
                  │
                  └── 1:N ── RESULT


EVENT
 │
 └── 1:N ── ALERT
                │
                └── 1:N ── NOTIFICATION
```

---

# 41. Relations géospatiales

Les relations spatiales ne seront pas uniquement représentées par des clés étrangères.

Certaines relations seront calculées dynamiquement.

Exemple :

```text
Observation
     │
     │ ST_Within / ST_Intersects
     ▼
Zone
```

Ainsi une observation peut être déterminée comme appartenant à une zone à partir de sa géométrie.

---

# 42. Index classiques

Les colonnes fréquemment utilisées dans :

* recherches ;
* jointures ;
* filtrage ;
* tri temporel ;

recevront des index B-tree appropriés.

Exemples :

```text
observation.user_id
observation.observed_at
event.started_at
alert.status
alert.created_at
simulation.status
sync_operation.status
```

---

# 43. Index spatiaux

Les colonnes géométriques importantes utiliseront principalement :

```text
USING GIST
```

Exemples :

```text
zone.geometry
geo_object.geometry
observation.geometry
event.geometry
risk.geometry
result.geometry
annotation.geometry
```

---

# 44. Index temporels

Les tables à fort volume pourront utiliser des index temporels.

Exemples :

```text
(observed_at)
(started_at)
(created_at)
(updated_at)
```

Pour certaines tables volumineuses, une stratégie BRIN pourra être étudiée lorsque l'ordre physique des données présente une corrélation temporelle suffisante.

---

# 45. Contraintes

La base devra utiliser :

```text
PRIMARY KEY
FOREIGN KEY
UNIQUE
NOT NULL
CHECK
```

Exemples :

```text
confidence BETWEEN 0 AND 1
```

ou :

```text
version >= 1
```

ou :

```text
retry_count >= 0
```

Les contraintes garantissent l'intégrité structurelle.

---

# 46. Suppression des données

Les suppressions en cascade ne seront pas utilisées automatiquement partout.

Exemple :

Une observation ne doit pas pouvoir entraîner accidentellement la suppression :

```text
Observation
   ↓
Event
   ↓
Alert
   ↓
Notification
```

Les règles `ON DELETE` seront choisies table par table.

---

# 47. Historisation

Les objets critiques doivent conserver leur historique.

Notamment :

* observations ;
* risques ;
* alertes ;
* simulations ;
* résultats ;
* analyses ;
* permissions ;
* configurations importantes.

L'historisation pourra être réalisée via des tables dédiées ou un mécanisme de versionnement adapté.

---

# 48. Versionnement optimiste

Les objets modifiables utiliseront une colonne :

```text
version INTEGER
```

Lors d'une modification :

```text
version actuelle = 5

UPDATE
version = 6
```

Une modification utilisant une ancienne version pourra être détectée.

---

# 49. Synchronisation et version

Exemple :

```text
Serveur
Observation version 5

        ↓ synchronisation

Client
Observation version 5

        ↓ modification offline

Client
Observation version 6

        ↓ upload

Serveur
version 5
        │
        └── conflit éventuel
```

La résolution sera gérée par le Sync Engine.

---

# 50. Provenance

Toute donnée importante doit pouvoir répondre à :

```text
D'où vient-elle ?
Quand a-t-elle été produite ?
Qui l'a produite ?
Avec quelle version ?
Avec quel modèle ?
À partir de quelles données ?
```

La provenance sera donc représentée par :

```text
Source
   ↓
Dataset
   ↓
Observation / Data Record
   ↓
Analysis / Calculation
   ↓
Risk / Result
   ↓
Report
```

---

# 51. Séparation observation / calcul

La base doit distinguer clairement :

```text
OBSERVATION
    ≠
CALCULATION
    ≠
PREDICTION
    ≠
SIMULATION
    ≠
AI ANALYSIS
```

Exemple :

Une hauteur d'eau mesurée sur le terrain est une **observation**.

Une profondeur calculée par le Flood Engine est un **résultat calculé**.

Une valeur estimée pour une période future est une **prévision**.

Une propagation obtenue à partir d'un scénario est une **simulation**.

Une interprétation produite par un modèle IA est une **analyse IA**.

Ces informations ne doivent pas être mélangées dans une même colonne générique sans indication de leur nature.

---

# 52. Données JSONB

JSONB sera utilisé lorsque la structure est réellement variable.

Exemples :

```text
metadata
parameters
assumptions
properties
attributes
model configuration
AI result
```

JSONB ne doit cependant pas remplacer les colonnes relationnelles pour les données :

* fréquemment recherchées ;
* fortement structurées ;
* soumises à des contraintes ;
* utilisées dans des jointures.

---

# 53. Géométries et SRID

Le SRID sera explicitement défini pour chaque géométrie.

La configuration exacte des SRID utilisés par IntelliFlood sera centralisée.

Exemple conceptuel :

```text
geometry(Point, SRID)
geometry(Polygon, SRID)
```

Les conversions entre systèmes de coordonnées seront réalisées explicitement.

---

# 54. Geometry ou Geography

Le choix sera effectué selon le contexte.

Pour les analyses locales ou régionales adaptées à un système projeté :

```text
geometry
```

sera privilégié.

Pour certaines données géographiques de grande étendue où le calcul sur une représentation géodésique est pertinent :

```text
geography
```

pourra être utilisé.

Le choix ne doit jamais être fait uniquement parce que `geography` semble plus simple.

---

# 55. Données raster

Les gros rasters ne seront pas automatiquement stockés entièrement dans les tables métier.

Le système pourra conserver :

```text
Dataset
   │
   └── raster_reference
```

avec les fichiers dans un stockage adapté.

Les traitements raster seront réalisés par le Geo/Data Engine.

---

# 56. Données volumineuses

Les éléments potentiellement volumineux comprennent :

* photos ;
* vidéos ;
* rasters ;
* modèles ;
* résultats de simulation ;
* fichiers importés ;
* exports.

Ils ne doivent pas être stockés directement dans les tables relationnelles lorsque cela dégrade l'architecture.

La base conserve principalement :

```text
metadata
reference
checksum
provenance
```

---

# 57. Migration

La structure de la base sera créée par migrations versionnées.

Exemple :

```text
migrations/
│
├── 001_initial_schema
├── 002_identity
├── 003_geography
├── 004_observations
├── 005_events
├── 006_risk
├── 007_alerts
├── 008_simulation
├── 009_intelligence
└── ...
```

Une migration doit être :

* reproductible ;
* traçable ;
* testable ;
* réversible lorsque possible.

---

# 58. Données de référence

Certaines valeurs seront gérées comme données de référence :

```text
profile
permission
observation_type
event_type
alert_level
alert_status
simulation_status
media_type
source_type
```

Elles ne doivent pas être dispersées arbitrairement dans le code.

---

# 59. Règle d'intégrité

La base garantit :

```text
Identité
   ↓
Relations
   ↓
Intégrité
   ↓
Cohérence
```

Mais elle ne doit pas devenir responsable de toute la logique métier.

Exemple :

La base peut empêcher :

```text
version < 1
```

mais le calcul complet d'un risque doit rester dans le Flood Engine.

---

# 60. Diagramme relationnel global

```text
                         ┌──────────────┐
                         │     USER     │
                         └──────┬───────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
              ▼                 ▼                 ▼
          PROFILE          OBSERVATION        ANALYSIS
              │                 │                 │
              ▼                 ▼                 ▼
        PERMISSION            MEDIA             REPORT


                         ┌──────────────┐
                         │     ZONE     │
                         └──────┬───────┘
                                │
        ┌──────────┬────────────┼───────────┬────────────┐
        ▼          ▼            ▼           ▼            ▼
   OBSERVATION   EVENT         RISK    VULNERABILITY  SCENARIO
                   │
                   ▼
                 ALERT
                   │
                   ▼
              NOTIFICATION

                         SCENARIO
                            │
                            ▼
                        SIMULATION
                            │
                            ▼
                          RESULT

SOURCE
   │
   ▼
DATASET
   │
   ▼
DATA RECORD

USER
   │
   ▼
SYNC OPERATION
   │
   ▼
SYNC CONFLICT

USER
   │
   ▼
AUDIT LOG
```

---

# 61. Principe de traçabilité complète

Pour une donnée critique, IntelliFlood doit pouvoir reconstruire le chemin :

```text
SOURCE
  ↓
DATASET
  ↓
OBSERVATION
  ↓
EVENT
  ↓
ANALYSIS / CALCULATION
  ↓
RISK
  ↓
ALERT
  ↓
NOTIFICATION
  ↓
ACTION HUMAINE
```

Pour une simulation :

```text
DATA
 ↓
SCENARIO
 ↓
MODEL VERSION
 ↓
SIMULATION
 ↓
RESULT
 ↓
ANALYSIS
 ↓
REPORT
```

---

# 62. Règles pour les futurs développeurs

Un développeur ou agent de code ne doit pas :

* créer une table sans identifier son domaine ;
* stocker une géométrie sous forme de texte sans justification ;
* stocker une photo directement dans une table métier sans nécessité ;
* supprimer une donnée critique pour simplifier une requête ;
* supprimer une colonne version sans analyse de synchronisation ;
* contourner une clé étrangère ;
* utiliser JSONB pour éviter une modélisation relationnelle nécessaire ;
* créer des relations implicites impossibles à tracer ;
* mélanger observation et résultat calculé.

---

# 63. Critères de validation

Le schéma sera considéré comme acceptable lorsque :

* toutes les entités principales du domaine sont représentées ;
* les relations principales sont représentées ;
* les données géospatiales sont correctement typées ;
* les index spatiaux sont définis ;
* les index temporels importants sont définis ;
* les clés étrangères sont définies ;
* les contraintes importantes sont définies ;
* la provenance est conservée ;
* la synchronisation est représentée ;
* le versionnement est représenté ;
* l'audit est représenté ;
* les migrations sont prévues ;
* la séparation observation/calcul/simulation/IA est respectée.

---

# 64. État

Le modèle PostgreSQL/PostGIS est maintenant défini au niveau logique détaillé.

Il reste avant implémentation à définir précisément :

1. les SRID définitifs ;
2. les valeurs exactes des enums/référentiels ;
3. les index définitifs ;
4. les règles exactes de suppression ;
5. les stratégies d'historisation ;
6. les migrations ;
7. les repositories ;
8. les contrats API correspondant aux entités.

Ces éléments seront traités dans les documents techniques suivants.

---

# 65. Prochaine étape

La prochaine étape sera :

**DOCUMENT028 — Architecture détaillée Offline-first & Synchronisation**

Ce document détaillera :

* le schéma IndexedDB ;
* les stores locaux ;
* les objets synchronisables ;
* la Sync Queue ;
* les états de synchronisation ;
* l'idempotence ;
* les versions ;
* la détection des conflits ;
* les stratégies de résolution ;
* les uploads de médias ;
* la reprise après coupure ;
* la synchronisation prioritaire ;
* le comportement sans réseau.

L'objectif sera de pouvoir ensuite implémenter le mode offline sans improvisation.
