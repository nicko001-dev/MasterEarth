# DOCUMENT009 — ARCHITECTURE LOGICIELLE

**Projet :** IntelliFlood
**Document :** DOCUMENT009
**Titre :** Architecture logicielle
**Version :** 1.0
**Date :** 30 septembre 2026
**Statut :** Conception initiale

---

# 1. Objet du document

Ce document définit l'architecture logicielle générale d'IntelliFlood.

Les documents précédents ont défini :

* pourquoi IntelliFlood existe ;
* qui l'utilise ;
* ce qu'il doit faire ;
* comment les fonctionnalités se déroulent ;
* comment les composants interagissent ;
* quelles sont les principales entités métier ;
* quelles données doivent être conservées.

Nous devons maintenant répondre à la question :

> **Comment organiser techniquement IntelliFlood ?**

---

# 2. Principes architecturaux

L'architecture doit respecter les principes suivants :

1. modularité ;
2. séparation des responsabilités ;
3. faible couplage ;
4. forte cohésion ;
5. testabilité ;
6. évolutivité ;
7. offline-first ;
8. sécurité ;
9. traçabilité ;
10. interopérabilité ;
11. indépendance vis-à-vis d'un fournisseur propriétaire ;
12. possibilité d'utiliser des composants open-source.

---

# 3. Architecture générale

L'architecture conceptuelle est organisée en plusieurs niveaux.

```text
┌───────────────────────────────────────────────────────────┐
│                     INTERFACES                            │
│                                                           │
│ Web / PWA / Mobile / Desktop / Cockpit                   │
└───────────────────────────┬───────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────┐
│                  APPLICATION LAYER                        │
│                                                           │
│ Auth / Permissions / Workflows / Notifications / Reports │
└───────────────────────────┬───────────────────────────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐
│   WORLD ENGINE   │ │ FLOOD ENGINE │ │ INTELLIGENCE     │
│                  │ │              │ │ ENGINE           │
└────────┬─────────┘ └──────┬───────┘ └────────┬─────────┘
         │                  │                  │
         └──────────────────┼──────────────────┘
                            ▼
┌───────────────────────────────────────────────────────────┐
│                    GEO / DATA ENGINE                      │
└───────────────────────────┬───────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────┐
│                 OFFLINE / SYNC ENGINE                     │
└───────────────────────────┬───────────────────────────────┘
                            │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
        Base locale    Base distante   Sources externes
```

---

# 4. Couche Interface

Cette couche représente les différents moyens d'accès au système.

## 4.1 Web

Interface destinée aux utilisateurs travaillant principalement sur ordinateur.

---

## 4.2 PWA

Permet une utilisation web avec certaines capacités d'installation et de fonctionnement hors ligne.

---

## 4.3 Mobile

Interface destinée notamment aux agents de terrain.

Elle doit privilégier :

* simplicité ;
* rapidité ;
* géolocalisation ;
* photographie ;
* fonctionnement hors ligne.

---

## 4.4 Desktop

Interface pouvant être utilisée pour les environnements nécessitant une interface plus complète.

---

## 4.5 Cockpit

Interface spécialisée pour la supervision.

Elle pourra présenter :

* carte ;
* alertes ;
* événements ;
* indicateurs ;
* timeline ;
* situation globale.

---

# 5. Application Layer

Cette couche orchestre les fonctionnalités du système.

Elle contient notamment :

* authentification ;
* autorisation ;
* gestion des utilisateurs ;
* workflows ;
* notifications ;
* rapports ;
* gestion des requêtes ;
* orchestration des moteurs ;
* journalisation.

Elle ne doit pas contenir directement toutes les règles métier spécialisées.

---

# 6. World Engine

Le World Engine est responsable de la représentation générale du territoire.

Responsabilités :

* carte ;
* globe ;
* terrain ;
* bâtiments ;
* routes ;
* infrastructures ;
* couches ;
* objets dynamiques ;
* représentation temporelle ;
* navigation géographique ;
* visualisation 3D.

Il ne doit pas devenir le moteur principal de calcul des phénomènes d'inondation.

---

# 7. Flood Engine

Le Flood Engine est responsable des phénomènes spécifiques aux inondations.

Responsabilités :

* précipitations ;
* niveaux d'eau ;
* zones inondées ;
* propagation ;
* risques ;
* vulnérabilité ;
* drainage ;
* analyse hydrologique ;
* simulation liée aux inondations.

---

# 8. Intelligence Engine

L'Intelligence Engine regroupe les fonctions d'intelligence artificielle et d'analyse avancée.

Responsabilités :

* modèles IA ;
* détection d'anomalies ;
* analyse d'images ;
* assistant ;
* recherche dans les connaissances ;
* génération de synthèses ;
* classification ;
* enrichissement des données.

Il doit pouvoir utiliser plusieurs modèles.

Il ne doit pas être conçu comme une dépendance obligatoire à un fournisseur unique.

---

# 9. Geo/Data Engine

Le Geo/Data Engine constitue le cœur de gestion des données géographiques et temporelles.

Responsabilités :

* stockage logique ;
* récupération ;
* géométrie ;
* données temporelles ;
* métadonnées ;
* sources ;
* transformations ;
* validation ;
* requêtes spatiales ;
* requêtes temporelles ;
* historique.

---

# 10. Offline & Sync Engine

Ce moteur gère la continuité du fonctionnement lorsque la connexion n'est pas disponible.

Responsabilités :

* stockage local ;
* cache ;
* file de synchronisation ;
* détection des changements ;
* synchronisation ;
* détection des conflits ;
* résolution des conflits ;
* reprise après interruption.

---

# 11. Services transversaux

Certaines fonctionnalités ne sont pas propres à un moteur.

## 11.1 Authentication Service

Gère l'identité.

## 11.2 Authorization Service

Gère les permissions.

## 11.3 Notification Service

Gère les notifications.

## 11.4 Reporting Service

Gère la génération de rapports.

## 11.5 Audit Service

Enregistre les actions importantes.

## 11.6 File / Media Service

Gère les images, vidéos et documents.

## 11.7 Configuration Service

Gère les paramètres du système.

---

# 12. Communication entre composants

Les composants doivent communiquer via des interfaces définies.

Exemple :

```text
Interface
   │
   ▼
Application
   │
   ├────► World Engine
   │
   ├────► Flood Engine
   │
   ├────► Intelligence Engine
   │
   └────► Geo/Data Engine
```

Un moteur ne doit pas accéder directement aux détails internes d'un autre moteur.

---

# 13. Architecture modulaire

Chaque moteur doit être organisé comme un module relativement indépendant.

Exemple :

```text
IntelliFlood
│
├── Application
│
├── World Engine
│
├── Flood Engine
│
├── Intelligence Engine
│
├── Geo/Data Engine
│
├── Offline/Sync Engine
│
├── Authentication
│
├── Notifications
│
├── Reporting
│
└── Audit
```

---

# 14. Dépendances autorisées

Les dépendances doivent suivre une direction maîtrisée.

```text
Interfaces
    │
    ▼
Application
    │
    ▼
Domain / Engines
    │
    ▼
Infrastructure
```

Une couche inférieure ne doit pas dépendre directement d'une couche supérieure.

---

# 15. Architecture conceptuelle en couches

```text
┌───────────────────────────────┐
│ PRESENTATION                  │
│ Web / Mobile / Desktop       │
├───────────────────────────────┤
│ APPLICATION                  │
│ Use Cases / Workflows        │
├───────────────────────────────┤
│ DOMAIN                       │
│ World / Flood / Intelligence │
├───────────────────────────────┤
│ DATA                         │
│ Geo / Temporal / Repository  │
├───────────────────────────────┤
│ INFRASTRUCTURE               │
│ DB / Storage / Sync / APIs   │
└───────────────────────────────┘
```

---

# 16. Domain Layer

La couche domaine contient les règles métier fondamentales.

Elle doit notamment représenter :

* Observation ;
* Zone ;
* Event ;
* Risk ;
* Alert ;
* Scenario ;
* Simulation ;
* Result ;
* etc.

Elle ne doit pas dépendre directement :

* d'un framework web ;
* d'une base de données particulière ;
* d'un fournisseur IA ;
* d'un fournisseur cloud.

---

# 17. Application Layer

La couche application orchestre les cas d'utilisation.

Exemples :

```text
CreateObservation
AnalyzeZone
CreateSimulation
RunSimulation
CreateAlert
SynchronizeData
GenerateReport
AskAssistant
```

Chaque cas d'utilisation doit coordonner les composants nécessaires.

---

# 18. Infrastructure Layer

Cette couche contient les implémentations techniques.

Exemples :

* base de données ;
* stockage de fichiers ;
* APIs ;
* connecteurs externes ;
* modèles IA ;
* systèmes de notification ;
* synchronisation réseau.

---

# 19. Architecture des données

Conceptuellement :

```text
              APPLICATION
                    │
                    ▼
             GEO/DATA ENGINE
                    │
          ┌─────────┼──────────┐
          ▼         ▼          ▼
     Database    File Store   Cache
          │
          ▼
      Index spatiaux
      Index temporels
```

---

# 20. Sources externes

Les sources externes peuvent être :

* capteurs ;
* API météorologiques ;
* données hydrologiques ;
* données cartographiques ;
* satellites ;
* systèmes partenaires ;
* fichiers ;
* bases externes.

Elles doivent être intégrées par des connecteurs ou adaptateurs.

```text
Source externe
      │
      ▼
   Adapter
      │
      ▼
Geo/Data Engine
```

---

# 21. Architecture Offline-first

Le principe général est :

```text
Utilisateur
     │
     ▼
Application locale
     │
     ▼
Stockage local
     │
     ├──► Utilisation hors ligne
     │
     └──► File de synchronisation
                    │
                    ▼
                Connexion
                    │
                    ▼
               Serveur
```

---

# 22. Architecture événementielle

Certains événements peuvent déclencher plusieurs traitements.

Exemple :

```text
Nouvelle mesure
      │
      ▼
Event Bus
      │
 ┌────┼─────────┬─────────┐
 ▼    ▼         ▼         ▼
Flood AI     World    Alert
Engine       Engine   Engine
```

Cette architecture permettra d'éviter que chaque composant connaisse tous les autres.

---

# 23. Traitements synchrones et asynchrones

## Synchrone

Utilisé lorsque l'utilisateur attend immédiatement une réponse.

Exemples :

* consultation ;
* recherche ;
* modification simple.

## Asynchrone

Utilisé pour les traitements lourds.

Exemples :

* simulation ;
* analyse IA ;
* traitement d'image ;
* génération de rapport ;
* import massif ;
* synchronisation importante.

---

# 24. Gestion des erreurs

Chaque module doit pouvoir produire des erreurs structurées.

Exemple :

```text
Erreur
│
├── Authentification
├── Autorisation
├── Validation
├── Données
├── Géospatial
├── Simulation
├── IA
├── Synchronisation
├── Stockage
└── Source externe
```

Les erreurs doivent pouvoir être journalisées et présentées à l'utilisateur de manière compréhensible.

---

# 25. Sécurité architecturale

La sécurité doit être appliquée à plusieurs niveaux :

```text
Utilisateur
    │
    ▼
Authentification
    │
    ▼
Autorisation
    │
    ▼
Application
    │
    ▼
Données
```

Une permission ne doit jamais être contrôlée uniquement dans l'interface.

---

# 26. Traçabilité architecturale

Les actions importantes doivent pouvoir produire des événements d'audit.

```text
Action utilisateur
      │
      ▼
Application
      │
      ├────► Traitement
      │
      └────► Audit
                  │
                  ▼
              Historique
```

---

# 27. Extensibilité

L'architecture doit permettre d'ajouter :

* de nouvelles sources ;
* de nouveaux modèles IA ;
* de nouvelles analyses ;
* de nouvelles simulations ;
* de nouveaux types de données ;
* de nouvelles interfaces ;
* de nouvelles fonctionnalités.

Sans réécrire l'ensemble du système.

---

# 28. Indépendance vis-à-vis de l'IA

L'architecture ne doit pas supposer l'existence d'un seul modèle.

Conceptuellement :

```text
                 Intelligence Engine
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
          Modèle A    Modèle B    Modèle C
```

Les modèles peuvent être :

* locaux ;
* open-source ;
* spécialisés ;
* distants si nécessaire.

---

# 29. Indépendance vis-à-vis des sources

Même principe pour les données :

```text
                  Geo/Data Engine
                        │
       ┌────────────────┼────────────────┐
       ▼                ▼                ▼
   Source A          Source B         Source C
```

Une source ne doit pas devenir une dépendance architecturale unique lorsque plusieurs sources sont possibles.

---

# 30. Testabilité

Chaque module doit pouvoir être testé indépendamment autant que possible.

Exemple :

```text
Flood Engine
     │
     ▼
Tests métier
     │
     ▼
Tests d'intégration
     │
     ▼
Tests système
```

Les traitements déterministes doivent être séparés des éléments difficiles à tester.

---

# 31. Architecture logique finale provisoire

```text
INTELLIFLOOD
│
├── Presentation
│   ├── Web
│   ├── PWA
│   ├── Mobile
│   ├── Desktop
│   └── Cockpit
│
├── Application
│   ├── Authentication
│   ├── Authorization
│   ├── Workflows
│   ├── Notifications
│   ├── Reports
│   └── Audit
│
├── Engines
│   ├── World Engine
│   ├── Flood Engine
│   ├── Intelligence Engine
│   ├── Geo/Data Engine
│   └── Offline/Sync Engine
│
├── Domain
│   ├── Users
│   ├── Observations
│   ├── Events
│   ├── Risks
│   ├── Alerts
│   ├── Simulations
│   └── Reports
│
└── Infrastructure
    ├── Database
    ├── File Storage
    ├── External APIs
    ├── AI Models
    └── Connectors
```

---

# 32. Architecture cible provisoire

À ce stade, IntelliFlood est orienté vers une architecture de type :

**Application modulaire + services spécialisés + architecture offline-first + composants géospatiaux + traitements asynchrones.**

Le choix précis entre :

* monolithe modulaire ;
* services séparés ;
* microservices ;

sera étudié avec les contraintes réelles du projet.

Le principe retenu à ce stade est de **ne pas introduire de complexité distribuée inutilement**.

---

# 33. Principes de décision technologique

Les technologies seront choisies selon :

1. maturité ;
2. licence ;
3. coût ;
4. disponibilité open-source ;
5. fonctionnement local ;
6. performances ;
7. compatibilité géospatiale ;
8. support du mode hors ligne ;
9. facilité de maintenance ;
10. facilité de test ;
11. compatibilité avec les modèles IA ;
12. compétences disponibles.

---

# 34. Ce que ce document ne définit pas encore

Ce document ne fixe volontairement pas :

* le framework frontend exact ;
* le framework backend exact ;
* le langage définitif ;
* le SGBD définitif ;
* le moteur 3D définitif ;
* le moteur cartographique définitif ;
* le système exact de messages ;
* le système exact de stockage ;
* le modèle IA définitif.

Ces décisions seront prises dans les documents spécialisés.

---

# 35. Décisions de conception

### DEC-009-001

IntelliFlood sera conçu comme un système modulaire.

### DEC-009-002

Les moteurs auront des responsabilités clairement séparées.

### DEC-009-003

L'application privilégiera une architecture modulaire avant d'envisager une architecture distribuée complexe.

### DEC-009-004

Le mode offline-first sera intégré à l'architecture dès le départ.

### DEC-009-005

Le Geo/Data Engine sera une responsabilité centrale pour les données géospatiales et temporelles.

### DEC-009-006

L'Intelligence Engine sera indépendant d'un fournisseur IA unique.

### DEC-009-007

Les traitements lourds pourront être exécutés de manière asynchrone.

### DEC-009-008

Les composants devront être testables indépendamment autant que possible.

---

# 36. Préparation du DOCUMENT010

Le DOCUMENT010 détaillera l'architecture des données géospatiales et temporelles.

Il devra notamment préciser :

* géométries ;
* systèmes de coordonnées ;
* données raster ;
* données vectorielles ;
* index spatiaux ;
* index temporels ;
* séries temporelles ;
* historique ;
* requêtes spatio-temporelles ;
* volumes de données ;
* stockage des données 3D.

---

# 37. État du document

**DOCUMENT009 : TERMINÉ — VERSION 1.0**


---

## Décisions complémentaires — périmètre global et intégration des sources (29 octobre 2026)

L'architecture doit séparer clairement le **socle de visualisation globale** des **fonctions spécialisées de risque d'inondation**. Le globe terrestre complet et les fonctionnalités réellement présentes dans God’s Eye View doivent être inventoriés puis conservés, sauf incompatibilité démontrée et décision explicitement approuvée. L'ajout des modules IntelliFlood ne doit pas réduire l'exploration du monde à une vue centrée exclusivement sur la Côte d'Ivoire.

Le territoire ivoirien constitue la couverture opérationnelle nationale cible. Cocody est un exemple de pilote possible et ne doit pas apparaître comme limite codée, hypothèse d'architecture ou filtre géographique par défaut.

Les données externes doivent entrer par une couche d'ingestion/connecteurs indépendante des domaines métier. Elle doit permettre, selon les capacités réelles des sources, les mesures IoT directes, les API de fabricants, les webhooks/flux d'événements, les passerelles locales, les API météorologiques et les jeux de données géospatiales. L'architecture doit normaliser les données sans effacer leur provenance, leur fraîcheur, leur qualité ou les conditions d'utilisation.

Les mécanismes locaux de sécurité et de collecte doivent rester distincts de la disponibilité du cloud. Les fonctions réellement autonomes hors ligne doivent être identifiées et testées ; aucune disponibilité d'alerte distante ne doit être promise lorsqu'aucun réseau de communication n'est disponible.
