# DOCUMENT038 — CONTRATS API DÉFINITIFS V1

**Projet : IntelliFlood**
**Version : 1.0**
**Statut : Spécification technique**
**Dépendances : DOCUMENT028, DOCUMENT029, DOCUMENT030, DOCUMENT031, DOCUMENT036, DOCUMENT037**

---

## 1. Objectif

Ce document définit les contrats techniques de l'API REST V1 d'IntelliFlood.

L'API constitue le contrat de communication entre :

* l'application Web ;
* les clients mobiles éventuels ;
* le moteur de synchronisation ;
* les modules internes du backend ;
* les outils externes autorisés ;
* les futurs clients compatibles avec l'API.

L'objectif est d'obtenir une API :

* versionnée ;
* cohérente ;
* documentée ;
* sécurisée ;
* compatible avec l'architecture Offline-first ;
* compatible avec le multi-tenant ;
* idempotente lorsque nécessaire ;
* contrôlable ;
* testable ;
* indépendante de l'implémentation interne du backend.

---

## 2. Principe architectural

```text
                    ┌──────────────────────┐
                    │      Client Web      │
                    │   React / TypeScript │
                    └──────────┬───────────┘
                               │
                               │ HTTPS
                               ▼
                    ┌──────────────────────┐
                    │      API Gateway     │
                    │ Auth / Rate Limit /  │
                    │ Validation / Routing │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
       ┌────────────┐   ┌────────────┐   ┌────────────┐
       │  Domaines  │   │ Synchroni- │   │ Intelligence│
       │ métier     │   │ sation     │   │ Engine      │
       └─────┬──────┘   └─────┬──────┘   └────────────┘
             │                │
             └────────┬───────┘
                      ▼
              ┌───────────────┐
              │ PostgreSQL +  │
              │    PostGIS    │
              └───────────────┘
```

---

# 3. Versionnement

Toutes les routes publiques V1 doivent commencer par :

```text
/api/v1/
```

Exemples :

```text
/api/v1/users
/api/v1/observations
/api/v1/flood-events
/api/v1/alerts
/api/v1/sync/push
/api/v1/sync/pull
```

Une nouvelle version majeure ne doit pas casser silencieusement les contrats existants.

---

# 4. Format standard des réponses

## 4.1 Réponse réussie

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

## 4.2 Réponse d'erreur

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {}
  },
  "meta": {}
}
```

Le format exact des champs peut évoluer dans les versions futures, mais les clients doivent pouvoir distinguer :

1. succès ;
2. données ;
3. métadonnées ;
4. erreur.

---

# 5. Authentification

Les endpoints protégés doivent nécessiter une identité authentifiée.

Le système d'authentification est défini dans DOCUMENT030.

L'API ne doit jamais considérer l'identité envoyée par le client comme suffisante sans validation côté serveur.

Le serveur doit déterminer :

```text
Utilisateur
   ↓
Session / Token
   ↓
Identité authentifiée
   ↓
Organisation
   ↓
Rôles
   ↓
Permissions
   ↓
Autorisation de l'action
```

---

# 6. Multi-tenancy

Chaque requête concernant des données métier doit être évaluée dans le contexte de l'organisation de l'utilisateur.

```text
Request
   │
   ▼
Authentication
   │
   ▼
User
   │
   ▼
Organization Context
   │
   ▼
Authorization
   │
   ▼
Database Query
   │
   ▼
PostgreSQL RLS
```

Le client ne doit pas pouvoir contourner l'isolation en modifiant simplement un `organization_id`.

---

# 7. Pagination

Les collections importantes doivent supporter la pagination.

Format conceptuel :

```text
GET /api/v1/observations?limit=50&cursor=abc123
```

Réponse :

```json
{
  "success": true,
  "data": [],
  "meta": {
    "next_cursor": "xyz456",
    "has_more": true
  }
}
```

La pagination par curseur est privilégiée pour les données susceptibles d'évoluer fréquemment.

---

# 8. Ressources principales

Les ressources suivantes constituent le socle API V1.

> ⚠️ **EXEMPLES NON EXHAUSTIFS :** cette liste présente les ressources structurantes identifiées à ce stade. Elle ne constitue pas nécessairement la liste complète de tous les endpoints qui devront exister.

```text
/api/v1/users
/api/v1/organizations
/api/v1/devices
/api/v1/observations
/api/v1/measurements
/api/v1/sensors
/api/v1/flood-events
/api/v1/flood-zones
/api/v1/alerts
/api/v1/world-objects
/api/v1/scenarios
/api/v1/simulations
/api/v1/media
/api/v1/data-sources
/api/v1/audit
/api/v1/sync
/api/v1/intelligence
```

---

# 9. Observations

## Création

```text
POST /api/v1/observations
```

Exemple :

```json
{
  "type": "water_level",
  "value": 1.42,
  "unit": "m",
  "observed_at": "2026-09-30T12:30:00Z",
  "location": {
    "latitude": 5.34,
    "longitude": -4.02
  },
  "source": "sensor"
}
```

⚠️ Cet objet est un **exemple non exhaustif**. Le schéma final doit être aligné avec le modèle physique du DOCUMENT037.

---

## Consultation

```text
GET /api/v1/observations/{id}
```

## Liste

```text
GET /api/v1/observations
```

## Modification

```text
PATCH /api/v1/observations/{id}
```

## Suppression

```text
DELETE /api/v1/observations/{id}
```

Les permissions doivent être vérifiées pour chaque opération.

---

# 10. Événements d'inondation

```text
GET    /api/v1/flood-events
POST   /api/v1/flood-events
GET    /api/v1/flood-events/{id}
PATCH  /api/v1/flood-events/{id}
DELETE /api/v1/flood-events/{id}
```

Les événements doivent conserver leur provenance et leur statut.

---

# 11. Zones d'inondation

```text
GET /api/v1/flood-zones
GET /api/v1/flood-zones/{id}
POST /api/v1/flood-zones
PATCH /api/v1/flood-zones/{id}
```

Les opérations géographiques doivent être effectuées côté backend.

Le frontend ne doit pas être responsable des calculs critiques.

---

# 12. Alertes

```text
GET /api/v1/alerts
POST /api/v1/alerts
GET /api/v1/alerts/{id}
PATCH /api/v1/alerts/{id}
```

Une alerte doit notamment pouvoir posséder :

* un niveau de criticité ;
* un état ;
* une origine ;
* une zone géographique ;
* une période de validité ;
* une provenance ;
* une justification lorsque nécessaire.

---

# 13. Intelligence API

L'Intelligence Engine ne doit pas exposer directement le modèle de langage.

Architecture :

```text
Client
  │
  ▼
Intelligence API
  │
  ▼
Context Engine
  │
  ▼
Tool Executor
  │
  ├── Analytics
  ├── Geo
  ├── Flood
  ├── World
  └── Data
  │
  ▼
AI Provider
  │
  ▼
Validation
  │
  ▼
Response
```

Exemple conceptuel :

```text
POST /api/v1/intelligence/query
```

```json
{
  "query": "Analyse la situation actuelle dans cette zone.",
  "context": {
    "zone_id": "..."
  }
}
```

La réponse doit permettre de distinguer les informations issues :

* des données ;
* des calculs ;
* des estimations ;
* des prédictions ;
* des simulations ;
* de l'interprétation générée.

---

# 14. Synchronisation

## Push

```text
POST /api/v1/sync/push
```

Exemple :

```json
{
  "device_id": "...",
  "operations": [
    {
      "operation_id": "...",
      "entity_id": "...",
      "entity_type": "observation",
      "operation": "CREATE",
      "version": 1,
      "payload": {}
    }
  ]
}
```

---

## Pull

```text
GET /api/v1/sync/pull?cursor=...
```

Réponse conceptuelle :

```json
{
  "success": true,
  "data": {
    "changes": [],
    "next_cursor": "..."
  }
}
```

---

# 15. Idempotence

Les opérations de synchronisation doivent être idempotentes.

Une même opération envoyée plusieurs fois avec le même `operation_id` ne doit pas créer plusieurs modifications.

```text
operation_id
      │
      ▼
Déjà traité ?
   │       │
  Oui     Non
   │       │
   ▼       ▼
Retour   Exécution
résultat    │
            ▼
        Enregistrement
```

---

# 16. Conflits

Un conflit doit être explicitement détectable.

```text
Client A
   │
   ├── version 4
   │
   ▼
Serveur
   │
   └── version actuelle = 5
          │
          ▼
       CONFLICT
```

Réponse :

```json
{
  "success": false,
  "error": {
    "code": "SYNC_CONFLICT",
    "message": "The resource has changed on the server.",
    "details": {
      "server_version": 5,
      "client_version": 4
    }
  }
}
```

Les données critiques ne doivent jamais être écrasées silencieusement.

---

# 17. Géospatial

Les endpoints géospatiaux doivent pouvoir accepter des paramètres tels que :

```text
bbox
radius
latitude
longitude
geometry
```

Exemple :

```text
GET /api/v1/flood-events?bbox=...
```

Les formats exacts doivent être normalisés dans les schémas OpenAPI.

---

# 18. Médias

Les médias doivent être séparés des données métier.

Architecture :

```text
Client
  │
  ▼
API
  │
  ├── Metadata
  │
  └── Upload authorization
          │
          ▼
   Object Storage
```

L'API ne doit pas nécessairement transporter elle-même tous les fichiers volumineux.

---

# 19. Codes HTTP

Les principaux codes utilisés sont :

| Code | Signification                       |
| ---- | ----------------------------------- |
| 200  | Succès                              |
| 201  | Ressource créée                     |
| 204  | Succès sans contenu                 |
| 400  | Requête invalide                    |
| 401  | Non authentifié                     |
| 403  | Non autorisé                        |
| 404  | Ressource inexistante               |
| 409  | Conflit                             |
| 422  | Validation invalide                 |
| 429  | Trop de requêtes                    |
| 500  | Erreur serveur                      |
| 503  | Service temporairement indisponible |

---

# 20. Validation

Les données entrantes doivent être validées avant d'atteindre la logique métier.

```text
HTTP Request
     ↓
Parsing
     ↓
Schema Validation
     ↓
Authentication
     ↓
Authorization
     ↓
Business Validation
     ↓
Domain Logic
     ↓
Persistence
```

---

# 21. Documentation OpenAPI

L'API doit produire une documentation OpenAPI exploitable.

La documentation doit permettre :

* de connaître les endpoints ;
* de connaître les paramètres ;
* de connaître les réponses ;
* de connaître les erreurs ;
* de tester les endpoints ;
* de générer éventuellement des clients.

---

# 22. Règles fondamentales

L'API :

1. ne doit pas contenir de logique métier arbitraire dans les contrôleurs ;
2. ne doit pas exposer directement PostgreSQL ;
3. ne doit pas faire confiance aux données d'identité envoyées par le client ;
4. ne doit pas permettre de contourner le multi-tenancy ;
5. doit valider les entrées ;
6. doit journaliser les opérations importantes ;
7. doit respecter les permissions ;
8. doit être compatible Offline-first ;
9. doit conserver la provenance des données ;
10. doit rester indépendante du fournisseur IA.

---

# 23. Décisions API

| ID      | Décision                                           |
| ------- | -------------------------------------------------- |
| API-001 | REST V1                                            |
| API-002 | Versionnement `/api/v1`                            |
| API-003 | OpenAPI                                            |
| API-004 | Pagination par curseur privilégiée                 |
| API-005 | Synchronisation via endpoints dédiés               |
| API-006 | Idempotence des opérations de sync                 |
| API-007 | Validation côté serveur obligatoire                |
| API-008 | Multi-tenancy côté serveur                         |
| API-009 | L'IA n'est jamais directement exposée              |
| API-010 | Les calculs critiques restent côté services métier |

---

# 24. Critère de validation

DOCUMENT038 sera considéré comme validé lorsque :

* les schémas OpenAPI détaillés sont générés ;
* les DTO sont définis ;
* les erreurs sont normalisées ;
* les permissions sont associées aux endpoints ;
* les contrats de synchronisation sont implémentés ;
* les tests de contrat sont définis.

---

## 25. Principe final

> **L'API est un contrat. Elle ne doit pas devenir un lieu où chaque client invente sa propre interprétation du système.**
