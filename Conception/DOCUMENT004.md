# DOCUMENT004 — ACTEURS & CAS D’UTILISATION

**Projet :** IntelliFlood
**Document :** DOCUMENT004
**Titre :** Acteurs & cas d'utilisation
**Version :** 1.0
**Date :** 30 septembre 2026
**Statut :** Conception initiale

---

# 1. Objet du document

Ce document transforme les exigences définies dans le DOCUMENT003 en **acteurs et cas d'utilisation**.

Il constitue la base fonctionnelle des futurs diagrammes UML de cas d'utilisation et permet de déterminer comment les différents utilisateurs et systèmes externes interagissent avec IntelliFlood.

L'objectif n'est pas encore de décrire précisément l'implémentation technique.

Nous cherchons ici à répondre à la question :

> **Qui fait quoi avec IntelliFlood ?**

---

# 2. Documents de référence

Ce document s'appuie sur :

* DOCUMENT001 — Vision & Périmètre d'IntelliFlood ;
* DOCUMENT002 — Parties prenantes & utilisateurs ;
* DOCUMENT003 — Expression des besoins & exigences.

---

# 3. Définitions

## 3.1 Acteur

Un acteur est une personne, une organisation ou un système externe qui interagit avec IntelliFlood.

## 3.2 Cas d'utilisation

Un cas d'utilisation représente une fonctionnalité ou un objectif qu'un acteur peut réaliser grâce au système.

## 3.3 Système externe

Un système externe est un logiciel, service, capteur ou système tiers avec lequel IntelliFlood échange des informations.

---

# 4. Acteurs principaux

Les acteurs humains principaux sont :

| ID      | Acteur                   | Description                                            |
| ------- | ------------------------ | ------------------------------------------------------ |
| ACT-001 | Citoyen                  | Utilisateur public                                     |
| ACT-002 | Agent de terrain         | Utilisateur réalisant des observations sur le terrain  |
| ACT-003 | Analyste / Expert        | Utilisateur réalisant des analyses approfondies        |
| ACT-004 | Responsable opérationnel | Utilisateur supervisant les situations et opérations   |
| ACT-005 | Administrateur           | Responsable de la configuration et de l'administration |

---

# 5. Acteurs externes

| ID      | Acteur                  | Description                                              |
| ------- | ----------------------- | -------------------------------------------------------- |
| ACT-006 | Organisation partenaire | Organisation collaborant avec IntelliFlood               |
| ACT-007 | Fournisseur de données  | Source externe de données                                |
| ACT-008 | Autorité compétente     | Organisme pouvant recevoir ou exploiter des informations |
| ACT-009 | Système externe         | Application ou plateforme externe                        |
| ACT-010 | Capteur / dispositif    | Source automatique de mesures                            |

---

# 6. Hiérarchie conceptuelle des acteurs

Les profils humains peuvent être représentés conceptuellement ainsi :

```text
                    Utilisateur IntelliFlood
                           │
          ┌────────────────┼────────────────┐
          │                │                │
      Citoyen       Utilisateur métier   Administrateur
                           │
              ┌────────────┼────────────┐
              │            │            │
          Terrain       Analyste     Responsable
```

Cette représentation est conceptuelle.

Les relations UML exactes seront affinées lors de la réalisation des diagrammes.

---

# 7. Cas d'utilisation principaux

## 7.1 Authentification

**ID : UC-AUTH-001**

Permet à un utilisateur de s'authentifier.

**Acteurs :**

* Citoyen ;
* Agent de terrain ;
* Analyste ;
* Responsable opérationnel ;
* Administrateur.

---

## 7.2 Consulter la carte

**ID : UC-WORLD-001**

Permet à un utilisateur de consulter la représentation cartographique du territoire.

**Acteurs :**

* Citoyen ;
* Agent de terrain ;
* Analyste ;
* Responsable opérationnel.

---

## 7.3 Explorer le territoire

**ID : UC-WORLD-002**

Permet de naviguer dans le territoire.

Fonctions :

* déplacement ;
* zoom ;
* sélection ;
* recherche ;
* changement de couche.

---

## 7.4 Consulter une couche géographique

**ID : UC-WORLD-003**

Permet d'afficher ou masquer une couche géographique.

---

## 7.5 Consulter l'évolution temporelle

**ID : UC-WORLD-004**

Permet d'examiner l'évolution d'une situation dans le temps.

---

# 8. Cas d'utilisation liés aux inondations

## UC-FLOOD-001 — Consulter une zone inondée

Permet d'afficher une zone affectée par une inondation.

## UC-FLOOD-002 — Consulter le niveau d'eau

Permet de consulter les niveaux d'eau disponibles.

## UC-FLOOD-003 — Consulter les précipitations

Permet de consulter les données de pluie disponibles.

## UC-FLOOD-004 — Analyser une zone à risque

Permet d'étudier le niveau de risque d'une zone.

## UC-FLOOD-005 — Consulter la propagation

Permet de visualiser l'évolution d'une inondation.

## UC-FLOOD-006 — Consulter la vulnérabilité

Permet d'identifier les éléments vulnérables dans une zone.

---

# 9. Cas d'utilisation liés aux observations

## UC-OBS-001 — Créer une observation

Un utilisateur autorisé crée une observation.

## UC-OBS-002 — Géolocaliser une observation

Associe une position géographique à une observation.

## UC-OBS-003 — Ajouter une photographie

Ajoute une photographie à une observation.

## UC-OBS-004 — Ajouter un média

Ajoute une vidéo, un document ou un autre média.

## UC-OBS-005 — Décrire une observation

Ajoute une description textuelle.

## UC-OBS-006 — Consulter une observation

Consulte une observation existante.

## UC-OBS-007 — Valider une observation

Un utilisateur autorisé vérifie une observation.

## UC-OBS-008 — Rejeter une observation

Un utilisateur autorisé rejette une observation non valide.

---

# 10. Cas d'utilisation liés à l'analyse

## UC-ANALYSIS-001 — Analyser une zone

Analyse les données disponibles dans une zone géographique.

## UC-ANALYSIS-002 — Analyser une période

Analyse l'évolution d'un phénomène dans une période donnée.

## UC-ANALYSIS-003 — Comparer deux situations

Compare deux états ou deux périodes.

## UC-ANALYSIS-004 — Consulter les indicateurs

Affiche les indicateurs calculés.

---

# 11. Cas d'utilisation liés à l'intelligence artificielle

## UC-AI-001 — Interroger l'assistant

Permet à un utilisateur autorisé de poser une question à l'assistant.

## UC-AI-002 — Analyser automatiquement des données

Permet de lancer une analyse assistée par IA.

## UC-AI-003 — Détecter une anomalie

Permet d'identifier automatiquement certaines anomalies.

## UC-AI-004 — Analyser une image

Permet d'utiliser un modèle de vision sur une image.

## UC-AI-005 — Générer une synthèse

Permet de générer une synthèse à partir des informations disponibles.

## UC-AI-006 — Vérifier un résultat IA

Permet à un utilisateur habilité de consulter et éventuellement valider un résultat généré par IA.

---

# 12. Cas d'utilisation liés à la simulation

## UC-SIM-001 — Créer un scénario

Crée un scénario hypothétique.

## UC-SIM-002 — Configurer un scénario

Définit les paramètres du scénario.

## UC-SIM-003 — Exécuter une simulation

Lance le calcul du scénario.

## UC-SIM-004 — Visualiser une simulation

Affiche les résultats sur la carte.

## UC-SIM-005 — Comparer des simulations

Compare plusieurs scénarios.

---

# 13. Cas d'utilisation liés aux alertes

## UC-ALERT-001 — Détecter une situation critique

Identifie une situation correspondant à une règle d'alerte.

## UC-ALERT-002 — Créer une alerte

Crée une alerte.

## UC-ALERT-003 — Consulter une alerte

Consulte les détails d'une alerte.

## UC-ALERT-004 — Recevoir une notification

Reçoit une notification lorsqu'une alerte concerne l'utilisateur.

## UC-ALERT-005 — Gérer une alerte

Un responsable autorisé peut traiter une alerte.

---

# 14. Cas d'utilisation hors ligne

## UC-OFFLINE-001 — Préparer les données hors ligne

Télécharge ou conserve localement les données nécessaires.

## UC-OFFLINE-002 — Consulter les données hors ligne

Consulte les données disponibles localement.

## UC-OFFLINE-003 — Créer une observation hors ligne

Crée une observation sans connexion.

## UC-OFFLINE-004 — Mettre en file une modification

Stocke localement une modification en attente de synchronisation.

## UC-OFFLINE-005 — Synchroniser les données

Synchronise les données lorsque la connexion revient.

## UC-OFFLINE-006 — Gérer un conflit

Traite une divergence entre les données locales et distantes.

---

# 15. Cas d'utilisation liés aux rapports

## UC-REPORT-001 — Générer un rapport

Crée un rapport.

## UC-REPORT-002 — Consulter un rapport

Affiche un rapport existant.

## UC-REPORT-003 — Exporter un rapport

Exporte un rapport dans un format approprié.

---

# 16. Cas d'utilisation liés à la collaboration

## UC-COLLAB-001 — Partager une information

Partage une information avec un utilisateur autorisé.

## UC-COLLAB-002 — Ajouter une annotation

Ajoute une annotation à un élément.

## UC-COLLAB-003 — Ajouter un commentaire

Ajoute un commentaire.

## UC-COLLAB-004 — Consulter l'historique

Consulte les actions et modifications enregistrées.

---

# 17. Administration

## UC-ADMIN-001 — Gérer les utilisateurs

Créer, modifier, désactiver ou gérer des utilisateurs.

## UC-ADMIN-002 — Gérer les rôles

Configurer les rôles et permissions.

## UC-ADMIN-003 — Configurer le système

Modifier certains paramètres généraux.

## UC-ADMIN-004 — Gérer les sources de données

Configurer les sources disponibles.

## UC-ADMIN-005 — Consulter les journaux

Consulter les événements techniques et administratifs.

---

# 18. Interactions avec les systèmes externes

## UC-EXT-001 — Importer des données

Intègre des données provenant d'une source externe.

**Acteur :** Fournisseur de données.

## UC-EXT-002 — Recevoir des mesures

Reçoit automatiquement des mesures provenant de capteurs ou systèmes externes.

## UC-EXT-003 — Exporter des données

Transmet des données à un système externe.

## UC-EXT-004 — Partager une alerte

Transmet une information ou une alerte à une organisation autorisée.

---

# 19. Relations principales entre cas d'utilisation

Certaines fonctionnalités dépendent d'autres fonctionnalités.

Exemple :

```text
Créer une observation
        │
        ├── <<include>> Géolocaliser
        │
        ├── <<include>> Enregistrer la date
        │
        └── <<extend>> Ajouter une photographie
```

Autre exemple :

```text
Exécuter une simulation
        │
        ├── <<include>> Configurer scénario
        │
        └── <<include>> Vérifier paramètres
```

---

# 20. Cas d'utilisation par profil

| Profil         | Cas principaux                                                        |
| -------------- | --------------------------------------------------------------------- |
| Citoyen        | Consulter carte, consulter informations, signaler un événement        |
| Agent terrain  | Créer observation, géolocaliser, ajouter média, travailler hors ligne |
| Analyste       | Analyse, comparaison, simulation, IA, rapports                        |
| Responsable    | Supervision, alertes, coordination, rapports                          |
| Administrateur | Utilisateurs, permissions, sources, configuration                     |

---

# 21. Diagramme général à produire

Le diagramme UML général devra représenter :

```text
                       INTELLIFLOOD
┌────────────────────────────────────────────────────┐
│                                                    │
│  Authentification                                  │
│                                                    │
│  Consultation du territoire                       │
│                                                    │
│  Observation                                       │
│                                                    │
│  Analyse                                           │
│                                                    │
│  Inondation                                        │
│                                                    │
│  Simulation                                        │
│                                                    │
│  Intelligence artificielle                        │
│                                                    │
│  Alertes                                           │
│                                                    │
│  Hors ligne / Synchronisation                     │
│                                                    │
│  Rapports                                          │
│                                                    │
│  Collaboration                                     │
│                                                    │
│  Administration                                    │
│                                                    │
└────────────────────────────────────────────────────┘
```

Les acteurs seront positionnés autour du système et reliés aux cas d'utilisation pertinents.

---

# 22. Décisions de conception

### DEC-004-001

Les cas d'utilisation sont organisés par objectif fonctionnel et non par écran.

### DEC-004-002

Un même cas d'utilisation peut être accessible à plusieurs profils.

### DEC-004-003

Les permissions détaillées seront définies dans les documents de sécurité.

### DEC-004-004

Les fonctionnalités hors ligne seront considérées comme de véritables cas d'utilisation.

### DEC-004-005

Les systèmes externes seront représentés comme acteurs lorsqu'ils interagissent directement avec IntelliFlood.

---

# 23. Préparation du DOCUMENT005

Le DOCUMENT005 décrira les **flux d'activités** associés aux principales fonctionnalités.

Il permettra notamment de modéliser :

* création d'une observation ;
* analyse d'une situation ;
* gestion d'une alerte ;
* simulation ;
* synchronisation ;
* génération d'un rapport ;
* traitement d'une donnée.

---

# 24. État du document

**DOCUMENT004 : TERMINÉ — VERSION 1.0**
