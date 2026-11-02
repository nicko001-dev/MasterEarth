## DOCUMENT030 — Architecture de Sécurité, Identité & Contrôle d’Accès

**Projet :** IntelliFlood
**Document :** DOCUMENT030
**Titre :** Architecture de Sécurité, Identité & Contrôle d’Accès
**Version :** 1.0
**Statut :** Conception
**Dépendances :** DOCUMENT028, DOCUMENT029

---

# 1. Introduction

IntelliFlood manipule des données potentiellement sensibles :

* observations ;
* positions ;
* infrastructures ;
* événements ;
* alertes ;
* données utilisateur ;
* médias ;
* données géospatiales ;
* informations opérationnelles.

La sécurité doit donc être intégrée à l'architecture et non ajoutée après l'implémentation.

---

# 2. Objectifs

Le système doit garantir :

* confidentialité ;
* intégrité ;
* disponibilité ;
* authentification ;
* autorisation ;
* traçabilité ;
* isolation des utilisateurs ;
* protection des communications ;
* protection des données locales ;
* gestion des sessions ;
* contrôle des permissions.

---

# 3. Modèle général

```text
                 UTILISATEUR
                      │
                      ▼
              ┌───────────────┐
              │ Authentication│
              └───────┬───────┘
                      │
                      ▼
               ┌────────────┐
               │ Identity   │
               └─────┬──────┘
                     │
                     ▼
              ┌──────────────┐
              │ Authorization│
              └──────┬───────┘
                     │
                     ▼
              ┌──────────────┐
              │ Application  │
              └──────┬───────┘
                     │
                     ▼
              ┌──────────────┐
              │ API Gateway  │
              └──────┬───────┘
                     │
                     ▼
             Services + Database
```

---

# 4. Authentification

L'utilisateur doit prouver son identité avant d'accéder aux fonctionnalités protégées.

Le système doit prévoir :

* identifiant ;
* mot de passe ;
* session ;
* renouvellement de session ;
* révocation ;
* récupération de compte.

Une authentification multifactorielle pourra être utilisée pour les comptes nécessitant un niveau de sécurité supérieur.

---

# 5. Autorisation

Être authentifié ne signifie pas avoir accès à tout.

Le système sépare :

```text
AUTHENTICATION
Qui es-tu ?

AUTHORIZATION
Qu'as-tu le droit de faire ?
```

---

# 6. RBAC

IntelliFlood utilisera un modèle **Role-Based Access Control**.

Exemple :

```text
USER
 │
 ▼
ROLE
 │
 ├── PERMISSION 1
 ├── PERMISSION 2
 └── PERMISSION 3
```

---

# 7. Rôles

Les rôles exacts pourront évoluer, mais l'architecture doit pouvoir supporter plusieurs profils.

Exemple :

```text
Citizen
Observer
Analyst
Operator
Administrator
System
```

Ces noms représentent des catégories fonctionnelles et ne constituent pas nécessairement la liste finale des rôles métier.

---

# 8. Permissions

Les permissions sont plus précises que les rôles.

Exemples :

```text
observation:create
observation:read
observation:update
observation:delete

alert:create
alert:read
alert:update

flood_event:create
flood_event:read

user:manage
system:configure
```

---

# 9. Autorisation par ressource

La permission peut dépendre :

* du rôle ;
* de l'organisation ;
* de la zone géographique ;
* du propriétaire ;
* du niveau de criticité ;
* du contexte.

Exemple :

```text
Utilisateur A
     │
     ▼
Observation O1
     │
     ▼
Permission ?
     │
 ┌───┴────┐
Oui      Non
 │         │
 ▼         ▼
Allow     Deny
```

---

# 10. Multi-tenancy

Si IntelliFlood est utilisé par plusieurs organisations, leurs données doivent être isolées.

Exemple :

```text
Organisation A
├── Users
├── Observations
└── Events

Organisation B
├── Users
├── Observations
└── Events
```

Une organisation ne doit pas pouvoir accéder aux données d'une autre sans permission explicite.

---

# 11. PostgreSQL RLS

L'isolation au niveau application doit être complétée par des mécanismes de sécurité au niveau base de données lorsque cela est applicable.

PostgreSQL Row-Level Security permet de contrôler les lignes accessibles.

Architecture :

```text
API
 │
 ▼
Authorization
 │
 ▼
PostgreSQL
 │
 ▼
RLS
 │
 ▼
Allowed Rows
```

---

# 12. Sécurité API

Chaque requête protégée doit être associée à une identité.

Exemple conceptuel :

```text
Authorization: Bearer <token>
```

Le serveur vérifie :

1. validité ;
2. expiration ;
3. identité ;
4. permissions ;
5. contexte.

---

# 13. HTTPS

Les communications réseau doivent utiliser HTTPS.

Cela protège notamment :

* identifiants ;
* tokens ;
* observations ;
* coordonnées ;
* données API ;
* médias.

---

# 14. Protection des tokens

Les tokens d'authentification ne doivent pas être exposés inutilement.

Le client doit utiliser un mécanisme de stockage sécurisé adapté à la plateforme.

Les tokens doivent pouvoir être révoqués ou renouvelés.

---

# 15. Sessions

Une session possède :

```text
session_id
user_id
created_at
expires_at
last_activity
device_id
status
```

Les sessions peuvent être :

```text
ACTIVE
EXPIRED
REVOKED
```

---

# 16. Appareils

Dans une architecture Offline-first, le serveur doit pouvoir identifier les appareils.

Exemple :

```text
DEVICE-001
DEVICE-002
DEVICE-003
```

Un utilisateur peut disposer de plusieurs appareils.

Le système peut également permettre la révocation d'un appareil perdu.

---

# 17. Sécurité Offline

Le mode hors connexion constitue un point particulier.

Une partie des données est stockée localement.

Il faut donc limiter :

* les données locales inutiles ;
* les secrets persistants ;
* les permissions excessives ;
* la durée de conservation.

---

# 18. Données locales sensibles

Toutes les données n'ont pas nécessairement besoin d'être conservées hors connexion.

Le client doit distinguer :

```text
CACHE PUBLIC
CACHE UTILISATEUR
DONNÉES OPÉRATIONNELLES
DONNÉES SENSIBLES
```

Les règles de rétention doivent dépendre du niveau de sensibilité.

---

# 19. Chiffrement

Lorsque la plateforme le permet, les données sensibles locales doivent être protégées par les mécanismes de chiffrement disponibles.

Le stockage serveur doit également utiliser des mécanismes de protection adaptés.

---

# 20. Permissions hors connexion

Une question importante apparaît :

> Que se passe-t-il si les permissions changent alors que l'utilisateur est hors connexion ?

Le client possède donc un état de permission local avec une durée de validité.

À la prochaine synchronisation :

```text
Local permissions
       │
       ▼
Server permissions
       │
       ▼
Refresh
```

Le serveur reste l'autorité finale.

---

# 21. Révocation

Si un compte est révoqué :

```text
Client
  │
  │ Offline
  ▼
Permissions locales
```

Lors du retour réseau :

```text
Sync
 ↓
Server
 ↓
Account revoked
 ↓
Local session invalidated
```

---

# 22. Audit de sécurité

Les événements importants doivent être enregistrés.

Exemples :

```text
LOGIN
LOGOUT
LOGIN_FAILED
PASSWORD_CHANGED
ROLE_CHANGED
PERMISSION_CHANGED
TOKEN_REVOKED
DEVICE_REVOKED
CONFLICT_RESOLVED
DATA_DELETED
```

---

# 23. Journal d'audit

Chaque événement peut contenir :

```text
event_id
user_id
device_id
action
resource
resource_id
timestamp
ip
result
metadata
```

Le journal d'audit doit être protégé contre les modifications non autorisées.

---

# 24. Protection contre les abus

L'API doit prévoir :

* rate limiting ;
* validation ;
* taille maximale des requêtes ;
* limitation des uploads ;
* contrôle des fichiers ;
* expiration des sessions ;
* détection d'activités anormales.

---

# 25. Uploads

Les fichiers envoyés doivent être contrôlés.

Le système doit vérifier :

```text
type
taille
extension
signature
permissions
```

Il ne faut jamais considérer l'extension d'un fichier comme preuve suffisante de son type.

---

# 26. Sécurité des médias

Les médias doivent posséder :

```text
media_id
owner
entity_id
content_type
size
checksum
created_at
```

Un checksum peut permettre de détecter des corruptions ou des doublons.

---

# 27. Intégrité des données

Les données doivent être validées avant insertion.

Exemples :

```text
Latitude ∈ [-90, 90]

Longitude ∈ [-180, 180]

Niveau d'eau >= 0
```

Les contraintes métier plus complexes seront définies dans les documents spécifiques aux domaines.

---

# 28. Principe du moindre privilège

Chaque composant doit recevoir uniquement les permissions nécessaires.

Exemple :

```text
Service A
→ lecture observations

Service B
→ écriture observations

Service C
→ gestion utilisateurs
```

Un service ne doit pas disposer automatiquement de tous les droits.

---

# 29. Secrets

Les secrets ne doivent jamais être stockés :

* dans Git ;
* dans le code source ;
* dans les logs ;
* dans les fichiers publics ;
* dans les données client non protégées.

Les secrets doivent être gérés par une configuration sécurisée adaptée à l'environnement.

---

# 30. Logs

Les logs ne doivent pas contenir de secrets.

À éviter :

```text
password=...
token=...
authorization=...
```

Les logs doivent être utiles au diagnostic sans devenir une fuite de données.

---

# 31. Séquence d'accès

```text
Utilisateur
   │
   ▼
Login
   │
   ▼
Authentication
   │
   ▼
Identity
   │
   ▼
Role / Permission
   │
   ▼
Access Decision
   │
 ┌─┴─┐
 ▼   ▼
ALLOW DENY
```

---

# 32. Architecture de sécurité complète

```text
┌────────────────────────────────────────────┐
│              CLIENT                        │
│                                            │
│ Secure Session │ Local Protection          │
└──────────────────┬─────────────────────────┘
                   │ HTTPS
                   ▼
┌────────────────────────────────────────────┐
│              API GATEWAY                   │
│                                            │
│ TLS │ Rate Limit │ Authentication          │
└──────────────────┬─────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────┐
│          AUTHORIZATION LAYER               │
│                                            │
│ RBAC │ Permissions │ Tenant Isolation      │
└──────────────────┬─────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────┐
│             APPLICATION                    │
└──────────────────┬─────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────┐
│          PostgreSQL + PostGIS              │
│                                            │
│ Constraints │ RLS │ Audit                  │
└────────────────────────────────────────────┘
```

---

# 33. Principes de sécurité

IntelliFlood applique notamment :

1. **Least Privilege**
2. **Defense in Depth**
3. **Zero Trust entre composants**
4. **Secure by Design**
5. **Fail Secure**
6. **Auditability**

---

# 34. Critères d'acceptation

* [ ] authentification ;
* [ ] autorisation ;
* [ ] RBAC ;
* [ ] permissions ;
* [ ] isolation multi-tenant ;
* [ ] HTTPS ;
* [ ] sessions ;
* [ ] révocation ;
* [ ] sécurité offline ;
* [ ] audit ;
* [ ] contrôle des uploads ;
* [ ] rate limiting ;
* [ ] protection des secrets ;
* [ ] validation des données ;
* [ ] moindre privilège.

---

# 35. Décisions architecturales

| ID      | Décision                                                   |
| ------- | ---------------------------------------------------------- |
| SEC-001 | Authentification obligatoire pour les ressources protégées |
| SEC-002 | Autorisation séparée de l'authentification                 |
| SEC-003 | RBAC                                                       |
| SEC-004 | Permissions fines                                          |
| SEC-005 | Isolation multi-tenant                                     |
| SEC-006 | HTTPS obligatoire                                          |
| SEC-007 | Audit des événements sensibles                             |
| SEC-008 | Principe du moindre privilège                              |
| SEC-009 | Protection spécifique des données offline                  |
| SEC-010 | Le serveur reste l'autorité finale                         |

---

# 36. Conclusion

La sécurité d'IntelliFlood ne repose pas sur un seul mécanisme.

Elle repose sur plusieurs couches :

```text
IDENTITY
   ↓
AUTHENTICATION
   ↓
AUTHORIZATION
   ↓
NETWORK SECURITY
   ↓
APPLICATION SECURITY
   ↓
DATABASE SECURITY
   ↓
AUDIT
```

Le système reste ainsi compatible avec l'architecture Offline-first tout en conservant un contrôle serveur centralisé.
