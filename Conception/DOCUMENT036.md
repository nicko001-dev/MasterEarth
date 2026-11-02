# DOCUMENT036 — ARCHITECTURE TECHNIQUE DÉFINITIVE V1

**Projet : IntelliFlood**
**Phase : Conception technique**
**Statut : Proposition technique V1 à valider avant implémentation**
**Version : 1.0**

---

# 1. OBJECTIF

DOCUMENT036 transforme l'architecture conceptuelle d'IntelliFlood en une architecture technique concrète.

Il définit notamment :

* la stack principale ;
* l'organisation du repository ;
* le frontend ;
* le backend ;
* la base de données ;
* le système géospatial ;
* le stockage ;
* le système offline-first ;
* la synchronisation ;
* les tâches asynchrones ;
* l'Intelligence Engine ;
* l'intégration IA ;
* la sécurité ;
* les tests ;
* le déploiement.

Ce document constitue la base technique utilisée par les futurs développeurs et agents de codage.

---

# 2. RÈGLE IMPORTANTE SUR LES EXEMPLES

> ⚠️ **EXEMPLES NON EXHAUSTIFS**
>
> Les noms de fichiers, modules, endpoints, composants, services, fonctions, technologies ou fonctionnalités présentés comme exemples servent uniquement à illustrer l'architecture.
>
> Ils ne constituent jamais une liste exhaustive.
>
> L'agent de développement doit respecter l'architecture complète et ne doit pas limiter l'implémentation aux exemples explicitement mentionnés.

Classification utilisée :

* **OBLIGATOIRE** → doit être respecté ;
* **EXEMPLE** → illustration non exhaustive ;
* **OPTIONNEL** → possibilité future ;
* **À DÉFINIR** → ne doit pas être inventé par l'agent.

---

# 3. PRINCIPES TECHNIQUES

L'architecture repose sur les principes suivants.

## 3.1 Modularité

Les composants doivent être séparés par responsabilité.

## 3.2 Offline-first

Le système doit continuer à fonctionner lorsque la connectivité est absente ou dégradée.

## 3.3 API-first

Les clients communiquent avec le backend via des contrats API définis.

## 3.4 Data-first

Les données structurées constituent la base de l'intelligence du système.

## 3.5 Deterministic-first

Les calculs critiques doivent être réalisés par des fonctions déterministes et testables.

## 3.6 AI-assisted

L'IA assiste le système mais ne doit pas devenir la source unique de vérité.

## 3.7 Security by design

La sécurité est intégrée dès l'architecture.

## 3.8 Open-source/local-first

Lorsque plusieurs technologies remplissent correctement le même rôle, la préférence est donnée aux solutions :

* open source ;
* auto-hébergeables ;
* gratuites ;
* locales ;
* sans dépendance obligatoire à une API propriétaire.

---

# 4. ARCHITECTURE GÉNÉRALE

```text
                         INTELLIFLOOD
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
         CLIENTS                         SERVICES
              │                               │
      ┌───────┼───────┐               ┌──────┼──────┐
      │       │       │               │      │      │
      ▼       ▼       ▼               ▼      ▼      ▼
     Web    Mobile  Offline        API    Workers   AI
      │       │       │               │      │      │
      └───────┴───────┴───────────────┘      │      │
                      │                      │      │
                      ▼                      ▼      ▼
                 API / SYNC              Engines  Models
                      │
          ┌───────────┼────────────┐
          ▼           ▼            ▼
     PostgreSQL     Storage      Cache
      + PostGIS
```

---

# 5. STACK TECHNIQUE V1

## 5.1 Backend

### Technologie retenue

**Python + FastAPI**

Raison :

* excellent support des API modernes ;
* typage avec Pydantic ;
* documentation OpenAPI automatique ;
* écosystème scientifique ;
* géospatial ;
* traitement de données ;
* machine learning ;
* intégration IA ;
* bonne testabilité.

---

# 6. Frontend

### Technologie retenue

**TypeScript + React**

Le frontend sera construit comme une application web moderne.

Responsabilités :

* interface utilisateur ;
* cartes ;
* visualisation ;
* formulaires ;
* tableaux ;
* dashboards ;
* gestion locale ;
* synchronisation côté client.

Le frontend ne doit pas contenir les calculs métier critiques.

---

# 7. APPLICATION WEB

Architecture :

```text
React
 │
 ├── UI
 ├── State
 ├── Map
 ├── Offline Storage
 ├── Sync Client
 └── API Client
          │
          ▼
       FastAPI
```

---

# 8. STOCKAGE LOCAL

Pour le fonctionnement offline du client web :

**IndexedDB**

Le système local doit permettre de stocker :

* données métier nécessaires ;
* opérations non synchronisées ;
* métadonnées de synchronisation ;
* données cartographiques mises en cache ;
* état local ;
* fichiers ou références de fichiers selon la stratégie retenue.

> EXEMPLE NON EXHAUSTIF.

---

# 9. BASE DE DONNÉES

### Technologie retenue

**PostgreSQL + PostGIS**

PostgreSQL constitue le système principal de persistance.

PostGIS fournit les capacités géospatiales.

Cela permet notamment de gérer :

* points ;
* lignes ;
* polygones ;
* distances ;
* intersections ;
* zones ;
* emprises ;
* recherches spatiales.

---

# 10. ARCHITECTURE BACKEND

Le backend adopte une architecture modulaire.

```text
backend/
│
├── api/
├── core/
├── auth/
├── users/
├── organizations/
├── observations/
├── flood/
├── geo/
├── world/
├── alerts/
├── intelligence/
├── synchronization/
├── media/
└── infrastructure/
```

> EXEMPLE D'ORGANISATION : la structure exacte pourra être affinée dans DOCUMENT040.

---

# 11. ARCHITECTURE INTERNE D'UN MODULE

Chaque module important doit suivre une séparation similaire :

```text
Module
│
├── domain/
├── application/
├── infrastructure/
├── api/
└── tests/
```

### Domain

Contient les règles métier.

### Application

Orchestre les cas d'utilisation.

### Infrastructure

Communique avec :

* base de données ;
* stockage ;
* services externes ;
* systèmes techniques.

### API

Expose les fonctionnalités.

---

# 12. WORLD ENGINE

Le World Engine constitue la représentation numérique du monde IntelliFlood.

```text
World Engine
│
├── Geographic Objects
├── Spatial Relationships
├── Layers
├── Locations
├── Temporal State
├── Visualization Data
└── World Queries
```

Le World Engine ne doit pas devenir un simple composant graphique.

Il représente le modèle spatial exploité par les autres moteurs.

---

# 13. FLOOD ENGINE

Le Flood Engine est responsable des opérations liées aux phénomènes d'inondation.

```text
Flood Engine
│
├── Flood Events
├── Water Data
├── Flood Zones
├── Risk Analysis
├── Temporal Analysis
└── Flood Calculations
```

Les calculs doivent être séparés de l'interface.

---

# 14. GEO/DATA ENGINE

Le Geo/Data Engine fournit les opérations communes liées aux données.

```text
Geo/Data Engine
│
├── Spatial Queries
├── Geometry
├── Coordinate Systems
├── Data Import
├── Data Export
├── Validation
└── Transformation
```

Il fournit des capacités réutilisables aux autres modules.

---

# 15. INTELLIGENCE ENGINE

```text
Intelligence Engine
│
├── Context Engine
├── Analytics Engine
├── Detection Engine
├── Prediction Engine
├── Knowledge Engine
├── AI Assistant
├── Tool Executor
└── Validation Engine
```

Principe :

```text
Data
 ↓
Context
 ↓
Tools
 ↓
Analysis
 ↓
AI
 ↓
Validation
 ↓
Result
```

---

# 16. COUCHE IA

L'application ne doit pas dépendre directement d'un modèle particulier.

Une abstraction doit être utilisée :

```text
Intelligence Engine
       │
       ▼
 AI Provider Interface
       │
 ┌─────┴─────────┐
 ▼               ▼
Local Model    Other Provider
```

Cela permet de changer de modèle sans réécrire toute l'application.

---

# 17. MODÈLES LOCAUX

La priorité est donnée aux modèles pouvant être exécutés localement.

Le système doit donc pouvoir fonctionner avec un runtime local compatible.

> EXEMPLES NON EXHAUSTIFS : Ollama, llama.cpp ou autre runtime compatible.

Aucun modèle particulier ne doit être considéré comme définitivement obligatoire dans ce document.

La sélection précise du modèle est une décision distincte.

---

# 18. RAG

Le système de connaissances doit être séparé des données opérationnelles.

```text
Operational Data
       │
       └── PostgreSQL/PostGIS

Knowledge
       │
       └── Knowledge/RAG Layer
```

Le RAG peut servir notamment à rechercher des informations documentaires.

> EXEMPLES NON EXHAUSTIFS.

Il ne doit pas remplacer les données transactionnelles.

---

# 19. API

L'API principale sera versionnée.

```text
/api/v1/
```

Architecture :

```text
Client
  ↓
API Router
  ↓
Authentication
  ↓
Authorization
  ↓
Validation
  ↓
Application Service
  ↓
Domain
  ↓
Infrastructure
```

---

# 20. SYNCHRONISATION

Le système reprend l'architecture de DOCUMENT028 et DOCUMENT029.

```text
LOCAL CLIENT
    │
    │ Push
    ▼
SERVER
    │
    │ Pull
    ▼
LOCAL CLIENT
```

Chaque opération de synchronisation possède un identifiant unique.

L'idempotence est obligatoire.

---

# 21. FILES ET MÉDIAS

Les fichiers ne doivent pas être stockés directement comme gros blobs dans les tables métier sans justification.

Architecture cible :

```text
Application
     │
     ▼
Media Service
     │
     ▼
Object Storage
```

La base conserve principalement les métadonnées et références nécessaires.

> EXEMPLE : photos d'observation, pièces jointes, documents, etc.

---

# 22. TÂCHES ASYNCHRONES

Les traitements longs ne doivent pas bloquer les requêtes HTTP.

Architecture :

```text
API
 │
 ▼
Job Queue
 │
 ▼
Worker
 │
 ▼
Processing
```

> EXEMPLES NON EXHAUSTIFS : import massif de données, traitement géospatial lourd, génération de rapport.

Le système exact de queue sera verrouillé dans la phase d'infrastructure.

---

# 23. CACHE

Un cache peut être utilisé pour :

* données fréquemment demandées ;
* résultats coûteux ;
* sessions selon architecture ;
* métadonnées temporaires.

Mais :

> le cache ne doit jamais devenir la source de vérité des données métier.

---

# 24. AUTHENTIFICATION

Architecture :

```text
Client
 ↓
Authentication
 ↓
Identity
 ↓
Session / Token
 ↓
Authorization
 ↓
Resource
```

Les permissions sont vérifiées côté serveur.

Le frontend ne constitue jamais une frontière de sécurité.

---

# 25. MULTI-TENANCY

Toutes les ressources tenant-scoped doivent conserver leur contexte d'organisation.

Conceptuellement :

```text
Request
  ↓
Authenticated User
  ↓
Organization Context
  ↓
Authorization
  ↓
Data Access
```

PostgreSQL/PostGIS pourra utiliser des mécanismes d'isolation appropriés, notamment RLS lorsque nécessaire.

---

# 26. OBSERVABILITÉ

Le système doit prévoir :

```text
Logs
Metrics
Traces
Health
Audit
```

Les informations sensibles ne doivent pas être enregistrées inutilement dans les logs.

---

# 27. TESTS

Architecture :

```text
Unit Tests
     ↓
Integration Tests
     ↓
API Tests
     ↓
Security Tests
     ↓
Offline/Sync Tests
     ↓
E2E Tests
```

Les moteurs de calcul doivent être particulièrement testables.

---

# 28. ENVIRONNEMENTS

Minimum :

```text
Development
Testing
Production
```

Un environnement intermédiaire peut être ajouté si nécessaire.

> OPTIONNEL.

---

# 29. DÉPLOIEMENT

Architecture logique :

```text
                 Internet / Network
                         │
                         ▼
                  Reverse Proxy
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
          Frontend                 API
                                    │
                        ┌───────────┼───────────┐
                        ▼           ▼           ▼
                       DB        Storage       Queue
                        │
                     PostGIS
```

L'architecture doit rester auto-hébergeable.

---

# 30. PRINCIPLE LOCAL-FIRST

L'environnement de développement doit pouvoir fonctionner localement autant que possible.

Objectif :

```text
Developer Machine
│
├── Frontend
├── Backend
├── PostgreSQL/PostGIS
├── Storage
├── Queue
└── AI Runtime
```

Cela limite les dépendances externes pendant le développement.

---

# 31. ARBORESCENCE CIBLE

> ⚠️ Cette arborescence est une base technique V1. Elle pourra être affinée dans DOCUMENT040.

```text
IntelliFlood/
│
├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── shared/
│   └── contracts/
│
├── backend/
│   ├── modules/
│   ├── core/
│   └── infrastructure/
│
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── scripts/
│
├── docs/
│
├── tests/
│
├── infrastructure/
│
├── scripts/
│
├── .env.example
├── README.md
└── AGENTS.md
```

---

# 32. RÈGLE AGENTS

Le futur `AGENTS.md` devra imposer notamment :

1. lire la documentation avant modification ;
2. respecter les décisions architecturales ;
3. ne pas considérer les exemples comme exhaustifs ;
4. ne pas inventer une fonctionnalité absente ;
5. ne pas supprimer une architecture existante sans justification ;
6. tester les modifications ;
7. maintenir la documentation ;
8. respecter les frontières des modules ;
9. ne pas placer les calculs métier critiques dans l'UI ;
10. ne pas donner au LLM un accès incontrôlé aux données ou actions.

---

# 33. DÉCISIONS TECHNIQUES V1

| ID       | Décision                        | Statut |
| -------- | ------------------------------- | ------ |
| TECH-001 | Backend Python                  | VALIDÉ |
| TECH-002 | FastAPI                         | VALIDÉ |
| TECH-003 | Frontend TypeScript/React       | VALIDÉ |
| TECH-004 | PostgreSQL                      | VALIDÉ |
| TECH-005 | PostGIS                         | VALIDÉ |
| TECH-006 | IndexedDB pour offline web      | VALIDÉ |
| TECH-007 | API versionnée                  | VALIDÉ |
| TECH-008 | Architecture modulaire          | VALIDÉ |
| TECH-009 | AI abstraction layer            | VALIDÉ |
| TECH-010 | Local AI privilégiée            | VALIDÉ |
| TECH-011 | Object storage pour médias      | VALIDÉ |
| TECH-012 | Queue pour traitements longs    | VALIDÉ |
| TECH-013 | Tests multi-niveaux             | VALIDÉ |
| TECH-014 | Infrastructure auto-hébergeable | VALIDÉ |

---

# 34. ÉLÉMENTS À FINALISER

Les éléments suivants seront détaillés dans les documents suivants :

* modèle SQL complet ;
* stratégie exacte des migrations ;
* contrats API complets ;
* système exact de queue ;
* système exact de stockage objet ;
* système exact de cartographie ;
* modèle IA précis ;
* stratégie de déploiement ;
* CI/CD ;
* arborescence définitive.

---

# 35. CONCLUSION

L'architecture technique V1 d'IntelliFlood est désormais définie autour de :

```text
React / TypeScript
        │
        ▼
     FastAPI
        │
 ┌──────┼────────┐
 ▼      ▼        ▼
World  Flood  Intelligence
Engine Engine    Engine
        │
        ▼
 Geo/Data Engine
        │
        ▼
PostgreSQL + PostGIS
        │
 ┌──────┼──────────┐
 ▼      ▼          ▼
Storage Queue   Offline/Sync
```

Cette architecture constitue la base technique pour la conception du modèle de données.

**FIN DE DOCUMENT036**


---

## Complément — principes de couverture et d'interopérabilité (29 octobre 2026)

L'architecture technique doit conserver le globe terrestre complet et les fonctionnalités God’s Eye View confirmées par comparaison du code source, tout en ajoutant les capacités propres à IntelliFlood. Le territoire ivoirien est la portée opérationnelle nationale cible ; Cocody est uniquement un exemple de pilote.

Les intégrations externes doivent être encapsulées derrière des connecteurs et des contrats internes stables. Les fournisseurs, API et protocoles doivent être remplaçables sans réécrire les moteurs métier. La disponibilité réelle des données, leur provenance, leur fraîcheur et leurs limites doivent être conservées tout au long du pipeline.
