# DOCUMENT041 — ARCHITECTURE DU SYSTÈME GÉOSPATIAL & MOTEUR CARTOGRAPHIQUE

**Projet : IntelliFlood**
**Version : 1.0**
**Statut : Spécification technique**
**Dépendances : DOCUMENT036, DOCUMENT037, DOCUMENT038, DOCUMENT040**

---

# 1. Objectif

Ce document définit l'architecture géospatiale d'IntelliFlood.

Le système géospatial constitue une infrastructure fondamentale du projet puisque les informations manipulées par IntelliFlood peuvent être liées à :

* une position ;
* une zone ;
* une trajectoire ;
* un événement ;
* une infrastructure ;
* une observation ;
* une simulation ;
* un phénomène environnemental.

L'objectif est de séparer clairement :

```text
Données géographiques
        ↓
Calculs géospatiaux
        ↓
Services métier
        ↓
Visualisation
```

La carte affichée à l'utilisateur ne doit donc pas être confondue avec le moteur géospatial.

---

# 2. Principe architectural

```text
                         GEO/DATA ENGINE
                               │
             ┌─────────────────┼─────────────────┐
             │                 │                 │
             ▼                 ▼                 ▼
        Geo Storage      Geo Processing      Geo Queries
             │                 │                 │
             └─────────────────┼─────────────────┘
                               │
                               ▼
                     Domaines métier
                               │
                 ┌─────────────┼─────────────┐
                 ▼             ▼             ▼
            Flood Engine   World Engine   Intelligence
                 │             │             │
                 └─────────────┼─────────────┘
                               ▼
                         API / Services
                               │
                               ▼
                         Frontend Map
```

---

# 3. Séparation fondamentale

Il faut distinguer quatre responsabilités.

## 3.1 Stockage géospatial

Responsable de la persistance des géométries.

Technologie principale :

```text
PostgreSQL + PostGIS
```

## 3.2 Calcul géospatial

Responsable des opérations telles que :

* distance ;
* intersection ;
* inclusion ;
* proximité ;
* recherche spatiale ;
* transformation ;
* agrégation spatiale.

## 3.3 Services métier

Ils utilisent les capacités géospatiales pour répondre aux besoins d'IntelliFlood.

## 3.4 Visualisation

Le frontend transforme les résultats en :

* carte ;
* couches ;
* marqueurs ;
* zones ;
* trajectoires ;
* animations ;
* informations contextuelles.

---

# 4. PostGIS

PostGIS constitue la couche géospatiale principale du serveur.

Il doit être utilisé pour les opérations spatiales nécessitant :

* précision ;
* cohérence ;
* performance ;
* requêtes sur de grands volumes ;
* transactions.

Le frontend ne doit pas devenir la source de vérité géospatiale.

---

# 5. Types géométriques

Le système doit pouvoir représenter différents types de géométrie.

Exemples :

```text
POINT
LINESTRING
POLYGON
MULTIPOINT
MULTILINESTRING
MULTIPOLYGON
```

⚠️ **EXEMPLES NON EXHAUSTIFS :** cette liste illustre les types de géométries pouvant être utilisés. Elle ne constitue pas une liste fermée des types autorisés par l'architecture.

---

# 6. Coordonnées

Toutes les données géographiques doivent posséder un système de coordonnées explicitement identifié.

Le système doit éviter les conversions implicites non contrôlées.

```text
Donnée
  ↓
CRS identifié
  ↓
Stockage
  ↓
Transformation éventuelle
  ↓
Calcul
  ↓
Visualisation
```

---

# 7. Précision

La précision géographique doit être adaptée au type de donnée.

Une position issue d'un appareil de mesure ne doit pas être présentée avec une précision supérieure à celle réellement disponible.

Exemple :

```text
Mesure réelle
     ↓
Précision connue
     ↓
Stockage
     ↓
Affichage cohérent
```

---

# 8. Géométrie et métadonnées

Une entité géographique ne doit pas être réduite à sa géométrie.

Elle peut également posséder :

```text
Identité
Provenance
Timestamp
Type
Statut
Précision
Qualité
Organisation
Version
```

---

# 9. Requêtes spatiales

Le système doit permettre des recherches spatiales.

Exemples :

```text
Objets dans une zone
Événements proches d'un point
Stations dans un rayon
Zones intersectant une zone
Observations dans une région
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

---

# 10. Architecture du Geo/Data Engine

```text
backend/modules/geo/
│
├── domain/
│   ├── geometry/
│   ├── spatial/
│   └── coordinate/
│
├── application/
│   ├── queries/
│   ├── services/
│   └── transformations/
│
├── infrastructure/
│   └── postgis/
│
├── api/
│   └── routes/
│
└── tests/
```

Cette structure est indicative et peut être adaptée sans modifier les responsabilités.

---

# 11. Services géospatiaux

Le Geo Engine peut exposer des services tels que :

```text
SpatialQueryService
DistanceService
IntersectionService
GeometryService
CoordinateService
SpatialIndexService
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

Les services définitifs doivent être déterminés par les cas d'utilisation réellement retenus.

---

# 12. Index géospatiaux

Les colonnes géométriques importantes doivent disposer d'index adaptés.

Le mécanisme privilégié est un index spatial compatible PostGIS.

Objectif :

```text
Recherche spatiale
       ↓
Index
       ↓
Réduction du volume parcouru
       ↓
Résultat
```

Les index doivent être définis sur la base des requêtes réellement utilisées et validés par des mesures de performance.

---

# 13. Bounding Box

Les recherches géographiques peuvent utiliser des bounding boxes.

Conceptuellement :

```text
        longitude
   ┌─────────────────┐
   │                 │
   │      Zone       │
   │                 │
   │                 │
   └─────────────────┘
        latitude
```

Une bounding box peut permettre de limiter rapidement l'espace de recherche avant une opération spatiale plus précise.

---

# 14. Recherche par proximité

Architecture :

```text
Point utilisateur
       │
       ▼
Distance maximale
       │
       ▼
Index spatial
       │
       ▼
Objets candidats
       │
       ▼
Calcul précis
       │
       ▼
Résultats
```

---

# 15. GeoJSON

L'API peut utiliser GeoJSON pour transporter des données géographiques.

Exemple :

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [-4.02, 5.34]
  },
  "properties": {}
}
```

⚠️ Ceci est un **exemple non exhaustif**.

Le format exact des réponses API doit être défini dans les contrats OpenAPI.

---

# 16. Carte frontend

Le moteur cartographique frontend est responsable de la représentation visuelle.

```text
API
 ↓
GeoJSON / DTO
 ↓
Map Engine
 ↓
Layers
 ↓
Rendering
```

La carte ne doit pas effectuer de calcul métier critique.

---

# 17. Couches cartographiques

Une carte peut présenter plusieurs couches.

Exemples :

```text
Fond de carte
Cours d'eau
Zones inondables
Événements
Observations
Stations
Alertes
Infrastructures
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

Les couches doivent être activables/désactivables selon les permissions et les besoins de l'application.

---

# 18. Séparation des couches

```text
Map
 │
 ├── Base Layer
 │
 ├── Data Layers
 │
 ├── Event Layers
 │
 ├── Analysis Layers
 │
 └── Alert Layers
```

Chaque couche doit avoir une source clairement identifiée.

---

# 19. Données dynamiques

Les données pouvant évoluer fréquemment doivent pouvoir être actualisées sans recharger toute la carte.

```text
Nouvelle donnée
      ↓
API / Sync
      ↓
Store local
      ↓
Map state
      ↓
Layer update
```

---

# 20. Offline Map

Le système Offline-first doit également considérer les données géographiques.

Lorsque le réseau est indisponible :

```text
Carte disponible localement
        +
Données géographiques mises en cache
        +
Données métier locales
```

Les données disponibles Offline doivent dépendre de la stratégie de synchronisation.

---

# 21. Tuiles cartographiques

Les tuiles peuvent être utilisées pour le rendu cartographique.

Architecture :

```text
Map
 │
 ├── Local tiles
 │
 └── Remote tiles
```

La stratégie exacte de stockage, téléchargement et licence des données cartographiques doit être déterminée avant production.

---

# 22. Performance

Le système doit éviter :

```text
10 000 objets
      ↓
10 000 éléments DOM
```

Les stratégies de rendu doivent être adaptées aux volumes.

Possibilités :

```text
Clustering
Vector tiles
Simplification
Lazy loading
Viewport filtering
Level of detail
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

Aucune technique ne doit être imposée avant mesure du besoin réel.

---

# 23. Géospatial et Flood Engine

Le Flood Engine ne doit pas recréer les fonctions géospatiales fondamentales.

```text
Flood Engine
     │
     ▼
Geo/Data Engine
     │
     ▼
PostGIS
```

Cela évite la duplication.

---

# 24. Géospatial et World Engine

Le World Engine utilise les données géographiques pour représenter le monde numérique.

```text
PostGIS
  ↓
Geo Engine
  ↓
World Engine
  ↓
World Objects
  ↓
Visualization
```

---

# 25. Géospatial et Intelligence Engine

L'Intelligence Engine doit passer par des services contrôlés.

```text
AI
 │
 ▼
Tool
 │
 ▼
Geo Service
 │
 ▼
PostGIS
```

Le LLM ne doit pas recevoir un accès SQL arbitraire à la base.

---

# 26. Qualité géospatiale

Chaque donnée géographique importante doit pouvoir être évaluée selon :

* source ;
* précision ;
* date ;
* qualité ;
* fiabilité ;
* méthode d'obtention.

---

# 27. Audit

Les opérations géospatiales importantes peuvent être auditées lorsqu'elles produisent un résultat métier critique.

---

# 28. Tests

Les tests doivent couvrir :

```text
Géométrie valide
Coordonnées valides
Distance
Intersection
Proximité
Requêtes spatiales
Permissions
Multi-tenancy
Performance
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

---

# 29. Décisions GEO

| ID      | Décision                                                            |
| ------- | ------------------------------------------------------------------- |
| GEO-001 | PostGIS est la couche géospatiale serveur principale                |
| GEO-002 | Les calculs spatiaux critiques sont côté serveur                    |
| GEO-003 | Les coordonnées possèdent un CRS explicite                          |
| GEO-004 | Les données géographiques conservent leur provenance                |
| GEO-005 | Le frontend n'est pas la source de vérité géospatiale               |
| GEO-006 | Le Flood Engine réutilise le Geo Engine                             |
| GEO-007 | Le World Engine réutilise le Geo Engine                             |
| GEO-008 | L'IA n'accède pas directement à PostGIS                             |
| GEO-009 | Les performances sont mesurées avant optimisation complexe          |
| GEO-010 | L'Offline-first doit intégrer les données géographiques nécessaires |

---

# 30. Principe final

> **La carte est une représentation du monde. Le Geo Engine est responsable de la vérité géographique qui se trouve derrière cette représentation.**


---

## Complément — cartographie mondiale et couches nationales (29 octobre 2026)

Le moteur cartographique doit maintenir la possibilité d'explorer le globe terrestre complet. La Côte d'Ivoire est une zone opérationnelle prioritaire à l'intérieur de ce monde global, et non l'étendue maximale de la carte. Les données nationales doivent être chargées par couches géographiques selon leur disponibilité et leurs droits d'utilisation.

La représentation doit distinguer les données observées, les prévisions, les estimations et les sorties de simulation. Les couches 3D et les simulations ne doivent pas masquer les incertitudes ni donner l'impression que chaque zone du pays dispose de données à la même résolution.
