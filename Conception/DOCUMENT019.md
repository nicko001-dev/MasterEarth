# DOCUMENT019 — API & CONTRATS D’ÉCHANGE INTELLIFLOOD

**Projet :** IntelliFlood
**Version :** 1.0
**Date :** 30 septembre 2026
**Statut :** Conception
**Type :** Architecture / Spécification technique

---

## 1. Objet du document

Ce document définit les principes d’échange de données entre les différentes parties d’IntelliFlood.

Il décrit notamment :

* les API ;
* les contrats d’échange ;
* les formats de données ;
* les requêtes et réponses ;
* les erreurs ;
* les événements ;
* les opérations synchrones et asynchrones ;
* les échanges avec les systèmes externes ;
* les règles de versionnement ;
* les principes de compatibilité.

Ce document ne choisit pas encore un framework ou une technologie d’API particulière.

---

# 2. Objectifs

L’architecture des échanges doit permettre :

1. aux interfaces de communiquer avec l’application ;
2. aux moteurs de communiquer avec les services applicatifs ;
3. aux données géospatiales d’être échangées correctement ;
4. aux applications mobiles de fonctionner hors ligne ;
5. aux opérations de synchronisation d’être fiables ;
6. aux simulations longues d’être exécutées de manière asynchrone ;
7. aux systèmes externes d’échanger des données avec IntelliFlood ;
8. de conserver la traçabilité des données ;
9. de faire évoluer l’application sans casser brutalement les clients existants.

---

# 3. Principes architecturaux

Les API IntelliFlood doivent respecter les principes suivants :

* simplicité ;
* contrats explicites ;
* validation systématique ;
* sécurité par défaut ;
* versionnement ;
* idempotence lorsque nécessaire ;
* traçabilité ;
* séparation des responsabilités ;
* compatibilité avec l’offline-first ;
* indépendance vis-à-vis d'un fournisseur particulier ;
* distinction entre données observées, calculées, simulées et générées par IA.

---

# 4. Architecture générale des échanges

```text
                   ┌──────────────────────┐
                   │      UTILISATEUR      │
                   └──────────┬───────────┘
                              │
                              ▼
              ┌──────────────────────────────┐
              │       INTERFACES             │
              │ Web / PWA / Mobile / Desktop │
              │ Cockpit                      │
              └──────────────┬───────────────┘
                             │
                             ▼
                  ┌─────────────────────┐
                  │    API / GATEWAY    │
                  └─────────┬───────────┘
                            │
            ┌───────────────┼────────────────┐
            │               │                │
            ▼               ▼                ▼
      ┌───────────┐   ┌────────────┐  ┌──────────────┐
      │Application│   │World Engine│  │ Flood Engine │
      │  Layer    │   │            │  │              │
      └─────┬─────┘   └────────────┘  └──────┬───────┘
            │                                 │
            │               ┌─────────────────┘
            │               ▼
            │       ┌───────────────────┐
            └──────►│ Intelligence      │
                    │ Engine             │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Geo/Data Engine  │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ Données / Stockage│
                    └──────────────────┘
```

---

# 5. Types d’API

IntelliFlood pourra utiliser plusieurs catégories d’API.

## 5.1 API applicative

Elle permet aux interfaces de demander des opérations métier.

Exemples :

```text
Créer une observation
Consulter une zone
Créer un scénario
Lancer une simulation
Consulter un risque
Créer une alerte
Générer un rapport
```

---

## 5.2 API géospatiale

Elle permet de rechercher et manipuler les données spatiales.

Exemples :

```text
Rechercher les bâtiments d'une zone
Trouver les routes proches d'un point
Obtenir les objets dans un polygone
Calculer une distance
Afficher les zones inondables
```

---

## 5.3 API temporelle

Elle permet de rechercher les données selon le temps.

Exemples :

```text
Observations du 25/09/2026
Évolution du niveau d'eau
Historique d'une zone
Événements entre deux dates
Comparer deux périodes
```

---

## 5.4 API de synchronisation

Elle est utilisée par les clients offline.

Exemples :

```text
Envoyer les observations locales
Récupérer les nouvelles données
Envoyer une photo
Synchroniser une modification
Récupérer les conflits
```

---

## 5.5 API de simulation

Elle permet de gérer les scénarios et simulations.

Exemples :

```text
Créer un scénario
Modifier les paramètres
Valider un scénario
Lancer une simulation
Consulter son état
Récupérer les résultats
```

---

## 5.6 API Intelligence

Elle permet d'utiliser les capacités d'analyse et d'IA.

Exemples :

```text
Analyser une image
Détecter une anomalie
Rechercher dans la base documentaire
Interroger l'assistant
Générer un résumé
Analyser un résultat de simulation
```

L'API Intelligence ne doit cependant pas contourner les permissions normales de l'utilisateur.

---

# 6. Organisation logique des ressources

Les ressources principales correspondent au modèle de domaine.

```text
/users
/profiles
/permissions

/zones
/geo-objects

/sources
/observations
/media

/events
/risks
/vulnerabilities

/alerts
/notifications

/scenarios
/simulations
/results

/models
/analyses

/reports
/annotations

/sync
```

Cette organisation est conceptuelle.

Le choix exact du style d'API sera effectué lors de l'implémentation.

---

# 7. Exemple de contrat : Observation

## Requête conceptuelle

```json
{
  "type": "EAU_MONTEE",
  "description": "Montée importante du niveau d'eau",
  "observedAt": "2026-09-30T08:30:00Z",
  "position": {
    "latitude": 5.3200,
    "longitude": -4.0100
  },
  "confidence": 0.85,
  "sourceId": "SRC-001"
}
```

## Réponse conceptuelle

```json
{
  "id": "OBS-001",
  "status": "NEW",
  "createdAt": "2026-09-30T08:31:00Z",
  "version": 1
}
```

Le serveur peut compléter automatiquement :

* identifiant ;
* auteur ;
* date de création ;
* version ;
* état ;
* informations de traçabilité.

---

# 8. Contrat de réponse standard

Les réponses doivent conserver une structure cohérente.

### Succès

```json
{
  "success": true,
  "data": {},
  "metadata": {
    "requestId": "REQ-001",
    "timestamp": "2026-09-30T08:31:00Z"
  }
}
```

### Erreur

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Les données fournies sont invalides",
    "details": []
  },
  "metadata": {
    "requestId": "REQ-002",
    "timestamp": "2026-09-30T08:31:00Z"
  }
}
```

---

# 9. Catégories d’erreurs

Les erreurs doivent être normalisées.

| Code conceptuel        | Signification                |
| ---------------------- | ---------------------------- |
| AUTHENTICATION_ERROR   | Authentification invalide    |
| AUTHORIZATION_ERROR    | Permission insuffisante      |
| VALIDATION_ERROR       | Données invalides            |
| NOT_FOUND              | Ressource inexistante        |
| CONFLICT               | Conflit de version           |
| DUPLICATE              | Opération déjà effectuée     |
| RATE_LIMITED           | Trop de requêtes             |
| PROCESSING_ERROR       | Erreur de traitement         |
| SIMULATION_ERROR       | Erreur de simulation         |
| SYNC_ERROR             | Erreur de synchronisation    |
| STORAGE_ERROR          | Erreur de stockage           |
| EXTERNAL_SERVICE_ERROR | Service externe indisponible |
| INTERNAL_ERROR         | Erreur interne               |

Les messages exposés à l'utilisateur ne doivent jamais révéler de secrets ou d'informations techniques sensibles.

---

# 10. Validation des données

Toute donnée reçue doit être validée avant traitement.

Exemples :

```text
Type obligatoire
Date valide
Coordonnées valides
Géométrie correcte
Valeur numérique valide
Identifiant valide
Permission suffisante
Version compatible
```

Pour les données géospatiales :

```text
Type de géométrie
Système de coordonnées
Validité géométrique
Limites géographiques
Précision
```

---

# 11. Pagination

Les collections importantes doivent être paginées.

Exemple :

```text
GET /observations?page=1&limit=50
```

Réponse :

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1250,
    "hasNext": true
  }
}
```

---

# 12. Filtres géospatiaux

Les API doivent permettre des recherches spatiales.

Exemples conceptuels :

```text
Observations dans une zone
Objets proches d'un point
Bâtiments intersectant une zone inondée
Routes affectées
Événements dans un rayon
```

---

# 13. Filtres temporels

Exemples :

```text
?from=2026-09-01
&to=2026-09-30
```

Les recherches peuvent combiner espace et temps :

```text
ZONE + PÉRIODE + TYPE DE DONNÉE
```

---

# 14. API asynchrones

Certaines opérations ne doivent pas bloquer une requête classique.

Exemples :

* simulation ;
* traitement massif d'images ;
* analyse de vidéos ;
* génération de gros rapports ;
* traitement de données volumineuses ;
* certaines analyses IA.

Architecture :

```text
Client
  │
  │ demande
  ▼
API
  │
  ▼
Création du Job
  │
  ▼
File de traitement
  │
  ▼
Worker
  │
  ▼
Traitement
  │
  ▼
Résultat
  │
  ▼
Client
```

Le client peut consulter :

```text
PENDING
RUNNING
COMPLETED
FAILED
CANCELLED
```

---

# 15. Identifiants de requête

Chaque requête importante doit pouvoir être identifiée.

Exemple :

```text
requestId = REQ-20260930-000001
```

Cela permet de relier :

```text
Utilisateur
    ↓
Requête
    ↓
Service
    ↓
Moteur
    ↓
Donnée
    ↓
Résultat
```

---

# 16. Idempotence

Certaines opérations doivent être idempotentes.

Exemple :

```text
Synchronisation
Upload de média
Création d'une opération offline
```

Si le même message est envoyé deux fois :

```text
Opération 1 → exécutée
Opération 2 → reconnue comme doublon
```

Cela évite les doublons lors d'une reconnexion instable.

---

# 17. Contrats d’événements

Les événements internes suivent une structure commune.

```json
{
  "eventId": "EVT-001",
  "type": "WATER_LEVEL_RISING",
  "occurredAt": "2026-09-30T08:30:00Z",
  "source": {
    "type": "SENSOR",
    "id": "SRC-001"
  },
  "position": {},
  "data": {},
  "version": 1
}
```

---

# 18. Contrats de synchronisation

Une opération offline peut être représentée ainsi :

```json
{
  "operationId": "SYNC-001",
  "operation": "CREATE",
  "entityType": "OBSERVATION",
  "entityId": "OBS-001",
  "version": 1,
  "timestamp": "2026-09-30T08:30:00Z",
  "payload": {}
}
```

Le serveur doit pouvoir répondre :

```text
SYNCED
DUPLICATE
CONFLICT
REJECTED
RETRY
```

---

# 19. Versionnement des API

Les contrats doivent pouvoir évoluer.

Principe conceptuel :

```text
API v1
API v2
API v3
```

Une nouvelle version ne doit pas casser immédiatement les clients existants.

Les changements doivent être classés :

### Compatible

```text
Ajouter un champ optionnel
Ajouter une nouvelle ressource
```

### Potentiellement incompatible

```text
Modifier le type d'un champ
Supprimer un champ
Changer la signification d'un champ
Modifier un état
```

Les changements incompatibles nécessitent une stratégie de versionnement.

---

# 20. Échanges avec les systèmes externes

Architecture :

```text
                  IntelliFlood
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
    API externe     Fichier        Flux de données
        │              │              │
        └──────────────┼──────────────┘
                       ▼
                Adapter externe
                       │
                       ▼
                 Format interne
```

IntelliFlood ne doit pas dépendre directement du format interne d'un fournisseur.

Un **Adapter** traduit :

```text
Format externe
      ↓
Adapter
      ↓
Format IntelliFlood
```

---

# 21. Sécurité des API

Les API doivent appliquer :

* authentification ;
* autorisation ;
* validation ;
* contrôle des fichiers ;
* limitation des abus ;
* journalisation ;
* protection des secrets ;
* contrôle des permissions par ressource ;
* protection contre les injections ;
* validation des données externes.

L'Intelligence Engine doit utiliser les mêmes contrôles d'autorisation que les autres modules.

---

# 22. Documentation des contrats

Les contrats doivent être conservés dans une zone dédiée du projet.

Organisation conceptuelle :

```text
specs/
├── api/
├── schemas/
├── events/
├── synchronization/
├── external/
└── errors/
```

Les contrats deviennent ainsi des artefacts officiels du projet.

---

# 23. Diagramme global des échanges

```text
                  ┌─────────────────┐
                  │     CLIENT      │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │       API       │
                  └────────┬────────┘
                           │
             ┌─────────────┼──────────────┐
             ▼             ▼              ▼
        Application      Geo/Data      Intelligence
             │             │              │
             └─────────────┼──────────────┘
                           ▼
                     Domain / Engines
                           │
                           ▼
                        Storage
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
         Local data     Remote DB    External data
```

---

# 24. Décisions de conception

Les décisions suivantes sont retenues :

1. Les API sont conçues indépendamment d'un framework.
2. Les contrats sont explicitement documentés.
3. Les données géospatiales et temporelles sont des citoyens de première classe.
4. Les opérations longues sont asynchrones.
5. Les opérations offline utilisent des identifiants et mécanismes d'idempotence.
6. Les événements sont distincts des requêtes classiques.
7. Les systèmes externes passent par des adapters.
8. Les erreurs sont normalisées.
9. Les API sont versionnables.
10. Les permissions sont appliquées côté serveur.
11. Les contrats sont conservés dans `specs/`.
12. Aucun fournisseur externe payant n'est imposé par l'architecture.

---

# 25. Préparation du document suivant

Le prochain document définit où les composants IntelliFlood seront exécutés :

**DOCUMENT020 — Architecture de déploiement.**

Il précisera :

* appareils ;
* serveur ;
* stockage ;
* réseau ;
* environnement local ;
* environnement distant ;
* déploiement offline ;
* services optionnels ;
* sauvegardes ;
* observabilité.


---

## Complément — contrats d'intégration externe (29 octobre 2026)

Les contrats d'échange doivent distinguer l'API applicative IntelliFlood des interfaces d'ingestion de sources externes. Les adaptateurs peuvent, selon les capacités de chaque source, recevoir des données par HTTPS, MQTT, API de fabricant, webhook, flux d'événements ou passerelle. Tous les protocoles ne sont pas obligatoires pour chaque équipement ; les connecteurs doivent être ajoutés selon les besoins vérifiés.

Le format interne normalisé doit conserver au minimum les informations disponibles sur l'identifiant de source/appareil, le type de mesure, la valeur et l'unité, l'horodatage de mesure et de réception, la localisation, l'état/qualité et la provenance. La validation, l'authentification, la limitation de débit, la déduplication et le traitement des données tardives doivent être spécifiés pour les connecteurs concernés. Les secrets et clés API ne doivent pas être placés dans le code source ou les documents publics.
