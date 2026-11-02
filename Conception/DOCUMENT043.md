# DOCUMENT043 — ARCHITECTURE DÉTAILLÉE DU WORLD ENGINE

**Projet : IntelliFlood**
**Version : 1.0**
**Statut : Spécification technique**
**Dépendances : DOCUMENT036, DOCUMENT037, DOCUMENT040, DOCUMENT041, DOCUMENT042**

---

# 1. Objectif

Le World Engine constitue la couche permettant à IntelliFlood de représenter un environnement numérique cohérent.

Il ne doit pas être compris comme un simple moteur graphique.

Il représente :

```text
Monde
 ├── Entités
 ├── Objets
 ├── Lieux
 ├── Relations
 ├── États
 ├── Événements
 └── Temps
```

Le World Engine fournit donc une représentation structurée du monde manipulé par les autres moteurs.

---

# 2. Concept

```text
                   WORLD ENGINE
                        │
       ┌────────────────┼────────────────┐
       │                │                │
       ▼                ▼                ▼
    Objects          Spatial           State
       │                │                │
       └────────────────┼────────────────┘
                        ▼
                     Events
                        │
                        ▼
                    World State
```

---

# 3. Monde numérique

Le monde peut être décrit comme un ensemble :

```text
World
 ├── Objects
 ├── Locations
 ├── Relations
 ├── Events
 └── State
```

⚠️ Cette représentation est un **modèle conceptuel non exhaustif**.

---

# 4. World Objects

Un World Object représente une entité identifiable dans le monde.

Exemples :

```text
Infrastructure
Building
Road
Bridge
River
Station
Sensor
Zone
Vehicle
Administrative Area
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

La liste finale dépendra des cas d'utilisation fonctionnels.

---

# 5. Identité

Chaque objet doit disposer d'une identité stable.

```text
World Object
     │
     ├── ID
     ├── Type
     ├── Geometry
     ├── Metadata
     └── State
```

---

# 6. Relations

Les objets peuvent être liés.

Exemples :

```text
Station → located_in → Zone

Road → crosses → FloodZone

Building → located_near → River
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

Les relations doivent être explicitement modélisées lorsqu'elles ont une importance métier.

---

# 7. État

Un objet peut posséder un état dynamique.

```text
Object
  ↓
State
  ↓
Change
  ↓
New State
```

Exemple conceptuel :

```text
NORMAL
   ↓
AFFECTED
   ↓
DAMAGED
   ↓
RECOVERING
```

⚠️ Ces états sont uniquement illustratifs.

---

# 8. Événements

Un événement représente un changement ou une occurrence.

```text
Event
 ├── Type
 ├── Time
 ├── Location
 ├── Source
 └── Impact
```

Les événements peuvent être :

* observés ;
* calculés ;
* simulés ;
* importés.

⚠️ **EXEMPLES NON EXHAUSTIFS.**

---

# 9. Temps

Le World Engine doit tenir compte de la dimension temporelle.

Une entité peut posséder :

```text
created_at
updated_at
valid_from
valid_until
```

Une donnée temporelle ne doit pas être confondue avec sa date de création informatique.

---

# 10. World State

Le World State représente l'état connu du monde à un instant donné.

```text
Data
 │
 ▼
World State
 │
 ├── Objects
 ├── Locations
 ├── Events
 └── Relationships
```

Le World State peut être recalculé ou mis à jour selon les événements reçus.

---

# 11. Architecture interne

Structure indicative :

```text
backend/modules/world/
│
├── domain/
│   ├── objects/
│   ├── relations/
│   ├── states/
│   ├── events/
│   └── time/
│
├── application/
│   ├── queries/
│   ├── commands/
│   └── services/
│
├── infrastructure/
│
├── api/
│
└── tests/
```

---

# 12. World Engine et Geo Engine

Le World Engine ne doit pas recréer le stockage géospatial.

```text
World Engine
     │
     ▼
Geo Engine
     │
     ▼
PostGIS
```

Le World Engine interprète les données dans le contexte du monde.

---

# 13. World Engine et Flood Engine

Le Flood Engine peut produire des événements ou états affectant le World Engine.

```text
Flood Engine
     │
     ▼
Flood Event
     │
     ▼
World Engine
     │
     ▼
Affected World Objects
```

---

# 14. Exemple

```text
Flood Event
     ↓
Zone géographique
     ↓
Recherche des objets concernés
     ↓
Objects affected
     ↓
World State updated
```

⚠️ Ceci est un **exemple de fonctionnement non exhaustif**.

---

# 15. World Engine et Intelligence Engine

L'Intelligence Engine peut demander des informations au World Engine.

```text
User Question
      ↓
Intelligence Engine
      ↓
World Tool
      ↓
World Engine
      ↓
Structured Data
      ↓
AI Interpretation
```

Le modèle IA ne doit pas manipuler directement les tables du World Engine.

---

# 16. Tool Interface

L'Intelligence Engine peut disposer de fonctions contrôlées.

Exemples :

```text
find_objects_in_area()
get_object_state()
find_related_objects()
get_world_state()
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

Ces outils doivent être explicitement autorisés et validés.

---

# 17. World Queries

Les requêtes peuvent être :

```text
Spatial
Temporal
Attribute-based
Relationship-based
State-based
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

---

# 18. Consistance

Le World Engine doit éviter les contradictions.

Exemple :

```text
Object A
Geometry = Zone X

Relation:
Object A located_in Zone Y
```

Si X et Y sont incompatibles, le système doit pouvoir détecter ou empêcher l'incohérence selon les règles définies.

---

# 19. Provenance

Chaque changement important du World State doit pouvoir être relié à sa source.

```text
Source
  ↓
Observation / Event
  ↓
Processing
  ↓
World State Change
```

---

# 20. Versionnement

Les objets importants doivent pouvoir être versionnés.

```text
Object
 ├── version 1
 ├── version 2
 └── version 3
```

L'objectif est de permettre l'audit et la reconstruction de l'état connu du monde.

---

# 21. Historique

Le système peut conserver les changements d'état importants.

```text
Time ──────────────────────────────►

State A
   ↓
State B
   ↓
State C
```

La stratégie exacte de conservation dépendra des exigences de volume et d'audit.

---

# 22. World State et Offline

Le client peut posséder une représentation locale partielle.

```text
Server World State
       │
       ▼
Synchronization
       │
       ▼
Local World State
```

Le client doit toujours connaître le caractère potentiellement incomplet de son état Offline.

---

# 23. Synchronisation

Les changements de World Objects doivent suivre les mécanismes définis dans DOCUMENT028 et DOCUMENT029.

```text
Local Change
     ↓
Sync Queue
     ↓
Server
     ↓
Conflict Detection
     ↓
World State
```

---

# 24. Sécurité

Le World Engine doit respecter :

* multi-tenancy ;
* autorisation ;
* visibilité des objets ;
* audit ;
* validation ;
* restrictions géographiques si nécessaire.

---

# 25. Performance

Le système doit éviter de charger inutilement l'intégralité du monde.

```text
Utilisateur
    ↓
Viewport / Area of Interest
    ↓
Query
    ↓
Relevant Objects
```

Cette stratégie peut réduire considérablement le volume de données transférées.

---

# 26. Level of Detail

Selon l'échelle d'affichage :

```text
Vue globale
   ↓
Objets agrégés

Vue régionale
   ↓
Objets détaillés

Vue locale
   ↓
Informations détaillées
```

⚠️ Ceci est un **exemple conceptuel non exhaustif**.

---

# 27. World Engine et simulation

Les simulations doivent être séparées de l'état réel.

```text
REAL WORLD STATE
       │
       │ copy / snapshot
       ▼
SIMULATION STATE
       │
       ▼
Scenario
       │
       ▼
Simulation
```

Une simulation ne doit jamais écraser silencieusement l'état réel.

---

# 28. Snapshots

Un snapshot peut représenter l'état du monde à un instant donné.

```text
World State
     ↓
Snapshot
     ↓
Simulation
```

Cela peut permettre de reproduire une situation historique ou de lancer un scénario.

---

# 29. Audit

Les modifications importantes doivent être traçables.

```text
Who?
What?
When?
Why?
Source?
Previous state?
New state?
```

---

# 30. Tests

Les tests doivent couvrir :

```text
Object creation
Object updates
Relations
State changes
Temporal consistency
Spatial consistency
Synchronization
Permissions
Snapshots
Simulation isolation
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

---

# 31. Décisions WORLD

| ID        | Décision                                                 |
| --------- | -------------------------------------------------------- |
| WORLD-001 | World Engine séparé des autres moteurs                   |
| WORLD-002 | World Objects possèdent une identité stable              |
| WORLD-003 | Les données géospatiales sont gérées par Geo Engine      |
| WORLD-004 | Les changements importants sont traçables                |
| WORLD-005 | Le World State peut être versionné                       |
| WORLD-006 | L'état réel est séparé des simulations                   |
| WORLD-007 | Les simulations ne modifient pas silencieusement le réel |
| WORLD-008 | L'IA accède au monde via des outils contrôlés            |
| WORLD-009 | Les requêtes sont adaptées à la zone d'intérêt           |
| WORLD-010 | L'état Offline peut être partiel                         |

---

# 32. Principe final

> **Le World Engine représente l'état structuré du monde ; il ne doit ni devenir une simple carte, ni absorber les responsabilités du Flood Engine, du Geo Engine ou de l'Intelligence Engine.**


---

## Complément — globe complet et portée mondiale (29 octobre 2026)

Le World Engine représente un monde explorable globalement. La navigation ne doit pas être limitée à la Côte d'Ivoire ou à une commune donnée. Les couches d'IntelliFlood spécialisées dans les inondations peuvent privilégier le territoire ivoirien tout en restant attachées au référentiel spatial global.

Les fonctions de God’s Eye View à conserver doivent être déterminées par comparaison directe du projet source avec le dépôt IntelliFlood ; les noms de moteurs ou de fonctionnalités ne remplacent pas cette vérification.
