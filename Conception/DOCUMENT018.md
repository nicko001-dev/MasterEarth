# DOCUMENT018 — SYSTÈME DE SIMULATION & SCÉNARIOS

**Projet :** IntelliFlood
**Type :** Architecture fonctionnelle et technique
**Version :** 1.0
**Statut :** Conception
**Date :** 30 septembre 2026

---

# 1. Objet du document

Ce document définit le système de scénarios et de simulation d'IntelliFlood.

Son objectif est de permettre de répondre à des questions de type :

> "Que pourrait-il se passer si certaines conditions changeaient ?"

---

# 2. Principe fondamental

Une simulation est une représentation calculée d'une situation hypothétique.

Elle ne doit jamais être confondue automatiquement avec une observation réelle.

```text
RÉALITÉ
   │
   ├── Observations
   │
   └── Mesures

HYPOTHÈSE
   │
   └── Scénario
          ↓
      Simulation
          ↓
       Résultat
```

---

# 3. Scénario

Un scénario définit :

* une zone ;
* une période ;
* des conditions ;
* des paramètres ;
* un modèle ;
* des hypothèses.

---

# 4. Exemple de scénario

```text
SCÉNARIO : SF-001

Zone :
Quartier X

Précipitations :
120 mm

Durée :
3 heures

État du drainage :
Normal

Période :
14:00 → 17:00
```

---

# 5. Paramètres

Les paramètres peuvent concerner :

* pluie ;
* niveau initial ;
* débit ;
* drainage ;
* topographie ;
* occupation du sol ;
* infrastructures ;
* conditions initiales ;
* durée ;
* résolution spatiale ;
* résolution temporelle.

---

# 6. Modèles

Une simulation doit identifier le modèle utilisé.

```text
Simulation
   ↓
Modèle
   ↓
Version du modèle
   ↓
Paramètres
```

---

# 7. Reproductibilité

Une simulation doit pouvoir être reproduite autant que possible.

Il faut donc conserver :

* données d'entrée ;
* paramètres ;
* modèle ;
* version ;
* date ;
* configuration ;
* environnement pertinent.

---

# 8. Cycle d'une simulation

```text
CREATED
   ↓
CONFIGURED
   ↓
VALIDATED
   ↓
QUEUED
   ↓
RUNNING
   ↓
COMPLETED
```

En cas de problème :

```text
RUNNING
   ↓
FAILED
```

---

# 9. Création

L'utilisateur autorisé crée un scénario.

```text
Zone
 ↓
Conditions
 ↓
Paramètres
 ↓
Modèle
 ↓
Nom du scénario
```

---

# 10. Validation

Avant exécution :

* vérifier les paramètres ;
* vérifier les données ;
* vérifier les unités ;
* vérifier la zone ;
* vérifier les données nécessaires ;
* détecter les incohérences.

---

# 11. Exécution

Une simulation peut être exécutée :

* localement ;
* sur un serveur ;
* sur une machine spécialisée ;
* dans un environnement de calcul dédié.

Le choix dépendra de la complexité du modèle.

---

# 12. Traitement asynchrone

Une simulation lourde doit être traitée comme un job.

```text
Utilisateur
    ↓
Lancer
    ↓
JOB
    ↓
File
    ↓
Worker
    ↓
Simulation
    ↓
Résultats
```

---

# 13. Résultats

Les résultats peuvent contenir :

* cartes ;
* zones ;
* profondeur ;
* durée ;
* vitesse ;
* évolution temporelle ;
* statistiques ;
* infrastructures affectées.

---

# 14. Résultats géographiques

Les résultats peuvent être représentés sous forme de :

* points ;
* lignes ;
* polygones ;
* raster ;
* volumes 3D ;
* séries temporelles.

---

# 15. Résultats temporels

Exemple :

```text
14:00 → 0 cm
15:00 → 15 cm
16:00 → 40 cm
17:00 → 65 cm
```

Ces données peuvent être visualisées dans la timeline du World Engine.

---

# 16. Comparaison

IntelliFlood doit pouvoir comparer :

```text
Simulation A
VS
Simulation B
```

ou :

```text
Simulation
VS
Observation réelle
```

---

# 17. Scénarios multiples

Un utilisateur peut créer plusieurs scénarios.

Exemple :

```text
Scénario A
Pluie : 50 mm

Scénario B
Pluie : 100 mm

Scénario C
Pluie : 150 mm
```

Les résultats peuvent ensuite être comparés.

---

# 18. Analyse de sensibilité

Lorsque le modèle le permet, le système peut étudier l'effet d'une variation de paramètre.

Exemple :

```text
Pluie
50 → 100 → 150 mm
```

Puis observer l'évolution du résultat.

---

# 19. Versionnement

Un scénario modifié peut produire une nouvelle version.

```text
Scénario 1
   │
   ├── Version 1
   ├── Version 2
   └── Version 3
```

Les anciennes versions restent identifiables.

---

# 20. Comparaison de versions

Le système peut afficher :

```text
Version 1
VS
Version 2

Paramètre modifié :
Pluie

100 mm → 150 mm
```

---

# 21. Scénarios enregistrés

Les scénarios peuvent être :

* privés ;
* partagés ;
* publics selon permissions ;
* archivés.

---

# 22. Collaboration

Plusieurs utilisateurs autorisés peuvent :

* consulter ;
* commenter ;
* modifier ;
* dupliquer ;
* valider.

Les permissions déterminent les actions possibles.

---

# 23. Annotation

Un analyste peut ajouter :

> "Cette zone présente une forte sensibilité à l'augmentation du niveau d'eau."

L'annotation est liée au scénario ou au résultat.

---

# 24. Visualisation

Les résultats doivent pouvoir être envoyés au World Engine.

```text
Simulation
   ↓
Résultats
   ↓
Geo/Data Engine
   ↓
World Engine
   ↓
Carte / 3D / Timeline
```

---

# 25. Simulation et Intelligence Engine

L'Intelligence Engine peut assister :

* création de scénario ;
* choix de données ;
* interprétation ;
* comparaison ;
* résumé ;
* génération de rapport.

Mais la simulation elle-même reste exécutée par le moteur spécialisé approprié.

---

# 26. Rapport de simulation

Un rapport peut contenir :

```text
Titre
Zone
Date
Scénario
Hypothèses
Modèle
Paramètres
Résultats
Limites
Auteur
Version
```

---

# 27. Limites

Chaque simulation doit pouvoir indiquer ses limites.

Exemples :

* données incomplètes ;
* résolution insuffisante ;
* modèle simplifié ;
* hypothèses fortes ;
* incertitude élevée.

---

# 28. Gestion des erreurs

En cas d'échec :

```text
Simulation
   ↓
FAILED
   ↓
Erreur enregistrée
   ↓
Utilisateur informé
```

Le système doit conserver suffisamment d'informations pour diagnostiquer le problème.

---

# 29. Sécurité

Une simulation peut utiliser des données sensibles.

Les permissions doivent donc contrôler :

* création ;
* consultation ;
* modification ;
* exécution ;
* partage ;
* suppression.

---

# 30. Offline

Hors connexion, il peut être possible de :

* créer un scénario ;
* modifier un scénario local ;
* consulter une simulation déjà téléchargée ;
* préparer des paramètres.

L'exécution dépendra des ressources disponibles.

---

# 31. Architecture

```text
┌─────────────────────────────────────────┐
│       SIMULATION ENGINE                 │
├─────────────────────────────────────────┤
│ Scenario Manager                        │
│ Parameter Manager                       │
│ Model Manager                           │
│ Validation Engine                       │
│ Simulation Runner                       │
│ Job Manager                             │
│ Result Manager                          │
│ Version Manager                         │
│ Comparison Engine                       │
└────────────────────┬────────────────────┘
                     │
              GEO/DATA ENGINE
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
    WORLD ENGINE         INTELLIGENCE
                              ENGINE
```

---

# 32. Reproductibilité technique

Chaque résultat important doit pouvoir être relié à :

```text
Scenario ID
+
Scenario Version
+
Model ID
+
Model Version
+
Input Data
+
Parameters
```

---

# 33. Traçabilité

La chaîne complète doit être identifiable :

```text
DONNÉES
   ↓
SCÉNARIO
   ↓
MODÈLE
   ↓
PARAMÈTRES
   ↓
SIMULATION
   ↓
RÉSULTATS
   ↓
ANALYSE
   ↓
RAPPORT
```

---

# 34. Décisions de conception

1. Les scénarios sont distincts des observations.
2. Une simulation est toujours associée à un scénario.
3. Le modèle et sa version sont conservés.
4. Les paramètres sont historisés.
5. Les simulations lourdes sont exécutées de manière asynchrone.
6. Les résultats sont géospatiaux et temporels lorsque pertinent.
7. Les simulations peuvent être comparées.
8. Les scénarios sont versionnés.
9. La reproductibilité est un objectif fondamental.
10. Les limites et hypothèses sont conservées.
11. Les résultats peuvent être visualisés dans le World Engine.
12. L'Intelligence Engine peut assister l'analyse sans remplacer le moteur de simulation.

---

# 35. Préparation du DOCUMENT019

Le prochain document définira :

**API & contrats d'échange**

Il permettra de préciser comment :

* le frontend communique avec le backend ;
* les moteurs communiquent entre eux ;
* les données sont échangées ;
* les systèmes externes sont intégrés ;
* les événements circulent ;
* les contrats sont versionnés.

---

# 36. État du document

**DOCUMENT018 : TERMINÉ — VERSION 1.0**


---

## Complément — simulations 3D et portée territoriale (29 octobre 2026)

Les simulations d'inondation doivent s'appuyer sur un état du monde, des paramètres, des données d'entrée et des hypothèses explicitement identifiés. La visualisation 3D améliore la compréhension spatiale, mais ne garantit pas à elle seule la validité hydrologique du résultat. La résolution, la qualité du modèle et les données disponibles déterminent la portée des conclusions.

L'architecture vise le territoire ivoirien dans son ensemble et doit rester compatible avec l'exploration mondiale du World Engine. Des simulations détaillées peuvent être disponibles uniquement pour certaines zones lorsque les données de terrain, l'altimétrie, l'hydrologie ou la calibration sont insuffisantes ailleurs. L'interface doit indiquer les limites de chaque scénario et ne pas afficher une simulation illustrative comme une prévision opérationnelle validée.
