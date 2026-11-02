# DOCUMENT002 — PARTIES PRENANTES & UTILISATEURS

**Projet :** IntelliFlood
**Type :** Analyse des parties prenantes et des utilisateurs
**Version :** 1.0
**Statut :** Document de conception
**Référence :** DOCUMENT001 — Vision & périmètre d'IntelliFlood

---

# 1. Objet du document

Ce document identifie les différentes **parties prenantes**, les **acteurs**, les **profils utilisateurs** et leurs interactions avec IntelliFlood.

L'objectif est de déterminer :

* qui utilise IntelliFlood ;
* qui fournit des données au système ;
* qui dépend des informations produites ;
* quelles sont les responsabilités de chaque acteur ;
* quelles fonctionnalités sont accessibles à chaque profil ;
* quelles sont les attentes et contraintes de chaque partie prenante.

Ce document servira de base aux documents suivants, notamment :

* l'expression des exigences ;
* les cas d'utilisation ;
* les diagrammes UML ;
* la conception des permissions ;
* l'architecture fonctionnelle.

---

# 2. Rappel du contexte

IntelliFlood est une plateforme géospatiale intelligente destinée à l'observation, l'analyse, la prévention, la simulation et la gestion des inondations.

Le système intègre plusieurs moteurs :

```text
                    INTELLIFLOOD
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
 WORLD ENGINE       FLOOD ENGINE    INTELLIGENCE ENGINE
        │                │                │
        └────────────────┼────────────────┘
                         │
                         ▼
                  GEO/DATA ENGINE
                         │
                         ▼
                 OFFLINE & SYNC
```

La diversité de ces fonctions implique plusieurs catégories d'utilisateurs.

---

# 3. Définitions

## 3.1. Partie prenante

Une **partie prenante** est une personne, une organisation ou un système qui :

* utilise IntelliFlood ;
* fournit des données à IntelliFlood ;
* dépend des résultats d'IntelliFlood ;
* participe à son fonctionnement ;
* influence son évolution ;
* ou est affecté par son utilisation.

---

## 3.2. Acteur

Un **acteur** est une entité externe qui interagit directement avec le système.

Un acteur peut être :

* une personne ;
* une organisation représentée par un utilisateur ;
* un système externe ;
* une source de données.

---

## 3.3. Profil utilisateur

Un profil utilisateur représente un ensemble de responsabilités et de permissions.

Exemple :

```text
Utilisateur
     │
     ├── Citoyen
     ├── Agent de terrain
     ├── Analyste
     ├── Responsable opérationnel
     └── Administrateur
```

---

# 4. Identification des parties prenantes

Les principales parties prenantes identifiées sont :

| ID     | Partie prenante          | Catégorie            | Relation avec IntelliFlood                          |
| ------ | ------------------------ | -------------------- | --------------------------------------------------- |
| PS-001 | Citoyen                  | Utilisateur          | Consulte et signale                                 |
| PS-002 | Agent de terrain         | Utilisateur          | Observe et intervient                               |
| PS-003 | Analyste / Expert        | Utilisateur          | Analyse et simule                                   |
| PS-004 | Responsable opérationnel | Utilisateur          | Coordonne                                           |
| PS-005 | Administrateur           | Utilisateur          | Administre                                          |
| PS-006 | Organisation partenaire  | Organisation         | Exploite et partage des données                     |
| PS-007 | Fournisseur de données   | Système/Organisation | Fournit des données                                 |
| PS-008 | Autorité compétente      | Organisation         | Exploite les informations pour la gestion du risque |
| PS-009 | Équipe technique         | Équipe interne       | Développe et maintient                              |
| PS-010 | Système externe          | Système              | Échange automatiquement des données                 |

---

# 5. PS-001 — Citoyen

## 5.1. Description

Le citoyen est un utilisateur général d'IntelliFlood.

Il n'a pas nécessairement de connaissances techniques ou scientifiques.

Son objectif principal est de :

* comprendre la situation autour de lui ;
* consulter les risques ;
* recevoir des informations ;
* signaler une situation inhabituelle ou dangereuse.

---

## 5.2. Fonctionnalités accessibles

Le citoyen peut notamment :

* consulter la carte ;
* consulter certaines couches géographiques ;
* consulter les zones à risque ;
* consulter les alertes ;
* consulter les événements ;
* consulter les informations relatives à une zone ;
* créer un signalement ;
* joindre une photographie ou un média ;
* transmettre sa position ;
* consulter l'état de ses signalements.

---

## 5.3. Contraintes

L'interface citoyenne doit :

* être simple ;
* être compréhensible ;
* fonctionner sur mobile ;
* limiter le nombre d'actions nécessaires pour signaler une situation ;
* fonctionner hors ligne lorsque cela est prévu.

---

# 6. PS-002 — Agent de terrain

## 6.1. Description

L'agent de terrain utilise IntelliFlood directement sur le terrain.

Il peut être confronté à :

* une mauvaise connexion Internet ;
* une batterie limitée ;
* des conditions difficiles ;
* une grande quantité d'informations à collecter.

---

## 6.2. Fonctionnalités

L'agent peut :

* consulter une carte ;
* consulter les zones d'intervention ;
* consulter les incidents ;
* créer des observations ;
* enregistrer une position ;
* prendre des photographies ;
* ajouter des commentaires ;
* créer des rapports ;
* consulter les informations disponibles hors ligne ;
* synchroniser les données ultérieurement ;
* consulter les tâches qui lui sont attribuées.

---

## 6.3. Besoin principal

Le système doit permettre à l'agent de travailler même lorsque :

```text
Internet disponible
        │
        ▼
   Synchronisation
```

ou :

```text
Internet indisponible
        │
        ▼
   Travail local
        │
        ▼
   Synchronisation
   ultérieure
```

---

# 7. PS-003 — Analyste / Expert

## 7.1. Description

L'analyste utilise IntelliFlood pour comprendre les phénomènes et exploiter les données.

Il peut avoir des connaissances dans :

* la géographie ;
* les systèmes d'information géographique ;
* l'environnement ;
* l'hydrologie ;
* l'analyse de données ;
* la gestion des risques.

---

## 7.2. Fonctionnalités

L'analyste peut :

* explorer les données géospatiales ;
* consulter l'historique ;
* comparer différentes périodes ;
* analyser les événements ;
* étudier les zones vulnérables ;
* consulter les données provenant de différentes sources ;
* lancer des simulations ;
* comparer des scénarios ;
* analyser les résultats ;
* produire des rapports ;
* utiliser l'assistant intelligent.

---

## 7.3. Besoin principal

L'analyste doit pouvoir distinguer clairement :

```text
OBSERVATION
     ≠
CALCUL
     ≠
PRÉVISION
     ≠
SIMULATION
```

Cette distinction est fondamentale pour éviter l'interprétation incorrecte des résultats.

---

# 8. PS-004 — Responsable opérationnel

## 8.1. Description

Le responsable opérationnel supervise les événements et les opérations.

Il peut coordonner :

* des équipes ;
* des interventions ;
* des ressources ;
* des zones géographiques.

---

## 8.2. Fonctionnalités

Il peut :

* consulter les événements ;
* consulter les alertes ;
* visualiser les zones affectées ;
* suivre les équipes autorisées ;
* créer ou attribuer des interventions ;
* consulter les rapports ;
* suivre l'évolution d'une situation ;
* consulter les données historiques ;
* utiliser les outils de supervision.

---

## 8.3. Besoin principal

Le responsable doit obtenir rapidement une vision synthétique de la situation :

```text
OÙ ?
QUOI ?
QUAND ?
QUELLE GRAVITÉ ?
QUELLES RESSOURCES ?
QUELLE ÉVOLUTION ?
```

---

# 9. PS-005 — Administrateur

## 9.1. Description

L'administrateur est responsable de la configuration et de la gestion du système.

---

## 9.2. Fonctionnalités

L'administrateur peut :

* créer des utilisateurs ;
* modifier des utilisateurs ;
* désactiver des comptes ;
* attribuer des rôles ;
* gérer les organisations ;
* gérer les permissions ;
* configurer certaines sources de données ;
* consulter les journaux ;
* gérer les paramètres ;
* superviser l'état général du système.

---

## 9.3. Restriction

L'administrateur ne doit pas automatiquement avoir accès à toutes les données métier simplement parce qu'il possède des droits techniques.

Les permissions techniques et les permissions d'accès aux données doivent être conçues séparément lorsque cela est nécessaire.

---

# 10. PS-006 — Organisation partenaire

## 10.1. Description

Une organisation partenaire peut utiliser IntelliFlood dans le cadre d'une collaboration.

Exemples conceptuels :

* organisation humanitaire ;
* organisme environnemental ;
* équipe de recherche ;
* structure de gestion des risques ;
* organisation locale.

---

## 10.2. Fonctionnalités possibles

Selon ses permissions, l'organisation peut :

* consulter certaines données ;
* partager des observations ;
* créer des événements ;
* consulter des rapports ;
* suivre des interventions ;
* transmettre des données ;
* recevoir des informations.

---

# 11. PS-007 — Fournisseur de données

## 11.1. Description

Le fournisseur de données fournit des informations pouvant être utilisées par IntelliFlood.

Il peut s'agir d'une organisation ou d'un système automatisé.

---

## 11.2. Types de données possibles

Exemples :

* données météorologiques ;
* données hydrologiques ;
* données satellites ;
* données géographiques ;
* données de capteurs ;
* données de trafic ;
* données cartographiques ;
* données historiques.

---

## 11.3. Principe

Une donnée provenant d'une source externe doit conserver ses métadonnées lorsque cela est possible :

```text
Donnée
 ├── Source
 ├── Date/heure
 ├── Type
 ├── Position
 ├── Valeur
 └── Qualité / confiance
```

---

# 12. PS-008 — Autorité compétente

## 12.1. Description

Une autorité compétente peut exploiter les informations produites par IntelliFlood dans le cadre de ses missions.

Elle peut notamment :

* consulter les risques ;
* suivre les événements ;
* consulter les rapports ;
* exploiter les informations géospatiales ;
* coordonner certaines opérations selon ses responsabilités.

---

## 12.2. Principe important

IntelliFlood fournit des informations et des outils d'aide.

Les décisions officielles restent sous la responsabilité des personnes et institutions compétentes.

---

# 13. PS-009 — Équipe technique

## 13.1. Description

L'équipe technique développe, maintient et fait évoluer IntelliFlood.

Elle comprend potentiellement :

* développeurs ;
* architectes ;
* ingénieurs logiciels ;
* spécialistes données ;
* administrateurs système ;
* testeurs.

---

## 13.2. Responsabilités

L'équipe technique doit :

* maintenir le code ;
* corriger les anomalies ;
* faire évoluer l'architecture ;
* maintenir les bases de données ;
* maintenir les interfaces ;
* gérer les déploiements ;
* assurer les tests ;
* maintenir la documentation ;
* surveiller les performances ;
* maintenir les mécanismes de synchronisation.

---

# 14. PS-010 — Systèmes externes

## 14.1. Description

Un système externe est une application ou un service avec lequel IntelliFlood échange automatiquement des informations.

---

## 14.2. Exemples

```text
IntelliFlood
     │
     ├── API météo
     ├── Source cartographique
     ├── Source satellite
     ├── Capteurs IoT
     ├── Système de notification
     └── Autres systèmes compatibles
```

Les systèmes externes sont optionnels selon les fonctionnalités et l'architecture finale.

---

# 15. Hiérarchie générale des utilisateurs

La hiérarchie fonctionnelle initiale est :

```text
                         UTILISATEUR
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
      CITOYEN          UTILISATEUR PRO       ADMINISTRATEUR
                              │
               ┌──────────────┼──────────────┐
               │              │              │
               ▼              ▼              ▼
          AGENT TERRAIN   ANALYSTE       RESPONSABLE
```

Cette représentation est conceptuelle.

Elle ne signifie pas qu'un profil est nécessairement supérieur à un autre.

Elle représente uniquement les responsabilités fonctionnelles.

---

# 16. Matrice des permissions initiales

| Fonction                    | Citoyen |        Agent |     Analyste |  Responsable |        Admin |
| --------------------------- | ------: | -----------: | -----------: | -----------: | -----------: |
| Consulter carte             |       ✓ |            ✓ |            ✓ |            ✓ |            ✓ |
| Consulter événements        |       ✓ |            ✓ |            ✓ |            ✓ |            ✓ |
| Consulter alertes           |       ✓ |            ✓ |            ✓ |            ✓ |            ✓ |
| Créer signalement           |       ✓ |            ✓ |            ✓ |            ✓ |            ✓ |
| Ajouter observation terrain |       — |            ✓ |            ✓ |            ✓ |            — |
| Ajouter média               |       ✓ |            ✓ |            ✓ |            ✓ |            — |
| Consulter historique        |  Limité |            ✓ |            ✓ |            ✓ | Selon droits |
| Lancer simulation           |       — |            — |            ✓ |            ✓ |            — |
| Comparer scénarios          |       — |            — |            ✓ |            ✓ |            — |
| Générer rapport             |       — |            ✓ |            ✓ |            ✓ |            — |
| Gérer interventions         |       — | Selon droits |            — |            ✓ |            — |
| Suivre équipes              |       — |            — |            — |            ✓ |            — |
| Gérer utilisateurs          |       — |            — |            — |            — |            ✓ |
| Gérer rôles                 |       — |            — |            — |            — |            ✓ |
| Configurer sources          |       — |            — |            — | Selon droits |            ✓ |
| Consulter audit             |       — |            — | Selon droits | Selon droits |            ✓ |

> Cette matrice est initiale. Les permissions définitives seront définies dans les documents consacrés aux exigences et à la sécurité.

---

# 17. Matrice des besoins par utilisateur

| Utilisateur      | Besoin principal               | Priorité |
| ---------------- | ------------------------------ | -------- |
| Citoyen          | Comprendre le risque local     | P0       |
| Citoyen          | Signaler une situation         | P0       |
| Agent            | Collecter des observations     | P0       |
| Agent            | Travailler hors ligne          | P0       |
| Analyste         | Analyser les données           | P0       |
| Analyste         | Simuler des scénarios          | P1       |
| Responsable      | Superviser les événements      | P0       |
| Responsable      | Coordonner les interventions   | P1       |
| Administrateur   | Gérer les utilisateurs         | P0       |
| Organisation     | Partager/exploiter les données | P1       |
| Équipe technique | Maintenir le système           | P0       |

---

# 18. Interactions générales

Le système peut être représenté conceptuellement ainsi :

```text
                         ┌─────────────────┐
                         │   INTELLIFLOOD  │
                         └────────┬────────┘
                                  │
       ┌──────────────────────────┼──────────────────────────┐
       │                          │                          │
       ▼                          ▼                          ▼
   UTILISATEURS              ORGANISATIONS             SYSTÈMES
       │                          │                          │
       ├─ Citoyen                 ├─ Partenaires             ├─ Météo
       ├─ Terrain                 ├─ Autorités               ├─ Satellites
       ├─ Analyste                └─ Structures              ├─ Capteurs
       ├─ Responsable                spécialisées             └─ APIs
       └─ Admin
```

---

# 19. Scénario global d'utilisation

Un exemple de fonctionnement global est :

```text
1. Une source détecte une information.
              ↓
2. IntelliFlood reçoit ou collecte la donnée.
              ↓
3. Geo/Data Engine la structure.
              ↓
4. Flood Engine ou World Engine l'analyse.
              ↓
5. Intelligence Engine peut apporter une analyse complémentaire.
              ↓
6. Un événement ou une alerte peut être créé.
              ↓
7. Les utilisateurs autorisés visualisent l'information.
              ↓
8. Un agent peut effectuer une observation terrain.
              ↓
9. Les informations sont synchronisées.
              ↓
10. Un analyste peut étudier la situation.
              ↓
11. Une simulation peut être effectuée.
              ↓
12. Un responsable peut coordonner une intervention.
              ↓
13. Les événements et actions sont conservés dans l'historique.
```

---

# 20. Relations entre utilisateurs et moteurs

| Profil         | World Engine | Flood Engine | Intelligence Engine | Geo/Data | Offline/Sync |
| -------------- | -----------: | -----------: | ------------------: | -------: | -----------: |
| Citoyen        |            ✓ |            ✓ |              Limité |        ✓ |            ✓ |
| Agent terrain  |            ✓ |            ✓ |              Limité |        ✓ |            ✓ |
| Analyste       |            ✓ |            ✓ |                   ✓ |        ✓ |            ✓ |
| Responsable    |            ✓ |            ✓ |                   ✓ |        ✓ |            ✓ |
| Administrateur |            ✓ | Selon droits |       Configuration |        ✓ |            ✓ |

---

# 21. Contraintes d'accessibilité

Les utilisateurs ne possèdent pas tous le même niveau de compétence.

Le système doit donc prévoir plusieurs niveaux de complexité.

### Niveau 1 — Utilisation simple

Pour le citoyen :

```text
Carte
Alertes
Signaler
```

### Niveau 2 — Utilisation opérationnelle

Pour le terrain :

```text
Carte
Incidents
Collecte
Rapports
Synchronisation
```

### Niveau 3 — Utilisation analytique

Pour l'analyste :

```text
Données
Couches
Historique
Analyse
Simulation
Rapports
```

### Niveau 4 — Administration

Pour l'administrateur :

```text
Utilisateurs
Permissions
Sources
Configuration
Audit
Système
```

---

# 22. Besoins transversaux

Quel que soit le profil, certaines informations doivent rester cohérentes.

Lorsqu'une donnée importante est affichée, le système doit pouvoir indiquer si nécessaire :

```text
QUOI ?
↓
Type d'information

OÙ ?
↓
Position / zone

QUAND ?
↓
Date / heure

SOURCE ?
↓
Origine

STATUT ?
↓
Observation / calcul / simulation

CONFIANCE ?
↓
Qualité ou niveau de confiance
```

---

# 23. Principes de séparation des responsabilités

Un utilisateur ne doit recevoir que les fonctionnalités nécessaires à son rôle.

Exemple :

```text
Citoyen
   ↓
Information + Signalement

Agent
   ↓
Information + Collecte + Intervention

Analyste
   ↓
Information + Analyse + Simulation

Responsable
   ↓
Information + Supervision + Coordination

Administrateur
   ↓
Configuration + Administration
```

Cette séparation permettra de simplifier l'interface et de renforcer la sécurité.

---

# 24. Risques liés aux utilisateurs

## R-USER-001 — Mauvaise interprétation

Un utilisateur peut confondre une simulation avec une observation réelle.

### Réponse

Utiliser des labels explicites :

* OBSERVÉ ;
* CALCULÉ ;
* PRÉVISION ;
* SIMULATION ;
* ESTIMATION.

---

## R-USER-002 — Données incorrectes

Un utilisateur peut fournir une information erronée.

### Réponse

Prévoir :

* validation ;
* provenance ;
* historique ;
* possibilité de correction ;
* mécanismes de vérification.

---

## R-USER-003 — Perte de connexion

Un agent peut perdre la connexion pendant une opération.

### Réponse

Utiliser l'architecture Offline & Sync.

---

## R-USER-004 — Accès non autorisé

Un utilisateur peut tenter d'accéder à une ressource qui ne lui appartient pas.

### Réponse

Mettre en place un contrôle d'accès côté serveur et côté domaine.

---

# 25. Synthèse

Les utilisateurs d'IntelliFlood ont des responsabilités différentes :

```text
CITOYEN
   │
   └── Observer / Signaler

AGENT
   │
   └── Observer / Collecter / Intervenir

ANALYSTE
   │
   └── Analyser / Simuler

RESPONSABLE
   │
   └── Superviser / Coordonner

ADMINISTRATEUR
   │
   └── Administrer / Configurer
```

Les systèmes externes et fournisseurs de données complètent cet écosystème en alimentant IntelliFlood.

---

# 26. Décisions de conception

| ID          | Décision                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------- |
| DEC-002-001 | Cinq profils utilisateurs principaux sont retenus pour la conception initiale.                  |
| DEC-002-002 | Les permissions seront associées aux responsabilités et non uniquement aux écrans.              |
| DEC-002-003 | Le citoyen bénéficie d'une interface simplifiée.                                                |
| DEC-002-004 | L'agent de terrain doit être un utilisateur prioritairement compatible avec le mode hors ligne. |
| DEC-002-005 | L'analyste possède les fonctions avancées d'analyse et de simulation.                           |
| DEC-002-006 | Le responsable opérationnel possède les fonctions de supervision et de coordination.            |
| DEC-002-007 | L'administrateur possède les fonctions de configuration et de gestion du système.               |
| DEC-002-008 | Les systèmes externes sont considérés comme des acteurs d'intégration.                          |
| DEC-002-009 | Les permissions définitives seront détaillées dans le document de sécurité.                     |
| DEC-002-010 | Les besoins identifiés dans ce document serviront à construire les exigences fonctionnelles.    |

---

# 27. Préparation du document suivant

Les informations de ce document permettent maintenant de construire **DOCUMENT003 — Expression des besoins & exigences**.

La chaîne de conception devient :

```text
DOCUMENT001
Vision & Périmètre
       ↓
DOCUMENT002
Parties prenantes & Utilisateurs
       ↓
DOCUMENT003
Exigences
       ↓
DOCUMENT004
Cas d'utilisation
       ↓
UML détaillé
       ↓
Architecture
       ↓
Implémentation
```

---

# 28. État du document

**DOCUMENT002 est validé comme base d'identification des parties prenantes et des utilisateurs d'IntelliFlood.**

Les profils et permissions présentés ici sont des éléments de conception initiaux. Ils pourront être raffinés lorsque les exigences détaillées et les contraintes de sécurité seront définies.

**Prochaine étape : DOCUMENT003 — Expression des besoins & exigences.**

---

**Fin de DOCUMENT002**
S