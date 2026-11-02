# DOCUMENT048 — ARCHITECTURE DU SYSTÈME D'ÉVÉNEMENTS INTELLIFLOOD

**Projet : IntelliFlood**
**Version : V1.0**
**Statut : Spécification technique**

---

# 1. Objectif

Le système d'événements permet aux différents moteurs IntelliFlood de communiquer sans créer de dépendances excessives entre eux.

Exemple :

```text
Nouvelle mesure reçue
        │
        ▼
Event
        │
        ├──► Flood Engine
        ├──► Intelligence Engine
        ├──► Alert Engine
        └──► Audit
```

L'objectif est de créer une architecture réactive tout en conservant une forte traçabilité.

---

# 2. Event ≠ Command

Une distinction fondamentale doit être conservée.

### Command

Une commande demande au système de faire quelque chose.

```text
CreateObservation
```

### Event

Un événement indique que quelque chose s'est produit.

```text
ObservationCreated
```

Donc :

```text
COMMAND
"Fais ceci"
    │
    ▼
SYSTEM
    │
    ▼
EVENT
"Ceci vient de se produire"
```

---

# 3. Architecture

```text
                 ┌─────────────────┐
                 │ Domain Services │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │ Event Publisher │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │ Event Bus       │
                 └───────┬─────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
       Consumer A     Consumer B     Consumer C
          │              │              │
          ▼              ▼              ▼
       Flood          Alert         Intelligence
```

---

# 4. Event Bus

L'Event Bus est le mécanisme permettant de publier et distribuer les événements.

La technologie concrète reste **À DÉFINIR** selon :

* volume ;
* besoin de persistance ;
* complexité ;
* fonctionnement offline ;
* infrastructure disponible ;
* coût ;
* maintenance.

---

# 5. Structure d'un événement

Un événement doit posséder un identifiant unique.

**⚠️ EXEMPLE NON EXHAUSTIF :**

```json
{
  "event_id": "evt-123",
  "event_type": "ObservationCreated",
  "occurred_at": "2026-09-30T10:15:00Z",
  "producer": "observation-service",
  "organization_id": "org-123",
  "entity_id": "obs-456",
  "payload": {},
  "metadata": {}
}
```

La structure finale sera définie dans les contrats techniques.

---

# 6. Propriétés importantes

Les événements doivent être :

* identifiables ;
* traçables ;
* versionnés ;
* horodatés ;
* associés à leur origine ;
* associés au tenant lorsque nécessaire.

---

# 7. Versionnement

Les événements peuvent évoluer.

Exemple :

```text
ObservationCreated v1
ObservationCreated v2
```

Un consommateur ne doit pas casser simplement parce que la structure d'un événement évolue.

---

# 8. Idempotence

Un même événement peut exceptionnellement être reçu plusieurs fois.

Le consommateur doit pouvoir éviter les effets indésirables.

```text
Event #123
   │
   ▼
Consumer
   │
   ├── première réception → TRAITÉ
   │
   └── deuxième réception → IGNORÉ / DÉJÀ TRAITÉ
```

---

# 9. Ordering

L'ordre des événements peut être important.

Exemple :

```text
ObservationCreated
        ↓
ObservationUpdated
        ↓
ObservationValidated
```

Le système doit identifier les domaines dans lesquels l'ordre est réellement nécessaire.

Il ne faut pas imposer une garantie globale d'ordre si elle n'est pas nécessaire.

---

# 10. Événements métier

**⚠️ EXEMPLES NON EXHAUSTIFS :**

```text
ObservationCreated
ObservationUpdated
ObservationValidated

FloodEventCreated
FloodEventUpdated

SensorStatusChanged

SimulationStarted
SimulationCompleted
SimulationFailed

AlertCreated
AlertActivated
AlertResolved
```

Ces noms illustrent le principe et ne constituent pas la liste définitive.

---

# 11. Événements techniques

Il peut également exister des événements techniques.

**⚠️ EXEMPLES NON EXHAUSTIFS :**

```text
SyncCompleted
SyncFailed
ImportCompleted
ImportFailed
WorkerStarted
WorkerFailed
```

---

# 12. Consumer

Chaque consumer possède une responsabilité précise.

Exemple :

```text
ObservationCreated
       │
       ├──► Quality Consumer
       ├──► Intelligence Consumer
       ├──► Audit Consumer
       └──► Alert Consumer
```

Un consumer ne doit pas devenir responsable de plusieurs domaines sans justification.

---

# 13. Event-driven ≠ absence d'API

L'architecture événementielle ne remplace pas REST.

Les deux mécanismes ont des rôles différents.

```text
REST
│
└── demande/réponse directe

EVENT
│
└── notification asynchrone
```

IntelliFlood conserve donc ses API REST définies dans les documents précédents.

---

# 14. Événements et Offline-first

Le système doit distinguer :

```text
LOCAL EVENT
SERVER EVENT
SYNCED EVENT
```

Un événement créé offline peut être synchronisé ultérieurement.

Il doit conserver :

* son identifiant ;
* son timestamp ;
* son origine ;
* son contexte.

---

# 15. Événements critiques

Certains événements peuvent avoir un impact important.

Pour ces événements :

* validation supplémentaire ;
* audit ;
* permissions ;
* éventuellement approbation humaine.

**⚠️ EXEMPLES NON EXHAUSTIFS :**

* activation d'une alerte critique ;
* modification d'une donnée scientifique validée ;
* action ayant un impact externe.

---

# 16. Event Store

Selon les besoins, certains événements peuvent être conservés dans un Event Store.

Il ne faut toutefois pas supposer que tout IntelliFlood doit devenir un système Event Sourcing.

### Event-driven

Les événements servent à communiquer.

### Event Sourcing

Les événements constituent la source principale permettant de reconstruire l'état.

Ces architectures ne sont pas équivalentes.

---

# 17. Retry

Si un consumer échoue :

```text
Event
 │
 ▼
Consumer
 │
 X
 │
 ▼
Retry
 │
 ├── succès
 │
 └── échec définitif
          │
          ▼
      Dead Letter
```

---

# 18. Dead Letter Queue

Les événements impossibles à traiter après les tentatives prévues peuvent être déplacés vers une file dédiée.

Objectifs :

* ne pas bloquer le système ;
* conserver l'événement ;
* permettre l'analyse ;
* permettre une nouvelle tentative manuelle.

---

# 19. Transactions

Lorsqu'un changement métier produit un événement important, le système doit éviter les situations du type :

```text
DATABASE = SUCCESS
EVENT = LOST
```

ou :

```text
EVENT = PUBLISHED
DATABASE = ROLLBACK
```

Une stratégie transactionnelle adaptée devra être définie.

Une approche possible est le pattern **Transactional Outbox**, mais son adoption définitive reste à confirmer lors de la conception d'infrastructure.

---

# 20. Sécurité

Les événements peuvent contenir des données sensibles.

Le système doit contrôler :

* qui peut publier ;
* qui peut consommer ;
* quelles données sont présentes ;
* quels tenants sont concernés ;
* ce qui est écrit dans les logs.

---

# 21. Observabilité

Chaque événement doit pouvoir être suivi.

Exemple :

```text
event_id
    ↓
publisher
    ↓
event bus
    ↓
consumer
    ↓
processing
    ↓
result
```

Cela facilite le diagnostic.

---

# 22. Tests

Les tests doivent couvrir :

* publication ;
* consommation ;
* idempotence ;
* retry ;
* dead-letter ;
* versionnement ;
* ordering lorsque nécessaire ;
* sécurité ;
* multi-tenancy ;
* offline/synchronisation.

---

# 23. Décisions

### EVT-001

Les événements sont distincts des commandes.

### EVT-002

Chaque événement possède un identifiant unique.

### EVT-003

Les consommateurs doivent être idempotents.

### EVT-004

Les événements doivent être versionnés.

### EVT-005

Les événements doivent être traçables.

### EVT-006

REST et événements sont complémentaires.

### EVT-007

Les événements critiques nécessitent une gouvernance renforcée.

### EVT-008

Les erreurs de consommation doivent pouvoir être réessayées.

### EVT-009

Les événements non traitables doivent être isolables.

### EVT-010

La technologie finale de l'Event Bus reste À DÉFINIR.

---

# 24. Principe final

> **Un événement informe le système qu'un changement s'est produit ; il ne doit pas devenir un moyen incontrôlé de contourner les frontières architecturales.**

**⚠️ EXEMPLES NON EXHAUSTIFS : les éléments présentés comme exemples illustrent le fonctionnement attendu, mais ne constituent pas une liste complète des fonctionnalités, données, cas d'utilisation ou composants à implémenter.**
