# IntelliFlood

## DOCUMENT028 — Architecture détaillée Offline-first & Synchronisation

**Projet :** IntelliFlood
**Document :** DOCUMENT028
**Titre :** Architecture détaillée Offline-first & Synchronisation
**Version :** 1.0
**Statut :** Draft de conception
**Dépendances principales :** DOCUMENT001 → DOCUMENT027
**Document précédent :** DOCUMENT027 — Schéma détaillé PostgreSQL/PostGIS

---

# 1. Introduction

IntelliFlood doit pouvoir continuer à fonctionner même lorsque la connexion Internet est faible, instable ou totalement absente.

Cette contrainte est particulièrement importante pour une plateforme destinée à l'observation environnementale, à la surveillance des inondations et à la gestion de situations critiques.

Le système ne doit donc pas être conçu selon le modèle classique :

> Application → Internet → Serveur → Base de données

mais selon le modèle :

> **Utilisateur → Application locale → Données locales → Synchronisation avec le serveur lorsque cela est possible**

Cette architecture est appelée **Offline-first**.

Le mode hors connexion n'est donc pas une fonctionnalité secondaire.

Il constitue une propriété fondamentale de l'architecture d'IntelliFlood.

---

# 2. Objectifs

L'architecture définie dans ce document doit permettre :

1. l'utilisation d'IntelliFlood sans connexion Internet ;
2. la consultation des données déjà disponibles localement ;
3. la création de nouvelles données hors connexion ;
4. la modification de données hors connexion ;
5. la mise en file d'attente des opérations locales ;
6. la synchronisation automatique lorsque la connexion revient ;
7. la reprise d'une synchronisation interrompue ;
8. la détection des conflits ;
9. la résolution contrôlée des conflits ;
10. l'évitement des doublons ;
11. la conservation de la provenance des données ;
12. la synchronisation des médias ;
13. la priorisation des données critiques ;
14. la gestion des versions ;
15. la synchronisation partielle lorsque la bande passante est limitée.

---

# 3. Principe fondamental

Le principe central est :

> **Local first, synchronize later.**

Une opération effectuée par l'utilisateur doit d'abord être enregistrée localement.

Exemple :

Un utilisateur observe une zone inondée et crée un signalement.

Même sans Internet :

```text
Utilisateur
    ↓
Création du signalement
    ↓
Base locale
    ↓
Sync Queue
    ↓
[Connexion absente]
    ↓
Attente
```

Lorsque la connexion revient :

```text
Connexion disponible
        ↓
Sync Engine
        ↓
Sync Queue
        ↓
Serveur IntelliFlood
        ↓
Validation
        ↓
Réponse
        ↓
Mise à jour locale
```

---

# 4. Architecture générale

L'architecture Offline-first est organisée en plusieurs couches.

```text
┌───────────────────────────────────────────────────────┐
│                    INTELLIFLOOD                       │
├───────────────────────────────────────────────────────┤
│                    UI / FRONTEND                       │
│                                                       │
│  Dashboard │ Carte │ Flood │ Alertes │ Observation   │
└──────────────────────────┬────────────────────────────┘
                           │
                           ▼
┌───────────────────────────────────────────────────────┐
│                  APPLICATION CORE                     │
│                                                       │
│  Domain Services │ State │ Validation │ Permissions  │
└──────────────────────────┬────────────────────────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
┌──────────────────────────┐   ┌───────────────────────┐
│     LOCAL DATA LAYER     │   │     SYNC ENGINE       │
│                          │   │                       │
│ IndexedDB                │   │ Sync Queue            │
│ Local Stores             │◄─►│ Conflict Manager      │
│ Cache                    │   │ Retry Manager         │
│ Local Metadata           │   │ Version Manager       │
└──────────────────────────┘   └───────────┬───────────┘
                                           │
                                           ▼
                              ┌────────────────────────┐
                              │    NETWORK LAYER       │
                              │                        │
                              │ API / WebSocket / HTTP │
                              └────────────┬───────────┘
                                           │
                                           ▼
                              ┌────────────────────────┐
                              │   INTELLIFLOOD SERVER   │
                              │                        │
                              │ API Gateway             │
                              │ Application Services    │
                              │ PostgreSQL/PostGIS      │
                              │ Object Storage          │
                              └────────────────────────┘
```

---

# 5. Base locale

## 5.1 Technologie

Pour la partie navigateur/web, le stockage local principal sera basé sur :

**IndexedDB**

IndexedDB permet de conserver des données structurées directement sur le périphérique de l'utilisateur.

Il est adapté aux données importantes et relativement volumineuses qu'une simple clé/valeur ne pourrait pas gérer efficacement.

---

# 6. Organisation des données locales

La base locale doit être organisée en plusieurs stores.

Architecture logique :

```text
IndexedDB
│
├── entities
│
├── observations
│
├── flood_events
│
├── alerts
│
├── map_data
│
├── users
│
├── sync_queue
│
├── sync_metadata
│
├── conflicts
│
├── media
│
└── cache_metadata
```

Chaque store possède un rôle précis.

---

# 7. Store `entities`

Ce store contient les objets métier téléchargés ou créés localement.

Exemples :

* zones ;
* infrastructures ;
* bâtiments ;
* routes ;
* cours d'eau ;
* stations ;
* capteurs ;
* équipements ;
* utilisateurs autorisés ;
* événements.

Chaque objet doit posséder au minimum :

```text
id
type
version
created_at
updated_at
deleted_at
sync_status
server_version
local_version
```

---

# 8. Store `observations`

Il contient les observations réalisées par les utilisateurs ou les systèmes automatisés.

Exemples :

```text
Observation
├── id
├── type
├── latitude
├── longitude
├── timestamp
├── source
├── value
├── confidence
├── author
├── created_at
├── updated_at
└── sync_status
```

Une observation peut être créée totalement hors connexion.

---

# 9. Store `flood_events`

Ce store contient les événements liés aux inondations.

Exemples :

* zone inondée ;
* niveau d'eau ;
* montée rapide du niveau ;
* débordement ;
* route bloquée ;
* infrastructure menacée ;
* signalement citoyen.

---

# 10. Store `alerts`

Il contient les alertes reçues ou générées localement.

Une alerte doit notamment conserver :

```text
id
severity
type
location
message
created_at
expires_at
source
status
version
sync_status
```

Les alertes critiques bénéficient d'une priorité de synchronisation élevée.

---

# 11. Store `sync_queue`

La Sync Queue constitue l'un des composants les plus importants de l'architecture.

Elle contient les opérations qui doivent encore être synchronisées avec le serveur.

Exemple :

```text
sync_queue

┌────────────┬──────────┬─────────┬──────────┬──────────┐
│ operation  │ entity   │ action  │ priority │ status   │
├────────────┼──────────┼─────────┼──────────┼──────────┤
│ OP001      │ OBS123   │ CREATE  │ HIGH     │ PENDING  │
│ OP002      │ EVT456   │ UPDATE  │ NORMAL   │ PENDING  │
│ OP003      │ ALT789   │ CREATE  │ CRITICAL │ PENDING  │
└────────────┴──────────┴─────────┴──────────┴──────────┘
```

---

# 12. Opérations synchronisables

Les opérations principales sont :

```text
CREATE
UPDATE
DELETE
```

Une opération de synchronisation possède notamment :

```text
operation_id
entity_id
entity_type
operation_type
payload
created_at
priority
attempt_count
status
client_version
server_version
last_attempt_at
error
```

---

# 13. États d'une opération

Une opération de synchronisation possède un cycle de vie.

```text
              ┌──────────┐
              │ CREATED  │
              └────┬─────┘
                   │
                   ▼
              ┌──────────┐
              │ PENDING  │
              └────┬─────┘
                   │
             Sync disponible
                   │
                   ▼
              ┌──────────┐
              │ SENDING  │
              └────┬─────┘
                   │
        ┌──────────┼───────────┐
        │          │           │
        ▼          ▼           ▼
    SUCCESS     CONFLICT     ERROR
        │          │           │
        ▼          ▼           ▼
     DONE      CONFLICT     RETRY
                   │           │
                   └─────┬─────┘
                         │
                         ▼
                      SENDING
```

---

# 14. États détaillés

Les états principaux sont :

### `PENDING`

L'opération attend une synchronisation.

### `SENDING`

L'opération est actuellement envoyée.

### `SYNCED`

L'opération a été acceptée par le serveur.

### `RETRY`

L'opération a échoué temporairement et doit être réessayée.

### `CONFLICT`

La version locale entre en conflit avec la version serveur.

### `FAILED`

L'opération a échoué définitivement ou nécessite une intervention.

---

# 15. Sync Engine

Le **Sync Engine** est responsable de toute la synchronisation.

Ses responsabilités :

```text
Sync Engine
│
├── Network Monitor
├── Queue Manager
├── Upload Manager
├── Download Manager
├── Retry Manager
├── Conflict Manager
├── Version Manager
├── Priority Manager
└── Sync State Manager
```

---

# 16. Network Monitor

Le Network Monitor surveille l'état de la connexion.

États :

```text
ONLINE
OFFLINE
UNSTABLE
LIMITED
```

Lorsque l'état change :

```text
OFFLINE
   ↓
ONLINE
   ↓
Déclenchement Sync Engine
```

Cependant, la présence d'une connexion réseau ne signifie pas nécessairement que le serveur est réellement accessible.

Le système doit donc effectuer une vérification réelle avant de considérer la synchronisation comme disponible.

---

# 17. Synchronisation automatique

Lorsque la connexion revient :

```text
Connexion détectée
        ↓
Health Check
        ↓
Serveur disponible ?
      /       \
    NON        OUI
     │          │
     ▼          ▼
   Retry     Sync Engine
                 │
                 ▼
            Sync Queue
                 │
                 ▼
          Upload / Download
```

---

# 18. Synchronisation bidirectionnelle

La synchronisation fonctionne dans les deux sens.

### Client → Serveur

Envoie :

* créations ;
* modifications ;
* suppressions ;
* observations ;
* événements ;
* médias ;
* données locales.

### Serveur → Client

Récupère :

* nouvelles données ;
* mises à jour ;
* alertes ;
* changements de statut ;
* corrections ;
* nouvelles versions.

Architecture :

```text
             ┌────────────────────┐
             │  CLIENT INTELLIFLOOD│
             └─────────┬──────────┘
                       │
             ┌─────────┴─────────┐
             │                   │
             ▼                   ▲
       PUSH LOCAL             PULL REMOTE
             │                   │
             ▼                   │
       ┌─────────────────────────────┐
       │       SYNC PROTOCOL         │
       └──────────────┬──────────────┘
                      │
                      ▼
             ┌─────────────────┐
             │ SERVEUR         │
             │ PostgreSQL      │
             │ PostGIS         │
             └─────────────────┘
```

---

# 19. Synchronisation incrémentale

IntelliFlood ne doit pas télécharger toute la base à chaque synchronisation.

Le système doit privilégier la synchronisation incrémentale.

Exemple :

```text
Dernière synchronisation :
14:00

Nouvelle synchronisation :
15:00

Données demandées :

updated_at > 14:00
```

Cela réduit :

* la consommation réseau ;
* le temps de synchronisation ;
* la consommation énergétique ;
* la quantité de données transférées.

---

# 20. Curseur de synchronisation

Chaque client possède un curseur.

Exemple :

```text
sync_cursor = 874521
```

Le serveur peut alors répondre :

```text
Changes after cursor 874521
```

Le client reçoit uniquement les modifications suivantes.

Après validation :

```text
sync_cursor = 874839
```

---

# 21. Idempotence

La synchronisation doit être **idempotente**.

Cela signifie qu'une même opération ne doit pas produire plusieurs fois le même effet.

Exemple :

```text
OP-123
CREATE OBS-456
```

Si le client envoie :

```text
OP-123
```

puis perd la connexion avant de recevoir la réponse, il peut réessayer.

Le serveur doit reconnaître :

```text
OP-123 already processed
```

et ne pas créer une deuxième observation.

---

# 22. Identifiants uniques

Les entités créées hors connexion doivent posséder un identifiant utilisable immédiatement.

Les UUID sont donc privilégiés.

Exemple :

```text
550e8400-e29b-41d4-a716-446655440000
```

Cela permet à plusieurs clients de créer simultanément des objets sans devoir attendre qu'un serveur fournisse un ID numérique.

---

# 23. Versionnement

Chaque entité synchronisable possède une version.

Exemple :

```text
Entity ID : EVT-001

local_version  = 4
server_version = 4
```

L'utilisateur modifie l'objet :

```text
local_version = 5
```

Lors de la synchronisation :

```text
Client version = 5
Server version = 4
```

La mise à jour peut être acceptée.

---

# 24. Détection des conflits

Un conflit apparaît lorsque plusieurs versions ont été modifiées indépendamment.

Exemple :

```text
Serveur
EVT-001 version 4
        │
        ├──────────────► Client A
        │                   │
        │                   ▼
        │              version 5A
        │
        └──────────────► Client B
                            │
                            ▼
                       version 5B
```

Si A et B tentent ensuite de synchroniser leurs modifications, le serveur doit détecter le conflit.

---

# 25. Stratégie de conflit

Il n'existe pas une seule stratégie applicable à toutes les données.

IntelliFlood adoptera une stratégie dépendant du type de donnée.

Exemples :

| Type                       | Stratégie                                                   |
| -------------------------- | ----------------------------------------------------------- |
| Donnée non critique        | Last-write-wins contrôlé                                    |
| Observation                | Conservation des deux observations si elles sont distinctes |
| Alerte critique            | Validation prioritaire                                      |
| Donnée géographique        | Résolution spécifique                                       |
| Configuration              | Version serveur prioritaire                                 |
| Média                      | Conservation des deux fichiers                              |
| Donnée réglementaire/audit | Intervention contrôlée                                      |

Le système ne doit jamais supprimer silencieusement une donnée importante.

---

# 26. Conflict Manager

Le Conflict Manager est chargé de :

1. détecter les conflits ;
2. classer leur gravité ;
3. déterminer une stratégie ;
4. résoudre automatiquement lorsque cela est sûr ;
5. demander une intervention lorsque nécessaire ;
6. conserver l'historique.

Architecture :

```text
                 Modification locale
                         │
                         ▼
                  Sync Request
                         │
                         ▼
                 Version Check
                         │
              ┌──────────┴──────────┐
              │                     │
          Compatible             Conflit
              │                     │
              ▼                     ▼
           Accept            Conflict Manager
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
                Automatic       Merge            Manual
                 Resolve        Resolve          Resolve
```

---

# 27. Résolution manuelle

Lorsqu'un conflit ne peut pas être résolu automatiquement, IntelliFlood doit présenter les informations nécessaires à l'utilisateur autorisé.

Exemple :

```text
CONFLIT DE DONNÉES

Objet : Zone inondée #ZF-001

Version locale :
Niveau d'eau : 1.20 m
Heure : 14:32

Version serveur :
Niveau d'eau : 1.35 m
Heure : 14:35

[Utiliser version locale]
[Utiliser version serveur]
[Créer une fusion]
```

La résolution doit elle-même être enregistrée dans l'audit.

---

# 28. Synchronisation des médias

Les médias peuvent être beaucoup plus lourds que les données classiques.

Exemples :

* photos ;
* vidéos ;
* captures ;
* fichiers SIG ;
* documents ;
* enregistrements audio.

Ils ne doivent donc pas être traités exactement comme les petits objets JSON.

Architecture :

```text
Observation
    │
    ├── Metadata
    │
    └── Media
          │
          ▼
     Local Storage
          │
          ▼
     Media Queue
          │
          ▼
     Upload Manager
          │
          ▼
   Object Storage
```

---

# 29. Priorité des données

Toutes les données ne possèdent pas la même urgence.

Le Sync Engine possède plusieurs niveaux :

```text
CRITICAL
HIGH
NORMAL
LOW
BACKGROUND
```

Exemple :

### CRITICAL

* alerte inondation majeure ;
* danger immédiat ;
* incident critique.

### HIGH

* observation urgente ;
* fermeture d'une route ;
* infrastructure menacée.

### NORMAL

* observation standard ;
* mise à jour classique.

### LOW

* métadonnées secondaires.

### BACKGROUND

* cache ;
* préchargement ;
* optimisation.

---

# 30. Exemple de file priorisée

```text
┌────────────┬──────────┬──────────────┐
│ ID         │ PRIORITY │ OPERATION    │
├────────────┼──────────┼──────────────┤
│ OP-001     │ CRITICAL │ CREATE ALERT │
│ OP-002     │ HIGH     │ CREATE EVENT │
│ OP-003     │ NORMAL   │ UPDATE ZONE  │
│ OP-004     │ LOW      │ UPDATE CACHE │
└────────────┴──────────┴──────────────┘
```

Le moteur traite d'abord les opérations critiques.

---

# 31. Retry Manager

Une erreur réseau temporaire ne doit pas faire échouer définitivement une opération.

Le système utilise un mécanisme de retry.

Exemple :

```text
Tentative 1
    ↓
Échec
    ↓
Attente
    ↓
Tentative 2
    ↓
Échec
    ↓
Attente plus longue
    ↓
Tentative 3
```

Un **exponential backoff** peut être utilisé.

Exemple conceptuel :

```text
1 s
2 s
4 s
8 s
16 s
...
```

Un délai maximal doit être appliqué.

---

# 32. Gestion des erreurs

Les erreurs doivent être catégorisées.

```text
NETWORK_ERROR
AUTH_ERROR
VALIDATION_ERROR
CONFLICT_ERROR
SERVER_ERROR
NOT_FOUND
PERMISSION_DENIED
STORAGE_ERROR
UNKNOWN_ERROR
```

Les erreurs temporaires sont réessayables.

Les erreurs permanentes doivent être signalées.

---

# 33. Synchronisation partielle

Si la connexion est faible, IntelliFlood ne doit pas nécessairement synchroniser tout le contenu.

Le système peut sélectionner :

```text
1. Alertes critiques
2. Observations prioritaires
3. Événements récents
4. Données géographiques essentielles
5. Médias prioritaires
6. Données secondaires
7. Cache
```

Cela permet au système de rester fonctionnel même avec une bande passante limitée.

---

# 34. Mode hors connexion

Lorsque l'application passe hors connexion :

```text
ONLINE
   │
   ▼
OFFLINE
   │
   ├── Lecture locale
   ├── Création locale
   ├── Modification locale
   ├── Mise en cache
   └── File d'attente
```

L'utilisateur doit être clairement informé du statut.

Exemple d'indicateur :

```text
● ONLINE
● OFFLINE
● SYNCHRONIZING
● SYNC ERROR
```

---

# 35. Retour en ligne

Lorsque la connexion revient :

```text
OFFLINE
   ↓
NETWORK DETECTED
   ↓
HEALTH CHECK
   ↓
AUTH CHECK
   ↓
PUSH LOCAL CHANGES
   ↓
RESOLVE CONFLICTS
   ↓
PULL REMOTE CHANGES
   ↓
UPDATE LOCAL DATABASE
   ↓
SYNC COMPLETE
```

---

# 36. Cycle complet de synchronisation

Le cycle global est :

```text
┌──────────────┐
│ Detect Network│
└──────┬───────┘
       ▼
┌──────────────┐
│ Health Check │
└──────┬───────┘
       ▼
┌──────────────┐
│ Authenticate │
└──────┬───────┘
       ▼
┌────────────────┐
│ Process Queue  │
└───────┬────────┘
        ▼
┌────────────────┐
│ Push Changes   │
└───────┬────────┘
        ▼
┌────────────────┐
│ Conflict Check │
└───────┬────────┘
        ▼
┌────────────────┐
│ Pull Changes   │
└───────┬────────┘
        ▼
┌────────────────┐
│ Update Local DB│
└───────┬────────┘
        ▼
┌────────────────┐
│ Update Cursor  │
└───────┬────────┘
        ▼
┌────────────────┐
│ SYNC COMPLETE  │
└────────────────┘
```

---

# 37. Architecture détaillée des composants

```text
                    IntelliFlood Client
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
        ▼                                     ▼
┌─────────────────┐                  ┌──────────────────┐
│ Application Core│                  │ Network Monitor  │
└────────┬────────┘                  └────────┬─────────┘
         │                                    │
         ▼                                    ▼
┌─────────────────┐                  ┌──────────────────┐
│ Local Repository│                  │   Sync Engine    │
└────────┬────────┘                  └────────┬─────────┘
         │                                    │
         ▼                 ┌──────────────────┼─────────────────┐
┌─────────────────┐        │                  │                 │
│    IndexedDB    │        ▼                  ▼                 ▼
└─────────────────┘   Queue Manager    Conflict Manager   Retry Manager
                           │                  │                 │
                           └──────────────────┼─────────────────┘
                                              ▼
                                      ┌────────────────┐
                                      │  API Gateway   │
                                      └───────┬────────┘
                                              ▼
                                      ┌────────────────┐
                                      │ Backend        │
                                      └───────┬────────┘
                                              ▼
                                      ┌────────────────┐
                                      │ PostgreSQL     │
                                      │ + PostGIS      │
                                      └────────────────┘
```

---

# 38. Modèle logique d'une opération

Une opération peut être représentée ainsi :

```text
SyncOperation
│
├── id
├── entityId
├── entityType
├── operationType
├── payload
├── priority
├── status
├── clientVersion
├── serverVersion
├── createdAt
├── updatedAt
├── attemptCount
├── lastAttemptAt
└── error
```

---

# 39. Relations avec le DOCUMENT027

Le DOCUMENT027 définit la structure PostgreSQL/PostGIS côté serveur.

Le DOCUMENT028 définit maintenant comment les clients interagissent avec cette structure en mode offline-first.

La relation est donc :

```text
DOCUMENT027
PostgreSQL / PostGIS
        ▲
        │
        │ Synchronisation
        │
DOCUMENT028
Offline-first / Sync Engine
        ▲
        │
        │
IndexedDB
        ▲
        │
Application IntelliFlood
```

---

# 40. Sécurité de la synchronisation

Les données synchronisées doivent respecter les mécanismes de sécurité déjà définis dans les documents précédents.

La synchronisation doit notamment contrôler :

* authentification ;
* autorisation ;
* identité de l'utilisateur ;
* permissions sur les entités ;
* intégrité des données ;
* provenance ;
* audit ;
* expiration des sessions.

Une opération locale ne doit pas permettre de contourner les permissions serveur.

---

# 41. Audit

Les opérations importantes doivent être traçables.

Exemple :

```text
AUDIT EVENT

operation_id : OP-001
user_id      : USER-123
entity_id    : EVT-456
action       : UPDATE
old_version  : 4
new_version  : 5
timestamp    : 2026-09-30T14:30:00Z
result       : SUCCESS
```

Les conflits et leurs résolutions doivent également être audités.

---

# 42. Cohérence des données

L'architecture doit rechercher :

> **Eventual Consistency**

en mode distribué.

Cela signifie qu'une donnée peut temporairement différer entre deux clients lorsque ceux-ci sont hors connexion.

Après synchronisation correcte, les données convergent vers un état cohérent.

```text
Client A ──── version 5
                    \
                     \
                      → Synchronisation → État cohérent
                     /
                    /
Client B ──── version 5
```

---

# 43. Contraintes de conception

L'architecture Offline-first doit respecter les contraintes suivantes :

### C1 — Pas de dépendance permanente au réseau

L'application principale doit rester utilisable hors connexion.

### C2 — Pas de perte silencieuse

Une donnée locale ne doit pas disparaître simplement parce qu'une synchronisation échoue.

### C3 — Idempotence

Une même opération doit pouvoir être rejouée sans créer de doublon.

### C4 — Traçabilité

Les opérations importantes doivent être auditables.

### C5 — Résilience

Une synchronisation interrompue doit pouvoir reprendre.

### C6 — Priorisation

Les données critiques doivent être synchronisées avant les données secondaires.

### C7 — Gestion explicite des conflits

Les conflits importants ne doivent pas être écrasés silencieusement.

---

# 44. Scénario complet

Considérons un utilisateur qui découvre une zone inondée sans connexion Internet.

### Étape 1

Il ouvre IntelliFlood.

```text
OFFLINE
```

### Étape 2

Il crée une observation :

```text
Zone : ZF-001
Niveau estimé : 1.2 m
Photo : IMG-001
```

### Étape 3

L'application sauvegarde immédiatement :

```text
IndexedDB
```

### Étape 4

Une opération est ajoutée :

```text
CREATE OBSERVATION
Priority = HIGH
Status = PENDING
```

### Étape 5

L'utilisateur continue à utiliser l'application normalement.

### Étape 6

La connexion revient.

### Étape 7

Le Network Monitor détecte le réseau.

### Étape 8

Le Sync Engine démarre.

### Étape 9

L'observation est envoyée au serveur.

### Étape 10

Le serveur valide l'opération.

### Étape 11

Le média est envoyé au stockage objet.

### Étape 12

Le serveur retourne la version officielle.

### Étape 13

IndexedDB est mise à jour.

### Étape 14

L'opération passe à :

```text
SYNCED
```

---

# 45. Résultat attendu

L'utilisateur ne doit jamais avoir l'impression que :

> « L'application ne fonctionne plus parce qu'Internet est coupé. »

Au contraire, l'expérience doit être :

> « L'application continue de fonctionner et synchronisera automatiquement les changements lorsque cela sera possible. »

C'est l'un des principes fondamentaux d'IntelliFlood.

---

# 46. Critères d'acceptation

L'architecture sera considérée comme conforme lorsque :

* [ ] l'application peut fonctionner sans connexion ;
* [ ] les données essentielles sont disponibles localement ;
* [ ] les nouvelles données peuvent être créées hors connexion ;
* [ ] les modifications sont conservées hors connexion ;
* [ ] les opérations sont ajoutées à une Sync Queue ;
* [ ] les opérations possèdent un statut ;
* [ ] les opérations peuvent être réessayées ;
* [ ] les opérations sont idempotentes ;
* [ ] les UUID empêchent les collisions d'identifiants ;
* [ ] les versions permettent de détecter les conflits ;
* [ ] les conflits peuvent être traités ;
* [ ] les données critiques sont prioritaires ;
* [ ] les médias possèdent leur propre mécanisme de synchronisation ;
* [ ] la synchronisation est incrémentale ;
* [ ] un curseur de synchronisation est maintenu ;
* [ ] une synchronisation interrompue peut reprendre ;
* [ ] les opérations importantes sont auditées ;
* [ ] aucune donnée importante n'est supprimée silencieusement ;
* [ ] le client et le serveur convergent après synchronisation.

---

# 47. Décisions architecturales

Les décisions prises dans ce document sont :

| ID      | Décision                                                          |
| ------- | ----------------------------------------------------------------- |
| OFF-001 | IntelliFlood adopte une architecture Offline-first                |
| OFF-002 | IndexedDB constitue le stockage local principal côté web          |
| OFF-003 | Les opérations hors connexion utilisent une Sync Queue            |
| OFF-004 | Les opérations sont idempotentes                                  |
| OFF-005 | Les entités synchronisables utilisent des UUID                    |
| OFF-006 | La synchronisation utilise le versionnement                       |
| OFF-007 | La synchronisation est incrémentale                               |
| OFF-008 | Les conflits sont détectés explicitement                          |
| OFF-009 | Les données critiques sont prioritaires                           |
| OFF-010 | Les médias possèdent un pipeline de synchronisation spécifique    |
| OFF-011 | Les opérations importantes sont auditables                        |
| OFF-012 | Le système doit pouvoir reprendre une synchronisation interrompue |

---

# 48. Architecture finale retenue

L'architecture Offline-first d'IntelliFlood peut finalement être résumée ainsi :

```text
                       ┌─────────────────────┐
                       │     UTILISATEUR     │
                       └──────────┬──────────┘
                                  │
                                  ▼
                       ┌─────────────────────┐
                       │  INTELLIFLOOD UI    │
                       └──────────┬──────────┘
                                  │
                                  ▼
                       ┌─────────────────────┐
                       │ APPLICATION CORE    │
                       └──────────┬──────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
          ┌──────────────────┐        ┌──────────────────┐
          │   LOCAL DATA     │        │   SYNC ENGINE    │
          │                  │        │                  │
          │ IndexedDB        │◄──────►│ Queue            │
          │ Cache            │        │ Retry            │
          │ Entities         │        │ Conflict         │
          │ Observations     │        │ Version          │
          │ Alerts           │        │ Priority         │
          │ Media            │        │ Network          │
          └──────────────────┘        └────────┬─────────┘
                                                │
                                                ▼
                                      ┌──────────────────┐
                                      │  NETWORK / API   │
                                      └────────┬─────────┘
                                               │
                                               ▼
                                      ┌──────────────────┐
                                      │ INTELLIFLOOD API │
                                      └────────┬─────────┘
                                               │
                              ┌────────────────┴──────────────┐
                              │                               │
                              ▼                               ▼
                    ┌──────────────────┐            ┌──────────────────┐
                    │ PostgreSQL       │            │ Object Storage   │
                    │ + PostGIS        │            │ Media            │
                    └──────────────────┘            └──────────────────┘
```

---

# 49. Conclusion

Le DOCUMENT028 établit l'architecture Offline-first d'IntelliFlood.

Cette architecture transforme la connexion Internet en une capacité supplémentaire plutôt qu'en une dépendance fondamentale.

Le système peut :

```text
OBSERVE
   ↓
STORE LOCALLY
   ↓
WORK OFFLINE
   ↓
QUEUE
   ↓
CONNECT
   ↓
SYNC
   ↓
VALIDATE
   ↓
MERGE
   ↓
CONVERGE
```

Le principe essentiel est donc :

> **IntelliFlood doit continuer à fonctionner même lorsque le réseau disparaît.**

Le prochain niveau de conception pourra maintenant s'appuyer sur cette architecture pour définir précisément les **API, le protocole de synchronisation, les contrats de données et les mécanismes serveur/client** nécessaires à son implémentation.


---

## Complément — ingestion IoT déconnectée et données nationales (29 octobre 2026)

Le protocole de synchronisation doit gérer les observations produites localement pendant une coupure réseau, les reprises, les doublons, les données tardives et la conservation de l'horodatage original. Les appareils ou passerelles peuvent avoir des capacités différentes ; les garanties doivent être documentées pour chaque intégration réelle plutôt que supposées universelles.

Les données synchronisées doivent conserver la provenance et permettre de distinguer les zones couvertes par des mesures de celles pour lesquelles seules des données générales, des estimations ou aucune donnée exploitable ne sont disponibles. Le système cible l'ensemble du territoire ivoirien sans exiger une connectivité permanente de chaque zone.
