# DOCUMENT040 — STRUCTURE DÉFINITIVE DU REPOSITORY & RÈGLES DES AGENTS

**Projet : IntelliFlood**
**Version : 1.0**
**Statut : Spécification d'organisation du code**
**Dépendances : DOCUMENT001 à DOCUMENT039**

---

# 1. Objectif

Ce document définit la structure officielle du repository IntelliFlood.

Il a deux objectifs :

1. organiser le code humainement ;
2. fournir aux agents de programmation un cadre qu'ils doivent respecter.

L'objectif est d'éviter :

* le code dispersé ;
* les responsabilités mélangées ;
* les dépendances anarchiques ;
* les duplications ;
* la logique métier dans l'interface ;
* les accès directs incontrôlés à la base ;
* les appels IA incontrôlés ;
* l'ajout arbitraire de fonctionnalités.

---

# 2. Structure racine

Structure cible :

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
├── .gitignore
├── README.md
├── AGENTS.md
└── LICENSE
```

> ⚠️ **EXEMPLES NON EXHAUSTIFS :** cette structure représente l'organisation architecturale cible. Certains fichiers ou sous-répertoires techniques supplémentaires pourront être nécessaires lors de l'implémentation.

---

# 3. `apps/`

Le dossier `apps/` contient les applications exécutables.

```text
apps/
├── web/
└── api/
```

---

# 4. `apps/web`

Application frontend.

```text
apps/web/
├── src/
│   ├── app/
│   ├── components/
│   ├── features/
│   ├── pages/
│   ├── hooks/
│   ├── services/
│   ├── stores/
│   ├── sync/
│   ├── geo/
│   ├── offline/
│   └── utils/
│
├── public/
├── tests/
├── package.json
└── ...
```

Les responsabilités doivent rester séparées.

---

# 5. Frontend : principe de séparation

```text
UI
 │
 ▼
Feature
 │
 ▼
Application Service
 │
 ▼
API / Local Store
```

L'interface ne doit pas appeler directement PostgreSQL.

L'interface ne doit pas implémenter seule les calculs critiques.

---

# 6. `apps/api`

Application FastAPI.

```text
apps/api/
├── main.py
├── dependencies.py
├── routers/
├── middleware/
├── schemas/
└── tests/
```

Les routers doivent rester minces.

Ils délèguent aux services applicatifs.

```text
Router
  ↓
Application Service
  ↓
Domain
  ↓
Infrastructure
```

---

# 7. `backend/modules`

Les modules métier principaux sont regroupés ici.

```text
backend/modules/
│
├── users/
├── organizations/
├── observations/
├── measurements/
├── sensors/
├── flood/
├── geo/
├── world/
├── alerts/
├── intelligence/
├── synchronization/
├── media/
└── audit/
```

> ⚠️ Cette liste représente les modules structurants identifiés. Elle n'interdit pas la création d'un module supplémentaire lorsqu'une responsabilité métier clairement justifiée apparaît.

---

# 8. Structure interne d'un module

Chaque module important doit suivre une structure cohérente.

Exemple :

```text
observations/
│
├── domain/
│   ├── entities/
│   ├── value_objects/
│   └── services/
│
├── application/
│   ├── commands/
│   ├── queries/
│   └── services/
│
├── infrastructure/
│   ├── repositories/
│   └── persistence/
│
├── api/
│   ├── routes/
│   └── schemas/
│
└── tests/
```

⚠️ Cette structure est un **exemple architectural**. Elle pourra être adaptée si une justification technique claire existe.

---

# 9. Domain Layer

Le domaine contient les règles métier.

Exemples de responsabilités :

```text
Validation métier
Invariants
Entités
Value Objects
Règles métier
Calculs métier déterministes
```

Le domaine ne doit pas dépendre directement de FastAPI.

---

# 10. Application Layer

La couche application orchestre les cas d'utilisation.

Exemple :

```text
CreateObservation
UpdateObservation
GetObservation
DeleteObservation
```

Elle coordonne :

```text
Domain
Repositories
Authorization
Transactions
Events
```

---

# 11. Infrastructure Layer

Elle contient les détails techniques.

Exemples :

```text
PostgreSQL
PostGIS
Object Storage
Queue
Cache
External APIs
AI Runtime
```

Le domaine ne doit pas connaître les détails techniques inutiles.

---

# 12. API Layer

L'API transforme :

```text
HTTP
 ↓
DTO
 ↓
Application Service
```

et inversement :

```text
Application Result
 ↓
Response DTO
 ↓
HTTP
```

Les controllers/routers ne doivent pas contenir une grande quantité de logique métier.

---

# 13. `backend/core`

Le core contient les éléments transversaux.

Exemples :

```text
configuration
logging
errors
security
database
events
types
utilities
```

> ⚠️ **EXEMPLES NON EXHAUSTIFS.**

Le dossier `core` ne doit pas devenir un dossier "fourre-tout".

---

# 14. `backend/infrastructure`

Ce dossier contient les implémentations techniques communes.

Exemple :

```text
backend/infrastructure/
├── database/
├── storage/
├── queue/
├── cache/
├── ai/
├── observability/
└── external/
```

---

# 15. Intelligence Engine

L'Intelligence Engine doit rester clairement séparé.

```text
intelligence/
│
├── context/
├── analytics/
├── detection/
├── prediction/
├── rag/
├── tools/
├── providers/
├── validation/
└── tests/
```

> ⚠️ Cette organisation est indicative et non exhaustive.

---

# 16. Règle fondamentale de l'IA

Aucun module métier ne doit appeler directement un modèle de langage.

Interdit :

```text
FloodService
    ↓
Ollama directement
```

Préféré :

```text
FloodService
    ↓
Intelligence Engine
    ↓
AI Provider Interface
    ↓
Local / External Provider
```

---

# 17. `packages/shared`

Contient les éléments réellement partagés entre plusieurs applications.

Exemples :

```text
types
constants
utility types
common schemas
```

Il ne doit pas devenir une poubelle contenant toute la logique métier.

---

# 18. `packages/contracts`

Contient les contrats partagés.

Exemples :

```text
API schemas
Sync contracts
Event contracts
DTO contracts
```

Cette couche permet de réduire les divergences entre frontend et backend.

---

# 19. `database`

```text
database/
├── migrations/
├── seeds/
└── scripts/
```

## migrations

Toutes les évolutions du schéma.

## seeds

Données nécessaires à l'initialisation.

## scripts

Scripts administratifs ou techniques.

---

# 20. `docs`

Les documents d'architecture doivent être conservés dans le repository.

Exemple :

```text
docs/
├── architecture/
├── requirements/
├── api/
├── database/
├── security/
├── deployment/
└── agents/
```

Les documents officiels doivent rester synchronisés avec le code.

---

# 21. `tests`

Les tests globaux peuvent être organisés par catégorie :

```text
tests/
├── unit/
├── integration/
├── api/
├── synchronization/
├── security/
├── geo/
└── end-to-end/
```

⚠️ Cette classification est indicative et non exhaustive.

---

# 22. Tests par module

Chaque module doit également pouvoir contenir ses tests locaux.

Exemple :

```text
observations/
└── tests/
    ├── unit/
    └── integration/
```

Les tests critiques doivent être proches du code qu'ils valident ou dans une suite globale clairement organisée.

---

# 23. `infrastructure/`

Ce dossier contient les éléments de déploiement.

Exemple :

```text
infrastructure/
├── docker/
├── deployment/
├── monitoring/
├── backup/
└── configuration/
```

---

# 24. `scripts/`

Les scripts reproductibles du projet.

Exemples :

```text
setup
database initialization
development
testing
backup
restore
lint
build
```

> ⚠️ Liste non exhaustive.

---

# 25. `AGENTS.md`

Le fichier `AGENTS.md` est obligatoire.

Il constitue le contrat entre IntelliFlood et les agents de programmation.

Il doit rappeler :

```text
1. Lire la documentation.
2. Respecter l'architecture.
3. Ne pas inventer les fonctionnalités.
4. Ne pas supprimer arbitrairement des modules.
5. Respecter les frontières.
6. Tester les modifications.
7. Documenter les changements.
8. Ne pas placer les calculs critiques dans l'UI.
9. Ne pas appeler directement les modèles IA.
10. Respecter la sécurité.
```

---

# 26. Règle OBLIGATOIRE / EXEMPLE / OPTIONNEL / À DÉFINIR

Tout document technique du projet doit utiliser autant que possible cette classification.

### OBLIGATOIRE

Élément devant être implémenté.

### EXEMPLE

Illustration permettant de comprendre le fonctionnement.

### OPTIONNEL

Possibilité qui peut être implémentée ultérieurement.

### À DÉFINIR

Décision non encore prise.

Un agent ne doit jamais transformer :

```text
EXEMPLE
```

en :

```text
OBLIGATOIRE
```

---

# 27. Règle contre l'invention

Si une information est :

```text
À DÉFINIR
```

l'agent ne doit pas inventer une décision définitive.

Il doit :

1. chercher si une décision existe ailleurs dans la documentation ;
2. vérifier les contraintes ;
3. signaler le manque ;
4. utiliser une solution temporaire uniquement si le contexte l'autorise explicitement.

---

# 28. Règle contre le feature creep

Un agent ne doit pas ajouter automatiquement :

* une fonctionnalité ;
* un module ;
* une technologie ;
* un service externe ;
* une API payante ;
* une dépendance importante ;

simplement parce qu'il considère que ce serait "utile".

Toute nouvelle fonctionnalité importante doit être :

```text
Proposée
   ↓
Justifiée
   ↓
Validée
   ↓
Documentée
   ↓
Implémentée
```

---

# 29. Règle de modification architecturale

Un agent ne doit pas modifier une décision architecturale majeure silencieusement.

Exemple :

```text
PostgreSQL
     ↓
MongoDB
```

ou :

```text
FastAPI
     ↓
Node.js
```

ne doit pas être effectué uniquement parce que l'agent préfère une autre technologie.

Toute modification importante nécessite :

* justification ;
* impact ;
* mise à jour documentaire ;
* validation humaine.

---

# 30. Règle de dépendances

Avant d'ajouter une dépendance :

```text
Pourquoi ?
Alternative native ?
Alternative open-source ?
Maintenance ?
Licence ?
Taille ?
Sécurité ?
Compatibilité ?
```

La dépendance doit avoir une justification.

---

# 31. Règle des calculs critiques

Les calculs critiques ne doivent pas être effectués uniquement par l'IA.

Architecture :

```text
Données
  ↓
Calcul déterministe
  ↓
Résultat
  ↓
IA
  ↓
Explication
```

et non :

```text
Données
  ↓
LLM
  ↓
"Calcul"
```

---

# 32. Règle des données

L'agent doit toujours distinguer :

```text
Observation
Calculation
Estimation
Prediction
Simulation
Interpretation
```

Il ne doit pas transformer une prédiction en fait.

---

# 33. Règle de provenance

Une donnée importante doit pouvoir répondre à :

```text
D'où vient-elle ?
Quand a-t-elle été obtenue ?
Par quel dispositif ?
Par quel utilisateur ?
A-t-elle été calculée ?
A-t-elle été estimée ?
A-t-elle été générée ?
```

---

# 34. Règle Offline-first

Lorsqu'une fonctionnalité doit fonctionner Offline :

```text
Local state
   ↓
Local persistence
   ↓
Sync queue
   ↓
Server
```

L'agent ne doit pas créer une fonctionnalité qui exige systématiquement Internet sans justification.

---

# 35. Règle de synchronisation

Les opérations Offline doivent être :

* identifiables ;
* idempotentes ;
* versionnées ;
* traçables ;
* capables de détecter les conflits.

---

# 36. Règle de sécurité

Aucune fonctionnalité ne doit contourner :

```text
Authentication
Authorization
Tenant Isolation
Audit
Validation
```

même si elle est exécutée depuis un client considéré comme "interne".

---

# 37. Règle de tests

Toute modification significative doit être accompagnée de tests appropriés.

```text
Code
 ↓
Test
 ↓
Validation
 ↓
Documentation
```

Les tests doivent notamment couvrir les comportements critiques.

---

# 38. Règle de documentation

Lorsqu'une modification change :

* l'architecture ;
* une API ;
* le modèle de données ;
* la sécurité ;
* la synchronisation ;
* le comportement métier ;

la documentation correspondante doit être mise à jour.

---

# 39. Architecture globale du repository

```text
                         IntelliFlood
                              │
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
          Frontend          Backend         Database
             │                │                │
             ▼                ▼                ▼
          React           FastAPI         PostgreSQL
             │                │                │
             │        ┌───────┼───────┐         │
             │        │       │       │         │
             │        ▼       ▼       ▼         │
             │      World   Flood   Intelligence│
             │      Engine  Engine    Engine    │
             │                                  │
             └──────────────┬───────────────────┘
                            │
                            ▼
                     Synchronisation
                            │
                            ▼
                     Offline / Online
```

---

# 40. Flux architectural officiel

```text
USER
 │
 ▼
React Web
 │
 ├──────────────► Local Store / IndexedDB
 │
 ▼
API
 │
 ▼
Application Services
 │
 ▼
Domain
 │
 ├──────────────► World Engine
 ├──────────────► Flood Engine
 ├──────────────► Geo/Data Engine
 └──────────────► Intelligence Engine
 │
 ▼
Infrastructure
 │
 ├── PostgreSQL/PostGIS
 ├── Object Storage
 ├── Queue
 └── AI Provider
```

---

# 41. Ce qu'un agent ne doit jamais faire

Sans validation explicite, un agent ne doit pas :

* changer la stack principale ;
* remplacer PostgreSQL ;
* supprimer PostGIS ;
* supprimer l'Offline-first ;
* supprimer le système de synchronisation ;
* contourner l'autorisation ;
* exposer directement la base ;
* appeler directement un LLM depuis l'UI ;
* déplacer les calculs critiques vers le frontend ;
* ajouter des services payants ;
* ajouter des fonctionnalités non demandées ;
* considérer les exemples comme exhaustifs ;
* considérer une hypothèse comme une décision ;
* supprimer une documentation parce qu'elle semble inutile.

---

# 42. Workflow obligatoire d'un agent

Avant de modifier le code :

```text
Lire AGENTS.md
       ↓
Lire les documents concernés
       ↓
Identifier les contraintes
       ↓
Identifier les décisions existantes
       ↓
Planifier
       ↓
Implémenter
       ↓
Tester
       ↓
Vérifier architecture
       ↓
Mettre documentation à jour
```

---

# 43. Checklist avant Pull Request

```text
[ ] Architecture respectée
[ ] Aucun feature creep
[ ] Tests ajoutés
[ ] Tests existants toujours OK
[ ] Sécurité vérifiée
[ ] Multi-tenancy vérifiée
[ ] Offline-first respecté si concerné
[ ] Synchronisation vérifiée si concernée
[ ] Documentation mise à jour
[ ] Aucun secret commité
[ ] Aucun appel IA incontrôlé
[ ] Aucun calcul critique dans l'UI
```

---

# 44. Principe directeur

Le repository IntelliFlood doit toujours rester compréhensible par :

* un étudiant ;
* un développeur humain ;
* un nouvel arrivant ;
* un agent IA ;
* un administrateur système.

La complexité technique doit être organisée, pas simplement cachée.

---

# 45. Décisions finales

| ID       | Décision                                               |
| -------- | ------------------------------------------------------ |
| REPO-001 | Repository modulaire                                   |
| REPO-002 | Frontend séparé du backend                             |
| REPO-003 | Backend organisé par domaines                          |
| REPO-004 | Séparation Domain/Application/Infrastructure/API       |
| REPO-005 | Contrats partagés centralisés                          |
| REPO-006 | Migrations versionnées                                 |
| REPO-007 | Tests structurés                                       |
| REPO-008 | Documentation versionnée                               |
| REPO-009 | AGENTS.md obligatoire                                  |
| REPO-010 | Classification OBLIGATOIRE/EXEMPLE/OPTIONNEL/À DÉFINIR |
| REPO-011 | Feature creep interdit sans validation                 |
| REPO-012 | Modifications architecturales majeures contrôlées      |
| REPO-013 | Calculs critiques déterministes                        |
| REPO-014 | IA derrière une abstraction contrôlée                  |

---

# 46. Critère de validation

DOCUMENT040 est considéré comme validé lorsque :

* le repository peut être créé conformément à cette structure ;
* `AGENTS.md` est présent ;
* les responsabilités des dossiers sont documentées ;
* les frontières entre modules sont définies ;
* les règles destinées aux agents sont appliquées ;
* les tests peuvent être exécutés de manière reproductible.

---

# 47. Principe final

> **Le repository IntelliFlood n'est pas seulement un emplacement pour du code : c'est la matérialisation de l'architecture du système.**

Toute organisation du code doit donc refléter les responsabilités définies dans les documents d'architecture.
