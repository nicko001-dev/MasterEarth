# DOCUMENT003 — EXPRESSION DES BESOINS & EXIGENCES

**Projet :** IntelliFlood
**Document :** DOCUMENT003
**Titre :** Expression des besoins & exigences
**Version :** 1.0
**Date :** 30 septembre 2026
**Statut :** Conception initiale

---

# 1. Objet du document

Ce document a pour objectif de transformer la vision générale d’IntelliFlood et les besoins des différentes parties prenantes en exigences précises, structurées et traçables.

Il constitue une base de référence pour :

* les futurs cas d'utilisation ;
* les diagrammes UML ;
* la conception de l'architecture ;
* la conception des différents moteurs ;
* la conception de la base de données ;
* le développement ;
* les tests ;
* la validation finale du système.

Les exigences définies dans ce document décrivent **ce qu'IntelliFlood doit permettre de faire**.

La manière exacte dont ces fonctionnalités seront techniquement implémentées sera définie dans les documents d'architecture et de conception suivants.

---

# 2. Référence aux documents précédents

Ce document s'appuie principalement sur :

* **DOCUMENT001 — Vision & Périmètre d'IntelliFlood**
* **DOCUMENT002 — Parties prenantes & utilisateurs**

Le DOCUMENT001 définit la vision, le périmètre et les grands moteurs du système.

Le DOCUMENT002 définit les principaux utilisateurs et parties prenantes.

Le présent document transforme ces éléments en exigences vérifiables.

---

# 3. Définitions

## 3.1 Besoin

Un besoin représente une capacité ou un résultat attendu par un utilisateur ou une partie prenante.

Exemple :

> Un agent de terrain doit pouvoir consulter des informations même sans connexion Internet.

---

## 3.2 Exigence

Une exigence est une formulation précise d'un comportement, d'une capacité ou d'une contrainte que le système doit respecter.

Exemple :

> Le système DOIT permettre à l'agent de terrain de consulter les données préalablement synchronisées lorsque la connexion Internet est absente.

---

## 3.3 Exigence fonctionnelle

Une exigence fonctionnelle décrit **ce que le système doit faire**.

Exemple :

> Le système DOIT permettre de créer une observation géolocalisée.

---

## 3.4 Exigence non fonctionnelle

Une exigence non fonctionnelle décrit **comment le système doit se comporter ou quelles contraintes il doit respecter**.

Exemple :

> Le système DOIT fonctionner en mode hors ligne pour certaines fonctionnalités essentielles.

---

## 3.5 Priorité

Les priorités utilisées dans ce document sont :

| Priorité | Signification                               |
| -------- | ------------------------------------------- |
| **P0**   | Indispensable au fonctionnement du système  |
| **P1**   | Important pour la première version complète |
| **P2**   | Fonctionnalité secondaire ou évolutive      |

---

# 4. Objectifs fonctionnels généraux

IntelliFlood doit permettre de :

1. représenter un territoire ;
2. observer les phénomènes liés aux inondations ;
3. centraliser les données pertinentes ;
4. analyser les situations ;
5. identifier les zones à risque ;
6. suivre l'évolution des phénomènes dans le temps ;
7. simuler différents scénarios ;
8. assister les utilisateurs dans leur analyse ;
9. fonctionner hors connexion lorsque cela est nécessaire ;
10. synchroniser les données lorsque la connexion revient ;
11. produire des rapports et synthèses ;
12. permettre la collaboration entre différents profils ;
13. conserver la traçabilité des informations et actions importantes.

---

# 5. Exigences fonctionnelles

# 5.1 Gestion des utilisateurs

### REQ-AUTH-001 — Authentification

Le système DOIT permettre à un utilisateur autorisé de s'authentifier.

**Priorité :** P0

---

### REQ-AUTH-002 — Gestion des profils

Le système DOIT associer un profil fonctionnel à chaque utilisateur.

Les profils initiaux sont :

* Citoyen ;
* Agent de terrain ;
* Analyste / Expert ;
* Responsable opérationnel ;
* Administrateur.

**Priorité :** P0

---

### REQ-AUTH-003 — Gestion des permissions

Le système DOIT contrôler l'accès aux fonctionnalités et aux données en fonction des permissions de l'utilisateur.

**Priorité :** P0

---

### REQ-AUTH-004 — Déconnexion

Le système DOIT permettre à l'utilisateur de se déconnecter.

**Priorité :** P0

---

# 5.2 World Engine

Le World Engine constitue la représentation générale du territoire.

### REQ-WORLD-001 — Affichage cartographique

Le système DOIT permettre d'afficher une carte interactive.

**Priorité :** P0

---

### REQ-WORLD-002 — Navigation

L'utilisateur DOIT pouvoir :

* se déplacer sur la carte ;
* zoomer ;
* dézoomer ;
* sélectionner une zone ;
* rechercher une localisation.

**Priorité :** P0

---

### REQ-WORLD-003 — Affichage 3D

Le système DOIT pouvoir représenter le territoire en trois dimensions lorsque les données nécessaires sont disponibles.

**Priorité :** P1

---

### REQ-WORLD-004 — Terrain

Le système DOIT pouvoir représenter les caractéristiques topographiques disponibles d'une zone.

**Priorité :** P1

---

### REQ-WORLD-005 — Bâtiments et infrastructures

Le système DOIT pouvoir représenter des objets géographiques tels que :

* bâtiments ;
* routes ;
* ponts ;
* réseaux ;
* infrastructures importantes.

**Priorité :** P1

---

### REQ-WORLD-006 — Couches géographiques

Le système DOIT permettre d'activer ou de désactiver différentes couches géographiques.

**Priorité :** P0

---

### REQ-WORLD-007 — Objets dynamiques

Le système DOIT pouvoir représenter certains objets ou phénomènes dynamiques lorsqu'une source de données appropriée est disponible.

Exemples :

* véhicules ;
* appareils ;
* navires ;
* événements ;
* capteurs.

**Priorité :** P1

---

### REQ-WORLD-008 — Timeline

Le système DOIT permettre de consulter des informations selon leur dimension temporelle.

L'utilisateur doit pouvoir distinguer :

* passé ;
* présent ;
* futur prévu ou simulé.

**Priorité :** P0

---

# 5.3 Flood Engine

Le Flood Engine regroupe les fonctionnalités spécifiques aux inondations.

### REQ-FLOOD-001 — Données de précipitations

Le système DOIT pouvoir intégrer des données relatives aux précipitations lorsqu'elles sont disponibles.

**Priorité :** P0

---

### REQ-FLOOD-002 — Niveaux d'eau

Le système DOIT pouvoir intégrer et afficher des données de niveaux d'eau.

**Priorité :** P0

---

### REQ-FLOOD-003 — Zones inondées

Le système DOIT pouvoir représenter les zones affectées par une inondation.

**Priorité :** P0

---

### REQ-FLOOD-004 — Propagation

Le système DOIT pouvoir représenter l'évolution spatiale d'une inondation dans le temps lorsque les données ou modèles nécessaires sont disponibles.

**Priorité :** P1

---

### REQ-FLOOD-005 — Risques

Le système DOIT permettre d'identifier et de représenter différents niveaux de risque.

**Priorité :** P0

---

### REQ-FLOOD-006 — Vulnérabilité

Le système DOIT pouvoir associer des informations de vulnérabilité aux zones ou infrastructures concernées.

**Priorité :** P1

---

### REQ-FLOOD-007 — Bassins et drainage

Le système DOIT pouvoir représenter, lorsque les données sont disponibles :

* bassins versants ;
* cours d'eau ;
* réseaux de drainage ;
* zones d'écoulement.

**Priorité :** P1

---

# 5.4 Gestion des observations

### REQ-OBS-001 — Création d'une observation

Un utilisateur autorisé DOIT pouvoir créer une observation.

**Priorité :** P0

---

### REQ-OBS-002 — Géolocalisation

Une observation DOIT pouvoir être associée à une position géographique.

**Priorité :** P0

---

### REQ-OBS-003 — Date et heure

Une observation DOIT enregistrer sa date et son heure.

**Priorité :** P0

---

### REQ-OBS-004 — Type d'observation

Une observation DOIT posséder un type permettant de catégoriser le phénomène observé.

Exemples :

* eau ;
* pluie ;
* route bloquée ;
* bâtiment touché ;
* dégât ;
* anomalie ;
* infrastructure ;
* autre.

**Priorité :** P0

---

### REQ-OBS-005 — Média

Le système DOIT pouvoir associer des médias à une observation.

Exemples :

* photographie ;
* vidéo ;
* document ;
* enregistrement.

**Priorité :** P1

---

### REQ-OBS-006 — Description

L'utilisateur DOIT pouvoir ajouter une description textuelle à une observation.

**Priorité :** P0

---

### REQ-OBS-007 — Source

Le système DOIT conserver l'origine ou la source d'une observation.

**Priorité :** P0

---

### REQ-OBS-008 — Statut de validation

Une observation DOIT pouvoir posséder un statut permettant de distinguer notamment :

* nouvelle ;
* en cours de vérification ;
* vérifiée ;
* rejetée.

**Priorité :** P1

---

# 5.5 Données géospatiales

### REQ-GEO-001 — Coordonnées

Le système DOIT pouvoir stocker des coordonnées géographiques.

**Priorité :** P0

---

### REQ-GEO-002 — Objets géographiques

Le système DOIT pouvoir gérer différents types de géométries :

* points ;
* lignes ;
* polygones ;
* géométries 3D lorsque nécessaire.

**Priorité :** P0

---

### REQ-GEO-003 — Recherche spatiale

Le système DOIT pouvoir rechercher des informations relatives à une zone géographique.

**Priorité :** P0

---

### REQ-GEO-004 — Superposition

Le système DOIT pouvoir superposer différentes sources de données géographiques.

**Priorité :** P0

---

# 5.6 Analyse

### REQ-ANALYSIS-001 — Analyse spatiale

Le système DOIT permettre l'analyse de données selon leur position géographique.

**Priorité :** P0

---

### REQ-ANALYSIS-002 — Analyse temporelle

Le système DOIT permettre d'analyser l'évolution d'un phénomène dans le temps.

**Priorité :** P0

---

### REQ-ANALYSIS-003 — Comparaison

Le système DOIT permettre de comparer différentes situations ou périodes.

**Priorité :** P1

---

### REQ-ANALYSIS-004 — Indicateurs

Le système DOIT pouvoir calculer et afficher des indicateurs pertinents.

Exemples :

* superficie affectée ;
* nombre d'observations ;
* nombre d'infrastructures concernées ;
* évolution du niveau d'eau ;
* évolution d'une zone inondée.

**Priorité :** P0

---

# 5.7 Intelligence Engine

### REQ-AI-001 — Assistance intelligente

Le système DOIT pouvoir fournir une assistance intelligente aux utilisateurs autorisés.

**Priorité :** P1

---

### REQ-AI-002 — Analyse automatique

Le système DOIT pouvoir analyser certaines données automatiquement lorsque des modèles appropriés sont disponibles.

**Priorité :** P1

---

### REQ-AI-003 — Détection d'anomalies

Le système DOIT pouvoir détecter certaines anomalies dans les données.

**Priorité :** P1

---

### REQ-AI-004 — Analyse d'images

Le système DOIT pouvoir intégrer des capacités d'analyse d'images pour certaines observations lorsque les modèles nécessaires sont disponibles.

**Priorité :** P1

---

### REQ-AI-005 — Génération de rapports

L'Intelligence Engine DOIT pouvoir assister la génération de synthèses et de rapports.

**Priorité :** P1

---

### REQ-AI-006 — Traçabilité des résultats

Les résultats produits par l'IA DOIVENT pouvoir être distingués des données directement observées ou calculées par des méthodes déterministes.

**Priorité :** P0

---

### REQ-AI-007 — Validation humaine

Les résultats critiques produits par l'IA NE DOIVENT PAS être considérés automatiquement comme des décisions opérationnelles définitives.

**Priorité :** P0

---

# 5.8 Simulation

### REQ-SIM-001 — Création de scénario

Un utilisateur autorisé DOIT pouvoir créer un scénario de simulation.

**Priorité :** P1

---

### REQ-SIM-002 — Paramètres

Un scénario DOIT pouvoir définir différents paramètres.

Exemples :

* quantité de pluie ;
* durée ;
* niveau d'eau initial ;
* zone concernée ;
* état d'une infrastructure.

**Priorité :** P1

---

### REQ-SIM-003 — Exécution

Le système DOIT pouvoir exécuter une simulation lorsque les données et modèles nécessaires sont disponibles.

**Priorité :** P1

---

### REQ-SIM-004 — Visualisation

Les résultats d'une simulation DOIVENT pouvoir être visualisés sur la carte.

**Priorité :** P1

---

### REQ-SIM-005 — Comparaison

Le système DOIT pouvoir comparer différents scénarios.

**Priorité :** P2

---

### REQ-SIM-006 — Distinction simulation/réalité

Les données simulées DOIVENT être clairement identifiées comme telles.

**Priorité :** P0

---

# 5.9 Alertes et notifications

### REQ-ALERT-001 — Détection d'une situation nécessitant une alerte

Le système DOIT pouvoir identifier certaines situations nécessitant une alerte selon des règles définies.

**Priorité :** P0

---

### REQ-ALERT-002 — Création d'alerte

Le système DOIT pouvoir créer une alerte à partir d'un événement ou d'une règle.

**Priorité :** P0

---

### REQ-ALERT-003 — Niveau de gravité

Une alerte DOIT pouvoir posséder un niveau de gravité.

**Priorité :** P0

---

### REQ-ALERT-004 — Zone concernée

Une alerte DOIT pouvoir être associée à une zone géographique.

**Priorité :** P0

---

### REQ-ALERT-005 — Notification

Le système DOIT pouvoir notifier les utilisateurs concernés selon leurs permissions et leur contexte.

**Priorité :** P1

---

# 5.10 Mode hors ligne

### REQ-OFFLINE-001 — Fonctionnement hors connexion

Certaines fonctionnalités essentielles DOIVENT rester accessibles sans connexion Internet.

**Priorité :** P0

---

### REQ-OFFLINE-002 — Stockage local

Le système DOIT pouvoir stocker localement certaines données nécessaires au fonctionnement hors ligne.

**Priorité :** P0

---

### REQ-OFFLINE-003 — Création hors ligne

Un agent autorisé DOIT pouvoir créer des observations hors connexion.

**Priorité :** P0

---

### REQ-OFFLINE-004 — File de synchronisation

Les données créées ou modifiées hors connexion DOIVENT pouvoir être placées dans une file de synchronisation.

**Priorité :** P0

---

### REQ-OFFLINE-005 — Synchronisation

Le système DOIT pouvoir synchroniser les données locales avec le système distant lorsqu'une connexion est disponible.

**Priorité :** P0

---

### REQ-OFFLINE-006 — Conflits

Le système DOIT pouvoir détecter les conflits de synchronisation.

**Priorité :** P1

---

### REQ-OFFLINE-007 — Résolution des conflits

Le système DOIT définir une stratégie de résolution des conflits.

**Priorité :** P1

---

# 5.11 Rapports

### REQ-REPORT-001 — Génération

Le système DOIT permettre de générer des rapports à partir des données disponibles.

**Priorité :** P1

---

### REQ-REPORT-002 — Synthèse

Un rapport DOIT pouvoir présenter une synthèse d'une situation.

**Priorité :** P1

---

### REQ-REPORT-003 — Données sources

Les informations importantes présentes dans un rapport DOIVENT pouvoir être reliées à leurs sources.

**Priorité :** P1

---

# 5.12 Collaboration

### REQ-COLLAB-001 — Partage d'informations

Les utilisateurs autorisés DOIVENT pouvoir partager certaines informations avec d'autres utilisateurs.

**Priorité :** P1

---

### REQ-COLLAB-002 — Commentaires

Le système DOIT pouvoir permettre l'ajout de commentaires ou annotations lorsque cette fonctionnalité est activée.

**Priorité :** P1

---

### REQ-COLLAB-003 — Historique

Les actions importantes DOIVENT être enregistrées dans un historique.

**Priorité :** P0

---

# 5.13 Gestion des données et traçabilité

### REQ-DATA-001 — Métadonnées

Les données importantes DOIVENT posséder des métadonnées permettant notamment de connaître :

* leur source ;
* leur date ;
* leur type ;
* leur position lorsqu'elle existe ;
* leur statut ;
* leur niveau de confiance lorsqu'il est disponible.

**Priorité :** P0

---

### REQ-DATA-002 — Origine

Le système DOIT conserver l'origine des données lorsque cette information est disponible.

**Priorité :** P0

---

### REQ-DATA-003 — Historisation

Le système DOIT pouvoir conserver l'historique des données importantes.

**Priorité :** P0

---

### REQ-DATA-004 — Distinction des données

Le système DOIT distinguer au minimum :

* données observées ;
* données importées ;
* données calculées ;
* données prédites ;
* données simulées ;
* données générées ou enrichies par l'IA.

**Priorité :** P0

---

# 6. Exigences non fonctionnelles

# 6.1 Performance

### REQ-NF-PERF-001

L'interface DOIT rester suffisamment réactive pour permettre une navigation normale dans les cartes et interfaces.

**Priorité :** P0

---

### REQ-NF-PERF-002

Le système DOIT éviter de charger inutilement des volumes importants de données lorsque seule une partie est nécessaire.

**Priorité :** P1

---

### REQ-NF-PERF-003

Les traitements lourds DOIVENT pouvoir être exécutés de manière asynchrone lorsque cela est nécessaire.

**Priorité :** P1

---

# 6.2 Disponibilité

### REQ-NF-DISP-001

Les fonctionnalités critiques hors ligne DOIVENT rester utilisables sans connexion.

**Priorité :** P0

---

### REQ-NF-DISP-002

Le système DOIT pouvoir récupérer son fonctionnement après une interruption sans perdre les données locales non synchronisées.

**Priorité :** P0

---

# 6.3 Sécurité

### REQ-NF-SEC-001

Les utilisateurs DOIVENT être authentifiés avant l'accès aux fonctionnalités protégées.

**Priorité :** P0

---

### REQ-NF-SEC-002

Les permissions DOIVENT être vérifiées côté système et ne doivent pas dépendre uniquement de l'interface utilisateur.

**Priorité :** P0

---

### REQ-NF-SEC-003

Les données sensibles DOIVENT être protégées contre les accès non autorisés.

**Priorité :** P0

---

### REQ-NF-SEC-004

Les actions importantes DOIVENT pouvoir être tracées.

**Priorité :** P0

---

# 6.4 Confidentialité

### REQ-NF-CONF-001

Le système DOIT appliquer le principe du moindre privilège.

**Priorité :** P0

---

### REQ-NF-CONF-002

Les informations personnelles DOIVENT être limitées aux données nécessaires au fonctionnement du système.

**Priorité :** P0

---

# 6.5 Maintenabilité

### REQ-NF-MAINT-001

Le système DOIT être conçu de manière modulaire.

**Priorité :** P0

---

### REQ-NF-MAINT-002

Les différents moteurs DOIVENT pouvoir évoluer indépendamment autant que possible.

**Priorité :** P1

---

### REQ-NF-MAINT-003

Le code DOIT être suffisamment structuré pour permettre les tests et la maintenance.

**Priorité :** P0

---

# 6.6 Interopérabilité

### REQ-NF-INTER-001

Le système DOIT pouvoir échanger des données avec des systèmes externes lorsque cela est nécessaire.

**Priorité :** P1

---

### REQ-NF-INTER-002

Les échanges de données DOIVENT utiliser des formats documentés.

**Priorité :** P1

---

### REQ-NF-INTER-003

Les sources externes DOIVENT pouvoir être identifiées.

**Priorité :** P0

---

# 6.7 Portabilité

### REQ-NF-PORT-001

Le système DOIT être conçu pour pouvoir être utilisé sur plusieurs types de plateformes.

Les plateformes ciblées sont :

* Web ;
* PWA ;
* Mobile ;
* Desktop.

**Priorité :** P1

---

# 6.8 Évolutivité

### REQ-NF-SCALE-001

L'architecture DOIT permettre l'ajout de nouvelles sources de données.

**Priorité :** P1

---

### REQ-NF-SCALE-002

L'architecture DOIT permettre l'ajout de nouveaux modèles d'analyse ou d'IA.

**Priorité :** P1

---

### REQ-NF-SCALE-003

L'architecture DOIT permettre l'ajout de nouvelles fonctionnalités sans nécessiter une réécriture complète du système.

**Priorité :** P0

---

# 6.9 Utilisabilité

### REQ-NF-UX-001

L'interface DOIT être adaptée au profil de l'utilisateur.

**Priorité :** P0

---

### REQ-NF-UX-002

Les fonctionnalités principales DOIVENT être accessibles sans nécessiter une connaissance technique avancée.

**Priorité :** P0

---

### REQ-NF-UX-003

L'interface de terrain DOIT privilégier la simplicité et la rapidité d'utilisation.

**Priorité :** P0

---

### REQ-NF-UX-004

Les informations critiques DOIVENT être présentées de manière clairement identifiable.

**Priorité :** P0

---

# 7. Exigences relatives à l'IA

L'intelligence artificielle constitue un composant d'assistance et d'analyse, et non un remplacement automatique de la décision humaine.

## Principes

### REQ-AI-PR-001

Les résultats générés par l'IA DOIVENT être identifiables comme des résultats issus d'un modèle.

### REQ-AI-PR-002

Les résultats critiques DOIVENT pouvoir être vérifiés par un utilisateur autorisé.

### REQ-AI-PR-003

Le système NE DOIT PAS présenter une prédiction comme une observation réelle.

### REQ-AI-PR-004

Le système NE DOIT PAS présenter une simulation comme une situation réelle.

### REQ-AI-PR-005

Le système DOIT pouvoir fonctionner avec des composants d'IA locaux lorsque cela est techniquement possible.

### REQ-AI-PR-006

L'architecture NE DOIT PAS imposer une dépendance obligatoire à un fournisseur d'IA propriétaire ou à une API payante.

**Priorité de l'ensemble :** P0/P1 selon la fonctionnalité.

---

# 8. Distinction fondamentale des types d'informations

Afin d'éviter les erreurs d'interprétation, IntelliFlood DOIT clairement distinguer les catégories suivantes.

| Type                | Description                                                           |
| ------------------- | --------------------------------------------------------------------- |
| **Observation**     | Information constatée ou reçue depuis une source                      |
| **Donnée importée** | Information provenant d'un système externe                            |
| **Calcul**          | Résultat obtenu par une méthode déterministe                          |
| **Prévision**       | Estimation concernant une situation future                            |
| **Simulation**      | Résultat obtenu à partir d'un scénario hypothétique                   |
| **IA**              | Résultat produit ou enrichi par un modèle d'intelligence artificielle |

Cette distinction devra être conservée dans les données, l'interface et les rapports lorsque cela est pertinent.

---

# 9. Exigences relatives à la confiance des données

Une information peut provenir de sources différentes et présenter des niveaux de fiabilité différents.

Le système DOIT donc pouvoir représenter, lorsque cette information est disponible :

* la source ;
* la date de collecte ;
* la méthode de collecte ;
* le statut de validation ;
* le niveau de confiance ;
* l'auteur ou le système à l'origine de l'information.

Cela permettra aux utilisateurs de comprendre **d'où vient une information et dans quel contexte elle doit être interprétée**.

---

# 10. Contraintes générales

IntelliFlood devra respecter les contraintes suivantes.

## 10.1 Local-first / Offline-first

Les fonctionnalités de terrain importantes doivent être conçues pour fonctionner dans des environnements avec une connexion faible, intermittente ou inexistante.

---

## 10.2 Open-source et maîtrise des dépendances

Le système doit privilégier les technologies et modèles pouvant être utilisés sans dépendance obligatoire à des services propriétaires payants.

---

## 10.3 Modularité

Les moteurs doivent être suffisamment découplés pour pouvoir évoluer indépendamment.

---

## 10.4 Traçabilité

Les informations importantes doivent pouvoir être reliées à leur source et à leur historique.

---

## 10.5 Décision humaine

IntelliFlood fournit des informations, analyses, simulations, alertes et recommandations.

Il ne doit pas transformer automatiquement ces éléments en décisions humaines ou institutionnelles irréversibles.

---

# 11. Matrice synthétique des exigences par moteur

| Domaine                   | Principales capacités                                                          |
| ------------------------- | ------------------------------------------------------------------------------ |
| **World Engine**          | Carte, 3D, terrain, bâtiments, routes, couches, objets dynamiques, temporalité |
| **Flood Engine**          | Pluie, eau, zones inondées, propagation, risques, vulnérabilité, drainage      |
| **Intelligence Engine**   | Analyse, IA, anomalies, vision, assistant, rapports                            |
| **Geo/Data Engine**       | Données géospatiales, données temporelles, métadonnées, historique             |
| **Offline & Sync Engine** | Stockage local, fonctionnement hors ligne, synchronisation, conflits           |
| **Application**           | Authentification, permissions, workflows, notifications, rapports              |
| **Interfaces**            | Web, PWA, mobile, desktop, cockpit                                             |

---

# 12. Matrice synthétique des exigences par profil

| Profil                       | Besoins principaux                                       |
| ---------------------------- | -------------------------------------------------------- |
| **Citoyen**                  | Consultation, signalement, informations publiques        |
| **Agent de terrain**         | Observation, géolocalisation, médias, travail hors ligne |
| **Analyste / Expert**        | Analyse, données avancées, simulation, IA                |
| **Responsable opérationnel** | Supervision, alertes, coordination, rapports             |
| **Administrateur**           | Utilisateurs, permissions, configuration, maintenance    |

---

# 13. Exigences critiques

Les exigences suivantes sont considérées comme fondamentales pour l'identité d'IntelliFlood :

* représentation géospatiale ;
* gestion des données temporelles ;
* observation géolocalisée ;
* analyse des risques ;
* distinction observation / calcul / prévision / simulation ;
* fonctionnement hors ligne pour les usages critiques ;
* synchronisation ;
* traçabilité ;
* gestion des permissions ;
* visualisation des inondations ;
* modularité ;
* validation humaine des informations critiques.

Ces éléments devront être considérés comme des contraintes structurantes pour les documents d'architecture suivants.

---

# 14. Critères généraux d'acceptation

Une fonctionnalité pourra être considérée comme correctement implémentée lorsque :

1. son comportement attendu est clairement défini ;
2. son utilisateur ou acteur est identifié ;
3. ses données nécessaires sont identifiées ;
4. ses résultats sont identifiables ;
5. ses erreurs possibles sont prises en compte ;
6. ses permissions sont définies ;
7. elle peut être testée ;
8. son comportement hors ligne est défini lorsqu'il est pertinent ;
9. sa traçabilité est assurée lorsqu'elle est nécessaire.

---

# 15. Traçabilité initiale

Les exigences de ce document seront progressivement reliées aux éléments suivants :

```text
Besoin
   │
   ▼
Exigence
   │
   ▼
Cas d'utilisation
   │
   ▼
Diagramme UML
   │
   ▼
Composant logiciel
   │
   ▼
Implémentation
   │
   ▼
Test
   │
   ▼
Validation
```

Cette traçabilité sera détaillée plus précisément dans le **DOCUMENT022 — Traçabilité exigences → conception → tests**.

---

# 16. Éléments volontairement non spécifiés

À ce stade, certaines décisions ne doivent pas encore être figées.

Il s'agit notamment :

* du langage exact de programmation ;
* du framework frontend ;
* du framework backend ;
* du moteur 3D exact ;
* du SGBD exact ;
* de la technologie exacte de stockage géospatial ;
* des modèles d'IA précis ;
* de l'infrastructure de déploiement ;
* des protocoles exacts de synchronisation ;
* des formats définitifs des API.

Ces choix seront étudiés dans les documents d'architecture correspondants.

---

# 17. Risques liés aux exigences

Plusieurs risques devront être surveillés pendant la conception.

## RISK-001 — Complexité excessive

Le nombre de fonctionnalités peut rendre IntelliFlood difficile à développer.

**Mesure :** architecture modulaire et développement progressif.

---

## RISK-002 — Dépendance aux données externes

Certaines fonctionnalités dépendent de sources de données qui peuvent être indisponibles.

**Mesure :** architecture permettant plusieurs sources et fonctionnement dégradé.

---

## RISK-003 — Données insuffisantes

Certaines analyses ou simulations peuvent nécessiter des données qui ne sont pas disponibles.

**Mesure :** indiquer clairement les données manquantes et ne pas présenter un résultat comme certain lorsqu'il ne l'est pas.

---

## RISK-004 — Dépendance à l'IA

L'utilisation excessive de l'IA pourrait rendre le système dépendant d'un modèle externe.

**Mesure :** privilégier une architecture permettant plusieurs modèles et des traitements déterministes.

---

## RISK-005 — Complexité géospatiale

La gestion de données géographiques et 3D peut devenir techniquement complexe.

**Mesure :** isoler les responsabilités dans le Geo/Data Engine et le World Engine.

---

# 18. Décisions de conception résultantes

À partir des exigences définies dans ce document, les décisions suivantes sont retenues :

### DEC-001

IntelliFlood sera conçu comme une plateforme modulaire.

### DEC-002

Le système intégrera une dimension géospatiale et temporelle native.

### DEC-003

Le mode hors ligne sera considéré comme une capacité fondamentale et non comme une fonctionnalité secondaire.

### DEC-004

Les données observées, calculées, prédites, simulées et générées par l'IA seront distinguées.

### DEC-005

Les résultats critiques de l'IA resteront soumis à une validation humaine.

### DEC-006

Les moteurs internes seront séparés selon leurs responsabilités.

### DEC-007

La traçabilité sera intégrée dès la conception.

### DEC-008

Les choix technologiques détaillés seront réalisés après la modélisation fonctionnelle.

---

# 19. Préparation du DOCUMENT004

Le DOCUMENT004 aura pour objectif de transformer les exigences de ce document en **acteurs et cas d'utilisation**.

Il devra notamment permettre de construire :

* le diagramme de contexte ;
* le diagramme des acteurs ;
* le diagramme général de cas d'utilisation ;
* les principaux cas d'utilisation par profil ;
* les relations entre acteurs et fonctionnalités ;
* les relations `include`, `extend` et généralisation lorsque nécessaires.

Les exigences de ce document serviront directement à identifier les cas d'utilisation.

---

# 20. Résumé

Le DOCUMENT003 établit la première spécification fonctionnelle et non fonctionnelle d'IntelliFlood.

Il définit notamment :

* ce que le système doit permettre de faire ;
* ce que chaque moteur doit prendre en charge ;
* les contraintes générales ;
* les exigences de sécurité ;
* les exigences hors ligne ;
* les exigences liées aux données ;
* les exigences liées à l'IA ;
* les exigences de simulation ;
* les exigences de traçabilité ;
* les critères généraux de validation.

Ce document constitue donc le pont entre :

**la vision d'IntelliFlood**

et

**sa conception détaillée puis son implémentation.**

---

# 21. État du document

**DOCUMENT003 : TERMINÉ — VERSION 1.0**

Les exigences pourront être affinées dans les documents ultérieurs si la modélisation révèle des besoins supplémentaires, sans modifier arbitrairement le périmètre initial.


---

## Complément aux exigences — portée nationale et préservation des capacités globales (29 octobre 2026)

Les exigences suivantes complètent le catalogue existant ; elles ne déclarent pas que les fonctions correspondantes sont déjà implémentées.

- **REQ-GEO-001 — Globe complet :** l'application doit conserver l'exploration du globe terrestre complet et ne pas imposer la Côte d'Ivoire comme limite du navigateur cartographique.
- **REQ-GEO-002 — Couverture nationale :** l'architecture doit permettre de représenter et d'analyser, selon les données disponibles, toutes les régions et localités de Côte d'Ivoire. Cocody est un exemple de zone pilote et non un périmètre exclusif.
- **REQ-DATA-001 — Couverture et disponibilité :** l'interface et les services doivent distinguer une zone représentable géographiquement d'une zone disposant de mesures en temps réel, de prévisions ou de modèles validés.
- **REQ-IOT-001 — Interopérabilité :** les observations des équipements doivent pouvoir être intégrées par des connecteurs adaptés, sans dépendance obligatoire à un seul fabricant ou à une seule plateforme.
- **REQ-IOT-002 — Provenance et fraîcheur :** chaque observation externe doit, lorsque disponible, conserver l'identité de la source, l'horodatage de mesure/réception, l'unité, la localisation, l'état de qualité et les informations de validation.
- **REQ-WX-001 — Sources météorologiques :** les intégrations météo doivent faire l'objet d'une évaluation documentée de la couverture ivoirienne, de la résolution, de la fréquence, des licences, des quotas, des clés, des conditions hors ligne et des coûts éventuels.
- **REQ-SAFE-001 — Alertes prudentes :** une prévision météorologique ne doit pas être présentée comme une preuve qu'une inondation est effectivement en cours. Les niveaux de confiance et les limites des données doivent être communiqués.
- **REQ-EDGE-001 — Résilience locale :** les équipements ou passerelles qui le permettent doivent pouvoir appliquer les règles de sécurité locale prévues, indépendamment d'une connexion permanente au serveur central.
