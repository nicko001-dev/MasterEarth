# DOCUMENT046 — ARCHITECTURE COMPLÈTE DE L'INTELLIGENCE ENGINE & ASSISTANT INTELLIFLOOD

**Projet : IntelliFlood**
**Version : 1.0**
**Statut : Spécification d'architecture**
**Dépendances : DOCUMENT031, DOCUMENT041, DOCUMENT042, DOCUMENT043, DOCUMENT044, DOCUMENT045**

---

# 1. Objectif

Ce document rassemble l'architecture complète du système d'intelligence d'IntelliFlood.

L'Intelligence Engine est la couche qui permet de transformer :

```text
Données
+
Connaissances
+
Outils
+
Contexte
```

en :

```text
Analyse
+
Explication
+
Assistance
+
Actions contrôlées
```

---

# 2. Principe fondamental

L'Intelligence Engine n'est pas simplement un chatbot.

```text
                    INTELLIGENCE ENGINE
                           │
          ┌────────────────┼─────────────────┐
          │                │                 │
          ▼                ▼                 ▼
     Context Engine    Tool Engine      Knowledge Engine
          │                │                 │
          └────────────────┼─────────────────┘
                           ▼
                    AI Provider
                           │
                           ▼
                    Validation Engine
                           │
                           ▼
                        Response
```

---

# 3. Architecture globale

```text
                              USER
                                │
                                ▼
                       Intelligence API
                                │
                                ▼
                         Query Router
                                │
             ┌──────────────────┼──────────────────┐
             │                  │                  │
             ▼                  ▼                  ▼
       Knowledge           Operational          Geo/Data
        Search                Tools               Tools
             │                  │                  │
             └──────────────────┼──────────────────┘
                                ▼
                         Context Engine
                                │
                                ▼
                         AI Orchestrator
                                │
                       ┌────────┴────────┐
                       ▼                 ▼
                 AI Provider          Tool Calls
                       │                 │
                       └────────┬────────┘
                                ▼
                         Validation Engine
                                │
                                ▼
                           Final Result
```

---

# 4. Intelligence Engine comme orchestrateur

L'Intelligence Engine coordonne les différents moteurs.

Il ne doit pas remplacer :

* le Flood Engine ;
* le Geo Engine ;
* le World Engine ;
* le Simulation Engine ;
* le Knowledge Engine.

Il les orchestre.

---

# 5. Les outils

L'IA doit utiliser des outils contrôlés.

Architecture :

```text
LLM
 │
 ▼
Tool Selector
 │
 ├── Flood Tool
 ├── Geo Tool
 ├── World Tool
 ├── Simulation Tool
 └── Knowledge Tool
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

---

# 6. Tool Contract

Chaque outil doit définir :

```text
Name
Description
Input schema
Output schema
Permissions
Side effects
Audit requirements
```

Un outil mal défini ne doit pas être exposé au modèle.

---

# 7. Exemple de Tool

Conceptuellement :

```json
{
  "name": "find_flood_events",
  "description": "Find flood events in a geographic area",
  "input": {
    "area": {}
  }
}
```

⚠️ **EXEMPLE NON EXHAUSTIF.**

Ce format doit être adapté au contrat réel du système.

---

# 8. Tool Safety

Chaque outil doit posséder un niveau de risque.

Conceptuellement :

```text
READ
   ↓
ANALYZE
   ↓
SIMULATE
   ↓
WRITE
   ↓
CRITICAL ACTION
```

Plus l'action est sensible, plus le contrôle doit être important.

---

# 9. Actions en lecture

Exemples :

```text
Lire une observation
Lire un événement
Chercher une zone
Lire une documentation
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

Ces opérations peuvent généralement être automatisées davantage.

---

# 10. Actions avec modification

Une action modifiant les données doit être explicitement contrôlée.

Architecture :

```text
AI
 ↓
Proposed Action
 ↓
Authorization
 ↓
Validation
 ↓
Human Approval when required
 ↓
Execution
```

---

# 11. Human-in-the-loop

Certaines opérations doivent nécessiter une validation humaine.

```text
AI proposes
    ↓
Human reviews
    ↓
Approve / Reject
    ↓
Tool execution
```

Le système ne doit pas contourner cette étape.

---

# 12. Context Engine

Le Context Engine construit le contexte utile.

Il peut combiner :

```text
User context
Temporal context
Geographic context
Operational data
Historical data
Knowledge
Simulation results
Permissions
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

---

# 13. Contexte géographique

Une question comme :

```text
"Que se passe-t-il dans cette zone ?"
```

doit être transformée en contexte structuré :

```text
Zone
 ↓
Nearby objects
 ↓
Recent observations
 ↓
Flood events
 ↓
Alerts
 ↓
Relevant knowledge
```

---

# 14. Contexte temporel

Le système doit distinguer :

```text
Current
Historical
Forecast
Simulated
```

Une donnée historique ne doit pas être présentée comme actuelle.

---

# 15. Query Router

Le Query Router détermine la stratégie nécessaire.

```text
Question
   │
   ▼
Query Router
   │
   ├── Knowledge
   ├── Data
   ├── Geo
   ├── Flood
   ├── World
   ├── Simulation
   └── Multiple
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

---

# 16. Exemple de routage

Question :

> "Quels événements d'inondation ont été observés dans cette zone cette semaine ?"

Le système peut identifier :

```text
Intent = historical/current data query
Sources = Flood Engine + Geo Engine
Temporal filter = current week
```

⚠️ **EXEMPLE NON EXHAUSTIF.**

Le LLM ne doit pas inventer les événements.

---

# 17. Question documentaire

Question :

> "Quelle est la procédure définie dans ce document ?"

Le système peut utiliser :

```text
Knowledge Engine
      ↓
Retriever
      ↓
Relevant passages
      ↓
LLM
```

---

# 18. Question nécessitant un calcul

Question :

> "Combien de stations sont dans cette zone ?"

Le système doit privilégier :

```text
Geo Tool
    ↓
Deterministic Query
    ↓
Count
    ↓
LLM explanation
```

et non :

```text
LLM guesses number
```

---

# 19. Question nécessitant plusieurs outils

Une question complexe peut suivre :

```text
Question
   ↓
Planning
   ↓
Tool A
   ↓
Tool B
   ↓
Knowledge Search
   ↓
Synthesis
```

Cette architecture correspond aux cas où une récupération simple ne suffit plus et où l'orchestrateur doit sélectionner dynamiquement les sources ou outils.

---

# 20. AI Provider Interface

Le modèle de langage doit être abstrait.

```text
Intelligence Engine
       │
       ▼
AI Provider Interface
       │
       ├── Local Provider
       ├── Self-hosted Provider
       └── External Provider
```

---

# 21. Local-first

La priorité architecturale est donnée aux modèles pouvant fonctionner localement ou être auto-hébergés.

Cela permet :

* réduction de dépendance externe ;
* fonctionnement Offline potentiel ;
* contrôle des données ;
* réduction des coûts variables.

Les technologies concrètes restent interchangeables.

---

# 22. Pas de dépendance directe

Les modules métier ne doivent jamais faire :

```text
FloodService → Ollama
```

ou :

```text
GeoService → OpenAI
```

Ils doivent utiliser les interfaces d'Intelligence Engine lorsque l'IA est réellement nécessaire.

---

# 23. Prompt Assembly

Le système construit le contexte destiné au modèle.

```text
System Rules
+
User Query
+
Retrieved Knowledge
+
Tool Results
+
Relevant Context
      ↓
Prompt
```

Les informations doivent être clairement séparées par nature.

---

# 24. Provenance dans le prompt

Le contexte doit conserver les sources.

Exemple conceptuel :

```text
SOURCE A
Type: Observation
Time: ...

SOURCE B
Type: Calculation
Method: ...

SOURCE C
Type: Document
Reference: ...
```

Ainsi, le modèle peut mieux distinguer les informations.

---

# 25. Validation Engine

Après génération :

```text
AI Output
   ↓
Validation
   ├── Schema
   ├── Grounding
   ├── Permissions
   ├── Safety
   └── Consistency
   ↓
Response
```

---

# 26. Grounding

Le système doit vérifier autant que possible que les affirmations importantes sont supportées par :

* données ;
* calculs ;
* documents ;
* résultats d'outils.

Une réponse non suffisamment fondée peut être marquée comme incertaine ou refusée.

---

# 27. Incertitude

L'assistant doit pouvoir communiquer :

```text
Known
Calculated
Estimated
Predicted
Simulated
Unknown
```

Cette distinction est fondamentale.

---

# 28. Réponse structurée

Une réponse interne peut conceptuellement contenir :

```json
{
  "answer": "...",
  "claims": [],
  "sources": [],
  "tool_results": [],
  "uncertainty": {},
  "provenance": {}
}
```

⚠️ **EXEMPLE NON EXHAUSTIF.**

Le contrat final sera défini dans les documents API.

---

# 29. Citations internes

Lorsqu'une réponse s'appuie sur une connaissance documentaire, la référence doit pouvoir être conservée.

```text
Answer
 ↓
Source
 ↓
Document
 ↓
Section / page
```

---

# 30. Mémoire conversationnelle

La mémoire conversationnelle doit être séparée des données métier.

```text
Conversation
   │
   ▼
Conversation Memory

Operational Data
   │
   ▼
Operational Database
```

Une conversation ne doit pas devenir automatiquement une source de vérité métier.

---

# 31. Permissions

Le contexte fourni à l'IA doit respecter les permissions de l'utilisateur.

```text
User
 ↓
Permissions
 ↓
Available Tools
 ↓
Available Data
 ↓
AI Context
```

---

# 32. Tenant Isolation

Une requête d'une organisation ne doit jamais permettre au modèle de voir les données d'une autre organisation.

Cette isolation doit être assurée avant génération.

---

# 33. Prompt Injection

Les contenus récupérés peuvent contenir du texte non fiable.

Le système doit donc distinguer :

```text
SYSTEM INSTRUCTIONS
USER INSTRUCTIONS
DATA
DOCUMENT CONTENT
TOOL RESULTS
```

Le contenu documentaire ne doit pas être automatiquement traité comme une instruction système.

---

# 34. Tool Injection

Les résultats d'outils doivent également être traités comme des données.

Un résultat d'outil ne doit pas pouvoir modifier arbitrairement les règles d'orchestration.

---

# 35. Boucle agentique contrôlée

Pour les tâches complexes :

```text
User
 ↓
Plan
 ↓
Tool
 ↓
Observation
 ↓
Evaluate
 ↓
Next Tool ?
 ├── Yes → Tool
 └── No  → Final Answer
```

La boucle doit avoir des limites :

```text
Maximum steps
Timeout
Token budget
Tool permissions
Error handling
```

Les valeurs exactes sont **À DÉFINIR** après tests.

---

# 36. Pas d'agent autonome illimité

L'agent ne doit jamais avoir une boucle :

```text
while(true)
```

ou une capacité d'action illimitée.

Toute orchestration doit être bornée.

---

# 37. Observabilité

Chaque requête d'intelligence importante doit pouvoir être tracée.

Conceptuellement :

```text
Request ID
 ↓
Query
 ↓
Router
 ↓
Tools
 ↓
Retrieval
 ↓
Model
 ↓
Validation
 ↓
Response
```

---

# 38. Audit IA

L'audit doit pouvoir conserver selon les besoins :

```text
Model
Provider
Prompt version
Tools called
Sources retrieved
Result
Validation status
Human approval
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

Les données sensibles ne doivent pas être journalisées inutilement.

---

# 39. Évaluation

Le système doit être évalué sur plusieurs dimensions.

```text
Retrieval quality
Tool selection
Tool correctness
Groundedness
Factuality
Latency
Cost
Safety
Consistency
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

---

# 40. Architecture interne

```text
backend/modules/intelligence/
│
├── api/
│
├── context/
│
├── routing/
│
├── orchestration/
│
├── tools/
│
├── knowledge/
│
├── providers/
│
├── validation/
│
├── memory/
│
├── guardrails/
│
├── observability/
│
└── tests/
```

Cette structure est indicative et non exhaustive.

---

# 41. Flux complet

```text
                         USER
                           │
                           ▼
                      Query API
                           │
                           ▼
                      Query Router
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
      Knowledge         Domain Tools     Geo Tools
          │                │                │
          └────────────────┼────────────────┘
                           ▼
                     Context Engine
                           │
                           ▼
                    AI Orchestrator
                           │
                     ┌─────┴─────┐
                     ▼           ▼
                   Model       Tools
                     │           │
                     └─────┬─────┘
                           ▼
                    Validation Engine
                           │
                    ┌──────┴──────┐
                    ▼             ▼
                 Valid          Invalid
                    │             │
                    ▼             ▼
                Response       Retry / Reject
```

---

# 42. Exemple complet

Question :

> "Quelle est la situation actuelle dans cette zone et quels événements récents peuvent l'expliquer ?"

Flux possible :

```text
Question
   ↓
Query Router
   ↓
Geo Context
   ↓
Flood Events Tool
   ↓
Recent Observations Tool
   ↓
Knowledge Search
   ↓
Context Assembly
   ↓
LLM
   ↓
Grounding Validation
   ↓
Response
```

⚠️ **EXEMPLE NON EXHAUSTIF.**

---

# 43. Règle fondamentale

Si un outil déterministe peut répondre à une question :

> **L'outil déterministe doit être privilégié par rapport à une estimation du LLM.**

Exemple :

```text
"Combien de stations ?"
        ↓
Database / Geo Query
```

et non :

```text
LLM → estimation
```

---

# 44. Règle scientifique

Pour les calculs scientifiques critiques :

```text
Data
 ↓
Scientific / Deterministic Engine
 ↓
Result
 ↓
AI Explanation
```

et non :

```text
Data
 ↓
LLM
 ↓
Scientific result
```

---

# 45. Règle de transparence

L'assistant doit pouvoir dire :

```text
"Je dispose de données..."
"J'ai calculé..."
"Le système estime..."
"Le modèle prédit..."
"La simulation indique..."
"Les documents indiquent..."
"Je ne dispose pas d'information suffisante..."
```

Il ne doit pas présenter toutes ces catégories comme équivalentes.

---

# 46. Règle Offline

Lorsqu'Offline :

```text
Local Data
+
Local Knowledge
+
Local Tools
+
Local AI
```

peuvent être utilisés si disponibles.

Sinon :

```text
Insufficient Offline Context
```

doit être signalé.

---

# 47. Human-in-the-loop

Les opérations à impact important doivent pouvoir nécessiter une validation humaine.

```text
AI
 ↓
Recommendation / Proposed Action
 ↓
Human
 ↓
Approve / Reject
```

---

# 48. Décisions INTELLIGENCE

| ID        | Décision                                            |
| --------- | --------------------------------------------------- |
| INTEL-001 | Intelligence Engine centralise l'orchestration      |
| INTEL-002 | LLM derrière une abstraction provider               |
| INTEL-003 | Outils déterministes privilégiés                    |
| INTEL-004 | Knowledge Engine séparé                             |
| INTEL-005 | Tool access contrôlé                                |
| INTEL-006 | Grounding obligatoire pour les réponses critiques   |
| INTEL-007 | Permissions appliquées avant exposition des données |
| INTEL-008 | Tenant isolation obligatoire                        |
| INTEL-009 | Agent loops bornées                                 |
| INTEL-010 | Human-in-the-loop pour les actions sensibles        |
| INTEL-011 | Provenance conservée                                |
| INTEL-012 | Résultats distingués par nature                     |
| INTEL-013 | Offline intelligence possible                       |
| INTEL-014 | Évaluation multi-dimensionnelle obligatoire         |

---

# 49. Principe final

> **L'Intelligence Engine ne remplace pas les moteurs spécialisés d'IntelliFlood : il les comprend, les orchestre et les rend accessibles de manière contrôlée.**

Le modèle de langage est donc une composante de l'intelligence du système, **pas la source de vérité du système**.
