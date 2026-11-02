# DOCUMENT001 — VISION & PÉRIMÈTRE D’INTELLIFLOOD

**Projet :** IntelliFlood  
**Type :** Plateforme géospatiale intelligente de prévention, observation, simulation et gestion des inondations  
**Statut du document :** Document de cadrage initial  
**Version :** 1.0  
**Date :** 30 septembre 2026  
**Précédent concept :** God’s Eye View (GEV)  
**Principe directeur :** *Offline-first, local-first, modulaire et extensible*

---

## 1. Objet du document

Ce document constitue le premier document officiel de conception du projet **IntelliFlood**.

Il définit la **vision**, la **raison d’être**, les **objectifs**, le **périmètre fonctionnel**, les principaux **utilisateurs**, les **principes architecturaux** et les **limites** du système.

Il ne décrit pas encore l'implémentation détaillée. Les choix techniques, les modèles de données, les diagrammes UML détaillés, les interfaces, les algorithmes et le code seront traités dans les documents suivants.

L'objectif est de disposer d'une référence commune avant de commencer la conception détaillée puis le développement.

---

# 2. Présentation générale

## 2.1. Qu'est-ce qu'IntelliFlood ?

**IntelliFlood** est une plateforme géospatiale intelligente destinée à aider les citoyens, les organisations et les acteurs de la gestion des risques à :

- observer un territoire ;
- détecter et suivre les situations à risque ;
- comprendre l'évolution d'une inondation ;
- visualiser des informations géographiques et temporelles ;
- simuler différents scénarios ;
- coordonner les interventions ;
- exploiter des données provenant de plusieurs sources ;
- fonctionner autant que possible sans dépendre en permanence d'Internet ;
- transformer des données complexes en informations compréhensibles et exploitables.

IntelliFlood reprend et absorbe les capacités du concept **God’s Eye View (GEV)**.

Le GEV n'est donc plus considéré comme un produit séparé : ses capacités deviennent une partie du **World Engine** d'IntelliFlood.

---

# 3. Vision

La vision d'IntelliFlood est de construire une plateforme capable de donner une **vue globale, géospatiale et temporelle d'un territoire**, tout en ajoutant une couche spécialisée consacrée aux inondations.

Le système doit permettre de passer progressivement :

**Données → Observation → Compréhension → Simulation → Décision → Action**

IntelliFlood doit donc être plus qu'une simple carte.

Il doit constituer un environnement permettant de :

1. **voir** ce qui se passe ;
2. **comprendre** ce qui se passe ;
3. **anticiper** ce qui pourrait se passer ;
4. **simuler** différents scénarios ;
5. **coordonner** les actions ;
6. **conserver** l'historique des événements ;
7. **fonctionner hors ligne** lorsque les conditions réseau sont mauvaises.

---

# 4. Problématique

Les inondations sont des phénomènes géographiques et temporels.

Une information isolée est rarement suffisante pour comprendre une situation.

Par exemple :

- une forte pluie n'indique pas nécessairement une inondation ;
- une zone basse n'indique pas nécessairement qu'elle est actuellement submergée ;
- une image satellite ne suffit pas toujours à déterminer la situation au sol ;
- un signal provenant d'un capteur peut être incomplet ou erroné ;
- une vidéo CCTV peut montrer une zone mais ne pas expliquer son évolution ;
- une carte statique ne représente pas correctement la dynamique d'un événement.

IntelliFlood doit donc être conçu pour **fusionner plusieurs catégories d'informations** et présenter leur relation dans l'espace et dans le temps.

---

# 5. Objectifs du projet

## 5.1. Objectif général

Créer une plateforme géospatiale intelligente permettant la **prévention, l'observation, la simulation et la gestion des inondations**, tout en conservant une capacité générale de surveillance et de compréhension du territoire héritée de God’s Eye View.

---

## 5.2. Objectifs spécifiques

IntelliFlood doit permettre de :

### O1 — Visualiser le territoire

Fournir une représentation géographique 2D/3D permettant d'explorer :

- villes ;
- routes ;
- bâtiments ;
- cours d'eau ;
- relief ;
- zones urbaines ;
- zones à risque ;
- infrastructures ;
- événements ;
- différentes couches géographiques.

### O2 — Observer les phénomènes

Permettre l'affichage de différentes sources d'information :

- satellites ;
- météo ;
- capteurs ;
- IoT ;
- caméras/CCTV ;
- données GIS ;
- événements signalés ;
- données de trafic ;
- aéronefs ;
- navires ;
- séismes ;
- incendies ;
- autres sources compatibles.

### O3 — Détecter les situations dangereuses

Identifier ou signaler des situations pouvant correspondre à :

- montée des eaux ;
- accumulation d'eau ;
- débordement ;
- pluie importante ;
- saturation d'une zone ;
- obstruction d'un passage ;
- route impraticable ;
- zone isolée ;
- événement nécessitant une intervention.

### O4 — Analyser les risques

Permettre d'étudier :

- l'altitude ;
- la topographie ;
- la proximité des cours d'eau ;
- les précipitations ;
- les données historiques ;
- les zones vulnérables ;
- les infrastructures exposées ;
- la population potentiellement concernée ;
- l'évolution temporelle du risque.

### O5 — Simuler

Permettre de représenter des scénarios tels que :

- montée du niveau de l'eau ;
- propagation d'une zone inondée ;
- impact sur les routes ;
- impact sur les bâtiments ;
- zones susceptibles d'être isolées ;
- évolution d'un événement dans le temps.

Les simulations doivent être clairement distinguées des observations réelles.

### O6 — Aider à la coordination

Permettre aux organisations autorisées de :

- localiser des incidents ;
- visualiser les zones affectées ;
- suivre des équipes ;
- ajouter des annotations ;
- partager des informations ;
- documenter les interventions ;
- conserver une chronologie des événements.

### O7 — Fonctionner hors ligne

Le système doit être conçu selon une philosophie **offline-first**.

L'absence temporaire d'Internet ne doit pas rendre l'application inutilisable.

Les fonctionnalités hors ligne pourront notamment concerner :

- consultation de cartes déjà téléchargées ;
- consultation des données locales ;
- création d'observations ;
- ajout de rapports ;
- annotations ;
- consultation d'historiques ;
- préparation d'actions ;
- synchronisation ultérieure.

### O8 — Exploiter l'intelligence artificielle

L'IA doit aider à :

- analyser des données ;
- résumer des événements ;
- assister l'utilisateur ;
- détecter des anomalies ;
- interpréter certaines images ou informations ;
- rechercher des informations ;
- proposer des analyses ;
- faciliter l'interaction avec le système.

L'IA n'a pas pour objectif de remplacer les données déterministes, les modèles physiques ou la décision humaine.

---

# 6. Principes fondamentaux

## 6.1. Offline-first

Le système est conçu en considérant l'accès réseau comme **variable**, et non comme une garantie permanente.

Architecture conceptuelle :

```text
                 ┌─────────────────────┐
                 │     IntelliFlood    │
                 └──────────┬──────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
        Fonctionnement local         Services réseau
              │                           │
        ┌─────┴─────┐             ┌───────┴───────┐
        │ Données   │             │ Synchronisation│
        │ locales   │◄───────────►│ / données     │
        └───────────┘             └───────────────┘
```

---

## 6.2. Local-first pour l'IA

Aucune IA propriétaire payante ne doit être obligatoire pour utiliser le cœur du système.

La priorité est donnée :

1. aux modèles open source ;
2. aux modèles exécutables localement ;
3. aux outils gratuits ;
4. aux mécanismes déterministes lorsque l'IA n'est pas nécessaire.

L'architecture doit permettre de remplacer un modèle par un autre sans reconstruire toute l'application.

---

## 6.3. Observation ≠ simulation

Le système doit toujours distinguer :

- **donnée observée** ;
- **donnée calculée** ;
- **prévision** ;
- **simulation** ;
- **hypothèse** ;
- **alerte**.

Une simulation ne doit jamais être présentée comme une observation réelle.

---

## 6.4. Incertitude

Les informations doivent pouvoir porter un niveau de confiance ou une indication d'incertitude lorsque cela est pertinent.

Exemple conceptuel :

```text
OBSERVATION
Source : Capteur X
Heure : 14:32
Niveau : 1,82 m
Statut : Observé
Confiance : élevée
```

ou :

```text
SIMULATION
Scénario : pluie intense
Horizon : +3 h
Zone affectée estimée : 4,2 km²
Statut : Simulation
Confiance : moyenne
```

---

## 6.5. Modularité

IntelliFlood doit être construit sous forme de modules relativement indépendants.

Un module doit pouvoir évoluer sans provoquer de réécriture massive du reste du système.

---

# 7. Les grands moteurs d'IntelliFlood

Le système est organisé conceptuellement autour de cinq grands moteurs.

```text
                         INTELLIFLOOD
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
       ▼                      ▼                      ▼
 WORLD ENGINE            FLOOD ENGINE        INTELLIGENCE ENGINE
       │                      │                      │
       └──────────────┬───────┴──────────────┬───────┘
                      │                      │
                      ▼                      ▼
                GEO/DATA ENGINE       OFFLINE & SYNC
```

---

## 7.1. World Engine

Le **World Engine** constitue l'héritage direct de God’s Eye View.

Il fournit l'environnement géospatial général permettant d'explorer le monde.

Il pourra notamment gérer :

- globe 3D ;
- cartes ;
- terrain ;
- bâtiments ;
- routes ;
- couches géographiques ;
- aéronefs ;
- navires ;
- satellites ;
- séismes ;
- trafic ;
- CCTV ;
- incendies ;
- tracking ;
- annotations ;
- cockpit ;
- temporalité ;
- visualisations dynamiques.

Le World Engine n'est pas limité aux inondations.

---

# 7.2. Flood Engine

Le **Flood Engine** constitue le cœur spécialisé d'IntelliFlood.

Il est chargé des fonctionnalités liées aux inondations.

Il pourra notamment gérer :

- cartographie des zones inondables ;
- niveaux d'eau ;
- précipitations ;
- bassins versants ;
- cours d'eau ;
- drainage ;
- accumulation d'eau ;
- propagation ;
- zones vulnérables ;
- historique des inondations ;
- scénarios ;
- simulation ;
- risques ;
- alertes ;
- impact sur les infrastructures.

---

# 7.3. Intelligence Engine

L'**Intelligence Engine** constitue la couche d'assistance intelligente.

Il pourra regrouper :

- modèles IA ;
- analyse de données ;
- détection d'anomalies ;
- classification ;
- vision par ordinateur ;
- assistant conversationnel ;
- génération de rapports ;
- résumé d'événements ;
- recherche intelligente ;
- aide à l'interprétation.

L'Intelligence Engine ne doit pas devenir une boîte noire obligatoire.

Lorsqu'une fonctionnalité peut être réalisée de manière déterministe, elle doit pouvoir l'être sans IA.

---

# 7.4. Geo/Data Engine

Le **Geo/Data Engine** constitue la couche de gestion des données géospatiales et temporelles.

Il devra permettre de gérer :

- données vectorielles ;
- données raster ;
- coordonnées ;
- altitude ;
- terrain ;
- cartes ;
- séries temporelles ;
- capteurs ;
- observations ;
- événements ;
- métadonnées ;
- historiques ;
- données importées ;
- données locales.

---

# 7.5. Offline & Sync Engine

Ce moteur gère :

- stockage local ;
- cache ;
- données disponibles hors ligne ;
- files d'opérations ;
- synchronisation ;
- résolution des conflits ;
- reprise après connexion ;
- import/export.

Principe :

```text
UTILISATEUR
    │
    ▼
DONNÉE LOCALE
    │
    ├── Internet disponible ──► SYNCHRONISATION
    │
    └── Internet indisponible ─► FILE LOCALE
                                      │
                                      ▼
                              SYNCHRONISATION
                              ultérieure
```

---

# 8. Utilisateurs cibles

## 8.1. Citoyen

Le citoyen peut :

- consulter les risques ;
- consulter les alertes ;
- visualiser les zones touchées ;
- signaler une situation ;
- envoyer une observation ;
- consulter certaines informations hors ligne ;
- recevoir des informations utiles.

---

## 8.2. Agent de terrain

L'agent de terrain peut :

- consulter une zone ;
- recevoir ou consulter des incidents ;
- créer des rapports ;
- prendre des observations ;
- ajouter des photos ;
- ajouter des annotations ;
- suivre une intervention ;
- travailler hors ligne ;
- synchroniser les données plus tard.

---

## 8.3. Organisation

Une organisation peut :

- gérer des équipes ;
- suivre des interventions ;
- consulter les événements ;
- analyser les risques ;
- gérer des zones ;
- produire des rapports ;
- exploiter les données disponibles.

---

## 8.4. Analyste / expert

L'analyste peut :

- étudier les données ;
- comparer des périodes ;
- consulter l'historique ;
- analyser les risques ;
- lancer des simulations ;
- étudier des scénarios ;
- interpréter les résultats.

---

## 8.5. Administrateur

L'administrateur peut :

- gérer les utilisateurs ;
- gérer les rôles ;
- gérer les organisations ;
- gérer les sources de données ;
- gérer les configurations ;
- contrôler les permissions ;
- superviser le système.

---

# 9. Plateformes ciblées

## 9.1. Web / PWA

La plateforme Web/PWA constitue l'interface principale.

Elle doit permettre :

- consultation ;
- analyse ;
- visualisation 2D/3D ;
- gestion ;
- simulation ;
- fonctionnement hors ligne lorsque les données nécessaires sont disponibles localement.

---

## 9.2. Mobile

Le mobile est principalement destiné aux usages :

- citoyens ;
- agents de terrain ;
- collecte ;
- signalement ;
- consultation rapide ;
- géolocalisation ;
- travail hors ligne.

---

## 9.3. Desktop

Le client desktop peut être utilisé pour les usages nécessitant :

- grande quantité d'informations ;
- visualisation avancée ;
- analyse ;
- cockpit ;
- supervision ;
- simulation ;
- exploitation professionnelle.

---

# 10. Périmètre fonctionnel initial

| Domaine | Fonctionnalités initiales |
|---|---|
| Cartographie | Carte 2D, globe 3D, couches géographiques |
| World Engine | Avions, navires, satellites, séismes, trafic, CCTV, incendies |
| Flood Engine | Zones inondables, eau, pluie, risques, propagation |
| Observation | Capteurs, signalements, images, données terrain |
| Simulation | Scénarios d'inondation et évolution temporelle |
| Tracking | Suivi d'entités et d'équipes |
| Temporalité | Historique, chronologie, évolution |
| Annotations | Points, zones, commentaires et événements |
| Alertes | Détection, notification et suivi d'événements |
| IA | Analyse, assistant, classification, anomalies |
| Offline | Données locales, consultation et collecte hors ligne |
| Synchronisation | Synchronisation différée et gestion des conflits |
| Collaboration | Partage d'informations entre utilisateurs autorisés |
| Rapports | Génération et consultation de rapports |

---

# 11. Hors périmètre initial

Les éléments suivants ne doivent pas être considérés comme obligatoires dans la première version :

- remplacement complet des systèmes institutionnels existants ;
- contrôle autonome de véhicules ;
- décision automatique d'évacuation ;
- garantie de prédiction parfaite des inondations ;
- dépendance obligatoire à une IA distante ;
- dépendance obligatoire à une API payante ;
- surveillance illimitée de toute personne ;
- automatisation complète de décisions critiques.

Ces éléments peuvent éventuellement faire l'objet de futures études spécifiques.

---

# 12. Architecture conceptuelle

L'architecture globale visée est :

```text
┌─────────────────────────────────────────────────────────────┐
│                     INTERFACES UTILISATEUR                  │
│                                                             │
│        Web/PWA       Mobile       Desktop       Cockpit     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION INTELLIFLOOD                 │
│                                                             │
│  Auth │ Permissions │ Workflows │ Notifications │ Reports  │
└──────────────────────────────┬──────────────────────────────┘
                               │
             ┌─────────────────┼─────────────────┐
             ▼                 ▼                 ▼
      ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
      │ World       │   │ Flood       │   │ Intelligence│
      │ Engine      │   │ Engine      │   │ Engine      │
      └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
             │                 │                 │
             └─────────────────┼─────────────────┘
                               ▼
                    ┌────────────────────┐
                    │ Geo/Data Engine    │
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │ Offline & Sync     │
                    │ Engine             │
                    └─────────┬──────────┘
                              │
               ┌──────────────┼──────────────┐
               ▼              ▼              ▼
          Local Data      Data Sources    Remote Services
```

Cette représentation est conceptuelle. Les choix techniques détaillés seront définis dans les documents d'architecture ultérieurs.

---

# 13. Gestion des données

IntelliFlood devra manipuler plusieurs familles de données.

## 13.1. Données géographiques

Exemples :

- latitude ;
- longitude ;
- altitude ;
- routes ;
- bâtiments ;
- cours d'eau ;
- frontières ;
- zones ;
- relief.

## 13.2. Données temporelles

Exemples :

- date ;
- heure ;
- historique ;
- évolution d'un niveau d'eau ;
- évolution d'une zone ;
- chronologie d'un incident.

## 13.3. Données d'observation

Exemples :

- capteurs ;
- observations humaines ;
- photos ;
- vidéos ;
- données satellites ;
- stations météorologiques.

## 13.4. Données calculées

Exemples :

- niveau de risque ;
- zones potentiellement affectées ;
- trajectoires ;
- agrégations ;
- indicateurs.

## 13.5. Données simulées

Exemples :

- scénario de pluie ;
- propagation théorique ;
- impact potentiel ;
- projection temporelle.

Chaque catégorie devra être identifiable afin d'éviter toute confusion.

---

# 14. Gestion des sources

Une donnée importante doit pouvoir être associée à sa source.

Conceptuellement :

```text
DONNÉE
 ├── source
 ├── date/heure
 ├── position
 ├── type
 ├── valeur
 ├── statut
 └── niveau de confiance
```

Cela permettra notamment de distinguer :

- une observation directe ;
- une information importée ;
- une information calculée ;
- une estimation ;
- une simulation.

---

# 15. Sécurité et contrôle des accès

La sécurité sera intégrée dès la conception.

Le système devra prévoir :

- authentification ;
- autorisation ;
- rôles ;
- permissions ;
- séparation des organisations ;
- contrôle des données sensibles ;
- journalisation des actions importantes ;
- protection des données locales ;
- synchronisation sécurisée.

Les détails techniques seront définis dans les documents d'architecture et de sécurité.

---

# 16. Principes d'interface

L'interface doit permettre à l'utilisateur de comprendre rapidement :

### Où ?

Position géographique.

### Quand ?

Moment de l'observation ou de l'événement.

### Quoi ?

Type de phénomène.

### Source ?

Origine de l'information.

### Réel ou simulé ?

Statut de l'information.

### Quel niveau de confiance ?

Fiabilité ou incertitude lorsque disponible.

### Que peut-on faire ?

Actions disponibles pour l'utilisateur.

---

# 17. Temporalité

La dimension temporelle est un élément central du système.

IntelliFlood doit pouvoir représenter :

```text
PASSÉ ───────────────► PRÉSENT ───────────────► FUTUR
  │                       │                       │
  ▼                       ▼                       ▼
Historique             Observation             Simulation
```

Un utilisateur pourra donc potentiellement :

- revoir un événement ;
- comparer deux périodes ;
- observer l'évolution d'une zone ;
- analyser une séquence ;
- lancer un scénario ;
- comparer observation et simulation.

---

# 18. Philosophie de l'IA

L'IA est considérée comme un **outil d'assistance**.

Elle ne doit pas être le fondement obligatoire de toute fonctionnalité.

## 18.1. Priorité

```text
Données fiables
      ↓
Algorithmes déterministes
      ↓
Modèles scientifiques
      ↓
IA spécialisée
      ↓
LLM / assistant
```

L'ordre exact dépendra de chaque fonctionnalité.

## 18.2. IA locale

La plateforme doit privilégier les solutions pouvant être exécutées localement lorsque cela est techniquement possible.

Objectifs :

- réduire les coûts ;
- améliorer la confidentialité ;
- permettre l'utilisation hors ligne ;
- éviter le verrouillage fournisseur ;
- faciliter l'expérimentation.

---

# 19. Principes de conception logicielle

Le projet suivra une démarche de **génie logiciel structurée**.

Ordre général :

```text
1. Vision
      ↓
2. Exigences
      ↓
3. Cas d'utilisation
      ↓
4. Modélisation UML
      ↓
5. Architecture
      ↓
6. Modèle de données
      ↓
7. Conception technique
      ↓
8. Prototypage
      ↓
9. Implémentation
      ↓
10. Tests
      ↓
11. Intégration
      ↓
12. Documentation
      ↓
13. Livrable
```

Le code ne doit donc pas être la première étape du projet.

---

# 20. Documents suivants

Les documents suivants seront construits progressivement.

La liste pourra être affinée pendant la conception, mais le principe est de conserver une numérotation stable.

## DOCUMENT002
**Analyse des parties prenantes et des utilisateurs**

## DOCUMENT003
**Expression des besoins et exigences**

## DOCUMENT004
**Acteurs et cas d'utilisation**

## DOCUMENT005
**Diagrammes d'activités**

## DOCUMENT006
**Diagrammes de séquence**

## DOCUMENT007
**Modèle de domaine et diagramme de classes**

## DOCUMENT008
**Modèle conceptuel de données**

## DOCUMENT009
**Architecture logicielle**

## DOCUMENT010
**Architecture des données géospatiales et temporelles**

## DOCUMENT011
**Architecture Offline-first et synchronisation**

## DOCUMENT012
**Architecture du World Engine**

## DOCUMENT013
**Architecture du Flood Engine**

## DOCUMENT014
**Architecture de l'Intelligence Engine**

## DOCUMENT015
**Architecture des interfaces**

## DOCUMENT016
**Sécurité et gestion des accès**

## DOCUMENT017
**Système d'événements, alertes et notifications**

## DOCUMENT018
**Système de simulation et scénarios**

## DOCUMENT019
**API et contrats d'échange**

## DOCUMENT020
**Architecture de déploiement**

## DOCUMENT021
**Stratégie de tests**

## DOCUMENT022
**Traçabilité exigences → conception → tests**

## DOCUMENT023
**Plan d'implémentation**

## DOCUMENT024
**Plan de livraison et documentation utilisateur**

> Cette liste constitue une base de travail. Elle pourra être ajustée lorsqu'une décision d'architecture ou une nouvelle exigence justifiera une modification.

---

# 21. Diagrammes attendus

La conception devra notamment produire les diagrammes suivants :

### Diagrammes fonctionnels
- diagramme de contexte ;
- diagramme des acteurs ;
- diagrammes de cas d'utilisation.

### Diagrammes comportementaux
- diagrammes d'activités ;
- diagrammes de séquence ;
- diagrammes d'états.

### Diagrammes structurels
- diagramme de classes ;
- modèle de domaine ;
- modèle de composants ;
- modèle de données.

### Diagrammes d'architecture
- architecture globale ;
- architecture logique ;
- architecture physique ;
- diagramme de déploiement ;
- architecture offline/synchronisation.

---

# 22. Critères de réussite du projet

IntelliFlood pourra être considéré comme techniquement cohérent lorsque :

- sa vision est clairement définie ;
- ses exigences sont traçables ;
- ses principaux utilisateurs sont identifiés ;
- les responsabilités des modules sont séparées ;
- les données observées et simulées sont distinguées ;
- le fonctionnement hors ligne est prévu dès la conception ;
- l'IA n'est pas une dépendance obligatoire ;
- les principaux flux sont modélisés ;
- l'architecture est documentée ;
- les données sont structurées ;
- les tests peuvent être associés aux exigences ;
- le système peut évoluer sans réécriture complète.

---

# 23. Limites et hypothèses

Ce document ne prétend pas résoudre dès maintenant :

- la précision scientifique exacte des modèles d'inondation ;
- la disponibilité réelle de toutes les sources de données ;
- la couverture satellite permanente ;
- la précision de toutes les données terrain ;
- les performances définitives ;
- le choix définitif de chaque technologie ;
- les coûts d'infrastructure définitifs.

Ces sujets seront traités progressivement.

---

# 24. Décisions de cadrage

Les décisions suivantes sont retenues comme base de conception :

| ID | Décision |
|---|---|
| DEC-001 | Le nom officiel du projet est **IntelliFlood**. |
| DEC-002 | God’s Eye View est absorbé dans IntelliFlood sous la forme du **World Engine**. |
| DEC-003 | Le système conserve les capacités générales héritées du GEV. |
| DEC-004 | Le système ajoute un moteur spécialisé consacré aux inondations. |
| DEC-005 | L'architecture suit une philosophie **offline-first**. |
| DEC-006 | La plateforme principale cible le Web/PWA, avec des clients mobile et desktop. |
| DEC-007 | L'IA payante propriétaire n'est pas une dépendance obligatoire. |
| DEC-008 | Les modèles open source et exécutables localement sont privilégiés. |
| DEC-009 | Les observations et les simulations doivent être distinguées. |
| DEC-010 | La conception précède l'implémentation. |
| DEC-011 | Le projet sera documenté progressivement avec des documents numérotés. |
| DEC-012 | Les diagrammes UML et d'architecture feront partie des livrables de conception. |

---

# 25. Résumé exécutif

**IntelliFlood** est une plateforme géospatiale intelligente qui combine les capacités générales de **God’s Eye View** avec un ensemble spécialisé d'outils destinés à la prévention, l'observation, la simulation et la gestion des inondations.

Son architecture conceptuelle repose sur cinq piliers :

1. **World Engine** — représentation et observation globale du territoire ;
2. **Flood Engine** — analyse et simulation des inondations ;
3. **Intelligence Engine** — assistance intelligente et analyse ;
4. **Geo/Data Engine** — gestion des données géospatiales et temporelles ;
5. **Offline & Sync Engine** — fonctionnement local et synchronisation.

Le projet adopte une approche **offline-first**, **local-first pour l'IA**, modulaire et progressive.

La priorité immédiate n'est pas de coder, mais de transformer cette vision en exigences précises, modèles UML, architecture et conception technique.

---

# 26. État du document

**DOCUMENT001 est le document de référence initial du projet IntelliFlood.**

Il établit le vocabulaire et le périmètre nécessaires à la suite du processus de génie logiciel.

**Prochaine étape prévue : DOCUMENT002 — Analyse des parties prenantes et des utilisateurs.**

---

**Fin de DOCUMENT001**


---

## Décisions complémentaires — périmètre national, globe complet et intégrations multi-sources (29 octobre 2026)

Les décisions ci-dessous complètent la vision existante et prévalent en cas d'ambiguïté sur le périmètre géographique ou les sources de données.

- **Globe terrestre complet :** IntelliFlood doit conserver et rendre explorable le globe terrestre complet et les capacités effectivement présentes dans le projet open source God’s Eye View dont il est issu. Les fonctions existantes doivent être inventoriées et comparées avant toute suppression ou remplacement. Cette exigence ne signifie pas que toutes les fonctions d'origine sont déjà intégrées ou validées dans IntelliFlood.
- **Spécialisation sans régression :** les capacités de prévention, observation, analyse, alertes et simulation des inondations s'ajoutent à la base de visualisation globale ; elles ne doivent pas réduire l'application à une carte locale des inondations.
- **Portée géographique :** le produit vise l'ensemble du territoire national de Côte d'Ivoire et conserve la possibilité d'explorer le reste du monde. Cocody, notamment Riviera Palmeraie/Allabra, est uniquement un exemple de zone pilote possible, jamais la limite fonctionnelle ou géographique du produit.
- **Couverture des données distincte de la couverture de la carte :** la carte nationale doit pouvoir représenter toutes les zones, même si les capteurs, données météorologiques, relevés hydrologiques ou modèles haute résolution ne sont disponibles que dans certaines zones. L'interface doit rendre visibles la provenance, la fraîcheur, la qualité et les lacunes des données.
- **Données multi-sources :** prévoir les observations IoT, les API et plateformes de fabricants, les données météorologiques et hydrologiques, les données géospatiales/topographiques, les données satellitaires/radar lorsqu'elles sont accessibles et autorisées, ainsi que les signalements citoyens et de terrain.
- **Exemples non exhaustifs :** les lieux, fournisseurs, capteurs, protocoles, API, scénarios et canaux cités dans les documents sont illustratifs, sauf exigence explicitement déclarée normative.
