# DOCUMENT008 — MODÈLE CONCEPTUEL DE DONNÉES

**Projet :** IntelliFlood
**Document :** DOCUMENT008
**Titre :** Modèle conceptuel de données
**Version :** 1.0
**Date :** 30 septembre 2026
**Statut :** Conception initiale

---

# 1. Objet du document

Ce document définit la structure conceptuelle des données manipulées par IntelliFlood.

Il transforme le modèle de domaine du DOCUMENT007 en un modèle orienté données.

Il permet de répondre à la question :

> **Quelles données IntelliFlood doit-il conserver et comment sont-elles liées ?**

Ce document constitue la base de la future conception de la base de données.

---

# 2. Documents de référence

* DOCUMENT001 — Vision & Périmètre ;
* DOCUMENT003 — Expression des besoins & exigences ;
* DOCUMENT007 — Modèle de domaine & diagramme de classes.

---

# 3. Principes de données

Le modèle de données doit respecter les principes suivants :

1. chaque donnée importante possède un identifiant ;
2. les relations entre les données sont explicites ;
3. les données géographiques sont natives au modèle ;
4. les données temporelles sont conservées ;
5. les sources sont traçables ;
6. les résultats sont différenciés des observations ;
7. les données simulées sont explicitement identifiées ;
8. les modifications importantes peuvent être historisées ;
9. le modèle doit pouvoir fonctionner avec le mode hors ligne ;
10. le modèle doit rester extensible.

---

# 4. Entités principales

Les principales entités sont :

```text
USER
PROFILE
PERMISSION
SESSION
ZONE
GEO_OBJECT
SOURCE
OBSERVATION
MEDIA
EVENT
RISK
VULNERABILITY
ALERT
NOTIFICATION
SCENARIO
SIMULATION
RESULT
MODEL
ANALYSIS
REPORT
ANNOTATION
SYNC_OPERATION
SYNC_CONFLICT
```

---

# 5. Entité USER

Représente un utilisateur.

### Attributs

| Attribut         | Type conceptuel | Contraintes |
| ---------------- | --------------- | ----------- |
| user_id          | Identifiant     | PK          |
| username         | Texte           | Unique      |
| name             | Texte           | Obligatoire |
| status           | Énumération     | Obligatoire |
| profile_id       | Identifiant     | FK          |
| created_at       | Date/heure      | Obligatoire |
| last_activity_at | Date/heure      | Optionnel   |

---

# 6. Entité PROFILE

### Attributs

| Attribut    | Type        | Contraintes |
| ----------- | ----------- | ----------- |
| profile_id  | Identifiant | PK          |
| name        | Texte       | Unique      |
| description | Texte       | Optionnel   |

---

# 7. Entité PERMISSION

### Attributs

| Attribut      | Type        | Contraintes |
| ------------- | ----------- | ----------- |
| permission_id | Identifiant | PK          |
| code          | Texte       | Unique      |
| description   | Texte       | Obligatoire |

---

# 8. Relation PROFILE_PERMISSION

Un profil possède plusieurs permissions.

```text
PROFILE 1 ───────── N PERMISSION
```

Cette relation pourra être représentée par une entité associative dans le modèle logique.

---

# 9. Entité SESSION

| Attribut   | Type        | Contraintes |
| ---------- | ----------- | ----------- |
| session_id | Identifiant | PK          |
| user_id    | Identifiant | FK          |
| started_at | Date/heure  | Obligatoire |
| expires_at | Date/heure  | Obligatoire |
| status     | Énumération | Obligatoire |

---

# 10. Entité ZONE

Une zone représente une portion du territoire.

| Attribut   | Type            | Contraintes |
| ---------- | --------------- | ----------- |
| zone_id    | Identifiant     | PK          |
| name       | Texte           | Obligatoire |
| zone_type  | Énumération     | Obligatoire |
| geometry   | Géométrie       | Obligatoire |
| properties | Objet structuré | Optionnel   |
| created_at | Date/heure      | Obligatoire |

---

# 11. Entité GEO_OBJECT

Représente un objet géographique.

| Attribut      | Type            | Contraintes |
| ------------- | --------------- | ----------- |
| geo_object_id | Identifiant     | PK          |
| object_type   | Énumération     | Obligatoire |
| geometry      | Géométrie       | Obligatoire |
| properties    | Objet structuré | Optionnel   |
| source_id     | Identifiant     | FK          |
| created_at    | Date/heure      | Obligatoire |

---

# 12. Entité SOURCE

| Attribut     | Type            | Contraintes |
| ------------ | --------------- | ----------- |
| source_id    | Identifiant     | PK          |
| name         | Texte           | Obligatoire |
| source_type  | Énumération     | Obligatoire |
| description  | Texte           | Optionnel   |
| reliability  | Nombre / niveau | Optionnel   |
| last_sync_at | Date/heure      | Optionnel   |

---

# 13. Entité OBSERVATION

| Attribut       | Type            | Contraintes |
| -------------- | --------------- | ----------- |
| observation_id | Identifiant     | PK          |
| type           | Énumération     | Obligatoire |
| description    | Texte           | Optionnel   |
| geometry       | Géométrie       | Optionnel   |
| observed_at    | Date/heure      | Obligatoire |
| created_at     | Date/heure      | Obligatoire |
| user_id        | Identifiant     | FK          |
| source_id      | Identifiant     | FK          |
| zone_id        | Identifiant     | FK          |
| status         | Énumération     | Obligatoire |
| confidence     | Nombre / niveau | Optionnel   |

---

# 14. Entité MEDIA

| Attribut          | Type        | Contraintes |
| ----------------- | ----------- | ----------- |
| media_id          | Identifiant | PK          |
| observation_id    | Identifiant | FK          |
| media_type        | Énumération | Obligatoire |
| storage_reference | Texte       | Obligatoire |
| size              | Nombre      | Optionnel   |
| hash              | Texte       | Optionnel   |
| created_at        | Date/heure  | Obligatoire |

---

# 15. Entité EVENT

| Attribut    | Type        | Contraintes |
| ----------- | ----------- | ----------- |
| event_id    | Identifiant | PK          |
| event_type  | Énumération | Obligatoire |
| description | Texte       | Optionnel   |
| geometry    | Géométrie   | Optionnel   |
| occurred_at | Date/heure  | Obligatoire |
| severity    | Énumération | Optionnel   |
| source_id   | Identifiant | FK          |
| status      | Énumération | Obligatoire |

---

# 16. Entité RISK

| Attribut     | Type            | Contraintes |
| ------------ | --------------- | ----------- |
| risk_id      | Identifiant     | PK          |
| zone_id      | Identifiant     | FK          |
| risk_type    | Énumération     | Obligatoire |
| level        | Énumération     | Obligatoire |
| evaluated_at | Date/heure      | Obligatoire |
| method       | Texte           | Optionnel   |
| confidence   | Nombre / niveau | Optionnel   |

---

# 17. Entité VULNERABILITY

| Attribut         | Type        | Contraintes |
| ---------------- | ----------- | ----------- |
| vulnerability_id | Identifiant | PK          |
| risk_id          | Identifiant | FK          |
| target_type      | Énumération | Obligatoire |
| target_id        | Identifiant | Obligatoire |
| level            | Énumération | Obligatoire |
| evaluated_at     | Date/heure  | Obligatoire |

---

# 18. Entité ALERT

| Attribut    | Type        | Contraintes |
| ----------- | ----------- | ----------- |
| alert_id    | Identifiant | PK          |
| title       | Texte       | Obligatoire |
| description | Texte       | Optionnel   |
| severity    | Énumération | Obligatoire |
| geometry    | Géométrie   | Optionnel   |
| created_at  | Date/heure  | Obligatoire |
| status      | Énumération | Obligatoire |
| event_id    | Identifiant | FK          |
| source_id   | Identifiant | FK          |

---

# 19. Entité NOTIFICATION

| Attribut        | Type        | Contraintes |
| --------------- | ----------- | ----------- |
| notification_id | Identifiant | PK          |
| alert_id        | Identifiant | FK          |
| user_id         | Identifiant | FK          |
| type            | Énumération | Obligatoire |
| content         | Texte       | Obligatoire |
| sent_at         | Date/heure  | Optionnel   |
| status          | Énumération | Obligatoire |

---

# 20. Entité SCENARIO

| Attribut    | Type            | Contraintes |
| ----------- | --------------- | ----------- |
| scenario_id | Identifiant     | PK          |
| name        | Texte           | Obligatoire |
| description | Texte           | Optionnel   |
| user_id     | Identifiant     | FK          |
| parameters  | Objet structuré | Obligatoire |
| created_at  | Date/heure      | Obligatoire |

---

# 21. Entité SIMULATION

| Attribut      | Type        | Contraintes |
| ------------- | ----------- | ----------- |
| simulation_id | Identifiant | PK          |
| scenario_id   | Identifiant | FK          |
| model_id      | Identifiant | FK          |
| started_at    | Date/heure  | Optionnel   |
| completed_at  | Date/heure  | Optionnel   |
| status        | Énumération | Obligatoire |

---

# 22. Entité RESULT

| Attribut       | Type              | Contraintes    |
| -------------- | ----------------- | -------------- |
| result_id      | Identifiant       | PK             |
| result_type    | Énumération       | Obligatoire    |
| simulation_id  | Identifiant       | FK optionnelle |
| analysis_id    | Identifiant       | FK optionnelle |
| model_id       | Identifiant       | FK optionnelle |
| created_at     | Date/heure        | Obligatoire    |
| confidence     | Nombre / niveau   | Optionnel      |
| data_reference | Texte / référence | Obligatoire    |

Un résultat peut provenir d'une simulation, d'une analyse ou d'un modèle.

---

# 23. Entité MODEL

| Attribut   | Type        | Contraintes |
| ---------- | ----------- | ----------- |
| model_id   | Identifiant | PK          |
| name       | Texte       | Obligatoire |
| version    | Texte       | Obligatoire |
| model_type | Énumération | Obligatoire |
| provider   | Texte       | Optionnel   |
| status     | Énumération | Obligatoire |

---

# 24. Entité ANALYSIS

| Attribut      | Type        | Contraintes |
| ------------- | ----------- | ----------- |
| analysis_id   | Identifiant | PK          |
| analysis_type | Énumération | Obligatoire |
| user_id       | Identifiant | FK          |
| started_at    | Date/heure  | Obligatoire |
| completed_at  | Date/heure  | Optionnel   |
| status        | Énumération | Obligatoire |

---

# 25. Entité REPORT

| Attribut          | Type        | Contraintes |
| ----------------- | ----------- | ----------- |
| report_id         | Identifiant | PK          |
| title             | Texte       | Obligatoire |
| user_id           | Identifiant | FK          |
| zone_id           | Identifiant | FK          |
| created_at        | Date/heure  | Obligatoire |
| period_start      | Date/heure  | Optionnel   |
| period_end        | Date/heure  | Optionnel   |
| content_reference | Texte       | Obligatoire |

---

# 26. Entité ANNOTATION

| Attribut      | Type        | Contraintes |
| ------------- | ----------- | ----------- |
| annotation_id | Identifiant | PK          |
| user_id       | Identifiant | FK          |
| content       | Texte       | Obligatoire |
| geometry      | Géométrie   | Optionnel   |
| created_at    | Date/heure  | Obligatoire |

---

# 27. Entité SYNC_OPERATION

| Attribut     | Type        | Contraintes |
| ------------ | ----------- | ----------- |
| sync_id      | Identifiant | PK          |
| user_id      | Identifiant | FK          |
| device_id    | Identifiant | Obligatoire |
| started_at   | Date/heure  | Obligatoire |
| completed_at | Date/heure  | Optionnel   |
| status       | Énumération | Obligatoire |
| error_count  | Nombre      | Optionnel   |

---

# 28. Entité SYNC_CONFLICT

| Attribut       | Type              | Contraintes |
| -------------- | ----------------- | ----------- |
| conflict_id    | Identifiant       | PK          |
| sync_id        | Identifiant       | FK          |
| object_type    | Texte             | Obligatoire |
| object_id      | Identifiant       | Obligatoire |
| local_version  | Texte / référence | Obligatoire |
| remote_version | Texte / référence | Obligatoire |
| status         | Énumération       | Obligatoire |
| resolution     | Texte             | Optionnel   |

---

# 29. Relations principales

```text
PROFILE 1 ─── N USER

PROFILE N ─── N PERMISSION

USER 1 ─── N SESSION

USER 1 ─── N OBSERVATION

OBSERVATION 1 ─── N MEDIA

SOURCE 1 ─── N OBSERVATION

ZONE 1 ─── N OBSERVATION

ZONE 1 ─── N GEO_OBJECT

ZONE 1 ─── N RISK

RISK 1 ─── N VULNERABILITY

EVENT 1 ─── N ALERT

ALERT 1 ─── N NOTIFICATION

USER 1 ─── N SCENARIO

SCENARIO 1 ─── N SIMULATION

SIMULATION 1 ─── N RESULT

MODEL 1 ─── N SIMULATION

MODEL 1 ─── N RESULT

USER 1 ─── N ANALYSIS

ANALYSIS 1 ─── N RESULT

USER 1 ─── N REPORT

USER 1 ─── N ANNOTATION

USER 1 ─── N SYNC_OPERATION

SYNC_OPERATION 1 ─── N SYNC_CONFLICT
```

---

# 30. Dimension temporelle

Les données importantes doivent pouvoir être associées au temps.

Le modèle devra distinguer :

```text
Temps de l'événement
        │
        ├── occurred_at
        │
        ▼
Temps de collecte
        │
        ├── observed_at
        │
        ▼
Temps de création
        │
        ├── created_at
        │
        ▼
Temps de modification
        │
        └── updated_at
```

Cette distinction est importante pour la traçabilité.

---

# 31. Dimension géographique

Les entités pouvant posséder une composante géographique comprennent notamment :

* Zone ;
* GeoObject ;
* Observation ;
* Event ;
* Risk ;
* Alert ;
* Annotation ;
* Result lorsque pertinent.

Les géométries pourront être :

* point ;
* ligne ;
* polygone ;
* géométrie multi-objet ;
* représentation 3D lorsque nécessaire.

---

# 32. Types de données

IntelliFlood manipulera plusieurs catégories :

```text
Données
│
├── Géographiques
├── Temporelles
├── Observées
├── Importées
├── Calculées
├── Prédites
├── Simulées
└── Générées / enrichies par IA
```

Chaque catégorie doit pouvoir être identifiée.

---

# 33. Historisation

Les objets critiques devront pouvoir conserver leur historique.

Exemple :

```text
Observation
    │
    ├── Version 1
    ├── Version 2
    ├── Version 3
    └── Version actuelle
```

L'architecture physique déterminera plus tard la stratégie exacte d'historisation.

---

# 34. Données hors ligne

Certaines données doivent pouvoir exister temporairement uniquement sur un appareil.

Exemple :

```text
Appareil
   │
   ▼
Observation locale
   │
   ▼
File de synchronisation
   │
   ▼
Serveur
```

Ces données devront conserver suffisamment d'informations pour permettre leur synchronisation.

---

# 35. Contraintes d'intégrité

Le système devra notamment empêcher :

* une observation sans identifiant ;
* une référence vers une zone inexistante ;
* une notification sans destinataire ;
* une simulation sans scénario ;
* un résultat sans origine identifiable lorsque celle-ci est obligatoire ;
* une synchronisation sans appareil identifié.

---

# 36. Principes de normalisation

Le modèle devra éviter :

* les duplications inutiles ;
* les données contradictoires ;
* les dépendances ambiguës ;
* les relations non définies.

Toutefois, des mécanismes de dénormalisation pourront être introduits ultérieurement lorsqu'ils sont nécessaires aux performances.

---

# 37. Modèle conceptuel simplifié

```text
USER
 │
 ├──── PROFILE
 │
 ├──── OBSERVATION ─── MEDIA
 │          │
 │          └──── SOURCE
 │
 ├──── ANALYSIS ───── RESULT
 │                       │
 │                       └──── MODEL
 │
 ├──── SCENARIO ───── SIMULATION ───── RESULT
 │
 ├──── REPORT
 │
 ├──── ANNOTATION
 │
 └──── SYNC_OPERATION ───── SYNC_CONFLICT

ZONE
 │
 ├──── GEO_OBJECT
 ├──── OBSERVATION
 └──── RISK ───── VULNERABILITY

EVENT ───── ALERT ───── NOTIFICATION
```

---

# 38. Préparation du modèle logique

Le modèle conceptuel sera transformé ultérieurement en modèle logique puis physique.

La transformation devra notamment définir :

* tables ;
* clés primaires ;
* clés étrangères ;
* index ;
* contraintes ;
* types de données réels ;
* index géospatiaux ;
* index temporels ;
* stratégie de partitionnement si nécessaire.

Ces éléments seront détaillés dans les documents d'architecture des données.

---

# 39. Décisions de conception

### DEC-008-001

Les données géographiques sont considérées comme une dimension native du système.

### DEC-008-002

Les données temporelles sont également natives du modèle.

### DEC-008-003

Les sources des données importantes doivent être traçables.

### DEC-008-004

Les résultats de simulation sont explicitement distingués des observations.

### DEC-008-005

Les résultats IA conservent une référence vers le modèle lorsque cela est possible.

### DEC-008-006

Le modèle doit supporter les opérations hors ligne et de synchronisation.

---

# 40. Préparation du DOCUMENT009

Le DOCUMENT009 définira l'architecture logicielle générale d'IntelliFlood.

Il devra déterminer :

* les grandes couches ;
* les modules ;
* les responsabilités ;
* les communications ;
* les dépendances ;
* les frontières entre les moteurs ;
* les interfaces ;
* les services transversaux.

---

# 41. État du document

**DOCUMENT008 : TERMINÉ — VERSION 1.0**
