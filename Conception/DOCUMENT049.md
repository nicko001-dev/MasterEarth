# DOCUMENT049 — ARCHITECTURE DES ALERTES & NOTIFICATIONS

**Projet : IntelliFlood**
**Version : V1.0**
**Statut : Spécification technique**

---

# 1. Objectif

Le système d'alertes permet à IntelliFlood de transformer certaines informations ou conditions détectées en notifications destinées aux utilisateurs ou systèmes autorisés.

Il doit pouvoir gérer :

* création d'alertes ;
* règles de déclenchement ;
* niveaux de criticité ;
* zones géographiques ;
* destinataires ;
* canaux ;
* expiration ;
* acquittement ;
* résolution ;
* historique ;
* audit.

---

# 2. Distinction fondamentale

Il faut distinguer :

```text
DONNÉE
   │
   ▼
ANALYSE
   │
   ▼
CONDITION
   │
   ▼
ALERTE
   │
   ▼
NOTIFICATION
```

Une alerte n'est donc pas simplement une notification.

### Alerte

État métier indiquant qu'une situation nécessite potentiellement une attention.

### Notification

Moyen de transmettre cette information à un destinataire.

---

# 3. Architecture

```text
                 DATA / EVENTS
                       │
                       ▼
               ┌───────────────┐
               │ Rule Engine   │
               └───────┬───────┘
                       │
                       ▼
               ┌───────────────┐
               │ Alert Engine  │
               └───────┬───────┘
                       │
              ┌────────┼─────────┐
              ▼        ▼         ▼
           Users     Systems    Dashboard
              │        │         │
              ▼        ▼         ▼
        Notifications / UI / API
```

---

# 4. Alert Engine

L'Alert Engine est responsable de la gestion du cycle de vie des alertes.

Il ne doit pas être confondu avec :

* Flood Engine ;
* Intelligence Engine ;
* Notification Service.

---

# 5. Rule Engine

Le Rule Engine permet de déterminer si une condition d'alerte est remplie.

Exemple :

```text
SI
niveau_eau > seuil
ET
zone = zone surveillée
ALORS
créer une alerte
```

**⚠️ EXEMPLE ILLUSTRATIF.**

Les règles réelles seront définies par les besoins métier et scientifiques.

---

# 6. Règles déterministes

Les règles critiques doivent être déterministes.

Exemple :

```text
water_level >= threshold
```

doit produire le même résultat avec les mêmes données et le même seuil.

L'IA ne doit pas décider seule qu'une condition critique est vraie lorsque celle-ci peut être définie par une règle déterministe.

---

# 7. Intelligence Engine

L'Intelligence Engine peut assister le système.

**⚠️ EXEMPLES NON EXHAUSTIFS :**

* analyser plusieurs signaux ;
* expliquer une alerte ;
* résumer le contexte ;
* rechercher des connaissances ;
* comparer des scénarios ;
* assister un opérateur.

Mais :

```text
AI
 │
 └──► ASSISTE

Rule / Scientific Engine
 │
 └──► DÉTERMINE lorsque possible
```

---

# 8. Niveau de criticité

Une alerte peut posséder un niveau de criticité.

**⚠️ EXEMPLES NON EXHAUSTIFS :**

```text
INFO
LOW
MEDIUM
HIGH
CRITICAL
```

La taxonomie définitive reste à établir.

---

# 9. Cycle de vie

Une alerte peut suivre un cycle :

```text
DETECTED
   │
   ▼
CREATED
   │
   ▼
ACTIVE
   │
   ├──► ACKNOWLEDGED
   │
   ▼
RESOLVED
   │
   ▼
CLOSED
```

**⚠️ EXEMPLE NON EXHAUSTIF.**

Les états exacts devront être verrouillés dans le modèle de données.

---

# 10. Géographie

Une alerte peut être associée à :

* un point ;
* une zone ;
* une géométrie ;
* une région ;
* un ensemble de zones.

**⚠️ EXEMPLES NON EXHAUSTIFS.**

La sélection géographique doit utiliser le Geo/Data Engine.

---

# 11. Destinataires

Les destinataires peuvent être définis selon :

```text
USER
ROLE
ORGANIZATION
ZONE
GROUP
SYSTEM
```

**⚠️ EXEMPLES NON EXHAUSTIFS.**

Les règles de ciblage doivent respecter les permissions et l'isolation multi-tenant.

---

# 12. Canaux de notification

**⚠️ EXEMPLES NON EXHAUSTIFS :**

* notification dans l'application ;
* email ;
* SMS ;
* push mobile ;
* webhook ;
* intégration externe.

La disponibilité réelle de chaque canal dépendra de l'infrastructure et des contraintes du projet.

---

# 13. Notification in-app

Le canal interne doit être disponible sans dépendre obligatoirement d'un fournisseur externe.

Architecture :

```text
ALERT
 │
 ▼
Notification Service
 │
 ▼
Database
 │
 ▼
Web / Mobile Client
```

---

# 14. Notifications externes

Pour les canaux externes :

```text
Alert
 │
 ▼
Notification Service
 │
 ▼
Provider Adapter
 │
 ├── Email
 ├── SMS
 └── Push
```

Les fournisseurs externes doivent être abstraits derrière une interface.

Cela évite de coupler IntelliFlood à un fournisseur unique.

---

# 15. Exemple d'interface

**⚠️ EXEMPLE :**

```text
NotificationProvider

send(notification)
validate_configuration()
get_status()
```

L'implémentation réelle reste à définir.

---

# 16. Prévention du spam

Une situation peut déclencher plusieurs fois la même condition.

Le système doit pouvoir appliquer :

* déduplication ;
* cooldown ;
* regroupement ;
* limitation de fréquence ;
* suppression des répétitions.

**⚠️ EXEMPLES NON EXHAUSTIFS.**

---

# 17. Escalade

Une alerte non traitée peut éventuellement être escaladée.

Exemple :

```text
ALERTE
  │
  ▼
Utilisateur A
  │
  │ non acquittée
  ▼
Groupe B
  │
  │ toujours non traitée
  ▼
Opérateur C
```

L'escalade doit être configurée selon les règles métier.

---

# 18. Acquittement

Un utilisateur autorisé peut reconnaître une alerte.

L'acquittement doit conserver :

```text
user_id
timestamp
alert_id
action
```

---

# 19. Résolution

Une alerte résolue doit conserver les informations nécessaires à l'audit.

Exemple :

```text
Alert
 ├── created_at
 ├── activated_at
 ├── acknowledged_at
 ├── resolved_at
 ├── created_by
 ├── acknowledged_by
 └── resolved_by
```

---

# 20. Expiration

Certaines alertes peuvent devenir obsolètes.

Le système peut gérer :

```text
VALID_UNTIL
```

Une alerte expirée ne doit pas continuer à générer indéfiniment des notifications.

---

# 21. Historique

Le système doit conserver l'historique des changements importants.

Exemple :

```text
Alert Created
      ↓
Severity Changed
      ↓
Acknowledged
      ↓
Escalated
      ↓
Resolved
```

---

# 22. Audit

Les opérations importantes doivent être auditées.

**⚠️ EXEMPLES NON EXHAUSTIFS :**

* création ;
* modification ;
* activation ;
* acquittement ;
* escalade ;
* résolution ;
* suppression.

---

# 23. Sécurité

Une alerte peut contenir des informations sensibles.

Le système doit vérifier :

```text
User
  │
  ▼
Permission
  │
  ▼
Organization
  │
  ▼
Geographic Scope
  │
  ▼
Alert
```

Un utilisateur ne doit pas recevoir une alerte appartenant à un tenant auquel il n'a pas accès.

---

# 24. Offline-first

Une notification critique peut être créée alors qu'un client est offline.

Le client peut conserver :

```text
Pending Notification
```

Puis synchroniser lorsque le réseau revient.

Cependant, il faut distinguer :

```text
ALERTE CRÉÉE LOCALEMENT
```

de :

```text
ALERTE OFFICIELLE SERVEUR
```

tant que la synchronisation et la validation serveur ne sont pas terminées.

---

# 25. Alertes et événements

Le système d'événements permet de connecter les composants.

Exemple :

```text
ObservationCreated
       │
       ▼
Rule Engine
       │
       ▼
Condition Detected
       │
       ▼
AlertCreated
       │
       ▼
NotificationRequested
```

---

# 26. Fiabilité

Pour les notifications importantes :

* retry ;
* idempotence ;
* journalisation ;
* confirmation de traitement ;
* gestion des erreurs.

Une notification envoyée deux fois peut avoir un impact différent selon le canal ; l'idempotence doit donc être pensée par canal.

---

# 27. Architecture globale

```text
                   ┌───────────────┐
                   │   DATA /      │
                   │   EVENTS      │
                   └───────┬───────┘
                           │
                           ▼
                   ┌───────────────┐
                   │  RULE ENGINE  │
                   └───────┬───────┘
                           │
                           ▼
                   ┌───────────────┐
                   │ ALERT ENGINE  │
                   └───────┬───────┘
                           │
                           ▼
                 ┌──────────────────┐
                 │ NOTIFICATION     │
                 │ SERVICE          │
                 └────────┬─────────┘
                          │
          ┌───────────────┼────────────────┐
          ▼               ▼                ▼
       In-App           Email          External
          │               │             Channels
          ▼               ▼                ▼
       Clients         Provider        Provider
```

---

# 28. Tests

Les tests doivent couvrir :

* règles ;
* seuils ;
* création ;
* cycle de vie ;
* permissions ;
* ciblage ;
* déduplication ;
* cooldown ;
* retry ;
* expiration ;
* escalade ;
* offline ;
* multi-tenancy ;
* audit ;
* canaux externes.

---

# 29. Décisions

### ALT-001

Une alerte est distincte d'une notification.

### ALT-002

Les règles critiques doivent être déterministes lorsque possible.

### ALT-003

L'IA ne constitue pas l'unique mécanisme de décision critique.

### ALT-004

Les notifications sont découplées des fournisseurs externes.

### ALT-005

Les alertes sont soumises aux permissions et à l'isolation multi-tenant.

### ALT-006

Les alertes doivent être auditables.

### ALT-007

Les notifications doivent supporter la gestion des erreurs et retry.

### ALT-008

Le système doit limiter les notifications répétitives.

### ALT-009

Les alertes doivent posséder un cycle de vie explicite.

### ALT-010

Les canaux externes restent interchangeables.

---

# 30. Principe final

> **Une alerte représente une situation ; une notification représente le moyen de communiquer cette situation. IntelliFlood doit séparer les deux afin de garantir fiabilité, traçabilité et flexibilité.**

**⚠️ EXEMPLES NON EXHAUSTIFS : les éléments présentés comme exemples illustrent le fonctionnement attendu, mais ne constituent pas une liste complète des fonctionnalités, données, cas d'utilisation ou composants à implémenter.**


---

## Complément — fiabilité des données et fonctionnement local (29 octobre 2026)

Les règles d'alerte doivent tenir compte de la provenance, de la fraîcheur, de la qualité et du type de données : mesure observée, prévision météo, estimation de risque, signalement citoyen ou résultat de simulation. Une prévision météorologique seule ne doit pas être présentée comme la confirmation d'une inondation en cours.

Les dispositifs locaux d'alarme peuvent continuer à fonctionner pendant une panne réseau seulement si le matériel et la logique locale ont été conçus et validés pour cela. Les notifications distantes restent dépendantes de la disponibilité des réseaux et fournisseurs. Les canaux et seuils décrits dans les exemples doivent être validés avec les acteurs compétents et par des essais de terrain avant tout usage opérationnel.
