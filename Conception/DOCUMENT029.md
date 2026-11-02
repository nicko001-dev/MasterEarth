## DOCUMENT029 — Architecture API & Protocole de Synchronisation

**Projet :** IntelliFlood
**Document :** DOCUMENT029
**Titre :** Architecture API & Protocole de Synchronisation
**Version :** 1.0
**Statut :** Conception
**Dépendances :** DOCUMENT027, DOCUMENT028

---

# 1. Introduction

Le DOCUMENT028 a défini le fonctionnement Offline-first d'IntelliFlood.

Le présent document transforme cette architecture en un protocole de communication concret entre :

* le client IntelliFlood ;
* le Sync Engine ;
* l'API IntelliFlood ;
* les services métier ;
* PostgreSQL/PostGIS ;
* le stockage des médias.

L'objectif est de définir **comment les données circulent réellement** entre le client et le serveur.

---

# 2. Objectifs

L'API doit permettre :

* l'authentification ;
* la récupération des données ;
* la création d'entités ;
* la modification d'entités ;
* la suppression contrôlée ;
* la synchronisation incrémentale ;
* l'envoi des opérations hors connexion ;
* la récupération des modifications serveur ;
* la détection des conflits ;
* la synchronisation des médias ;
* l'accès aux données géospatiales ;
* la transmission des alertes ;
* la traçabilité des opérations.

---

# 3. Architecture générale

```text
┌──────────────────────────────────────────────────────┐
│                 CLIENT INTELLIFLOOD                  │
│                                                      │
│ UI → Application Core → Repository → Sync Engine    │
└──────────────────────────┬───────────────────────────┘
                           │
                           │ HTTPS
                           ▼
┌──────────────────────────────────────────────────────┐
│                    API GATEWAY                        │
├──────────────────────────────────────────────────────┤
│ Authentication │ Rate Limit │ Validation │ Routing   │
└──────────────────────────┬───────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────┐
│                 APPLICATION API                      │
├──────────────────────────────────────────────────────┤
│ User │ Flood │ Geo │ Alert │ Observation │ Sync     │
└───────────────┬───────────────────────┬──────────────┘
                │                       │
                ▼                       ▼
       ┌─────────────────┐      ┌─────────────────┐
       │ PostgreSQL      │      │ Object Storage  │
       │ + PostGIS       │      │ Photos/Videos   │
       └─────────────────┘      └─────────────────┘
```

---

# 4. Style d'API

L'API principale adoptera une architecture **REST**.

Les ressources seront organisées autour des concepts métier.

Exemples :

```text
/api/v1/users
/api/v1/observations
/api/v1/flood-events
/api/v1/alerts
/api/v1/zones
/api/v1/stations
/api/v1/sync
```

---

# 5. Versionnement

Toutes les routes publiques seront versionnées.

Exemple :

```text
/api/v1/...
```

Une nouvelle version majeure pourra être introduite ultérieurement :

```text
/api/v2/...
```

Cette approche évite de casser brutalement les anciennes applications.

---

# 6. Principes REST

Les opérations principales utiliseront :

| Méthode   | Utilisation |
| --------- | ----------- |
| GET       | Lire        |
| POST      | Créer       |
| PUT/PATCH | Modifier    |
| DELETE    | Supprimer   |

Cependant, les opérations de synchronisation disposeront également d'endpoints spécialisés.

---

# 7. Contrat général d'une réponse

Une réponse API doit conserver une structure cohérente.

```json
{
  "success": true,
  "data": {},
  "meta": {},
  "error": null
}
```

En cas d'erreur :

```json
{
  "success": false,
  "data": null,
  "meta": {},
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid observation"
  }
}
```

---

# 8. Pagination

Les grandes collections ne doivent pas être retournées entièrement.

Exemple :

```text
GET /api/v1/observations?page=1&limit=50
```

Réponse :

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 1320
  }
}
```

Pour la synchronisation, un mécanisme basé sur curseur sera privilégié.

---

# 9. Cursor-based synchronization

Le client conserve :

```text
sync_cursor
```

Exemple :

```text
874521
```

Il demande ensuite :

```text
GET /api/v1/sync/changes?cursor=874521
```

Le serveur renvoie les changements postérieurs.

```json
{
  "changes": [],
  "next_cursor": 874839,
  "has_more": true
}
```

---

# 10. Endpoint de synchronisation

Le protocole principal repose sur :

```text
POST /api/v1/sync/push
GET  /api/v1/sync/pull
```

Le premier envoie les modifications locales.

Le second récupère les modifications serveur.

---

# 11. Push

Exemple :

```json
{
  "device_id": "DEVICE-001",
  "operations": [
    {
      "operation_id": "OP-001",
      "entity_id": "OBS-001",
      "entity_type": "observation",
      "operation": "CREATE",
      "version": 1,
      "payload": {}
    }
  ]
}
```

---

# 12. Réponse Push

Le serveur répond opération par opération.

```json
{
  "results": [
    {
      "operation_id": "OP-001",
      "status": "SYNCED",
      "server_version": 1
    }
  ]
}
```

En cas de conflit :

```json
{
  "operation_id": "OP-002",
  "status": "CONFLICT",
  "server_version": 7
}
```

---

# 13. Pull

Le client envoie son curseur.

```text
GET /api/v1/sync/pull?cursor=874521
```

Le serveur renvoie :

```json
{
  "changes": [
    {
      "entity_id": "EVT-001",
      "entity_type": "flood_event",
      "operation": "UPDATE",
      "version": 8,
      "payload": {}
    }
  ],
  "next_cursor": 874600,
  "has_more": false
}
```

---

# 14. Cycle complet

```text
              CLIENT
                 │
                 ▼
        ┌─────────────────┐
        │ Network Monitor │
        └────────┬────────┘
                 │
                 ▼
        ┌─────────────────┐
        │   SYNC ENGINE   │
        └───────┬─────────┘
                │
          ┌─────┴─────┐
          ▼           ▼
       PUSH          PULL
          │           │
          ▼           ▼
      /sync/push  /sync/pull
          │           │
          └─────┬─────┘
                ▼
           API SERVER
                │
                ▼
       PostgreSQL/PostGIS
```

---

# 15. Idempotence

Chaque opération possède :

```text
operation_id
```

Le serveur conserve les opérations déjà traitées.

Si :

```text
OP-001
```

est reçue deux fois, la deuxième réception ne doit pas créer une deuxième entité.

---

# 16. Atomicité

Lorsqu'une opération contient plusieurs modifications dépendantes, celles-ci doivent être traitées de manière transactionnelle lorsque cela est nécessaire.

Exemple :

```text
CREATE FloodEvent
+
CREATE Observation
+
CREATE Relation
```

Le serveur ne doit pas produire un état partiellement incohérent.

---

# 17. Gestion des conflits

Le serveur vérifie :

```text
client_version
```

contre :

```text
server_version
```

Exemple :

```text
Client : version 4
Serveur : version 5
```

La modification est potentiellement conflictuelle.

Le serveur retourne :

```text
409 CONFLICT
```

avec les informations nécessaires au Conflict Manager.

---

# 18. Codes HTTP principaux

| Code | Signification         |
| ---- | --------------------- |
| 200  | Succès                |
| 201  | Création              |
| 204  | Succès sans contenu   |
| 400  | Requête invalide      |
| 401  | Non authentifié       |
| 403  | Non autorisé          |
| 404  | Ressource inexistante |
| 409  | Conflit               |
| 422  | Validation échouée    |
| 429  | Trop de requêtes      |
| 500  | Erreur serveur        |
| 503  | Service indisponible  |

---

# 19. API géospatiale

Les données géographiques doivent être accessibles via des paramètres spatiaux.

Exemple :

```text
GET /api/v1/zones?bbox=...
```

Ou :

```text
GET /api/v1/observations?lat=...&lng=...&radius=...
```

Le serveur utilisera PostGIS pour les requêtes spatiales.

---

# 20. API des alertes

Exemples :

```text
GET  /api/v1/alerts
GET  /api/v1/alerts/{id}
POST /api/v1/alerts
PATCH /api/v1/alerts/{id}
```

Les alertes critiques doivent également pouvoir être récupérées par le mécanisme de synchronisation prioritaire.

---

# 21. API des observations

```text
GET    /api/v1/observations
GET    /api/v1/observations/{id}
POST   /api/v1/observations
PATCH  /api/v1/observations/{id}
DELETE /api/v1/observations/{id}
```

Les créations hors connexion passeront ensuite par `/sync/push`.

---

# 22. Médias

Les fichiers lourds ne doivent pas être transférés directement avec toutes les données métier.

Le serveur fournit plutôt une procédure d'upload.

```text
Client
  │
  ▼
Request Upload
  │
  ▼
Upload URL
  │
  ▼
Object Storage
  │
  ▼
Confirm Upload
```

---

# 23. Synchronisation par lots

Plusieurs opérations peuvent être envoyées dans une seule requête.

Cela réduit :

* le nombre de requêtes ;
* la consommation réseau ;
* la latence.

Cependant, la taille des lots doit être limitée.

---

# 24. Compression

Lorsque cela est pertinent, les échanges peuvent utiliser une compression HTTP.

L'objectif est de réduire la consommation réseau, notamment sur les connexions mobiles.

---

# 25. Gestion de la bande passante

Le client doit pouvoir adapter le comportement selon la qualité réseau.

```text
BON RÉSEAU
→ Synchronisation normale

RÉSEAU FAIBLE
→ Petits lots

RÉSEAU TRÈS FAIBLE
→ Données critiques uniquement

OFFLINE
→ Stockage local
```

---

# 26. Événements temps réel

L'API REST constitue la base.

Pour certains événements nécessitant une propagation rapide, une couche temps réel pourra être utilisée.

Exemples :

* nouvelles alertes ;
* changement critique d'un événement ;
* mise à jour d'une situation d'urgence.

Le temps réel ne doit cependant pas remplacer le mécanisme Offline-first.

---

# 27. Principe important

```text
REST / Sync = source de synchronisation fiable

Temps réel = accélérateur de propagation
```

Si le temps réel tombe :

> le système doit continuer à fonctionner grâce à la synchronisation classique.

---

# 28. Séquence complète

```text
Utilisateur
    │
    ▼
Application
    │
    ▼
Local Repository
    │
    ▼
Sync Queue
    │
    ▼
Sync Engine
    │
    ▼
HTTPS
    │
    ▼
API Gateway
    │
    ▼
Sync Service
    │
    ├──► PostgreSQL/PostGIS
    │
    └──► Object Storage
    │
    ▼
Response
    │
    ▼
Local Repository
```

---

# 29. Contrats de données

Les contrats API doivent être documentés et versionnés.

Chaque ressource doit définir :

* identifiants ;
* types ;
* champs obligatoires ;
* champs facultatifs ;
* formats ;
* règles de validation ;
* versions ;
* erreurs possibles.

---

# 30. Validation

La validation doit être effectuée :

1. côté client pour améliorer l'expérience ;
2. côté serveur pour garantir l'intégrité.

La validation client ne remplace jamais la validation serveur.

---

# 31. Principe de confiance

Le serveur ne doit jamais considérer qu'une donnée venant du client est automatiquement fiable.

Même une opération créée hors connexion doit être :

```text
RECEIVED
   ↓
AUTHENTICATED
   ↓
AUTHORIZED
   ↓
VALIDATED
   ↓
VERSION CHECK
   ↓
PROCESSED
```

---

# 32. Critères d'acceptation

* [ ] API versionnée ;
* [ ] contrats documentés ;
* [ ] endpoints métier définis ;
* [ ] endpoints Push/Pull définis ;
* [ ] synchronisation par curseur ;
* [ ] opérations idempotentes ;
* [ ] conflits détectables ;
* [ ] médias séparés des données métier ;
* [ ] pagination ;
* [ ] validation client + serveur ;
* [ ] gestion des erreurs ;
* [ ] support des données géospatiales ;
* [ ] synchronisation par lots ;
* [ ] possibilité de fonctionnement dégradé.

---

# 33. Décisions architecturales

| ID      | Décision                                       |
| ------- | ---------------------------------------------- |
| API-001 | API REST versionnée                            |
| API-002 | `/api/v1` comme première version               |
| API-003 | Synchronisation Push/Pull                      |
| API-004 | Curseur de synchronisation                     |
| API-005 | Idempotence obligatoire                        |
| API-006 | Versionnement des entités                      |
| API-007 | Upload média séparé                            |
| API-008 | Validation client et serveur                   |
| API-009 | REST comme mécanisme de synchronisation fiable |
| API-010 | Temps réel complémentaire et non obligatoire   |

---

# 34. Conclusion

Le DOCUMENT029 transforme l'architecture Offline-first du DOCUMENT028 en un véritable protocole client/serveur.

Le modèle obtenu est :

> **Local → Queue → Push → Validation → Pull → Merge → Local**

Le système peut maintenant être conçu avec des contrats API précis sans remettre en cause l'architecture Offline-first.


---

## Complément — ingestion externe et synchronisation des observations (29 octobre 2026)

Les interfaces de synchronisation doivent prévoir l'intégration de mesures IoT et de données externes avec idempotence, validation de schéma, contrôle de taille, authentification, horodatage, provenance et traitement des données tardives. Les connecteurs peuvent utiliser HTTPS, MQTT, API de fournisseur, webhook ou passerelle selon les capacités documentées de la source.

La réception de données depuis une plateforme de fabricant ne doit pas rendre cette plateforme indispensable à tout IntelliFlood. Les secrets et clés doivent être gérés par configuration sécurisée et ne doivent pas être committés. La perte de connexion ne doit pas être confondue avec l'absence de risque ni avec une confirmation de sécurité.
