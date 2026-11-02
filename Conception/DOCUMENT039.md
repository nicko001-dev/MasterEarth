# DOCUMENT039 — INFRASTRUCTURE, DÉPLOIEMENT & EXPLOITATION

**Projet : IntelliFlood**
**Version : 1.0**
**Statut : Spécification technique**
**Dépendances : DOCUMENT028 à DOCUMENT038**

---

# 1. Objectif

Ce document définit l'infrastructure cible permettant d'exécuter IntelliFlood.

L'objectif est de construire une infrastructure :

* simple ;
* reproductible ;
* auto-hébergeable ;
* sécurisée ;
* observable ;
* évolutive ;
* compatible avec une utilisation Offline-first ;
* adaptée à un déploiement initial à faible coût.

---

# 2. Principe général

IntelliFlood doit pouvoir fonctionner sans dépendre obligatoirement d'un fournisseur cloud propriétaire.

Architecture cible :

```text
                    INTERNET / LAN
                         │
                         ▼
                ┌─────────────────┐
                │ Reverse Proxy   │
                │ HTTPS / Routing │
                └────────┬────────┘
                         │
             ┌───────────┴───────────┐
             │                       │
             ▼                       ▼
      ┌─────────────┐         ┌─────────────┐
      │ React Web   │         │ FastAPI API │
      └─────────────┘         └──────┬──────┘
                                     │
                       ┌─────────────┼─────────────┐
                       │             │             │
                       ▼             ▼             ▼
                PostgreSQL       Worker       Object Storage
                  PostGIS         Queue            Media
                       │
                       ▼
                  Data / Geo
```

---

# 3. Architecture d'exécution

Les composants principaux sont :

```text
Frontend
Backend API
Database
Object Storage
Background Workers
Cache / Queue
Reverse Proxy
Monitoring
```

> ⚠️ **EXEMPLES NON EXHAUSTIFS :** ces composants représentent l'architecture cible actuelle. Ils ne doivent pas être interprétés comme une obligation d'utiliser uniquement les technologies ou services cités dans ce document.

---

# 4. Frontend

Le frontend est :

```text
TypeScript
React
```

Il doit pouvoir être servi comme application Web.

Le frontend doit :

* fonctionner avec le serveur API ;
* gérer le stockage local ;
* gérer le mode Offline ;
* gérer la synchronisation ;
* afficher les données géospatiales ;
* respecter les permissions ;
* éviter toute logique métier critique locale non validée.

---

# 5. Backend

Le backend est :

```text
Python
FastAPI
```

Responsabilités :

* API ;
* authentification ;
* autorisation ;
* logique métier ;
* géospatial ;
* synchronisation ;
* Intelligence Engine ;
* Flood Engine ;
* World Engine ;
* accès aux données.

---

# 6. Base de données

La base principale est :

```text
PostgreSQL
+
PostGIS
```

Elle constitue la source de vérité serveur pour les données persistantes.

```text
Backend
   │
   ▼
PostgreSQL
   │
   ├── Relations
   ├── Transactions
   ├── RLS
   └── PostGIS
```

---

# 7. Stockage des médias

Les fichiers volumineux ne doivent pas être stockés directement comme grandes colonnes dans les tables métier.

Architecture :

```text
Metadata ─────► PostgreSQL
                    │
                    │ reference
                    ▼
              Object Storage
                    │
                    ▼
             Image / Video / File
```

Le système doit permettre à terme l'utilisation d'un stockage compatible S3 ou équivalent.

---

# 8. Jobs asynchrones

Certaines opérations peuvent être longues :

* analyse de données ;
* import massif ;
* génération de cartes ;
* calculs lourds ;
* traitements géospatiaux ;
* génération de rapports ;
* tâches IA ;
* synchronisation importante.

Ces opérations ne doivent pas bloquer inutilement les requêtes HTTP.

Architecture :

```text
API
 │
 │ enqueue
 ▼
Queue
 │
 ▼
Worker
 │
 ▼
Long Task
 │
 ▼
Result
```

---

# 9. Cache

Un cache peut être utilisé pour améliorer les performances.

Mais :

> **Le cache ne doit jamais être considéré comme la source de vérité.**

En cas de suppression du cache :

```text
Cache perdu
   ↓
Application toujours fonctionnelle
   ↓
Données récupérées depuis la source de vérité
```

---

# 10. Reverse Proxy

Un reverse proxy doit être placé devant les services exposés.

Responsabilités possibles :

* HTTPS ;
* routage ;
* headers ;
* compression ;
* limitation ;
* terminaison TLS ;
* exposition contrôlée.

Les technologies possibles peuvent évoluer.

---

# 11. Environnements

Au minimum :

```text
development
test
production
```

## Development

Utilisé par les développeurs et agents de code.

## Test

Utilisé pour :

* tests automatisés ;
* tests d'intégration ;
* tests API ;
* tests de synchronisation.

## Production

Utilisé pour les données réelles.

Les environnements doivent être séparés.

---

# 12. Variables d'environnement

Les secrets ne doivent jamais être commités dans Git.

Exemple :

```text
DATABASE_URL
SECRET_KEY
JWT_SECRET
OBJECT_STORAGE_ENDPOINT
OBJECT_STORAGE_ACCESS_KEY
OBJECT_STORAGE_SECRET_KEY
AI_PROVIDER
AI_MODEL
```

⚠️ Cette liste est **un exemple non exhaustif**.

Le dépôt doit fournir :

```text
.env.example
```

mais jamais :

```text
.env
```

avec des secrets réels.

---

# 13. Conteneurisation

La conteneurisation est recommandée pour rendre le système reproductible.

Architecture conceptuelle :

```text
┌──────────────────────────────┐
│ IntelliFlood                 │
│                              │
│ ┌────────┐ ┌──────────────┐ │
│ │ Web    │ │ API          │ │
│ └────────┘ └──────────────┘ │
│                              │
│ ┌────────┐ ┌──────────────┐ │
│ │Worker  │ │Database      │ │
│ └────────┘ └──────────────┘ │
│                              │
│ ┌────────┐ ┌──────────────┐ │
│ │Storage │ │Queue/Cache   │ │
│ └────────┘ └──────────────┘ │
└──────────────────────────────┘
```

La configuration exacte des services doit rester documentée et reproductible.

---

# 14. Déploiement initial

Le premier déploiement doit privilégier une architecture simple.

```text
1 serveur
   │
   ├── Reverse Proxy
   ├── Web
   ├── API
   ├── Worker
   ├── PostgreSQL
   ├── Storage
   └── Queue
```

Cette architecture est adaptée au développement initial et à un premier environnement de production de taille limitée.

Elle pourra évoluer vers plusieurs machines si les besoins réels l'imposent.

---

# 15. Scalabilité

La scalabilité doit être progressive.

```text
Niveau 1
Monolithique modulaire

        ↓

Niveau 2
Services séparés

        ↓

Niveau 3
Scaling horizontal

        ↓

Niveau 4
Infrastructure distribuée
```

Il est interdit d'introduire prématurément une architecture distribuée uniquement pour des raisons théoriques.

---

# 16. Sauvegardes

Les données critiques doivent être sauvegardées.

Au minimum :

```text
PostgreSQL
   ↓
Backup
   ↓
Stockage séparé
```

Les sauvegardes doivent être :

* vérifiées ;
* restaurables ;
* protégées ;
* documentées.

Un backup jamais testé n'est pas considéré comme une stratégie de restauration fiable.

---

# 17. Migration de base

Toutes les modifications du schéma doivent passer par des migrations versionnées.

```text
Migration 001
Migration 002
Migration 003
...
```

Les agents de code ne doivent pas modifier directement la base de production.

---

# 18. Observabilité

Le système doit permettre de surveiller :

```text
Logs
Metrics
Errors
Health
Performance
Audit
```

Architecture :

```text
Application
    │
    ├── Logs
    ├── Metrics
    ├── Traces
    └── Audit Events
           │
           ▼
      Observability
```

---

# 19. Health checks

Des endpoints de santé doivent permettre de vérifier l'état du système.

Exemple :

```text
GET /health
```

et éventuellement :

```text
GET /health/ready
GET /health/live
```

Les noms exacts restent à définir lors de l'implémentation.

---

# 20. CI/CD

Le projet doit pouvoir automatiser :

```text
Commit
  ↓
Lint
  ↓
Type Check
  ↓
Unit Tests
  ↓
Integration Tests
  ↓
Build
  ↓
Security Checks
  ↓
Deploy
```

Le déploiement automatique en production doit rester contrôlé.

---

# 21. Sécurité infrastructure

Principes :

* principe du moindre privilège ;
* secrets séparés du code ;
* TLS ;
* ports minimaux ;
* services internes non exposés inutilement ;
* backups protégés ;
* logs sans secrets ;
* comptes administrateurs contrôlés ;
* mises à jour documentées.

---

# 22. Intelligence artificielle

L'IA ne doit pas être une dépendance infrastructurelle obligatoire.

Architecture :

```text
IntelliFlood
     │
     ▼
AI Provider Interface
     │
     ├── Local AI
     ├── Self-hosted AI
     └── External Provider
```

Les technologies exactes de modèles locaux sont des choix techniques susceptibles d'évoluer.

> ⚠️ **EXEMPLES NON EXHAUSTIFS :** des runtimes comme Ollama ou llama.cpp peuvent être envisagés, mais cette mention ne signifie pas qu'ils constituent les seules options autorisées.

---

# 23. Offline-first

L'infrastructure serveur ne doit jamais empêcher le fonctionnement local du client.

```text
                 ┌─────────────┐
                 │   Serveur   │
                 └──────┬──────┘
                        ▲▼
                     Sync
                        ▲▼
                 ┌─────────────┐
                 │ Client      │
                 │ IndexedDB   │
                 └─────────────┘
```

Une interruption réseau doit provoquer une dégradation contrôlée et non une destruction des données locales.

---

# 24. Stratégie de déploiement

Le déploiement doit être reproductible.

Les éléments nécessaires doivent être versionnés :

```text
Docker / container configuration
Database migrations
Environment template
Deployment scripts
Health checks
Backup scripts
Documentation
```

---

# 25. Restauration

Une procédure de restauration doit être documentée.

```text
Incident
   ↓
Identifier la sauvegarde
   ↓
Restaurer
   ↓
Vérifier DB
   ↓
Vérifier services
   ↓
Vérifier API
   ↓
Vérifier synchronisation
   ↓
Retour au service
```

---

# 26. Décisions infrastructure

| ID        | Décision                                    |
| --------- | ------------------------------------------- |
| INFRA-001 | Infrastructure auto-hébergeable             |
| INFRA-002 | PostgreSQL/PostGIS comme stockage principal |
| INFRA-003 | Médias dans un stockage objet               |
| INFRA-004 | Tâches longues via workers                  |
| INFRA-005 | Cache non source de vérité                  |
| INFRA-006 | Environnements séparés                      |
| INFRA-007 | Secrets hors Git                            |
| INFRA-008 | Migrations versionnées                      |
| INFRA-009 | Backups obligatoires                        |
| INFRA-010 | Observabilité obligatoire                   |
| INFRA-011 | Déploiement reproductible                   |
| INFRA-012 | Scalabilité progressive                     |

---

# 27. Principe final

> **IntelliFlood doit pouvoir démarrer simplement, fonctionner de manière fiable et évoluer uniquement lorsque les besoins réels le justifient.**
