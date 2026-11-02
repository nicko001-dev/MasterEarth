# DOCUMENT013 — ARCHITECTURE DU FLOOD ENGINE

**Projet :** IntelliFlood
**Type :** Architecture fonctionnelle et technique
**Version :** 1.0
**Statut :** Conception
**Date :** 30 septembre 2026

---

# 1. Objet du document

Le **Flood Engine** est le moteur spécialisé d'IntelliFlood consacré à l'étude des phénomènes d'inondation.

Il a pour objectif de permettre :

* l'observation des phénomènes hydrologiques ;
* l'analyse des facteurs de risque ;
* l'identification des zones potentiellement touchées ;
* l'analyse de la propagation de l'eau ;
* l'étude de la vulnérabilité ;
* la création de scénarios ;
* la simulation ;
* la comparaison entre observations, calculs et simulations.

---

# 2. Position dans IntelliFlood

```text
                    INTELLIFLOOD
                         │
             ┌───────────┴───────────┐
             │                       │
       WORLD ENGINE             FLOOD ENGINE
             │                       │
             └───────────┬───────────┘
                         │
                 INTELLIGENCE ENGINE
```

Le Flood Engine utilise principalement les données fournies par le **Geo/Data Engine** et produit des résultats consommables par le **World Engine** et l'**Intelligence Engine**.

---

# 3. Principes fondamentaux

Le Flood Engine respecte les principes suivants :

1. Séparer observation et calcul.
2. Séparer calcul et prédiction.
3. Séparer prédiction et simulation.
4. Conserver les hypothèses utilisées.
5. Conserver les données d'entrée.
6. Conserver les résultats.
7. Conserver le modèle ou la méthode utilisée.
8. Indiquer les incertitudes lorsque possible.
9. Ne jamais présenter automatiquement une simulation comme une observation réelle.
10. Ne pas prendre de décision critique de manière autonome.

---

# 4. Entrées principales

Le Flood Engine peut utiliser :

* précipitations ;
* niveaux d'eau ;
* débits ;
* altitude ;
* pente ;
* cours d'eau ;
* drainage ;
* sols ;
* bâtiments ;
* routes ;
* infrastructures ;
* occupation du sol ;
* historique des inondations ;
* observations terrain ;
* données satellites ;
* données météorologiques ;
* données hydrologiques.

---

# 5. Module Rainfall

Le module **Rainfall** gère les données de précipitation.

Il peut représenter :

* quantité de pluie ;
* intensité ;
* durée ;
* localisation ;
* période ;
* cumul ;
* historique.

Exemple :

```text
Pluie
│
├── 20 mm
├── 50 mm
├── 100 mm
└── 150 mm
```

---

# 6. Module Water Level

Ce module gère les niveaux d'eau.

Exemples :

* rivière ;
* lac ;
* canal ;
* bassin ;
* zone urbaine ;
* station de mesure.

Une mesure doit pouvoir contenir :

* valeur ;
* unité ;
* position ;
* date ;
* source ;
* qualité ;
* confiance.

---

# 7. Module Hydrology

Le module hydrologique regroupe les calculs liés au comportement de l'eau.

Il peut intégrer progressivement :

* débit ;
* ruissellement ;
* accumulation ;
* infiltration ;
* drainage ;
* écoulement ;
* relation pluie-débit.

Les modèles précis seront sélectionnés dans les documents techniques ultérieurs.

---

# 8. Module Terrain

Le Flood Engine exploite le relief.

Données principales :

* altitude ;
* pente ;
* direction d'écoulement ;
* zones basses ;
* dépressions ;
* bassins.

Exemple conceptuel :

```text
        ▲
       / \
      /   \
     /     \
    /       \____
   /             \___
```

L'eau tend à suivre certaines caractéristiques du relief.

---

# 9. Module Drainage

Le système peut représenter :

* canalisations ;
* canaux ;
* fossés ;
* bassins de rétention ;
* stations de pompage ;
* sorties d'eau ;
* réseaux de drainage.

Ces éléments peuvent influencer les scénarios de simulation.

---

# 10. Module Flood Zone

Ce module représente les zones touchées ou potentiellement touchées.

Une zone peut être :

* observée ;
* calculée ;
* prédite ;
* simulée.

Cette distinction est obligatoire.

---

# 11. Propagation

Le Flood Engine doit pouvoir représenter conceptuellement :

```text
Pluie
  ↓
Accumulation
  ↓
Écoulement
  ↓
Propagation
  ↓
Zone touchée
  ↓
Évolution temporelle
```

La propagation peut être représentée spatialement et temporellement.

---

# 12. Risque

Le risque peut dépendre de plusieurs facteurs :

```text
Risque
   =
Danger
   +
Exposition
   +
Vulnérabilité
```

Cette formule est conceptuelle.

Les méthodes de calcul exactes seront définies ultérieurement.

---

# 13. Exposition

L'exposition représente les éléments présents dans une zone susceptible d'être touchée.

Exemples :

* population ;
* bâtiments ;
* routes ;
* écoles ;
* hôpitaux ;
* infrastructures ;
* activités économiques.

---

# 14. Vulnérabilité

La vulnérabilité peut concerner :

* personnes ;
* bâtiments ;
* infrastructures ;
* routes ;
* activités ;
* services essentiels.

Elle peut être représentée par des données qualitatives ou quantitatives selon les sources disponibles.

---

# 15. Risk Engine

Le moteur de risque peut produire :

* niveau de risque ;
* zone concernée ;
* facteurs contributifs ;
* données utilisées ;
* méthode ;
* date de calcul ;
* niveau de confiance.

Exemple :

```text
ZONE A

Danger       : élevé
Exposition   : élevée
Vulnérabilité: moyenne

Résultat :
Risque élevé
```

Ce résultat doit rester traçable.

---

# 16. Scénarios

Un scénario décrit une situation hypothétique.

Exemple :

```text
SCÉNARIO 001

Pluie :
120 mm

Durée :
3 heures

Zone :
Quartier X

Drainage :
Fonctionnement normal
```

---

# 17. Simulation

Une simulation exécute un scénario.

```text
Scénario
   ↓
Paramètres
   ↓
Modèle
   ↓
Simulation
   ↓
Résultats
```

---

# 18. Résultats de simulation

Les résultats peuvent contenir :

* zones touchées ;
* profondeur estimée ;
* durée ;
* vitesse ;
* progression ;
* infrastructures concernées ;
* routes concernées ;
* évolution temporelle.

---

# 19. Comparaison simulation / réalité

Une fonctionnalité importante consiste à comparer :

```text
OBSERVATION RÉELLE
        VS
RÉSULTAT SIMULÉ
```

Cela permet d'évaluer la pertinence d'un modèle.

---

# 20. Calibration

Lorsqu'une méthode ou un modèle est utilisé, les paramètres peuvent être ajustés grâce à des observations historiques.

Exemple :

```text
Observations historiques
          ↓
     Calibration
          ↓
    Modèle amélioré
          ↓
      Simulation
```

---

# 21. Incertitude

Le système doit éviter les affirmations absolues.

Une simulation peut être accompagnée de :

* intervalle ;
* marge ;
* niveau de confiance ;
* hypothèses ;
* limites du modèle.

---

# 22. Temporalité

Le Flood Engine doit gérer :

### Passé

Analyse d'événements historiques.

### Présent

Analyse de la situation actuelle.

### Futur

Prévisions et scénarios.

---

# 23. Chaîne de traitement

```text
DONNÉES
   │
   ▼
VALIDATION
   │
   ▼
PRÉPARATION
   │
   ▼
CALCUL
   │
   ▼
ANALYSE
   │
   ▼
RÉSULTATS
   │
   ▼
WORLD ENGINE
```

---

# 24. Architecture interne

```text
┌──────────────────────────────────────┐
│           FLOOD ENGINE               │
├──────────────────────────────────────┤
│ Rainfall Manager                     │
│ Water Level Manager                  │
│ Hydrology Manager                    │
│ Terrain Manager                      │
│ Drainage Manager                     │
│ Flood Zone Manager                   │
│ Propagation Engine                   │
│ Risk Engine                          │
│ Vulnerability Engine                 │
│ Scenario Manager                     │
│ Simulation Engine                    │
│ Result Manager                       │
└──────────────────┬───────────────────┘
                   │
             GEO/DATA ENGINE
```

---

# 25. Traitement asynchrone

Les simulations lourdes ne doivent pas bloquer l'application.

Exemple :

```text
Utilisateur
    ↓
Créer simulation
    ↓
File de traitement
    ↓
Calcul
    ↓
Résultat
    ↓
Notification
```

---

# 26. Validation des entrées

Avant un calcul, le système doit vérifier :

* présence des données nécessaires ;
* unités ;
* valeurs aberrantes ;
* couverture spatiale ;
* couverture temporelle ;
* compatibilité des données ;
* paramètres obligatoires.

---

# 27. Gestion des erreurs

Une simulation peut échouer.

Le système doit conserver :

* statut ;
* erreur ;
* paramètres ;
* date ;
* contexte ;
* logs techniques.

Exemple :

```text
SIMULATION
    ↓
FAILED

Cause :
Données topographiques insuffisantes
```

---

# 28. Historique des simulations

Chaque simulation doit pouvoir être retrouvée.

Informations :

* auteur ;
* scénario ;
* modèle ;
* paramètres ;
* date ;
* version ;
* résultats ;
* statut.

---

# 29. Offline

Le Flood Engine peut fonctionner offline pour certaines opérations :

* consultation de données ;
* analyse locale légère ;
* création de scénarios ;
* consultation de simulations déjà disponibles.

Les calculs lourds peuvent nécessiter davantage de ressources selon le modèle retenu.

---

# 30. Relation avec l'Intelligence Engine

L'Intelligence Engine peut aider à :

* analyser les résultats ;
* détecter des anomalies ;
* interpréter des observations ;
* extraire des informations ;
* produire des résumés.

Cependant :

> L'IA ne doit pas remplacer les calculs déterministes lorsque ceux-ci sont nécessaires.

---

# 31. Décisions de conception

1. Le Flood Engine est séparé du World Engine.
2. Il gère les calculs spécialisés liés aux inondations.
3. Les observations et résultats sont séparés.
4. Les scénarios sont séparés des observations réelles.
5. Les simulations sont traçables.
6. Les hypothèses sont conservées.
7. Les incertitudes doivent être représentables.
8. Les traitements lourds sont asynchrones.
9. Les méthodes précises seront choisies ultérieurement.
10. Aucun résultat ne doit être présenté comme une certitude absolue.

---

# 32. Préparation du DOCUMENT014

Le prochain document définira l'architecture de l'**Intelligence Engine**.

---

# 33. État du document

**DOCUMENT013 : TERMINÉ — VERSION 1.0**


---

## Complément — données météo et observations terrain en Côte d'Ivoire (29 octobre 2026)

Le Flood Engine doit pouvoir combiner plusieurs familles de données, sans confondre leurs significations : observations de capteurs, précipitations mesurées, prévisions météorologiques, niveaux d'eau, données de terrain, topographie et informations hydrologiques. Une prévision météo contribue à l'estimation d'un risque mais ne constitue pas à elle seule une confirmation d'inondation.

Les intégrations météorologiques doivent être sélectionnées après une évaluation documentée de la couverture de la Côte d'Ivoire, de la résolution spatiale/temporelle, de la fraîcheur, des licences, des quotas, des clés et des coûts éventuels. Les calculs doivent tenir compte des absences de données et exposer les limites de confiance.

La couverture fonctionnelle cible comprend tout le territoire ivoirien. Les zones disposant de capteurs ou de données haute résolution peuvent être plus détaillées que les autres, sans que les zones moins instrumentées soient exclues de la carte.
