# DOCUMENT044 — ARCHITECTURE DU MOTEUR DE SIMULATION

**Projet : IntelliFlood**
**Version : 1.0**
**Statut : Spécification technique**
**Dépendances : DOCUMENT037, DOCUMENT041, DOCUMENT042, DOCUMENT043**

---

# 1. Objectif

Le Simulation Engine permet à IntelliFlood d'explorer des situations hypothétiques sans modifier l'état réel du monde.

Il constitue une séparation fondamentale entre :

```text
REAL WORLD
    │
    │ snapshot / données
    ▼
SIMULATION
    │
    ▼
SCENARIO
    │
    ▼
RESULT
```

Une simulation ne doit jamais être considérée comme une observation réelle.

---

# 2. Principe fondamental

Le système doit distinguer :

| Nature         | Signification                            |
| -------------- | ---------------------------------------- |
| OBSERVATION    | donnée réellement observée               |
| CALCULATION    | résultat d'un calcul déterministe        |
| ESTIMATION     | valeur approximée                        |
| PREDICTION     | projection future                        |
| SIMULATION     | résultat d'un scénario hypothétique      |
| INTERPRETATION | explication produite à partir de données |

Cette distinction est obligatoire dans les métadonnées des résultats.

---

# 3. Architecture générale

```text
                         SIMULATION ENGINE
                                │
             ┌──────────────────┼──────────────────┐
             │                  │                  │
             ▼                  ▼                  ▼
        Scenario Manager   Model Manager      Data Manager
             │                  │                  │
             └──────────────────┼──────────────────┘
                                ▼
                         Simulation Runner
                                │
                                ▼
                         Result Processor
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
              Result Store             Validation
                    │                       │
                    └───────────┬───────────┘
                                ▼
                         Simulation Result
```

---

# 4. Scenario

Un scénario représente les hypothèses utilisées pour une simulation.

Il peut contenir :

```text
Identité
Description
Variables
Paramètres
Hypothèses
Zone géographique
Période
Modèle utilisé
Version du modèle
Créateur
Date
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

---

# 5. Séparation scénario / simulation

Un scénario définit les conditions.

Une simulation exécute ces conditions.

```text
Scenario
   │
   ├── Parameters
   ├── Constraints
   └── Assumptions
          │
          ▼
      Simulation Run
          │
          ▼
        Results
```

---

# 6. Snapshot du monde réel

Une simulation peut partir d'un état connu du monde.

```text
Current World
     │
     ▼
Snapshot
     │
     ▼
Simulation State
```

Le snapshot doit conserver suffisamment de métadonnées pour permettre de savoir à partir de quel état la simulation a été lancée.

---

# 7. Isolation du réel

Règle fondamentale :

> Une simulation ne modifie jamais directement le World State réel.

Architecture :

```text
REAL WORLD STATE
       │
       │ COPY
       ▼
SIMULATION STATE
       │
       ▼
Simulation
       │
       ▼
Result
```

---

# 8. Simulation Run

Chaque exécution doit disposer d'un identifiant.

```text
simulation_run_id
```

Une exécution doit permettre de retrouver :

* le scénario ;
* le snapshot ;
* le modèle ;
* les paramètres ;
* la version ;
* le résultat ;
* le statut ;
* les erreurs éventuelles.

---

# 9. États d'une simulation

Exemple :

```text
CREATED
QUEUED
RUNNING
COMPLETED
FAILED
CANCELLED
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

Les valeurs finales devront être définies dans le modèle de domaine.

---

# 10. Simulation synchrone et asynchrone

Les petites simulations peuvent être exécutées directement.

```text
Request
  ↓
Simulation
  ↓
Result
```

Les simulations longues doivent utiliser les workers.

```text
Request
  ↓
Create Job
  ↓
Queue
  ↓
Worker
  ↓
Simulation
  ↓
Result
```

---

# 11. Modèles de simulation

Le Simulation Engine doit pouvoir utiliser plusieurs familles de modèles.

Exemples :

```text
Rule-based models
Mathematical models
Hydrological models
Hydraulic models
Statistical models
Agent-based models
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

Aucun modèle scientifique précis ne doit être inventé simplement pour remplir l'architecture.

---

# 12. Modèle comme composant interchangeable

Architecture :

```text
Simulation Engine
       │
       ▼
Model Interface
       │
       ├── Model A
       ├── Model B
       └── Model C
```

Le moteur ne doit pas être fortement couplé à un seul modèle scientifique.

---

# 13. Entrées

Les entrées peuvent être :

```text
Observations
Measurements
Geospatial data
Historical data
World snapshot
Scenario parameters
External datasets
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

Chaque entrée doit conserver sa provenance.

---

# 14. Sorties

Les résultats peuvent comprendre :

```text
Spatial outputs
Temporal outputs
Indicators
States
Probabilities
Estimated impacts
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

Chaque sortie doit être explicitement identifiée comme résultat de simulation.

---

# 15. Incertitude

Les simulations scientifiques peuvent comporter des incertitudes.

Le système doit permettre de représenter :

```text
Input uncertainty
Model uncertainty
Parameter uncertainty
Output uncertainty
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

---

# 16. Simulation déterministe

Si :

```text
Inputs identiques
+
Parameters identiques
+
Model version identique
```

alors le résultat devrait être reproductible lorsque le modèle utilisé le permet.

Cette propriété doit être testée lorsque cela est pertinent.

---

# 17. Simulation stochastique

Certains modèles utilisent des éléments aléatoires.

Dans ce cas, lorsque le modèle le permet, le système doit pouvoir conserver :

```text
Random seed
Model version
Parameters
Input snapshot
```

afin de faciliter la reproduction.

---

# 18. Résultats géographiques

Une simulation peut produire des résultats géographiques.

```text
Simulation
    ↓
Spatial Result
    ↓
Geo Engine
    ↓
Map
```

Les résultats peuvent être visualisés sous forme de :

```text
Zones
Contours
Grilles
Points
Trajectoires
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

---

# 19. Exemple conceptuel

```text
Scenario
   │
   ├── Rainfall assumption
   ├── Initial water level
   └── Geographic area
          │
          ▼
      Simulation
          │
          ▼
    Predicted extent
          │
          ▼
       Map Layer
```

⚠️ **EXEMPLE NON EXHAUSTIF ET NON SCIENTIFIQUE.**

Il ne constitue pas une formule de simulation à implémenter.

---

# 20. Validation

Avant de rendre un résultat exploitable :

```text
Simulation
   ↓
Technical validation
   ↓
Domain validation
   ↓
Result
```

Les résultats incohérents doivent être signalés.

---

# 21. Provenance

Un résultat de simulation doit pouvoir répondre à :

```text
Quel scénario ?
Quel modèle ?
Quelle version ?
Quelles données ?
Quels paramètres ?
Quel moment ?
Quel utilisateur ?
```

---

# 22. Comparaison de simulations

Le système peut permettre de comparer plusieurs simulations.

Exemple :

```text
Scenario A
      │
      ├── Result A
      │
      ▼
Comparison

Scenario B
      │
      ├── Result B
      │
      ▼
Comparison
```

⚠️ **EXEMPLE NON EXHAUSTIF.**

---

# 23. Simulation et IA

L'IA peut assister :

* la formulation d'un scénario ;
* l'explication d'un résultat ;
* la comparaison de résultats ;
* la génération d'un résumé.

Mais :

> L'IA ne doit pas être considérée comme le moteur scientifique de la simulation.

Architecture :

```text
User
 ↓
Intelligence Engine
 ↓
Simulation Tool
 ↓
Simulation Engine
 ↓
Validated Result
 ↓
Intelligence Engine
 ↓
Explanation
```

---

# 24. Audit

Chaque simulation importante doit être auditable.

```text
Scenario
   ↓
Snapshot
   ↓
Parameters
   ↓
Model
   ↓
Execution
   ↓
Result
```

---

# 25. Permissions

Les simulations doivent respecter les permissions utilisateur.

Certaines simulations peuvent nécessiter des droits particuliers selon leur nature.

Les règles exactes restent à définir selon les exigences fonctionnelles.

---

# 26. Performance

Les simulations longues doivent être exécutées hors du thread HTTP principal.

Le système doit pouvoir suivre leur progression lorsque cela est nécessaire.

---

# 27. Stockage

Les métadonnées sont stockées dans PostgreSQL.

Les résultats volumineux peuvent nécessiter un stockage spécialisé.

```text
Metadata
   ↓
PostgreSQL

Large Result
   ↓
Object Storage / Specialized Storage
```

La stratégie exacte dépendra du volume réel.

---

# 28. Tests

Les tests doivent couvrir :

```text
Scenario validation
Snapshot isolation
Model execution
Result validation
Reproducibility
Permissions
Failure handling
Simulation isolation
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

---

# 29. Décisions SIM

| ID      | Décision                                             |
| ------- | ---------------------------------------------------- |
| SIM-001 | Simulation séparée du monde réel                     |
| SIM-002 | Snapshot utilisé lorsque nécessaire                  |
| SIM-003 | Simulation versionnée                                |
| SIM-004 | Modèles interchangeables                             |
| SIM-005 | Résultats explicitement marqués SIMULATION           |
| SIM-006 | Simulation longue exécutée par worker                |
| SIM-007 | Provenance obligatoire                               |
| SIM-008 | Résultats validés avant utilisation critique         |
| SIM-009 | IA auxiliaire, jamais source scientifique unique     |
| SIM-010 | Simulation ne modifie jamais silencieusement le réel |

---

# 30. Principe final

> **Le Simulation Engine permet d'explorer “ce qui pourrait arriver” sans jamais confondre cette hypothèse avec “ce qui est réellement arrivé”.**


---

## Complément — validation des simulations (29 octobre 2026)

Les simulations 3D peuvent couvrir différentes échelles spatiales, mais leur domaine de validité doit être lié aux données topographiques, hydrologiques, pluviométriques et de terrain disponibles. La couverture cartographique nationale ne garantit pas qu'une simulation fiable est calculable pour chaque localité.

Tout scénario doit préciser s'il est illustratif, exploratoire ou validé pour un usage opérationnel, ainsi que ses hypothèses et incertitudes. Les exemples de zones pilotes, notamment Cocody, ne sont pas des limites géographiques du moteur.
