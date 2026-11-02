# DOCUMENT012 — ARCHITECTURE DU WORLD ENGINE

**Projet :** IntelliFlood
**Type :** Architecture fonctionnelle et technique
**Version :** 1.0
**Statut :** Conception
**Date :** 30 septembre 2026

---

# 1. Objet du document

Le **World Engine** constitue le moteur de représentation du monde d'IntelliFlood.

Il est issu du concept initial de **God's Eye View (GEV)**.

Son objectif est de fournir une représentation interactive du territoire permettant de :

* visualiser le monde ;
* naviguer ;
* observer ;
* superposer des données ;
* suivre des objets ;
* explorer le territoire dans le temps ;
* afficher des événements ;
* servir de support au Flood Engine et à l'Intelligence Engine.

---

# 2. Rôle du World Engine

Le World Engine répond principalement à la question :

> **"Que se passe-t-il où, et à quel moment ?"**

Il ne doit pas décider seul de la signification métier d'un phénomène.

Il fournit principalement :

* représentation ;
* navigation ;
* contexte géographique ;
* visualisation ;
* interaction ;
* temporalité.

---

# 3. Position dans IntelliFlood

```text
                    INTELLIFLOOD
                         │
              ┌──────────┴──────────┐
              │                     │
        WORLD ENGINE           FLOOD ENGINE
              │                     │
              └──────────┬──────────┘
                         │
                  INTELLIGENCE
                     ENGINE
```

Le World Engine constitue donc une infrastructure fonctionnelle commune.

---

# 4. Concepts principaux

Le World Engine repose sur plusieurs concepts.

### Monde

Représentation générale du territoire.

### Vue

État visuel actuel de l'utilisateur.

### Couche

Ensemble de données affichées.

### Objet

Élément géographique ou dynamique.

### Événement

Phénomène associé à un lieu et à un temps.

### Timeline

Dimension temporelle permettant de parcourir les événements.

---

# 5. Vue cartographique

La vue principale doit permettre :

* zoom ;
* déplacement ;
* rotation lorsque disponible ;
* changement d'orientation ;
* sélection ;
* recherche ;
* affichage de couches ;
* affichage d'objets.

---

# 6. Modes de représentation

Le World Engine pourra supporter plusieurs modes.

## 6.1 Vue 2D

Carte classique :

```text
┌─────────────────────────────┐
│          CARTE              │
│                             │
│      ● Observation          │
│      ▬ Route                │
│      ▰ Zone                 │
│      ~ Rivière              │
│                             │
└─────────────────────────────┘
```

---

## 6.2 Vue 3D

Représentation avec :

* terrain ;
* relief ;
* bâtiments ;
* infrastructures ;
* objets 3D ;
* eau ;
* caméra.

---

## 6.3 Vue globe

À faible niveau de zoom, l'utilisateur peut explorer la Terre sous forme de globe.

```text
        🌍
      /     \
     | Terre |
      \     /
```

---

# 7. Terrain

Le World Engine doit pouvoir représenter :

* altitude ;
* relief ;
* pentes ;
* vallées ;
* montagnes ;
* plaines ;
* zones basses.

Ces données sont particulièrement importantes pour le Flood Engine.

---

# 8. Bâtiments

Les bâtiments peuvent être représentés par :

* empreinte au sol ;
* hauteur ;
* type ;
* fonction ;
* identifiant ;
* niveau de vulnérabilité lorsqu'il est disponible.

---

# 9. Routes

Les routes doivent pouvoir être représentées avec :

* géométrie ;
* type ;
* nom ;
* état ;
* accessibilité ;
* événements associés.

Exemple :

```text
Route
 ├── ouverte
 ├── ralentie
 ├── bloquée
 └── inondée
```

---

# 10. Cours d'eau

Le World Engine peut représenter :

* rivières ;
* fleuves ;
* canaux ;
* lacs ;
* zones humides ;
* ouvrages hydrauliques.

Ces objets peuvent être utilisés par le Flood Engine.

---

# 11. Infrastructures

Exemples :

* hôpitaux ;
* écoles ;
* centrales ;
* stations de pompage ;
* ponts ;
* centres opérationnels ;
* réseaux.

---

# 12. Objets dynamiques

Le moteur doit pouvoir afficher des objets dont la position évolue.

Exemples :

* véhicule ;
* agent ;
* bateau ;
* aéronef ;
* drone ;
* équipement mobile.

---

# 13. Suivi

Un objet suivi peut être représenté par :

```text
Objet
  │
  ├── Position actuelle
  ├── Historique
  ├── Direction
  ├── Vitesse
  └── Trajectoire
```

---

# 14. Événements

Le World Engine peut afficher des événements tels que :

* pluie ;
* inondation ;
* incendie ;
* accident ;
* route bloquée ;
* anomalie ;
* intervention.

Les calculs métier restent cependant réalisés par les moteurs spécialisés.

---

# 15. Couches

Les données doivent être organisées en couches.

Exemple :

```text
┌──────────────────────────┐
│ Satellite                │
│ Terrain                  │
│ Bâtiments                │
│ Routes                   │
│ Cours d'eau              │
│ Capteurs                 │
│ Observations             │
│ Inondations              │
│ Risques                  │
│ Véhicules                │
└──────────────────────────┘
```

---

# 16. Gestion des couches

L'utilisateur doit pouvoir :

* afficher une couche ;
* masquer une couche ;
* modifier sa transparence ;
* modifier son ordre ;
* sélectionner une couche ;
* filtrer les données.

---

# 17. Superposition

Plusieurs couches peuvent être superposées.

Exemple :

```text
Terrain
   +
Routes
   +
Bâtiments
   +
Pluie
   +
Zone inondée
   +
Population
```

Cette superposition constitue l'une des fonctions fondamentales d'IntelliFlood.

---

# 18. Sélection d'objet

Lorsqu'un utilisateur sélectionne un objet :

```text
CARTE
  ↓
Objet sélectionné
  ↓
Identification
  ↓
Informations
  ↓
Historique
  ↓
Actions disponibles
```

---

# 19. Panneau d'information

Un objet peut afficher :

* nom ;
* type ;
* position ;
* état ;
* date ;
* source ;
* historique ;
* données associées ;
* observations ;
* risques.

---

# 20. Recherche géographique

Le World Engine doit permettre de rechercher :

* ville ;
* quartier ;
* route ;
* bâtiment ;
* infrastructure ;
* coordonnées ;
* zone ;
* événement.

---

# 21. Navigation

Fonctions prévues :

* zoom avant ;
* zoom arrière ;
* déplacement ;
* recentrage ;
* retour à la position ;
* vue globale ;
* vue locale ;
* vue 3D ;
* changement de perspective.

---

# 22. Timeline

La timeline permet de contrôler la dimension temporelle.

Exemple :

```text
◀───────●────────────────────▶
        14:30
```

Elle peut permettre :

* lecture ;
* pause ;
* avance ;
* retour ;
* changement de vitesse ;
* sélection d'une date.

---

# 23. Reconstitution historique

Le World Engine doit pouvoir reconstruire une situation passée lorsque les données nécessaires existent.

Exemple :

```text
12:00
  ↓
13:00
  ↓
14:00
  ↓
15:00
  ↓
16:00
```

L'utilisateur peut observer l'évolution d'une zone.

---

# 24. Simulation

Le World Engine doit pouvoir afficher les résultats du Flood Engine.

Exemple :

```text
Scénario
   ↓
Simulation
   ↓
Résultats géographiques
   ↓
World Engine
   ↓
Visualisation
```

---

# 25. Différence entre visualisation et calcul

Le World Engine ne doit pas devenir responsable de tous les calculs.

Exemple :

### Flood Engine

Calcule :

> Zone susceptible d'être inondée.

### World Engine

Affiche :

> Cette zone sur la carte.

Cette séparation est essentielle.

---

# 26. Cockpit

Le World Engine peut fournir un mode **Cockpit** destiné aux utilisateurs opérationnels.

Exemple :

```text
┌───────────────────────────────────────┐
│               COCKPIT                 │
├───────────────┬───────────────────────┤
│ ALERTES       │                       │
│ 12 actives    │        CARTE          │
│               │                       │
├───────────────┤                       │
│ ÉVÉNEMENTS    │                       │
│ 8 événements  │                       │
├───────────────┴───────────────────────┤
│ Timeline                              │
└───────────────────────────────────────┘
```

---

# 27. Mode annotation

L'utilisateur peut annoter la carte.

Exemples :

* point ;
* ligne ;
* zone ;
* texte ;
* symbole ;
* flèche.

Une annotation peut être associée à :

* un utilisateur ;
* une observation ;
* un événement ;
* une zone ;
* une date.

---

# 28. Temps réel

Lorsque des données arrivent en temps réel, le World Engine peut actualiser la représentation.

Exemple :

```text
Capteur
  ↓
Nouvelle mesure
  ↓
Data Engine
  ↓
World Engine
  ↓
Actualisation carte
```

---

# 29. Architecture fonctionnelle

```text
┌──────────────────────────────────────────┐
│              WORLD ENGINE                │
├──────────────────────────────────────────┤
│                                          │
│  Map Manager                             │
│  Globe Manager                           │
│  Terrain Manager                         │
│  Layer Manager                           │
│  Object Manager                          │
│  Event Manager                           │
│  Tracking Manager                        │
│  Timeline Manager                        │
│  Selection Manager                       │
│  Annotation Manager                      │
│  Visualization Manager                  │
│                                          │
└─────────────────────┬────────────────────┘
                      │
                GEO/DATA ENGINE
                      │
          ┌───────────┴───────────┐
          │                       │
     FLOOD ENGINE          INTELLIGENCE ENGINE
```

---

# 30. Gestion des performances

Le World Engine doit prévoir :

* chargement progressif ;
* chargement par zone ;
* niveaux de détail ;
* cache ;
* simplification géométrique ;
* affichage conditionnel ;
* limitation des objets visibles simultanément.

---

# 31. Niveau de détail

Les objets peuvent changer de représentation selon le niveau de zoom.

Exemple :

```text
MONDE
 ↓
PAYS
 ↓
RÉGION
 ↓
VILLE
 ↓
QUARTIER
 ↓
RUE
 ↓
BÂTIMENT
```

Tous les détails ne doivent donc pas être chargés simultanément.

---

# 32. Offline

Le World Engine doit pouvoir fonctionner avec des données locales.

Fonctions possibles hors ligne :

* navigation dans une zone téléchargée ;
* affichage des couches disponibles ;
* consultation des observations locales ;
* ajout d'annotations ;
* consultation de données préchargées.

---

# 33. Interopérabilité

Le World Engine doit rester indépendant d'un fournisseur unique.

Il doit pouvoir consommer différents types de sources géographiques et de données.

Les adaptateurs permettront de connecter :

```text
Source A
Source B
Source C
   ↓
Geo/Data Engine
   ↓
World Engine
```

---

# 34. Séparation des responsabilités

Le World Engine :

**FAIT**

* afficher ;
* naviguer ;
* sélectionner ;
* superposer ;
* suivre ;
* temporaliser ;
* visualiser.

Le World Engine :

**NE FAIT PAS SEUL**

* décider d'une évacuation ;
* déterminer automatiquement une politique publique ;
* remplacer un expert ;
* garantir une prédiction ;
* prendre une décision opérationnelle critique.

---

# 35. Relations avec les autres moteurs

### World Engine ↔ Geo/Data Engine

Échange :

* géométries ;
* objets ;
* événements ;
* données temporelles.

### World Engine ↔ Flood Engine

Échange :

* zones inondées ;
* niveaux d'eau ;
* risques ;
* simulations ;
* propagation.

### World Engine ↔ Intelligence Engine

Échange :

* détections ;
* analyses ;
* classifications ;
* anomalies ;
* résultats IA.

---

# 36. Architecture conceptuelle globale

```text
                        UTILISATEUR
                             │
                             ▼
                    ┌─────────────────┐
                    │   WORLD ENGINE  │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
   GEO/DATA              FLOOD ENGINE      INTELLIGENCE
    ENGINE                                      ENGINE
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
                     OFFLINE & SYNC
                             │
                      DONNÉES LOCALES
                             │
                     DONNÉES DISTANTES
```

---

# 37. Décisions de conception

Les décisions suivantes sont retenues :

1. Le World Engine constitue le moteur de représentation géographique principal.
2. Il intègre l'héritage fonctionnel du concept GEV.
3. Il supporte 2D, 3D et globe lorsque les technologies retenues le permettent.
4. Il est nativement spatio-temporel.
5. Il utilise des couches.
6. Il peut afficher des objets statiques et dynamiques.
7. Il intègre une timeline.
8. Il peut visualiser les résultats du Flood Engine.
9. Il ne remplace pas le Flood Engine pour les calculs hydrologiques.
10. Il doit pouvoir fonctionner offline sur les données disponibles localement.
11. Il doit rester indépendant d'un fournisseur technologique unique.
12. Les choix précis de moteur cartographique/3D seront effectués ultérieurement.

---

# 38. Préparation du DOCUMENT013

Le document suivant définira l'architecture du **Flood Engine**.

Il détaillera notamment :

* pluie ;
* hydrologie ;
* niveaux d'eau ;
* drainage ;
* ruissellement ;
* propagation ;
* zones inondables ;
* vulnérabilité ;
* calcul des risques ;
* scénarios ;
* simulations ;
* résultats.

---

# 39. État du document

**DOCUMENT012 : TERMINÉ — VERSION 1.0**


---

## Décisions complémentaires — World Engine et héritage God’s Eye View (29 octobre 2026)

Le World Engine doit préserver le principe d'un monde explorable à l'échelle globale : l'utilisateur peut naviguer du globe terrestre complet vers une zone locale, puis revenir à une vue globale, sans frontière artificielle limitée à la Côte d'Ivoire. Les fonctions existantes de God’s Eye View doivent être inventoriées à partir du code source d'origine et comparées aux fonctions réellement présentes dans IntelliFlood avant toute décision de remplacement.

Les couches IntelliFlood (capteurs, météo, observations, risques, alertes, simulations) sont des couches spécialisées activables au-dessus du socle géospatial, et non un remplacement du globe ou des fonctions de visualisation héritées. Les sources, résolutions et dates des couches doivent être explicites.

La couverture de représentation est mondiale ; la couverture opérationnelle prioritaire pour les risques d'inondation est nationale en Côte d'Ivoire. Cocody peut servir d'exemple de pilote, mais ne doit pas être codée en dur comme unique zone supportée.
