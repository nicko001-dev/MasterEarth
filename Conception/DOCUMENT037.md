# DOCUMENT037 — MODÈLE DE DONNÉES PHYSIQUE INTELLIFLOOD

**Projet : IntelliFlood**
**Phase : Conception technique**
**Statut : Modèle physique V1**
**Version : 1.0**

---

# 1. OBJECTIF

DOCUMENT037 transforme le modèle conceptuel d'IntelliFlood en modèle de données physique.

Il définit :

* les principales entités ;
* les relations ;
* les identifiants ;
* les données géospatiales ;
* le multi-tenant ;
* les versions ;
* les données offline ;
* la synchronisation ;
* les audits ;
* les index ;
* les contraintes d'intégrité.

---

# 2. ⚠️ RÈGLE SUR LES EXEMPLES

> ⚠️ **EXEMPLES NON EXHAUSTIFS**
>
> Les tables, colonnes, relations et valeurs présentées dans ce document constituent le modèle V1 et les exemples d'illustration associés.
>
> Lorsqu'un élément est explicitement marqué comme **EXEMPLE**, il ne constitue pas une liste exhaustive.
>
> L'agent de développement ne doit jamais interpréter un exemple comme la totalité des données nécessaires au système.

---

# 3. SGBD

Le SGBD retenu est :

**PostgreSQL + PostGIS**

Pourquoi :

* transactions robustes ;
* contraintes relationnelles ;
* indexation ;
* JSON ;
* extensions ;
* support géospatial ;
* intégration avec Python ;
* compatibilité avec une architecture auto-hébergée.

---

# 4. IDENTIFIANTS

Les entités distribuées entre plusieurs clients doivent utiliser des identifiants adaptés à l'offline.

La stratégie privilégiée est :

**UUID**

Ainsi, un appareil peut créer une entité sans attendre qu'un serveur lui attribue un ID.

```text
Client A
   │
   └── UUID-1

Client B
   │
   └── UUID-2

        ↓

      SERVER
```

Le risque de collision est extrêmement faible.

---

# 5. MULTI-TENANCY

Le modèle doit permettre plusieurs organisations.

Architecture :

```text
Organization
     │
 ┌───┼─────────────┐
 ▼   ▼             ▼
Users Data       Config
```

Les ressources concernées doivent pouvoir être associées à une organisation.

---

# 6. ORGANIZATION

Table logique :

```text
organizations
```

Champs principaux :

```text
id
name
slug
status
created_at
updated_at
```

> La liste exacte des colonnes sera finalisée lors de la génération des migrations SQL.

---

# 7. USERS

Table :

```text
users
```

Conceptuellement :

```text
users
│
├── id
├── organization_id
├── email
├── password_hash / identity_reference
├── status
├── created_at
└── updated_at
```

Les informations d'identité sensibles doivent être protégées.

---

# 8. ROLES ET PERMISSIONS

Le système d'autorisation doit être séparé des utilisateurs.

Architecture :

```text
User
 │
 ▼
Role
 │
 ▼
Permission
 │
 ▼
Resource
```

> EXEMPLES NON EXHAUSTIFS : création d'observation, consultation d'alerte, gestion d'organisation, etc.

Les permissions exactes seront définies par le système d'autorisation.

---

# 9. LOCATIONS

Une entité de localisation générique peut représenter un emplacement important du système.

Elle peut contenir :

```text
id
organization_id
name
geometry
altitude
metadata
created_at
updated_at
```

La géométrie exacte dépend du type de localisation.

---

# 10. OBSERVATIONS

L'observation est une entité fondamentale.

Conceptuellement :

```text
Observation
│
├── Who?
├── Where?
├── When?
├── What?
├── Value?
├── Source?
└── Quality?
```

Une observation peut être associée à :

* un utilisateur ;
* une localisation ;
* une source ;
* une mesure ;
* un média ;
* un événement.

> EXEMPLES NON EXHAUSTIFS.

---

# 11. PROVENANCE

Chaque donnée importante doit permettre de connaître son origine.

Concept :

```text
Data
 │
 ▼
Source
 │
 ├── Manual
 ├── Sensor
 ├── Import
 ├── External Dataset
 ├── Calculation
 └── Simulation
```

> EXEMPLES NON EXHAUSTIFS.

La provenance est essentielle pour l'Intelligence Engine.

---

# 12. MEASUREMENTS

Les mesures quantitatives peuvent être représentées par une structure spécialisée.

Concept :

```text
Measurement
│
├── parameter
├── value
├── unit
├── timestamp
├── location
├── source
└── quality
```

Exemples :

> EXEMPLES UNIQUEMENT : hauteur d'eau, température, débit.

La liste réelle des paramètres ne doit pas être limitée à ces exemples.

---

# 13. SENSORS

Les capteurs constituent une source possible de données.

```text
Sensor
 │
 ├── identity
 ├── type
 ├── location
 ├── status
 └── metadata
```

Un capteur peut produire plusieurs mesures.

```text
Sensor
   │
   ├── Measurement
   ├── Measurement
   └── Measurement
```

---

# 14. FLOOD EVENTS

Un événement d'inondation représente un événement métier.

Concept :

```text
FloodEvent
│
├── location / geometry
├── start
├── end
├── severity
├── source
├── status
└── evidence
```

> EXEMPLES NON EXHAUSTIFS.

---

# 15. FLOOD ZONES

Une zone d'inondation représente une emprise géographique.

```text
FloodZone
     │
     ▼
Polygon / MultiPolygon
```

Elle peut être associée à :

* un événement ;
* une simulation ;
* une observation ;
* une période temporelle.

---

# 16. ALERTS

Une alerte constitue une entité métier distincte.

```text
Alert
│
├── type
├── severity
├── status
├── geometry
├── created_at
├── expires_at
└── source
```

Une alerte peut être produite par :

* un utilisateur ;
* une règle ;
* un moteur ;
* un système externe.

> EXEMPLES NON EXHAUSTIFS.

---

# 17. SIMULATIONS

La simulation doit rester distincte des observations réelles.

```text
Simulation
│
├── Scenario
├── Input Data
├── Parameters
├── Result
├── Time
└── Provenance
```

Principe :

```text
Observation
     ≠
Simulation
```

---

# 18. SCENARIOS

Un scénario représente un ensemble de conditions utilisé pour une simulation.

Concept :

```text
Scenario
   │
   ├── configuration
   ├── parameters
   ├── assumptions
   └── metadata
```

Les hypothèses doivent être conservées afin de rendre les résultats interprétables.

---

# 19. WORLD OBJECTS

Le World Engine peut manipuler plusieurs types d'objets géographiques.

Architecture :

```text
WorldObject
│
├── geometry
├── type
├── attributes
├── source
├── temporal state
└── metadata
```

> EXEMPLES NON EXHAUSTIFS : bâtiments, routes, zones, infrastructures, cours d'eau.

Le modèle exact dépendra du catalogue géospatial final.

---

# 20. GEOMETRIES

PostGIS sera utilisé pour les données spatiales.

Types possibles :

```text
POINT
LINESTRING
POLYGON
MULTIPOINT
MULTILINESTRING
MULTIPOLYGON
```

> EXEMPLES DE TYPES SUPPORTÉS, NON LISTE DES SEULES GÉOMÉTRIES À UTILISER.

Les systèmes de coordonnées devront être explicitement définis.

---

# 21. INDEX GÉOSPATIAUX

Les données géographiques importantes devront utiliser des index spatiaux adaptés.

Objectif :

```text
Spatial Query
      ↓
Spatial Index
      ↓
Fast Result
```

Le choix exact des index sera confirmé lors de l'optimisation SQL.

---

# 22. MEDIA

Les médias sont séparés des données métier principales.

Architecture :

```text
Media
 │
 ├── id
 ├── owner
 ├── entity_type
 ├── entity_id
 ├── storage_key
 ├── mime_type
 ├── size
 ├── hash
 └── metadata
```

Le fichier réel est stocké dans l'object storage.

---

# 23. AUDIT LOG

Les opérations sensibles doivent être traçables.

```text
AuditLog
│
├── actor
├── action
├── resource
├── resource_id
├── timestamp
├── metadata
└── result
```

L'audit log ne doit pas contenir inutilement de secrets.

---

# 24. VERSIONING

Les entités synchronisables doivent disposer d'informations permettant de détecter les conflits.

Concept :

```text
Entity
│
├── version
├── updated_at
└── updated_by
```

Selon les besoins, des informations supplémentaires pourront être nécessaires.

---

# 25. SYNCHRONISATION

Le système de synchronisation doit posséder ses propres données techniques.

Architecture :

```text
SyncOperation
│
├── operation_id
├── device_id
├── entity_id
├── entity_type
├── operation
├── version
├── timestamp
├── payload
└── status
```

> Cette structure est illustrative. Le modèle physique définitif devra tenir compte des contraintes de sécurité et de performance.

---

# 26. DEVICES

Les appareils clients doivent pouvoir être identifiés.

```text
Device
│
├── id
├── user_id
├── organization_id
├── type
├── status
├── last_seen
└── metadata
```

Cela permet notamment de gérer :

* synchronisation ;
* révocation ;
* diagnostic ;
* traçabilité.

---

# 27. SYNC CURSORS

Le serveur doit pouvoir permettre aux clients de récupérer les changements depuis un point donné.

Concept :

```text
Client
 │
 │ cursor = X
 ▼
Server
 │
 ▼
Changes after X
 │
 ▼
new cursor
```

Le curseur doit être opaque pour le client lorsque possible.

---

# 28. RELATIONS PRINCIPALES

Vue simplifiée :

```text
Organization
 │
 ├────────────── Users
 │                  │
 │                  └──── Devices
 │
 ├────────────── Observations
 │                    │
 │                    ├──── Media
 │                    └──── Measurements
 │
 ├────────────── Flood Events
 │                    │
 │                    └──── Flood Zones
 │
 ├────────────── Alerts
 │
 ├────────────── Sensors
 │                    │
 │                    └──── Measurements
 │
 └────────────── Simulations
                       │
                       └──── Scenarios
```

---

# 29. RELATION ENTRE DONNÉES RÉELLES ET SIMULÉES

Le modèle doit empêcher une confusion conceptuelle.

```text
                 DATA
                   │
          ┌────────┴────────┐
          ▼                 ▼
       REAL                MODEL
          │                 │
          ▼                 ▼
 Observation           Simulation
 Measurement           Prediction
 Sensor Data           Scenario
```

Ces deux branches peuvent être comparées mais ne doivent pas être fusionnées sémantiquement.

---

# 30. TEMPORALITÉ

Les données IntelliFlood sont fortement temporelles.

Une entité importante peut nécessiter :

```text
created_at
updated_at
observed_at
valid_from
valid_until
```

Toutes ces colonnes ne sont pas obligatoires pour toutes les tables.

Elles doivent être utilisées selon la sémantique de l'entité.

---

# 31. SOFT DELETE

Certaines entités peuvent nécessiter une suppression logique.

Concept :

```text
deleted_at
```

Cela peut être particulièrement utile pour la synchronisation.

Cependant, toutes les tables ne doivent pas automatiquement utiliser le soft delete.

La stratégie sera définie par entité.

---

# 32. INTÉGRITÉ

Les contraintes doivent être appliquées autant que possible au niveau de la base.

Exemples :

* foreign keys ;
* unique constraints ;
* not-null ;
* check constraints ;
* spatial validity ;
* référentiels.

> EXEMPLES NON EXHAUSTIFS.

---

# 33. INDEX

Les index doivent être créés en fonction des requêtes réelles.

Catégories possibles :

```text
B-tree
GiST
GIN
Partial Index
Composite Index
```

> EXEMPLES DE MÉCANISMES, NON LISTE OBLIGATOIRE.

Une indexation excessive doit être évitée.

---

# 34. JSONB

PostgreSQL JSONB peut être utilisé pour certaines métadonnées flexibles.

Cependant :

> les données métier importantes ne doivent pas être systématiquement placées dans JSONB.

Il faut conserver une structure relationnelle lorsque les données nécessitent :

* validation ;
* recherche ;
* relation ;
* intégrité ;
* indexation spécifique.

---

# 35. SÉCURITÉ DES DONNÉES

Les données doivent respecter :

```text
Tenant Isolation
+
Authorization
+
Encryption in Transit
+
Protected Secrets
+
Audit
```

Les données sensibles ne doivent pas être exposées inutilement aux clients.

---

# 36. POSTGIS ET WORLD ENGINE

La relation est :

```text
PostGIS
   │
   ▼
Geo/Data Engine
   │
   ▼
World Engine
   │
   ▼
Applications
```

PostGIS fournit les primitives géospatiales.

Le World Engine porte la logique métier de représentation du monde.

---

# 37. POSTGIS ET FLOOD ENGINE

```text
PostGIS
   │
   ├── geometry
   ├── spatial relation
   └── spatial query
          │
          ▼
     Flood Engine
          │
          ├── analysis
          ├── detection
          └── calculation
```

Le Flood Engine ne doit pas réimplémenter inutilement les primitives géospatiales de base.

---

# 38. DONNÉES DE L'INTELLIGENCE ENGINE

L'Intelligence Engine doit pouvoir accéder aux données pertinentes via des services contrôlés.

Il ne doit pas accéder directement à toutes les tables sans couche métier.

```text
AI
 │
 ▼
Tool
 │
 ▼
Application Service
 │
 ▼
Domain
 │
 ▼
Data
```

---

# 39. PROVENANCE ET CONFIANCE

Chaque résultat important devrait permettre de distinguer :

```text
FACT
CALCULATION
ESTIMATION
PREDICTION
SIMULATION
INTERPRETATION
```

> Cette liste correspond aux catégories conceptuelles définies précédemment ; elle pourra être étendue si nécessaire.

---

# 40. MIGRATIONS

La structure de base sera versionnée par migrations.

```text
Migration 001
      ↓
Migration 002
      ↓
Migration 003
      ↓
...
```

Une modification de schéma ne doit pas être effectuée manuellement uniquement sur une base de développement.

Elle doit être représentée par une migration versionnée.

---

# 41. SEEDS

Des données initiales pourront être créées par scripts contrôlés.

> EXEMPLES NON EXHAUSTIFS : rôles système, permissions initiales, configuration minimale.

Les données de démonstration doivent être clairement séparées des données de production.

---

# 42. MODÈLE SIMPLIFIÉ GLOBAL

```text
                         ORGANIZATION
                              │
              ┌───────────────┼────────────────┐
              │               │                │
              ▼               ▼                ▼
            USERS           DEVICES          DATA
              │                                │
              │                    ┌───────────┼───────────┐
              │                    │           │           │
              │                    ▼           ▼           ▼
              │               OBSERVATION   SENSOR     EVENTS
              │                    │           │           │
              │                    ▼           ▼           ▼
              │               MEASUREMENT  MEASUREMENT  FLOOD
              │                                                │
              │                                                ▼
              │                                             ZONES
              │
              └───────────────────────────────────────────────┐
                                                              │
                                                              ▼
                                                          ALERTS

                     SIMULATION
                         │
                         ▼
                     SCENARIO
```

---

# 43. RÈGLES CRITIQUES

Les règles suivantes sont obligatoires.

### DATA-001

Toute donnée métier importante doit avoir un propriétaire ou un contexte d'organisation clairement identifiable lorsque nécessaire.

### DATA-002

Les données géographiques doivent utiliser des types géospatiaux appropriés.

### DATA-003

Les entités offline doivent pouvoir être identifiées sans connexion serveur.

### DATA-004

Les conflits de synchronisation doivent être détectables.

### DATA-005

Les observations et simulations doivent rester sémantiquement distinctes.

### DATA-006

La provenance des données importantes doit être conservée.

### DATA-007

Les calculs ne doivent pas devenir des données "magiques" sans origine identifiable.

### DATA-008

Les suppressions synchronisées doivent être traçables lorsque nécessaire.

### DATA-009

Les données sensibles doivent être protégées par les mécanismes d'autorisation.

### DATA-010

Le schéma doit rester compatible avec les besoins du World Engine, Flood Engine, Geo/Data Engine et Intelligence Engine.

---

# 44. TABLES V1 À CONSTRUIRE

La liste suivante constitue la base du modèle physique.

> ⚠️ Elle représente les tables actuellement identifiées et **ne doit pas être interprétée comme une garantie qu'aucune table supplémentaire ne sera nécessaire**.

```text
organizations
users
roles
permissions
user_roles
role_permissions

devices

locations
observations
measurements
sensors

flood_events
flood_zones
alerts

world_objects

simulations
scenarios

media
data_sources
audit_logs

sync_operations
sync_cursors
```

---

# 45. PRIORITÉ DE CONSTRUCTION

Les tables doivent être construites progressivement.

```text
PHASE 1
Organizations
Users
Roles
Permissions
Devices

        ↓

PHASE 2
Locations
Observations
Measurements
Sources

        ↓

PHASE 3
Sensors
Flood Events
Flood Zones
Alerts

        ↓

PHASE 4
World Objects
Simulations
Scenarios

        ↓

PHASE 5
Media
Audit
Synchronization

        ↓

PHASE 6
Optimisation
Index
Partitionnement éventuel
```

---

# 46. CE QUI N'EST PAS ENCORE À FAIRE

À ce stade, il ne faut pas encore :

* générer toute la base automatiquement ;
* créer toutes les migrations ;
* créer toutes les tables sans validation ;
* inventer des colonnes arbitraires ;
* remplir la base avec des données fictives présentées comme réelles ;
* construire tout le backend.

Le prochain document doit transformer ce modèle en **contrats API précis**.

---

# 47. PROCHAINE ÉTAPE

Le prochain document logique est :

# DOCUMENT038 — CONTRATS API & MODÈLES D'ÉCHANGE V1

Il devra définir :

```text
Endpoint
   │
   ├── Method
   ├── Authentication
   ├── Authorization
   ├── Request
   ├── Validation
   ├── Business Logic
   ├── Response
   ├── Errors
   └── Synchronization
```

---

# 48. CONCLUSION

Le modèle de données V1 d'IntelliFlood établit une base cohérente pour :

* la collecte ;
* la géolocalisation ;
* les observations ;
* les mesures ;
* les capteurs ;
* les événements ;
* les alertes ;
* les simulations ;
* le World Engine ;
* l'Intelligence Engine ;
* le fonctionnement offline ;
* la synchronisation ;
* la sécurité ;
* l'audit.

La prochaine étape consiste à connecter ce modèle aux interfaces de communication du système.

**FIN DE DOCUMENT037**
