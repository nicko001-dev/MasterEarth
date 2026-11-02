# DOCUMENT045 — ARCHITECTURE DU KNOWLEDGE ENGINE & RAG

**Projet : IntelliFlood**
**Version : 1.0**
**Statut : Spécification technique**
**Dépendances : DOCUMENT031, DOCUMENT036, DOCUMENT040, DOCUMENT043**

---

# 1. Objectif

Le Knowledge Engine permet à IntelliFlood de fournir à l'Intelligence Engine des connaissances externes et documentaires contrôlées.

Il doit permettre de répondre à des questions nécessitant des informations provenant de :

* documents ;
* procédures ;
* normes ;
* documentation scientifique ;
* documentation technique ;
* guides ;
* connaissances institutionnelles ;
* historiques documentés.

⚠️ **EXEMPLES NON EXHAUSTIFS.**

---

# 2. Pourquoi séparer Knowledge Engine et données opérationnelles ?

Les données opérationnelles représentent notamment :

```text
Observations
Sensors
Flood Events
World Objects
Measurements
```

Le Knowledge Engine représente plutôt :

```text
Documents
Definitions
Procedures
References
Scientific knowledge
Institutional knowledge
```

Ces deux catégories ne doivent pas être mélangées sans contrôle.

---

# 3. Architecture

```text
                   KNOWLEDGE ENGINE
                          │
          ┌───────────────┼────────────────┐
          │               │                │
          ▼               ▼                ▼
     Ingestion         Indexing        Knowledge Store
          │               │                │
          └───────────────┼────────────────┘
                          ▼
                       Retriever
                          │
                          ▼
                       Reranker
                          │
                          ▼
                     Context Builder
                          │
                          ▼
                   Intelligence Engine
```

Cette séparation entre ingestion et génération est cohérente avec les architectures RAG modernes.

---

# 4. Principe RAG

Le fonctionnement de base est :

```text
Question
   ↓
Retrieval
   ↓
Relevant Knowledge
   ↓
Context
   ↓
LLM
   ↓
Answer
```

Mais IntelliFlood ne doit pas se limiter à un simple :

```text
Question → Vector Search → LLM
```

Pour les questions complexes, le système doit pouvoir sélectionner différentes sources et outils.

---

# 5. Pipeline d'ingestion

```text
Document
   ↓
Validation
   ↓
Extraction
   ↓
Cleaning
   ↓
Chunking
   ↓
Metadata
   ↓
Embedding
   ↓
Index
```

---

# 6. Sources

Les sources peuvent être :

```text
PDF
HTML
Markdown
Text
Structured documents
Technical manuals
Scientific publications
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

Les sources doivent être autorisées et traçables.

---

# 7. Provenance documentaire

Chaque document doit posséder des métadonnées permettant de retrouver :

```text
Source
Title
Author
Date
Version
Language
Origin
License
Import date
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

---

# 8. Chunking

Les documents peuvent être divisés en unités plus petites.

```text
Document
   │
   ├── Chunk 1
   ├── Chunk 2
   ├── Chunk 3
   └── ...
```

Le chunking doit préserver le sens.

Un découpage aveugle peut diminuer la qualité de récupération.

---

# 9. Metadata

Les chunks peuvent conserver :

```text
document_id
section
page
topic
language
source
date
version
access_scope
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

---

# 10. Embeddings

Les chunks peuvent être transformés en vecteurs.

```text
Text
 ↓
Embedding Model
 ↓
Vector
 ↓
Vector Index
```

Le modèle d'embedding doit être interchangeable.

---

# 11. Vector Store

Le système doit pouvoir utiliser une solution vectorielle compatible avec l'architecture.

Une possibilité est d'utiliser PostgreSQL avec une extension vectorielle lorsqu'elle répond aux besoins.

Le choix définitif doit être guidé par :

* volume ;
* performance ;
* maintenance ;
* mode Offline ;
* coût ;
* simplicité.

---

# 12. Recherche hybride

Pour certaines requêtes, la recherche vectorielle seule peut être insuffisante.

Architecture possible :

```text
Query
 │
 ├── Semantic Search
 │
 └── Keyword Search
       │
       ▼
   Result Fusion
       │
       ▼
    Reranking
```

Les architectures RAG modernes utilisent notamment la recherche hybride et le reranking lorsque cela améliore la pertinence.

---

# 13. Reranking

Le retriever peut récupérer un ensemble de candidats.

```text
Query
 ↓
Top N candidates
 ↓
Reranker
 ↓
Top K relevant
```

Le `N` et le `K` ne doivent pas être codés arbitrairement avant évaluation.

---

# 14. Context Builder

Le Context Builder prépare les informations destinées au modèle.

```text
User Query
+
Retrieved Knowledge
+
Operational Context
+
Tool Results
        ↓
Context Builder
        ↓
LLM
```

Il doit éviter de fournir inutilement de grandes quantités de données.

---

# 15. Knowledge vs Operational Data

Architecture :

```text
             Intelligence Engine
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
 Knowledge Engine         Domain Tools
          │                     │
          ▼                     ▼
 Documents              Live / Operational Data
```

Les deux peuvent être combinés, mais leurs origines doivent rester identifiables.

---

# 16. Citations

Lorsque la réponse s'appuie sur un document, le système doit idéalement pouvoir indiquer la source.

Exemple :

```text
Réponse
   ↓
Source
   ↓
Document
   ↓
Page / Section
```

Cela améliore l'auditabilité.

---

# 17. Knowledge Scope

Les documents peuvent appartenir à différents périmètres.

Exemples :

```text
Global
Organization
Project
Restricted
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

Les permissions doivent être appliquées avant la récupération.

---

# 18. Sécurité

Un utilisateur ne doit jamais récupérer un document auquel il n'a pas accès simplement parce que son contenu correspond à sa question.

```text
Query
 ↓
Authorization Filter
 ↓
Retriever
 ↓
Allowed Knowledge
```

et non :

```text
Query
 ↓
Retriever all documents
 ↓
Filter afterwards
```

---

# 19. Mise à jour

Lorsqu'un document est modifié :

```text
Old Version
     ↓
New Version
     ↓
Reprocessing
     ↓
Re-indexing
```

Les versions doivent pouvoir être distinguées.

---

# 20. Suppression

La suppression d'une source doit également prendre en compte les index dérivés.

```text
Document deleted
      ↓
Chunks removed/deactivated
      ↓
Embeddings invalidated
      ↓
Search index updated
```

---

# 21. Knowledge Graph

Un Knowledge Graph peut éventuellement compléter le RAG lorsque les relations entre entités sont importantes.

```text
Entity A
   │
 relation
   ▼
Entity B
```

Les Knowledge Graphs peuvent améliorer le grounding lorsque les relations explicites entre données sont importantes.

Cependant :

> Le Knowledge Graph n'est pas obligatoire pour la première implémentation si le besoin n'est pas démontré.

---

# 22. GraphRAG

GraphRAG peut devenir une évolution future.

```text
Documents
    ↓
Entities / Relations
    ↓
Knowledge Graph
    ↓
Graph Retrieval
    ↓
LLM
```

**STATUT : OPTIONNEL / FUTUR**

---

# 23. Query Routing

Le système doit pouvoir déterminer si une question nécessite :

```text
Knowledge Search
Operational Data
Geo Query
Flood Calculation
World Query
Simulation
Multiple sources
```

Exemple :

```text
Question
   ↓
Query Router
   ├── Knowledge
   ├── Geo
   ├── Flood
   ├── World
   └── Simulation
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

---

# 24. Recherche multi-étapes

Une question complexe peut nécessiter plusieurs recherches.

```text
Question
   ↓
Decomposition
   ↓
Sub-query A
Sub-query B
Sub-query C
   ↓
Retrieval
   ↓
Validation
   ↓
Synthesis
```

Les architectures agentiques permettent notamment cette sélection dynamique de sources et cette récupération itérative.

---

# 25. Validation du contexte

Avant génération :

```text
Retrieved Context
      ↓
Relevance Check
      ↓
Source Check
      ↓
Permission Check
      ↓
Context
```

Un contexte insuffisant doit pouvoir conduire à :

```text
"Information insuffisante"
```

plutôt qu'à une réponse inventée.

---

# 26. Hallucination Control

Le système doit privilégier :

```text
Evidence
  ↓
Answer
```

plutôt que :

```text
Answer
  ↓
Justification inventée
```

---

# 27. Évaluation

Le Knowledge Engine doit être évalué sur :

```text
Retrieval quality
Precision
Recall
Source correctness
Groundedness
Latency
```

⚠️ **EXEMPLES NON EXHAUSTIFS.**

Une architecture RAG sérieuse doit être évaluée séparément sur ses différentes étapes, et pas uniquement sur la réponse finale.

---

# 28. Offline Knowledge

Certaines connaissances peuvent être disponibles Offline.

```text
Server Knowledge
      ↓
Selected subset
      ↓
Local index
      ↓
Offline retrieval
```

Le système doit indiquer lorsqu'une connaissance locale peut être obsolète.

---

# 29. Architecture interne

```text
backend/modules/intelligence/knowledge/
│
├── ingestion/
├── extraction/
├── chunking/
├── embeddings/
├── retrieval/
├── reranking/
├── context/
├── sources/
└── tests/
```

Cette structure est indicative et non exhaustive.

---

# 30. Décisions KNOWLEDGE

| ID       | Décision                                            |
| -------- | --------------------------------------------------- |
| KNOW-001 | Knowledge Engine séparé des données opérationnelles |
| KNOW-002 | Sources traçables                                   |
| KNOW-003 | Documents versionnés                                |
| KNOW-004 | Retrieval contrôlé                                  |
| KNOW-005 | Permissions appliquées avant retrieval              |
| KNOW-006 | Provider d'embedding interchangeable                |
| KNOW-007 | Recherche hybride possible                          |
| KNOW-008 | Reranking possible                                  |
| KNOW-009 | Citations/sources privilégiées                      |
| KNOW-010 | GraphRAG optionnel                                  |
| KNOW-011 | Offline knowledge possible                          |
| KNOW-012 | Evaluation RAG obligatoire                          |

---

# 31. Principe final

> **Le Knowledge Engine fournit des connaissances vérifiables à l'Intelligence Engine ; il ne doit pas devenir une boîte noire où l'IA invente ses propres sources.**
