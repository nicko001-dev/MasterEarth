# MasterEarth — Architecture Interne de Référence (M0.3)

Ce document formalise l'architecture interne de base du projet **MasterEarth**, établie lors du jalon **M0.3**. Il constitue le guide de référence obligatoire pour tout futur agent ou développeur intervenant sur le repository.

---

## 1. Principes Fondamentaux

1. **Modularité et séparation des responsabilités** : chaque module possède une responsabilité unique et clairement délimitée.
2. **Direction stricte des dépendances** : les couches supérieures dépendent des couches inférieures, jamais l'inverse.
3. **Préparer l'avenir sans le construire prématurément** : l'architecture fournit des fondations claires sans introduire d'abstractions superflues, de code mort ou de faux composants.
4. **Offline-first & déterminisme** : les calculs critiques et la logique métier doivent être déterministes et indépendants des canaux d'entrée/sortie.
5. **Conservation des acquis M0.1/M0.2** : la configuration dynamique par variables d'environnement (`pydantic-settings`, Vite `loadEnv`), l'isolation des tests et les endpoints techniques restent pleinement opérationnels.

---

## 2. Décisions Architecturales Obligatoires (Imposées par M0.3)

Ces décisions constituent des règles fermes du projet.

### A. Organisation Globale du Repository

```text
Current/IntelliFlood/
├── apps/
│   ├── api/             # Backend FastAPI (Python)
│   └── web/             # Frontend React + TypeScript (Vite)
├── packages/
│   ├── contracts/       # Contrats d'échange et interfaces partagées
│   └── shared/          # Utilitaires et constantes universelles pures
├── database/            # Réservé à M1 (migrations, scripts, schémas DB)
├── infrastructure/      # Configurations de déploiement et conteneurs
├── docs/                # Documentation technique et architecturale
├── scripts/             # Scripts de maintenance et outillage développeur
├── tests/               # Tests transversaux et end-to-end futurs
├── .env.example         # Modèle des variables d'environnement globales
├── .gitignore           # Règles d'exclusion des artefacts et secrets
├── AGENTS.md            # Consignes strictes pour les agents IA
└── README.md            # Guide d'accueil, d'installation et d'exécution
```

### B. Architecture Interne du Backend (`apps/api/app/`)

Le backend suit une séparation en couches concentriques :

```text
apps/api/app/
├── __init__.py
├── main.py              # Point d'entrée FastAPI, cycle de vie (lifespan), middleware CORS et RequestID
├── config.py            # Configuration dynamique via pydantic-settings
├── api/                 # Couche Présentation HTTP
│   ├── __init__.py
│   ├── router.py        # Agrégateur des routeurs de l'API
│   └── routes/          # Définition des endpoints par ressource
│       ├── __init__.py
│       ├── health.py    # Route GET /health
│       └── root.py      # Route GET /api/v1
├── core/                # Couche Transversale (M2.1 Core)
│   ├── __init__.py      # Re-exports publics des primitives transverses
│   ├── exceptions.py    # Hiérarchie d'exceptions applicatives pures
│   ├── handlers.py      # Gestionnaires d'exceptions globaux FastAPI
│   ├── logging.py       # Configuration du logger applicatif 'intelliflood'
│   └── middleware.py    # Middleware de corrélation X-Request-ID
├── schemas/             # Couche Structures de Données (DTO / Pydantic)
│   ├── __init__.py
│   ├── common.py        # Schémas standardisés d'erreurs (ErrorDetail, ErrorResponse)
│   └── system.py        # Schémas des réponses techniques (HealthResponse, ApiRootResponse)
├── services/            # Couche Logique Applicative
│   ├── __init__.py
│   └── system.py        # SystemService (fourniture de l'état système et métadonnées)
├── infrastructure/      # Couche Infrastructure & Données (M1)
│   ├── __init__.py
│   └── db/
│       ├── __init__.py
│       ├── base.py      # Base déclarative SQLAlchemy
│       ├── models.py    # Modèle de base abstrait (BaseModel)
│       ├── repository.py# Dépôt de données générique (BaseRepository)
│       └── session.py   # Gestionnaire de sessions et moteur DB paresseux
└── domain/              # Couche Métier (entités, invariants - réservé M2+)
    └── __init__.py
```

#### Responsabilités des couches backend :

| Couche | Rôle | Dépendances autorisées |
|---|---|---|
| **`api/`** | Réception HTTP, validation des paramètres d'entrée, appel des services, retour des réponses formatées. | `services/`, `schemas/`, `core/` |
| **`services/`** | Orchestration de la logique applicative, cas d'usage, coordination domaine. | `domain/`, `schemas/`, `core/` |
| **`schemas/`** | Modèles Pydantic pour sérialisation, désérialisation et validation des entrées/sorties API. | Bibliothèques standards / Pydantic |
| **`domain/`** | Concepts métier purs, entités, règles de gestion métier, invariants. | Aucune dépendance externe ou framework HTTP |
| **`core/`** | Configuration globale, primitives transverses, sécurité générale, journalisation. | Bibliothèques standards / système |

#### Règle de dépendance stricte du backend :

```text
HTTP / API (api/)
       ↓
Services Applicatifs (services/)
       ↓
Domaine Métier (domain/)
```

**Interdictions formelles :**
- Une route (`api/routes/`) ne doit JAMAIS accéder directement à la base de données.
- Une route ne doit pas implémenter de logique métier complexe ; elle doit déléguer à un service.
- La couche `domain/` ne doit JAMAIS dépendre de FastAPI, Starlette ou de détails d'infrastructure.

### C. Architecture Interne du Frontend (`apps/web/src/`)

Le frontend React structure son code en composants, services et logique applicative :

```text
apps/web/src/
├── app/                 # Composant racine applicatif (App.tsx)
│   └── App.tsx
├── components/          # Composants UI modulaires réutilisables
│   └── StatusCard.tsx
├── services/            # Clients d'API et communication réseau
│   └── api.ts
├── config.ts            # Configuration centralisée issue des variables Vite
├── main.tsx             # Point d'entrée de montage React dans le DOM
├── styles.css           # Styles CSS globaux de base
└── vite-env.d.ts        # Typage TypeScript des variables d'environnement
```

#### Responsabilités des couches frontend :
- **`app/`** : Orchestre la vue racine et l'arbre des composants applicatifs.
- **`components/`** : Contient des composants réutilisables indépendants. Aucune URL backend n'est codée en dur dans un composant.
- **`services/`** : Centralise les appels `fetch` vers l'API backend en utilisant `config.apiBaseUrl`.
- **`config.ts`** : Point unique d'accès aux variables d'environnement (`VITE_*`).

### D. Règle de Dépendance entre Projets et Packages

```text
apps/api ───┐
            ├───► packages/contracts
apps/web ───┘───► packages/shared
```

- `apps/api` et `apps/web` peuvent consommer `packages/contracts` et `packages/shared`.
- **Aucune dépendance inverse** : les packages partagés ne dépendent JAMAIS de `apps/api` ni de `apps/web`.
- Le backend ne dépend pas du frontend et vice-versa.
- Les packages partagés doivent rester agnostiques des frameworks web spécifiques.

### E. Fondations Transversales Backend (M2.1 Core)

Le jalon M2.1 établit cinq fondations transversales partagées dans `app/core/` et `app/schemas/common.py` :

1. **Hiérarchie d'exceptions applicatives (`app/core/exceptions.py`)** :
   - Découplée de tout framework web (pure Python).
   - Classe de base `AppException(message, code, details)`.
   - Exceptions spécialisées :
     - `NotFoundError` (code: `NOT_FOUND`, HTTP 404)
     - `ConflictError` (code: `CONFLICT`, HTTP 409)
     - `ValidationAppError` (code: `VALIDATION_ERROR`, HTTP 422)
     - `AuthenticationError` (code: `AUTHENTICATION_FAILED`, HTTP 401)
     - `PermissionDeniedError` (code: `PERMISSION_DENIED`, HTTP 403)
   - *Note : les exemples de codes et messages sont illustratifs et non exhaustifs.*

2. **Contrat d'erreur HTTP unifié (`app/schemas/common.py`)** :
   - `ErrorDetail` : structure `{ field, message, code }` pour le détail d'une anomalie de champ.
   - `ErrorResponse` : enveloppe JSON standardisée `{ status: "error", code: str, message: str, details: list[ErrorDetail] | None, request_id: str | None }`.
   - Garantit une structure de réponse d'erreur prévisible et typée pour l'ensemble des consommateurs de l'API.

3. **Gestionnaires d'exceptions globaux (`app/core/handlers.py`)** :
   - Enregistrés sur l'application FastAPI via `register_exception_handlers(app)`.
   - Traduisent les `AppException` vers leurs codes HTTP respectifs.
   - Convertissent les `RequestValidationError` de FastAPI/Pydantic en `ErrorResponse` (HTTP 422).
   - Préservent les erreurs HTTP de Starlette (404 Not Found, 405 Method Not Allowed).
   - Interceptent les erreurs inattendues (HTTP 500) en consignant la trace dans les logs au niveau ERROR, sans divulguer d'informations sensibles en production (`api_debug=False`).

4. **Journalisation centralisée (`app/core/logging.py`)** :
   - Logger applicatif hiérarchique nommé `intelliflood`.
   - Format structuré incluant l'horodatage, le niveau, le logger et le `request_id` contextuel.
   - Configuration idempotente (`setup_logging()`) sans duplication de handlers.
   - Niveau de log asservi à `Settings.api_debug` (DEBUG si actif, INFO sinon).
   - Règles strictes de sécurité : exclusion de tout secret, mot de passe ou jeton des logs.

5. **Identifiant de requête et cycle de vie (`app/core/middleware.py`, `app/main.py`)** :
   - Middleware `RequestIDMiddleware` injectant un en-tête `X-Request-ID` sur toutes les réponses (succès et erreurs).
   - Validation stricte des identifiants clients (longueur max 64 caractères, caractères alphanumériques/tirets) ; remplacement par un UUID4 serveur en cas d'absence ou d'invalidité.
   - Propagation via `ContextVar` (`request_id_var`) pour rattachement automatique aux logs sans état global partagé.
   - Cycle de vie asynchrone (`lifespan`) dans `main.py` : initialisation du logging au démarrage et libération sûre et idempotente des ressources de base de données (`close_db()`) à l'arrêt dans un bloc `finally`.

---

## 3. Guide Pratique : Où placer le futur code ?

| Besoin / Futur composant | Emplacement imposé | Emplacement interdit |
|---|---|---|
| Nouvel endpoint HTTP | `apps/api/app/api/routes/<nom>.py` | Directement dans `main.py` |
| Schéma de validation Pydantic | `apps/api/app/schemas/<nom>.py` | Dans les fichiers de routes |
| Logique applicative / service | `apps/api/app/services/<nom>.py` | Dans les contrôleurs de routes |
| Règle métier pure / Entité | `apps/api/app/domain/<nom>.py` | Dans `api/` ou `infrastructure/` |
| Primitives transverses / Core | `apps/api/app/core/<nom>.py` | Dans `domain/` ou `services/` |
| Paramètre de configuration | `apps/api/app/config.py` + `.env.example` | Valeur codée en dur dans le code |
| Nouveau composant UI React | `apps/web/src/components/<Nom>.tsx` | Dans `main.tsx` |
| Appel réseau frontend | `apps/web/src/services/<nom>.ts` | Enfoui dans un composant JSX |
| Type TypeScript partagé | `packages/contracts/src/` | Dupliqué séparément dans chaque app |
| Constante universelle pure | `packages/shared/src/` | Dispersée dans des fichiers locaux |

---

## 4. Frontières Strictes des Milestones

La liste des jalons ci-dessus décrit l'architecture prévue lors de M0.3; elle
n'est pas un statut vivant. Au 1er novembre 2026, le dépôt contient en plus des
fondations : authentification et rôles, organisations/audit, API capteurs et
alertes, collecte météo, globe/cartographie, simulation indicative et
connecteurs IoT. Plusieurs de ces capacités sont partielles et ne sont pas
validées en production. La [matrice BOATIKS](BOATIKS_REQUIREMENTS_MATRIX.md)
fait foi pour le statut et les tests constatés; elle distingue le code présent,
les exigences incomplètes et les validations externes.

---

## 5. Exemples d'Évolution Future

> ⚠️ **Mention obligatoire : Exemple — non exhaustif.**
> Les éléments ci-dessous sont présentés à titre indicatif pour illustrer comment l'architecture accueillera les jalons ultérieurs. Ils ne constituent pas des exigences du jalon M0.3.

### *Exemple — non exhaustif* : Organisation future du backend sous M1/M2/M3

```text
apps/api/app/
├── api/
│   └── routes/
│       ├── health.py
│       ├── root.py
│       ├── alerts.py        # Exemple futur (M8)
│       └── sensors.py       # Exemple futur (M2/M3)
├── domain/
│   ├── flood/               # Exemple futur (M6)
│   └── weather/             # Exemple futur (M2)
├── infrastructure/          # Exemple futur (M1)
│   └── db/                  # M1 : sessions, repositories SQLAlchemy
├── schemas/
└── services/
```

### *Exemple — non exhaustif* : Organisation future du frontend sous M4/M5

```text
apps/web/src/
├── app/
├── components/
│   ├── map/                 # Exemple futur (M5)
│   └── alerts/              # Exemple futur (M8)
├── pages/                   # Exemple futur (M4)
│   ├── DashboardPage.tsx
│   └── MapPage.tsx
├── services/
└── lib/
```

---

## 6. Intelligence Engine (implémentation facultative)

Le moteur IA est une couche de service optionnelle exposée par
`apps/api/app/api/routes/ai.py`. Les contrats sont dans `schemas/ai.py`, la
coordination et la provenance dans `services/ai.py`, les règles statistiques
pures dans `domain/anomaly.py` et les adaptateurs fournisseurs à hôtes fixes
dans `infrastructure/ai_providers.py`.

Les cinq fournisseurs configurables sont Gemini, Groq, Mistral, xKiro et
OpenRouter. Les identifiants sont chiffrés en base par Fernet; la clé maître
`AI_ENCRYPTION_KEY` reste une configuration d'exploitation, séparée de la base.
L'administrateur choisit explicitement les modèles gratuits et leur ordre. Le
gateway relit leurs catalogues, limite les tentatives et ne transmet jamais de
repli payant. Une offre gratuite ou un fournisseur disponible ne sont pas
garantis.

Le client web exige un consentement par requête; le contexte distant se limite
à des agrégats capteurs/météo/alertes et à des extraits de conception. Les
observations libres, identifiants, noms et coordonnées en sont exclus. L'analyse
d'image est distincte, opt-in, réencodée sans métadonnées et non conservée.
L'assistant est informatif : alertes, seuils et simulations ne dépendent pas du
modèle. En l'absence de réseau ou de modèle, un résumé local déterministe est
clairement différencié d'une réponse IA.

Le panneau MasterEarth de `apps/world` réutilise la même API, le même catalogue
et les mêmes identifiants MasterEarth. Il n'y a pas de deuxième magasin de clés
IA. Les services vocaux et HUD préexistants dans `apps/world` restent
indépendants et ne reçoivent pas automatiquement le contexte hydrologique. Voir
[`AI_ENGINE.md`](AI_ENGINE.md) pour le paramétrage, la confidentialité et les
limites.
