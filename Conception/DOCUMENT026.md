# DOCUMENT026 — Architecture technique détaillée

**Projet : IntelliFlood**
**Type : Document de conception technique**
**Version : 1.0**
**Statut : Conception**

---

# 1. Objet

Ce document transforme les choix technologiques du DOCUMENT025 en une architecture technique concrète.

Il définit :

* la structure générale du dépôt ;
* les modules backend ;
* les modules frontend ;
* les responsabilités de chaque module ;
* les dépendances autorisées ;
* les interfaces entre modules ;
* les frontières des moteurs ;
* l'accès aux données ;
* l'architecture offline ;
* l'architecture de synchronisation ;
* l'exécution des tâches lourdes ;
* les règles destinées aux futurs développeurs et agents de code.

Ce document ne définit pas encore l'implémentation détaillée de chaque fonctionnalité.

---

# 2. Principe architectural central

IntelliFlood sera construit comme un **modular monolith** dans sa première version.

Cela signifie :

```text
                    INTELLIFLOOD
                         │
              ┌──────────┴──────────┐
              │                     │
          FRONTEND               BACKEND
              │                     │
              │              ┌──────┴──────┐
              │              │             │
              │           Modules       Workers
              │              │             │
              │              └──────┬──────┘
              │                     │
              └─────────────────────┘
```

Il ne sera pas initialement découpé en dizaines de microservices.

---

# 3. Pourquoi un modular monolith ?

Le projet possède de nombreux domaines fonctionnels.

Cependant, les séparer immédiatement en microservices créerait inutilement :

* plusieurs déploiements ;
* plusieurs bases ;
* davantage de réseau ;
* davantage de configuration ;
* davantage de problèmes de synchronisation ;
* davantage de maintenance ;
* une complexité importante pour le développement initial.

Le modular monolith permet de conserver des frontières claires tout en gardant une infrastructure relativement simple.

---

# 4. Règle fondamentale

Un module doit avoir :

1. une responsabilité clairement définie ;
2. ses propres modèles métier ;
3. ses propres services ;
4. ses propres règles ;
5. des interfaces explicites avec les autres modules.

Un module ne doit pas accéder directement aux détails internes d'un autre module.

---

# 5. Architecture globale

```text
┌─────────────────────────────────────────────────────────┐
│                     UTILISATEURS                        │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                      FRONTEND                           │
│                                                         │
│ React + TypeScript + Vite                              │
│                                                         │
│ UI / Map / Cockpit / Forms / Offline / Notifications  │
└───────────────────────────┬─────────────────────────────┘
                            │
                         HTTP/API
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                      APPLICATION                        │
│                                                         │
│ Auth │ Permissions │ Workflows │ API │ Reports         │
└───────────────────────────┬─────────────────────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
          ▼                 ▼                 ▼
┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│ World Engine   │ │ Flood Engine   │ │ Intelligence   │
│                │ │                │ │ Engine         │
└───────┬────────┘ └───────┬────────┘ └───────┬────────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           ▼
                  ┌─────────────────┐
                  │ Geo/Data Engine │
                  └────────┬────────┘
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
       PostgreSQL       PostGIS      File Storage

                           ▲
                           │
                  ┌────────┴────────┐
                  │ Offline / Sync  │
                  └─────────────────┘
```

---

# 6. Structure générale du dépôt

La structure initiale sera organisée ainsi :

```text
intelliflood/
│
├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── shared/
│   ├── contracts/
│   └── geo/
│
├── workers/
│
├── infrastructure/
│
├── data/
│
├── docs/
│
├── tests/
│
└── scripts/
```

---

# 7. Application Web

```text
apps/web/
│
├── src/
│   │
│   ├── app/
│   │
│   ├── components/
│   │
│   ├── features/
│   │
│   ├── engines/
│   │
│   ├── services/
│   │
│   ├── offline/
│   │
│   ├── maps/
│   │
│   ├── stores/
│   │
│   ├── hooks/
│   │
│   ├── types/
│   │
│   └── utils/
│
├── public/
│
└── tests/
```

---

# 8. Organisation frontend par fonctionnalité

Le frontend ne doit pas être organisé uniquement par type de fichier.

On privilégiera également l'organisation fonctionnelle :

```text
features/
│
├── authentication/
├── map/
├── observations/
├── events/
├── alerts/
├── risks/
├── scenarios/
├── simulations/
├── reports/
├── intelligence/
├── users/
└── administration/
```

Chaque fonctionnalité pourra contenir :

```text
feature/
├── components/
├── hooks/
├── services/
├── types/
└── tests/
```

---

# 9. World Engine frontend

Le World Engine sera responsable de la représentation du territoire.

```text
engines/world/
│
├── map/
├── layers/
├── terrain/
├── objects/
├── tracks/
├── timeline/
├── annotations/
├── visualization/
└── selection/
```

Il ne doit pas contenir :

* les calculs hydrologiques ;
* les règles de risque ;
* les décisions d'alerte ;
* les calculs de propagation.

---

# 10. Flood Engine

Le Flood Engine constitue le cœur scientifique d'IntelliFlood.

```text
flood/
│
├── rainfall/
├── water_level/
├── hydrology/
├── terrain/
├── drainage/
├── flood_zones/
├── propagation/
├── risk/
├── vulnerability/
├── scenarios/
├── simulation/
└── results/
```

Chaque sous-module doit rester testable indépendamment.

---

# 11. Intelligence Engine

L'Intelligence Engine sera une couche d'orchestration.

```text
intelligence/
│
├── assistant/
├── models/
├── vision/
├── analysis/
├── rag/
├── knowledge/
├── tools/
├── prompts/
├── reports/
└── provenance/
```

---

# 12. Règle importante concernant l'IA

L'Intelligence Engine peut appeler les autres modules.

Exemple :

```text
Utilisateur
     │
     ▼
Assistant IA
     │
     ├──→ outil "obtenir_zone"
     │
     ├──→ outil "calculer_risque"
     │
     ├──→ outil "chercher_document"
     │
     └──→ outil "analyser_observation"
```

Mais l'IA ne doit pas contourner les règles métier.

---

# 13. Exemple d'interaction interdite

Il serait incorrect de permettre à un LLM de modifier directement la base :

```text
LLM
 │
 └──────→ PostgreSQL
```

L'architecture correcte est :

```text
LLM
 │
 ▼
Tool
 │
 ▼
Application Service
 │
 ▼
Domain Logic
 │
 ▼
Repository
 │
 ▼
PostgreSQL
```

---

# 14. Geo/Data Engine

Ce module fournit les capacités communes de données géospatiales et temporelles.

```text
geo/
│
├── geometry/
├── coordinates/
├── spatial_queries/
├── temporal_queries/
├── raster/
├── vector/
├── transformations/
├── provenance/
└── repositories/
```

---

# 15. Repository Pattern

Les moteurs ne doivent pas connaître directement les détails de PostgreSQL.

Exemple conceptuel :

```text
Flood Engine
     │
     ▼
ObservationRepository
     │
     ▼
Interface Repository
     │
     ▼
PostgreSQL Adapter
     │
     ▼
PostGIS
```

Ainsi, le moteur dépend d'une abstraction plutôt que du SGBD.

---

# 16. Avantage

Cette architecture permet de tester le Flood Engine avec une fausse base :

```text
Flood Engine
     │
     ▼
FakeRepository
     │
     ▼
Données de test
```

sans démarrer PostgreSQL.

---

# 17. Couche domaine

Le domaine contiendra les concepts fondamentaux :

```text
User
Profile
Permission

Zone
GeoObject

Observation
Media
Source
Data

Event
Risk
Vulnerability

Alert
Notification

Scenario
Simulation
Result

Analysis
Report

Annotation

SyncOperation
SyncConflict
```

Ces objets ne doivent dépendre :

* ni de FastAPI ;
* ni de React ;
* ni de PostgreSQL ;
* ni de PostGIS ;
* ni d'un fournisseur IA.

---

# 18. Couche application

La couche application orchestre les cas d'utilisation.

Exemple :

```text
CreateObservation
     │
     ├── vérifier utilisateur
     ├── vérifier permissions
     ├── valider données
     ├── créer Observation
     ├── enregistrer Media
     ├── enregistrer provenance
     └── déclencher événements nécessaires
```

Elle coordonne le domaine sans devenir elle-même un gigantesque bloc métier.

---

# 19. Couche infrastructure

La couche infrastructure contient les implémentations techniques.

```text
infrastructure/
│
├── database/
├── repositories/
├── storage/
├── queues/
├── authentication/
├── external_sources/
├── ai/
├── notifications/
└── logging/
```

---

# 20. API

L'API sera une façade du système.

```text
Client
  │
  ▼
API Router
  │
  ▼
Application Service
  │
  ▼
Domain
  │
  ▼
Infrastructure
```

L'API ne doit pas contenir toute la logique métier.

---

# 21. Organisation des routes

Exemple :

```text
/api/v1/
│
├── /auth
├── /users
├── /zones
├── /objects
├── /observations
├── /events
├── /risks
├── /alerts
├── /scenarios
├── /simulations
├── /results
├── /reports
├── /analyses
└── /sync
```

---

# 22. Versionnement API

Les routes publiques seront versionnées :

```text
/api/v1/
```

Une évolution majeure pourra ensuite utiliser :

```text
/api/v2/
```

L'objectif est de pouvoir faire évoluer l'API sans casser immédiatement les clients existants.

---

# 23. Contrats

Les échanges entre frontend et backend utiliseront des contrats explicitement définis.

```text
Frontend
   │
   │ Request Contract
   ▼
FastAPI
   │
   │ Response Contract
   ▼
Frontend
```

Les contrats pourront être générés/documentés via OpenAPI.

---

# 24. Modèle de données

La base sera divisée conceptuellement en domaines.

```text
DATABASE
│
├── identity
├── geography
├── observations
├── events
├── risk
├── alerts
├── simulation
├── intelligence
├── reports
├── synchronization
└── audit
```

Le découpage physique exact des schémas PostgreSQL sera déterminé lors de la conception détaillée de la base.

---

# 25. Médias

Les photos et autres fichiers volumineux ne seront pas directement stockés comme données relationnelles principales.

Architecture :

```text
Observation
     │
     └── Media metadata
              │
              ▼
        Object Storage
              │
        ┌─────┴─────┐
        │           │
       S3       MinIO/local
```

Le stockage objet restera interchangeable.

---

# 26. Offline

Le client possède son propre espace local :

```text
Browser
 │
 ├── Application
 │
 ├── IndexedDB
 │     ├── observations
 │     ├── media metadata
 │     ├── sync operations
 │     └── cached data
 │
 └── Service Worker
```

---

# 27. File de synchronisation

Chaque modification offline importante génère une opération.

Exemple :

```text
CREATE Observation
       │
       ▼
SyncOperation
       │
   PENDING
       │
       ▼
    Queue
       │
       ▼
   PROCESSING
       │
       ▼
    SYNCED
```

En cas de problème :

```text
PROCESSING
    │
    ▼
  FAILED
    │
    ▼
  RETRY
```

---

# 28. Conflits

Un conflit doit être détecté et traité explicitement.

```text
Client A
   │
   ├── modification
   │
   ▼
Serveur
   ▲
   │
   ├── modification différente
   │
Client B
```

Le système ne doit pas écraser silencieusement les données.

Les stratégies de résolution seront définies selon le type d'objet.

---

# 29. Workers

Les opérations longues seront séparées de l'API synchrone.

```text
API
 │
 ├── réponse rapide
 │
 └── création Job
          │
          ▼
        Queue
          │
          ▼
        Worker
          │
          ├── Simulation
          ├── IA
          ├── Raster
          └── Rapport
```

---

# 30. Simulation

Une simulation suivra le flux :

```text
Scenario
   │
   ▼
Validation
   │
   ▼
Job
   │
   ▼
Queue
   │
   ▼
Worker
   │
   ▼
Flood Engine
   │
   ▼
Simulation Result
   │
   ▼
Geo/Data
   │
   ▼
World Engine
```

---

# 31. État d'une simulation

```text
CREATED
   ↓
CONFIGURED
   ↓
VALIDATED
   ↓
QUEUED
   ↓
RUNNING
   ├──────────────→ FAILED
   ↓
COMPLETED
```

---

# 32. Événements

Les événements du système seront distincts des alertes.

```text
Observation
     │
     ▼
Event
     │
     ▼
Rule Engine
     │
     ▼
Alert
     │
     ▼
Notification
```

---

# 33. Sécurité

La sécurité sera appliquée à plusieurs niveaux :

```text
Utilisateur
    │
    ▼
Authentification
    │
    ▼
Autorisation
    │
    ▼
Permission
    │
    ▼
Application Service
    │
    ▼
Domaine
    │
    ▼
Données
```

Aucune interface ne doit être considérée comme une frontière de sécurité suffisante.

---

# 34. Dépendances autorisées

Une règle stricte sera appliquée.

```text
Interface
    ↓
Application
    ↓
Domain
    ↑
Infrastructure
```

Le domaine ne doit pas dépendre des frameworks.

---

# 35. Dépendances interdites

Exemples :

```text
❌ Domain → FastAPI

❌ Domain → PostgreSQL

❌ Domain → React

❌ Flood Engine → composant UI

❌ LLM → PostgreSQL direct

❌ UI → règles hydrologiques complexes
```

---

# 36. Dépendances acceptées

```text
Frontend
   ↓
API

Application
   ↓
Domain

Infrastructure
   ↓
Domain interfaces

Workers
   ↓
Application / Domain

Flood Engine
   ↓
Geo/Data abstractions
```

---

# 37. Architecture des tests

Chaque couche pourra être testée séparément.

```text
Domain
  │
  └── Unit Tests

Application
  │
  └── Application Tests

Infrastructure
  │
  └── Integration Tests

API
  │
  └── API Tests

Frontend
  │
  └── Component Tests

Système
  │
  └── E2E Tests
```

---

# 38. Tests du Flood Engine

Les tests devront notamment vérifier :

* calculs ;
* unités ;
* géométries ;
* conversions ;
* propagation ;
* scénarios ;
* résultats ;
* cas limites ;
* données manquantes ;
* reproductibilité.

---

# 39. Tests de l'Intelligence Engine

Les tests ne doivent pas seulement demander :

> « Est-ce que l'IA répond bien ? »

Ils doivent également vérifier :

* quelles données ont été utilisées ;
* quelles sources ont été consultées ;
* quels outils ont été appelés ;
* quelles permissions étaient disponibles ;
* quelle version du modèle a été utilisée ;
* si l'analyse est traçable ;
* si l'IA peut être interrompue ;
* si elle respecte les limites du système.

---

# 40. Observabilité

Le système devra produire des informations permettant de comprendre son fonctionnement.

```text
Application
    │
    ├── Logs
    ├── Metrics
    ├── Errors
    ├── Audit
    └── Job Status
```

Les logs ne doivent pas exposer inutilement :

* mots de passe ;
* tokens ;
* données sensibles ;
* secrets ;
* informations privées.

---

# 41. Configuration

Les paramètres techniques ne doivent pas être codés en dur.

Exemple :

```text
Configuration
│
├── Database URL
├── Storage URL
├── Queue URL
├── Authentication
├── AI Model
├── Map configuration
└── Environment
```

Les secrets seront fournis par l'environnement de déploiement.

---

# 42. Environnements

Au minimum :

```text
development
     ↓
test
     ↓
staging
     ↓
production
```

Chaque environnement possède sa propre configuration.

---

# 43. Règle pour les agents de code

Un agent de code ne doit jamais :

1. créer arbitrairement un nouveau framework ;
2. modifier l'architecture sans justification ;
3. créer un nouveau module qui duplique un module existant ;
4. placer du métier dans l'interface ;
5. placer du métier critique dans l'IA ;
6. accéder directement à la base depuis l'interface ;
7. introduire une API payante sans validation ;
8. supprimer une abstraction uniquement pour gagner quelques lignes ;
9. modifier les contrats publics sans analyse d'impact ;
10. ajouter une fonctionnalité non prévue sans la documenter.

---

# 44. Format d'une tâche destinée à un agent

Chaque tâche future devra suivre ce modèle :

```text
TASK-ID

Objectif :
...

Contexte :
...

Documents à consulter :
- DOCUMENT001
- DOCUMENT003
- DOCUMENT007
- DOCUMENT009
- DOCUMENT026

Composants concernés :
...

Entrées :
...

Sorties :
...

Contraintes :
...

Tests attendus :
...

Critères d'acceptation :
...

Ne pas modifier :
...
```

---

# 45. Exemple

```text
TASK-OBS-001

Objectif :
Implémenter la création d'une observation.

Documents :
DOCUMENT003
DOCUMENT007
DOCUMENT015
DOCUMENT019
DOCUMENT026

Composants :
Observation Domain
Observation Application Service
Observation API
Observation UI

Contraintes :
- respecter les permissions ;
- supporter la localisation ;
- supporter les médias ;
- fonctionner offline ;
- générer une SyncOperation si nécessaire.

Tests :
- observation valide ;
- observation invalide ;
- utilisateur non autorisé ;
- mode offline ;
- synchronisation.
```

---

# 46. Architecture finale de référence

```text
                         INTELLIFLOOD
                              │
          ┌───────────────────┴───────────────────┐
          │                                       │
       FRONTEND                                BACKEND
          │                                       │
   React / TypeScript                         FastAPI
          │                                       │
   ┌──────┼──────┐                ┌──────────────┼──────────────┐
   │      │      │                │              │              │
  2D     3D    Offline        Application    Engines       Workers
   │      │      │                │              │              │
MapLibre Cesium IndexedDB         │       ┌──────┼──────┐       │
                     │            │       │      │      │       │
                  Dexie       Domain    World  Flood  AI     Jobs
                     │                    │      │      │       │
                Sync Engine               └──────┼──────┘       │
                                                │              │
                                           Geo/Data            │
                                                │              │
                                      ┌─────────┴─────────┐    │
                                      │                   │    │
                                PostgreSQL             PostGIS │
                                      │                        │
                                      └──────────┬─────────────┘
                                                 │
                                           File Storage
```

---

# 47. Principe de stabilité

Une fois cette architecture validée, les futures implémentations devront respecter les frontières définies ici.

Une modification architecturale importante devra être documentée sous forme d'une décision d'architecture.

Exemple :

```text
ADR-XXX

Problème
↓
Options
↓
Analyse
↓
Décision
↓
Conséquences
```

---

# 48. État du projet après DOCUMENT026

```text
CONCEPTION
    │
    ├── Vision                         ✓
    ├── Parties prenantes             ✓
    ├── Exigences                     ✓
    ├── Cas d'utilisation             ✓
    ├── Activités                     ✓
    ├── Séquences                     ✓
    ├── Domaine / Classes             ✓
    ├── Données                       ✓
    ├── Architecture                  ✓
    ├── Géospatial                    ✓
    ├── Offline                       ✓
    ├── World Engine                  ✓
    ├── Flood Engine                  ✓
    ├── Intelligence Engine           ✓
    ├── Interfaces                    ✓
    ├── Sécurité                      ✓
    ├── Alertes                       ✓
    ├── Simulation                    ✓
    ├── API                           ✓
    ├── Déploiement                   ✓
    ├── Tests                         ✓
    ├── Traçabilité                   ✓
    ├── Implémentation                ✓
    ├── Livraison                     ✓
    ├── Choix technologiques          ✓
    └── Architecture technique        ✓
```

---

# 49. Prochaine étape

La prochaine étape sera la conception détaillée de la base :

**DOCUMENT027 — Schéma détaillé PostgreSQL/PostGIS.**

Il définira notamment :

* les tables ;
* les colonnes ;
* les types ;
* les clés primaires ;
* les clés étrangères ;
* les cardinalités ;
* les index ;
* les contraintes ;
* les données géospatiales ;
* les timestamps ;
* les versions ;
* l'audit ;
* la synchronisation ;
* les migrations ;
* les règles d'intégrité.

À ce stade, nous pourrons commencer à avoir une représentation suffisamment précise du système pour préparer ensuite les premiers fichiers de code.


---

## Complément — intégration indépendante des fournisseurs (29 octobre 2026)

La structure modulaire doit isoler les adaptateurs de données externes des services métier. Les connecteurs météo, IoT, API de fabricants et passerelles doivent traduire les données reçues vers des contrats internes normalisés, sans faire dépendre les modules Flood, World ou Alert d'un fournisseur particulier. Les connecteurs sont sélectionnés en fonction des appareils et sources réellement retenus ; les protocoles HTTPS/MQTT, API, webhooks et passerelles sont des voies possibles, non une liste de fonctions déjà implémentées.

Le système doit préserver le globe terrestre complet hérité de God’s Eye View et permettre une analyse nationale de la Côte d'Ivoire. Le pilote Cocody n'est qu'un cas de déploiement initial possible, pas une constante d'architecture ni un filtre spatial global.
