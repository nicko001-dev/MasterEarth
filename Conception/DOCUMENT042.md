# DOCUMENT042 — ARCHITECTURE DÉTAILLÉE DU FLOOD ENGINE

**Projet : IntelliFlood**
**Version : 1.0**
**Statut : Spécification technique**
**Dépendances : DOCUMENT031, DOCUMENT036, DOCUMENT037, DOCUMENT041**

---

# 1. Objectif

Le Flood Engine constitue le moteur spécialisé d'IntelliFlood pour la compréhension et l'analyse des phénomènes d'inondation.

Il doit transformer des données brutes ou préparées en informations exploitables.

```text
Données
   ↓
Flood Engine
   ↓
Analyse
   ↓
État / événement / estimation / prédiction
   ↓
Applications
```

---

# 2. Principe fondamental

Le Flood Engine ne doit pas être confondu avec l'Intelligence Engine.

### Flood Engine

Responsable des règles et calculs spécifiques aux phénomènes d'inondation.

### Intelligence Engine

Responsable de l'orchestration, de l'analyse assistée et de l'interprétation.

```text
                    IntelliFlood
                         │
            ┌────────────┴────────────┐
            │                         │
       Flood Engine             Intelligence Engine
            │                         │
       Calculs métier             IA / Analyse
       déterministes              / Orchestration
```

---

# 3. Entrées du Flood Engine

Les données peuvent provenir de :

* observations ;
* mesures ;
* capteurs ;
* événements historiques ;
* données géographiques ;
* données météorologiques ;
* données hydrologiques ;
* données environnementales ;
* simulations.

⚠️ **EXEMPLES NON EXHAUSTIFS.**

Toutes les sources doivent être identifiées et conserver leur provenance.

---

# 4. Architecture

```text
                    FLOOD ENGINE
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
   Data Processor   Event Engine    Analysis Engine
        │                │                │
        └────────────────┼────────────────┘
                         ▼
                  Risk/State Engine
                         │
                         ▼
                 Prediction Interface
                         │
                         ▼
                   Flood Results
```

---

# 5. Modules

Architecture indicative :

```text
backend/modules/flood/
│
├── domain/
│   ├── events/
│   ├── states/
│   ├── zones/
│   ├── measurements/
│   └── rules/
│
├── application/
│   ├── analysis/
│   ├── detection/
│   ├── prediction/
│   └── services/
│
├── infrastructure/
│
├── api/
│
└── tests/
```

---

# 6. Flood Event

Un événement d'inondation représente un phénomène identifié.

Il peut posséder :

```text
Identifiant
Localisation
Début
Fin
Statut
Source
Sévérité
Description
Provenance
```

⚠️ La liste est **non exhaustive**.

---

# 7. États

Le moteur peut représenter différents états.

Exemple :

```text
NORMAL
WATCH
WARNING
FLOODING
RECOVERY
```

⚠️ Ces valeurs sont des **exemples non exhaustifs** et ne doivent pas être considérées comme les valeurs définitives avant validation fonctionnelle.

---

# 8. Détection

La détection consiste à déterminer si une condition observable correspond à une règle ou à un phénomène connu.

```text
Observation
    ↓
Validation
    ↓
Rule Engine
    ↓
Condition ?
   / \
 Non  Oui
       ↓
    Detection
```

---

# 9. Règles déterministes

Les règles critiques doivent être explicites.

Exemple conceptuel :

```text
SI
    niveau_eau > seuil
ET
    durée > durée_minimale
ALORS
    condition détectée
```

⚠️ Ceci est un **exemple pédagogique**, pas une règle métier définitive.

---

# 10. Seuils

Les seuils doivent être :

* documentés ;
* versionnés ;
* associés à une source ;
* contextualisés ;
* modifiables uniquement par des utilisateurs autorisés.

Un seuil ne doit pas être codé en dur sans justification.

---

# 11. Analyse temporelle

Le Flood Engine doit pouvoir analyser l'évolution temporelle.

```text
Temps
 │
 │              /
 │            /
 │          /
 │        /
 │______/________________
```

Cela peut permettre d'étudier :

* évolution ;
* tendance ;
* variation ;
* vitesse de changement.

⚠️ **EXEMPLES NON EXHAUSTIFS.**

---

# 12. Analyse spatiale

Le moteur doit pouvoir exploiter :

```text
Flood Engine
     │
     ▼
Geo Engine
     │
     ▼
Spatial Analysis
```

Exemples :

* zones touchées ;
* proximité d'une infrastructure ;
* extension spatiale ;
* intersection avec une zone.

⚠️ **EXEMPLES NON EXHAUSTIFS.**

---

# 13. Données de capteurs

Les mesures issues de capteurs doivent être distinguées des événements calculés.

```text
Sensor
  ↓
Measurement
  ↓
Observation
  ↓
Flood Analysis
  ↓
Derived Result
```

Le résultat calculé ne doit pas remplacer la donnée originale.

---

# 14. Provenance

Chaque résultat important doit pouvoir répondre à :

```text
Quelle donnée ?
Quelle source ?
Quelle période ?
Quelle méthode ?
Quelle version de règle ?
```

---

# 15. Qualité des données

Avant un calcul critique :

```text
Raw Data
  ↓
Validation
  ↓
Quality Check
  ↓
Accepted / Rejected / Uncertain
  ↓
Calculation
```

Une donnée invalide ne doit pas être silencieusement utilisée comme donnée fiable.

---

# 16. Incertitude

Certains résultats peuvent être incertains.

Le système doit pouvoir distinguer :

```text
Valeur observée
Valeur calculée
Valeur estimée
Valeur prédite
```

Une prédiction ne doit jamais être présentée comme une observation.

---

# 17. Prediction

Le Flood Engine peut exposer une interface de prédiction.

```text
Historical Data
       +
Current Data
       +
Model / Algorithm
       ↓
Prediction
       ↓
Uncertainty
```

Les modèles exacts doivent être déterminés séparément.

---

# 18. Simulation

Une simulation permet d'explorer un scénario hypothétique.

```text
Scenario
   ↓
Simulation Engine
   ↓
Simulated State
```

Le résultat d'une simulation doit être explicitement marqué comme simulation.

---

# 19. Scénarios

Un scénario peut définir un ensemble d'hypothèses.

Exemples :

```text
augmentation d'une mesure
modification d'une condition
événement hypothétique
variation environnementale
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

---

# 20. Risk Engine

Le système peut produire une représentation du risque à partir de plusieurs facteurs.

Conceptuellement :

```text
Hazard
  +
Exposure
  +
Vulnerability
  ↓
Risk Analysis
```

Les formules exactes doivent être définies scientifiquement avant implémentation.

Aucune formule arbitraire ne doit être inventée par un agent de programmation.

---

# 21. Interaction avec Intelligence Engine

Le Flood Engine produit des résultats structurés.

```text
Flood Engine
     ↓
Structured Result
     ↓
Intelligence Engine
     ↓
Explanation / Summary / Query
```

L'IA peut expliquer un résultat, mais ne doit pas modifier silencieusement le résultat déterministe.

---

# 22. Exemple d'analyse

```text
Observation
   ↓
Water level = X
   ↓
Quality validation
   ↓
Temporal analysis
   ↓
Spatial context
   ↓
Flood rules
   ↓
Result
```

⚠️ **EXEMPLE NON EXHAUSTIF.**

---

# 23. Résultat structuré

Un résultat peut conceptuellement contenir :

```json
{
  "type": "calculation",
  "value": {},
  "confidence": {},
  "source": {},
  "method": {},
  "timestamp": {}
}
```

⚠️ Cet objet est uniquement un **exemple architectural non exhaustif**.

Le contrat final doit être défini dans l'API.

---

# 24. Audit

Les calculs critiques doivent être traçables.

Il doit être possible de retrouver :

```text
Entrées
 ↓
Version de l'algorithme
 ↓
Paramètres
 ↓
Calcul
 ↓
Résultat
```

---

# 25. Versionnement

Les règles scientifiques et algorithmes doivent pouvoir être versionnés.

Exemple :

```text
Flood Rule v1
Flood Rule v2
```

Un ancien résultat ne doit pas devenir incompréhensible après modification d'une règle.

---

# 26. Tests

Les tests doivent couvrir :

```text
Rules
Thresholds
Temporal analysis
Spatial analysis
Data quality
Prediction interfaces
Simulation
Audit
Versioning
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

---

# 27. Performance

Les calculs lourds ne doivent pas bloquer inutilement l'API.

```text
Request
  ↓
Job
  ↓
Worker
  ↓
Flood Calculation
  ↓
Result
```

Les calculs simples peuvent rester synchrones.

---

# 28. Sécurité

Le Flood Engine doit respecter :

* authentification ;
* autorisation ;
* isolation tenant ;
* audit ;
* validation des paramètres.

---

# 29. Offline

Certaines analyses simples peuvent être réalisées localement si les données et algorithmes nécessaires sont disponibles.

Cependant :

> Le client Offline ne doit pas prétendre disposer d'un résultat qu'il ne peut réellement calculer.

---

# 30. Décisions FLOOD

| ID        | Décision                                             |
| --------- | ---------------------------------------------------- |
| FLOOD-001 | Flood Engine séparé de Intelligence Engine           |
| FLOOD-002 | Calculs critiques déterministes                      |
| FLOOD-003 | Données originales conservées                        |
| FLOOD-004 | Provenance obligatoire                               |
| FLOOD-005 | Résultats distingués par nature                      |
| FLOOD-006 | Seuils versionnés                                    |
| FLOOD-007 | Algorithmes versionnés                               |
| FLOOD-008 | Simulations explicitement identifiées                |
| FLOOD-009 | IA utilisée pour assistance/interprétation           |
| FLOOD-010 | Formules scientifiques validées avant implémentation |

---

# 31. Principe final

> **Le Flood Engine calcule et structure les phénomènes d'inondation ; l'Intelligence Engine peut ensuite les interpréter, mais ne doit pas réécrire la réalité calculée.**


---

## Complément — données d'entrée et couverture nationale (29 octobre 2026)

Le Flood Engine doit accepter des données d'entrée issues de sources hétérogènes via des contrats normalisés : mesures de niveau d'eau, pluie observée, prévisions, données topographiques/hydrologiques, signalements et résultats validés de terrain. Chaque source doit conserver provenance, horodatage, unité, qualité et statut d'observation/prévision lorsque disponibles.

La cible géographique est toute la Côte d'Ivoire. La précision des analyses dépend néanmoins de la densité des observations, de la qualité des modèles et des données de terrain. Les zones moins instrumentées doivent rester représentées avec des limites explicites plutôt que recevoir des valeurs ou un niveau de confiance inventés.
