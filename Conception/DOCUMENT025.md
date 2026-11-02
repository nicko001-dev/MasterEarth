# DOCUMENT025 — Étude et choix technologiques

**Projet : IntelliFlood**
**Type : Document de conception technique**
**Statut : Validé pour préparation de l’implémentation**
**Version : 1.0**

---

## 1. Objet du document

Ce document définit les technologies retenues pour l’implémentation d’IntelliFlood.

Le choix technologique est effectué après :

* l’analyse fonctionnelle ;
* l’expression des exigences ;
* les cas d’utilisation ;
* les diagrammes UML ;
* le modèle de domaine ;
* le modèle de données ;
* l’architecture logicielle ;
* l’architecture géospatiale ;
* l’architecture offline-first ;
* l’architecture des moteurs ;
* la stratégie de tests ;
* la stratégie de déploiement.

L’objectif n’est pas de choisir les technologies les plus populaires, mais celles qui correspondent réellement aux contraintes d’IntelliFlood.

---

# 2. Principes de sélection

Les technologies doivent respecter autant que possible les principes suivants :

1. Open source.
2. Utilisables gratuitement.
3. Auto-hébergeables.
4. Compatibles avec un fonctionnement local.
5. Compatibles avec le mode offline.
6. Adaptées aux données géospatiales.
7. Adaptées aux données temporelles.
8. Adaptées aux simulations.
9. Adaptées à l'intelligence artificielle.
10. Interopérables.
11. Testables.
12. Maintenables.
13. Évolutives.
14. Compatibles avec une architecture modulaire.
15. Ne pas créer de dépendance obligatoire envers un fournisseur cloud ou une API propriétaire.

---

# 3. Stack technologique globale retenue

## 3.1 Vue générale

```text
                         INTELLIFLOOD
                              │
              ┌───────────────┴───────────────┐
              │                               │
          FRONTEND                         BACKEND
              │                               │
       React + TypeScript                 FastAPI
              │                               │
             Vite                    Application Layer
              │                               │
      ┌───────┴────────┐              ┌───────┴────────┐
      │                │              │                │
   MapLibre          Cesium       World Engine    Flood Engine
      │                │              │                │
      └───────┬────────┘              └───────┬────────┘
              │                               │
        World Engine                    Geo/Data Engine
              │                               │
              └───────────────┬───────────────┘
                              │
                        PostgreSQL
                              │
                           PostGIS
                              │
                 ┌────────────┴────────────┐
                 │                         │
             Données                  Fichiers
             spatiales                 médias
                 │                         │
                 └────────────┬────────────┘
                              │
                    Offline / Synchronisation
                              │
                    IndexedDB + Dexie.js
                              │
                    ┌─────────┴─────────┐
                    │                   │
                 Workers          Intelligence
                    │                   │
                 Celery             Python
                    │                   │
                 Valkey         PyTorch / modèles
```

---

# 4. Frontend

## 4.1 Technologie principale

### React + TypeScript

React sera utilisé pour construire l'interface utilisateur.

TypeScript sera utilisé comme langage principal du frontend.

### Raisons

IntelliFlood possède de nombreuses interfaces :

* carte ;
* cockpit ;
* formulaires ;
* observations ;
* alertes ;
* simulations ;
* tableaux ;
* graphiques ;
* gestion des utilisateurs ;
* administration ;
* assistant IA.

L'architecture composant de React correspond bien à ce type d'application.

---

# 5. Outil de construction frontend

## Vite

Vite sera utilisé pour construire et développer le frontend.

Architecture :

```text
React
  │
TypeScript
  │
Vite
  │
Application Web
  │
PWA
```

Vite permet notamment un environnement de développement rapide et une génération d’assets optimisés pour la production.

---

# 6. Cartographie 2D

## MapLibre GL JS

MapLibre GL JS sera utilisé comme moteur cartographique principal 2D.

Il permettra notamment :

* affichage de cartes ;
* couches vectorielles ;
* marqueurs ;
* zones ;
* routes ;
* bâtiments ;
* données dynamiques ;
* styles cartographiques ;
* interactions ;
* affichage GPU.

MapLibre fournit également un support du globe et de la visualisation 3D côté WebGL.

---

# 7. Globe et visualisation 3D

## CesiumJS

CesiumJS sera utilisé lorsque les besoins dépassent les capacités classiques d’une carte 2D.

Il sera principalement utilisé pour :

* globe 3D ;
* terrain ;
* bâtiments 3D ;
* trajectoires ;
* satellites ;
* aéronefs ;
* navires ;
* objets géospatiaux ;
* visualisations temporelles ;
* données 3D massives ;
* simulations géospatiales.

### Répartition

```text
Carte opérationnelle
        │
        ├── 2D → MapLibre
        │
        └── 3D / Globe → CesiumJS
```

CesiumJS est open source et conçu spécifiquement pour la visualisation géospatiale 3D dans le navigateur.

---

# 8. Backend

## FastAPI + Python

FastAPI sera utilisé comme framework backend principal.

Python sera le langage principal du backend.

### Raisons

IntelliFlood doit réunir :

* API ;
* géospatial ;
* hydrologie ;
* calcul scientifique ;
* simulation ;
* traitement de données ;
* intelligence artificielle ;
* vision par ordinateur ;
* automatisation ;
* génération de rapports.

Python permet de conserver ces domaines dans un même environnement technique.

FastAPI fournit également une génération automatique de documentation OpenAPI et une validation basée sur les annotations de types.

---

# 9. Architecture backend

Le backend ne sera pas construit comme un énorme fichier monolithique.

Il sera organisé en modules :

```text
backend/
│
├── authentication/
├── users/
├── permissions/
│
├── world/
│
├── flood/
│   ├── rainfall/
│   ├── hydrology/
│   ├── water_level/
│   ├── drainage/
│   ├── propagation/
│   ├── risk/
│   └── simulation/
│
├── geo/
├── observations/
├── events/
├── alerts/
├── notifications/
│
├── intelligence/
├── reports/
│
├── synchronization/
│
└── infrastructure/
```

---

# 10. Base de données

## PostgreSQL

PostgreSQL sera utilisé comme système de gestion de base de données principal.

Il stockera :

* utilisateurs ;
* profils ;
* permissions ;
* observations ;
* événements ;
* zones ;
* risques ;
* vulnérabilités ;
* scénarios ;
* simulations ;
* résultats ;
* analyses ;
* alertes ;
* notifications ;
* métadonnées ;
* historique ;
* synchronisation.

PostgreSQL est open source et possède les mécanismes nécessaires pour assurer l'intégrité relationnelle et transactionnelle.

---

# 11. Données géospatiales

## PostGIS

PostGIS sera utilisé comme extension géospatiale de PostgreSQL.

Il permettra de gérer :

* points ;
* lignes ;
* polygones ;
* multipolygones ;
* géométries ;
* systèmes de coordonnées ;
* index spatiaux ;
* requêtes spatiales ;
* intersections ;
* distances ;
* relations géométriques.

Architecture :

```text
PostgreSQL
     │
     └── PostGIS
           │
           ├── Geometry
           ├── Spatial Index
           ├── Spatial Query
           ├── CRS
           └── Geospatial Analysis
```

PostGIS est donc le composant central du Geo/Data Engine pour les données vectorielles et les requêtes spatiales.

---

# 12. Traitement géospatial Python

Les principales bibliothèques prévues sont :

* GeoPandas ;
* Shapely ;
* GDAL/OGR ;
* Rasterio ;
* NumPy.

### Rôle

```text
Données géospatiales
        │
        ├── PostGIS
        │
        ├── GeoPandas
        │
        ├── Shapely
        │
        ├── GDAL/OGR
        │
        └── Rasterio
```

GeoPandas sera particulièrement utile pour les traitements géospatiaux Python, tandis que GDAL/OGR permettra de travailler avec de nombreux formats géospatiaux.

---

# 13. Architecture Offline-first

L'application web doit continuer à fonctionner lorsque le réseau disparaît.

La technologie principale sera :

## IndexedDB

IndexedDB constituera le stockage local du navigateur.

Il contiendra notamment :

* observations locales ;
* métadonnées ;
* tâches à synchroniser ;
* données cartographiques mises en cache ;
* paramètres utilisateur ;
* états de synchronisation.

---

# 14. Couche de simplification IndexedDB

## Dexie.js

Dexie.js sera utilisé comme couche d'abstraction autour d'IndexedDB.

Architecture :

```text
React
  │
Offline Services
  │
Dexie.js
  │
IndexedDB
  │
Stockage local
```

Dexie.js permettra de simplifier :

* création des tables locales ;
* requêtes ;
* index ;
* transactions ;
* versionnement du schéma ;
* suivi des modifications.

---

# 15. PWA

IntelliFlood sera conçu comme une Progressive Web App.

La PWA permettra notamment :

* installation sur appareil ;
* fonctionnement offline ;
* cache des ressources ;
* stockage local ;
* synchronisation ultérieure ;
* expérience proche d'une application native.

Les Service Workers seront utilisés pour les mécanismes propres au fonctionnement offline et aux tâches en arrière-plan.

---

# 16. Synchronisation

Le système de synchronisation sera développé comme un module interne.

Il ne dépendra pas d'un fournisseur propriétaire.

Architecture :

```text
             SERVEUR
                │
        API de synchronisation
                │
        Sync Service
                │
       ┌────────┴────────┐
       │                 │
   PostgreSQL        File/Storage
       │
       │
════════════════════════════════
       RÉSEAU
════════════════════════════════
       │
       ▼
   Client local
       │
    Dexie.js
       │
   IndexedDB
       │
 Sync Queue
```

---

# 17. File de tâches

Certaines opérations seront trop lourdes pour être exécutées directement pendant une requête HTTP.

Exemples :

* simulation d'inondation ;
* génération de cartes complexes ;
* traitement d'images ;
* analyse IA ;
* génération de rapports ;
* import de gros jeux de données ;
* traitement raster.

Ces opérations seront envoyées à des workers.

---

# 18. Workers

## Celery

Celery sera étudié et utilisé comme système de tâches asynchrones côté Python.

Architecture :

```text
FastAPI
   │
   │ crée une tâche
   ▼
Queue
   │
   ▼
Worker Celery
   │
   ├── Simulation
   ├── IA
   ├── Raster
   ├── Analyse
   └── Rapport
```

L'objectif est de ne pas bloquer l'API pendant les opérations longues.

---

# 19. Broker / queue

## Valkey

Valkey sera privilégié comme infrastructure open source pour les besoins de :

* file de messages ;
* cache ;
* coordination ;
* tâches asynchrones ;
* données temporaires.

Le choix de Valkey permet de rester aligné avec la préférence du projet pour les technologies réellement open source et auto-hébergeables.

---

# 20. Intelligence artificielle

L'Intelligence Engine sera construit autour de Python.

Les technologies seront sélectionnées selon le type de tâche.

```text
                    Intelligence Engine
                           │
             ┌─────────────┼─────────────┐
             │             │             │
           NLP          Vision         Data/ML
             │             │             │
          LLM local    Computer       PyTorch
                       Vision
             │
       Modèles locaux
             │
          RAG
             │
      Knowledge Base
```

---

# 21. IA locale

Le système devra privilégier l'exécution locale lorsque le matériel le permet.

Les modèles pourront être exécutés via une couche interchangeable.

Exemple conceptuel :

```text
Intelligence Engine
        │
   Model Provider
        │
   ┌────┴─────┐
   │          │
 Local LLM   Autre moteur
   │
Ollama / runtime compatible
```

L'application ne devra donc pas dépendre structurellement d'un fournisseur particulier.

---

# 22. Machine Learning

## PyTorch

PyTorch sera la base privilégiée pour les modèles de machine learning nécessitant un framework complet.

Il pourra être utilisé pour :

* vision ;
* classification ;
* détection ;
* prédiction expérimentale ;
* modèles spécialisés ;
* entraînement ;
* inférence.

Les calculs critiques de l'Intelligence Engine ne devront toutefois pas remplacer les calculs déterministes du Flood Engine lorsque ceux-ci sont disponibles.

---

# 23. Règle fondamentale de l'IA

```text
                 INTELLIFLOOD
                      │
             Intelligence Engine
                      │
          ┌───────────┴───────────┐
          │                       │
     Analyse / IA          Outils déterministes
          │                       │
          │                       │
          ▼                       ▼
   interprétation          calculs géospatiaux
   classification          hydrologie
   assistance              simulation
   recherche               propagation
          │                       │
          └───────────┬───────────┘
                      │
                 Résultat
                      │
                 Utilisateur
```

L'IA ne doit pas être considérée comme une autorité absolue.

---

# 24. Séparation des responsabilités

La stack technologique doit préserver les séparations suivantes :

| Composant           | Responsabilité                       |
| ------------------- | ------------------------------------ |
| React               | Interface                            |
| MapLibre            | Cartographie 2D                      |
| CesiumJS            | Globe et 3D                          |
| FastAPI             | API et application                   |
| World Engine        | représentation du monde              |
| Flood Engine        | calculs hydrologiques et simulations |
| Intelligence Engine | analyse et assistance                |
| PostgreSQL          | données relationnelles               |
| PostGIS             | données géospatiales                 |
| IndexedDB           | données locales                      |
| Dexie.js            | accès au stockage local              |
| Celery              | tâches longues                       |
| Valkey              | infrastructure de tâches/cache       |
| PyTorch             | machine learning                     |
| GDAL                | traitement géospatial                |
| GeoPandas           | analyse géospatiale Python           |
| Shapely             | opérations géométriques              |

---

# 25. Architecture technique cible

```text
┌─────────────────────────────────────────────────────┐
│                    UTILISATEURS                     │
└─────────────────────────┬───────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│              FRONTEND INTELLIFLOOD                  │
│                                                     │
│ React + TypeScript + Vite                           │
│                                                     │
│ ┌──────────────┐  ┌──────────────┐                 │
│ │   MapLibre   │  │   CesiumJS   │                 │
│ └──────────────┘  └──────────────┘                 │
│                                                     │
│ PWA + Service Worker + Dexie + IndexedDB            │
└─────────────────────────┬───────────────────────────┘
                          │
                         HTTPS
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│                    FASTAPI                          │
│                                                     │
│ Auth │ API │ Application │ Workflows │ Reports      │
└─────────────────────────┬───────────────────────────┘
                          │
          ┌───────────────┼────────────────┐
          │               │                │
          ▼               ▼                ▼
┌────────────────┐ ┌──────────────┐ ┌────────────────┐
│ World Engine   │ │ Flood Engine │ │ Intelligence   │
│                │ │              │ │ Engine         │
└───────┬────────┘ └──────┬───────┘ └───────┬────────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          ▼
                 ┌────────────────┐
                 │ Geo/Data Engine│
                 └───────┬────────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
      PostgreSQL + PostGIS      File Storage
              │
              ▼
          Données
```

---

# 26. Déploiement

Le premier objectif sera le déploiement local/self-hosted.

Architecture cible :

```text
Machine / Serveur
│
├── Frontend
├── FastAPI
├── PostgreSQL
├── PostGIS
├── Valkey
├── Workers
├── Stockage fichiers
└── Modèles IA locaux
```

Docker pourra être utilisé pour simplifier l'installation et reproduire l'environnement.

Il ne sera toutefois pas considéré comme une obligation architecturale.

---

# 27. Technologies volontairement non imposées

À ce stade, les éléments suivants ne sont pas verrouillés :

* fournisseur de cartes ;
* fournisseur satellite ;
* fournisseur météo ;
* fournisseur de données hydrologiques ;
* fournisseur d'images ;
* modèle LLM particulier ;
* modèle de vision particulier ;
* fournisseur cloud ;
* fournisseur de stockage objet ;
* fournisseur de notification ;
* fournisseur d'authentification externe.

Cette décision permet d'éviter une dépendance prématurée.

---

# 28. Version initiale de la stack

La stack de référence pour l'implémentation sera donc :

```text
FRONTEND
├── React
├── TypeScript
├── Vite
├── MapLibre GL JS
├── CesiumJS
├── PWA
├── Service Worker
├── Dexie.js
└── IndexedDB

BACKEND
├── Python
├── FastAPI
└── Pydantic

GÉOSPATIAL
├── PostgreSQL
├── PostGIS
├── GeoPandas
├── Shapely
├── GDAL/OGR
└── Rasterio

ASYNCHRONE
├── Celery
└── Valkey

IA / ML
├── Python
├── PyTorch
├── modèles locaux
└── RAG

DÉPLOIEMENT
├── Docker
├── Linux
└── self-hosted
```

---

# 29. Décision architecturale

La stack retenue respecte les contraintes principales d'IntelliFlood :

* géospatial ;
* 2D ;
* 3D ;
* globe ;
* simulation ;
* IA ;
* offline ;
* synchronisation ;
* données temporelles ;
* données spatiales ;
* traitement scientifique ;
* extensibilité ;
* auto-hébergement ;
* open source ;
* absence de dépendance obligatoire à une API payante.

---

# 30. Prochaine étape

La sélection technologique ne signifie pas encore que nous devons commencer immédiatement à coder.

La prochaine étape de conception consiste à transformer cette stack en **architecture technique détaillée** :

```text
Technologies
      ↓
Structure du projet
      ↓
Modules
      ↓
Interfaces entre modules
      ↓
API détaillées
      ↓
Schéma PostgreSQL/PostGIS
      ↓
Modèle offline
      ↓
Contrats de synchronisation
      ↓
Architecture des moteurs
      ↓
Structure du code
      ↓
Tests
      ↓
Implémentation
```

Aucune fonctionnalité nouvelle ne doit être ajoutée uniquement parce qu'une technologie la permet.

Le périmètre reste celui défini dans DOCUMENT001 à DOCUMENT024.


---

## Décisions complémentaires — sélection des sources IoT et météo (29 octobre 2026)

La sélection technologique doit éviter l'enfermement fournisseur. Pour les équipements compatibles, une connexion directe HTTPS ou MQTT vers IntelliFlood est une option initiale privilégiée ; des connecteurs d'API de fabricant, webhooks et passerelles doivent pouvoir être ajoutés lorsqu'ils sont nécessaires. Il n'est pas demandé de développer toutes les voies d'intégration dès le premier jalon, mais l'architecture ne doit pas empêcher leur ajout.

Chaque technologie ou fournisseur doit être évalué sur la documentation des protocoles, l'accès aux données, l'authentification, les coûts et quotas, les licences, la couverture géographique, le fonctionnement hors ligne, la maintenance et la portabilité des données. Pour les API météorologiques, évaluer spécifiquement la couverture ivoirienne et les conditions d'utilisation avant de retenir une source. Le catalogue public-apis peut aider à découvrir des options mais ne constitue pas en lui-même une API météo.

La chaîne JSN-SR04T + ESP32 citée dans les documents BOATIKS est un exemple de chaîne de mesure à évaluer et tester, pas une dépendance obligatoire de toute l'architecture.
