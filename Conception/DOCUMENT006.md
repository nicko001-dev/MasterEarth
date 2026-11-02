# DOCUMENT006 — DIAGRAMMES DE SÉQUENCE & INTERACTIONS

**Projet :** IntelliFlood
**Document :** DOCUMENT006
**Titre :** Diagrammes de séquence & interactions
**Version :** 1.0
**Date :** 30 septembre 2026
**Statut :** Conception initiale

---

# 1. Objet du document

Ce document décrit les interactions entre les acteurs, interfaces, services et moteurs d'IntelliFlood.

Contrairement aux diagrammes d'activités, qui décrivent principalement le déroulement logique d'une activité, les diagrammes de séquence permettent de représenter :

* qui communique avec qui ;
* dans quel ordre ;
* quelles données sont transmises ;
* quelles réponses sont retournées ;
* quels traitements sont déclenchés.

La question principale est :

> **Comment les différents composants d'IntelliFlood communiquent-ils pour réaliser une fonctionnalité ?**

---

# 2. Documents de référence

* DOCUMENT001 — Vision & Périmètre ;
* DOCUMENT002 — Parties prenantes & utilisateurs ;
* DOCUMENT003 — Expression des besoins & exigences ;
* DOCUMENT004 — Acteurs & cas d'utilisation ;
* DOCUMENT005 — Diagrammes d'activités.

---

# 3. Composants génériques utilisés dans les séquences

À ce stade, les composants sont encore conceptuels.

| Composant                 | Responsabilité                                |
| ------------------------- | --------------------------------------------- |
| **Utilisateur**           | Déclenche une action                          |
| **Interface**             | Présente et collecte les informations         |
| **Application**           | Orchestre les opérations                      |
| **World Engine**          | Gère la représentation du monde               |
| **Flood Engine**          | Gère les phénomènes liés aux inondations      |
| **Intelligence Engine**   | Réalise les traitements intelligents          |
| **Geo/Data Engine**       | Gère les données géographiques et temporelles |
| **Offline & Sync Engine** | Gère le stockage local et la synchronisation  |
| **Notification Service**  | Gère les notifications                        |
| **Data Source**           | Fournit des données externes                  |

Ces noms représentent des responsabilités conceptuelles et pourront être raffinés dans les documents d'architecture.

---

# 4. Convention

Les séquences seront représentées selon le principe :

```text
Acteur
   │
   │ requête
   ▼
Interface
   │
   │ appel
   ▼
Application
   │
   │ traitement
   ▼
Moteur / Service
   │
   │ résultat
   ▼
Application
   │
   │ réponse
   ▼
Interface
   │
   ▼
Acteur
```

---

# 5. Séquence — Authentification

```text
Utilisateur
    │
    │ saisir identifiants
    ▼
Interface
    │
    │ envoyer identifiants
    ▼
Application
    │
    │ vérifier identité
    ▼
Service Authentification
    │
    │ vérifier
    ▼
Base de données
    │
    │ résultat
    ▼
Service Authentification
    │
    │ utilisateur authentifié
    ▼
Application
    │
    │ charger profil
    ▼
Base de données
    │
    │ profil + permissions
    ▼
Application
    │
    │ session
    ▼
Interface
    │
    ▼
Utilisateur
```

---

# 6. Séquence — Consultation de la carte

```text
Utilisateur
    │
    │ ouvrir carte
    ▼
Interface
    │
    │ demander données
    ▼
Application
    │
    │ demander données géographiques
    ▼
Geo/Data Engine
    │
    │ récupérer données
    ▼
Stockage
    │
    │ données
    ▼
Geo/Data Engine
    │
    │ données géographiques
    ▼
World Engine
    │
    │ préparer représentation
    ▼
Interface
    │
    ▼
Utilisateur
```

---

# 7. Séquence — Création d'une observation

```text
Agent terrain
    │
    │ créer observation
    ▼
Interface
    │
    │ données observation
    ▼
Application
    │
    │ vérifier permissions
    ▼
Service Autorisation
    │
    │ autorisé
    ▼
Application
    │
    │ enregistrer observation
    ▼
Geo/Data Engine
    │
    │ enregistrer
    ▼
Stockage
    │
    │ confirmation
    ▼
Geo/Data Engine
    │
    │ observation créée
    ▼
Application
    │
    ▼
Interface
    │
    ▼
Agent terrain
```

---

# 8. Séquence — Création d'une observation hors ligne

```text
Agent terrain
    │
    │ créer observation
    ▼
Interface
    │
    │ transmettre données
    ▼
Offline & Sync Engine
    │
    │ enregistrer localement
    ▼
Stockage local
    │
    │ confirmation
    ▼
Offline & Sync Engine
    │
    │ observation locale
    ▼
Interface
    │
    ▼
Agent terrain
```

Aucune connexion distante n'est nécessaire pendant cette séquence.

---

# 9. Séquence — Synchronisation

```text
Connexion
    │
    │ disponible
    ▼
Offline & Sync Engine
    │
    │ rechercher modifications
    ▼
Stockage local
    │
    │ modifications
    ▼
Offline & Sync Engine
    │
    │ envoyer données
    ▼
Application distante
    │
    │ vérifier données
    ▼
Geo/Data Engine
    │
    │ comparer
    ▼
Stockage distant
```

En cas de conflit :

```text
Stockage distant
      │
      │ conflit
      ▼
Geo/Data Engine
      │
      ▼
Offline & Sync Engine
      │
      ▼
Gestionnaire de conflit
      │
      ├── résolution automatique
      │
      └── validation humaine
```

---

# 10. Séquence — Analyse d'une zone

```text
Analyste
    │
    │ sélectionner zone
    ▼
Interface
    │
    │ demander analyse
    ▼
Application
    │
    │ récupérer données
    ▼
Geo/Data Engine
    │
    │ données
    ▼
Flood Engine
    │
    │ analyser
    ▼
Flood Engine
    │
    │ résultats
    ▼
Application
    │
    │ préparer résultats
    ▼
Interface
    │
    ▼
Analyste
```

---

# 11. Séquence — Détection d'une anomalie

```text
Source de données
    │
    │ nouvelle donnée
    ▼
Geo/Data Engine
    │
    │ donnée normalisée
    ▼
Intelligence Engine
    │
    │ analyser
    ▼
Modèle / Algorithme
    │
    │ résultat
    ▼
Intelligence Engine
    │
    │ anomalie détectée
    ▼
Application
    │
    │ créer événement
    ▼
Système d'alertes
    │
    ▼
Notification Service
```

---

# 12. Séquence — Création d'une alerte

```text
Flood Engine / Intelligence Engine
              │
              │ événement
              ▼
          Application
              │
              │ vérifier règles
              ▼
       Alert Engine
              │
              │ condition satisfaite
              ▼
       Créer alerte
              │
              ▼
       Stockage
              │
              │ alerte créée
              ▼
      Notification Service
              │
              ▼
          Utilisateurs
```

---

# 13. Séquence — Simulation

```text
Analyste
    │
    │ créer scénario
    ▼
Interface
    │
    │ paramètres
    ▼
Application
    │
    │ vérifier scénario
    ▼
Flood Engine
    │
    │ demander données
    ▼
Geo/Data Engine
    │
    │ données
    ▼
Flood Engine
    │
    │ exécuter modèle
    ▼
Simulation Engine
    │
    │ résultats
    ▼
Flood Engine
    │
    │ résultats simulés
    ▼
World Engine
    │
    │ visualisation
    ▼
Interface
    │
    ▼
Analyste
```

---

# 14. Séquence — Utilisation de l'IA

```text
Utilisateur
    │
    │ question
    ▼
Interface
    │
    ▼
Application
    │
    │ analyser demande
    ▼
Intelligence Engine
    │
    │ rechercher données
    ▼
Geo/Data Engine
    │
    │ contexte
    ▼
Intelligence Engine
    │
    │ exécuter modèle
    ▼
Modèle IA
    │
    │ résultat
    ▼
Intelligence Engine
    │
    │ résultat + sources/contexte
    ▼
Application
    │
    ▼
Interface
    │
    ▼
Utilisateur
```

---

# 15. Séquence — Analyse d'une image

```text
Agent terrain
    │
    │ photographie
    ▼
Interface
    │
    ▼
Application
    │
    │ envoyer image
    ▼
Intelligence Engine
    │
    │ analyser image
    ▼
Modèle de vision
    │
    │ résultat
    ▼
Intelligence Engine
    │
    │ interprétation
    ▼
Application
    │
    │ enregistrer résultat
    ▼
Geo/Data Engine
    │
    ▼
Stockage
```

Le résultat IA doit rester identifiable comme résultat produit par un modèle.

---

# 16. Séquence — Génération d'un rapport

```text
Responsable
    │
    │ demander rapport
    ▼
Interface
    │
    ▼
Application
    │
    │ récupérer données
    ├───────────────► Geo/Data Engine
    │
    │ récupérer analyses
    ├───────────────► Flood Engine
    │
    │ récupérer résultats IA
    ├───────────────► Intelligence Engine
    │
    ▼
Application
    │
    │ construire rapport
    ▼
Report Engine
    │
    │ rapport
    ▼
Stockage
    │
    │ confirmation
    ▼
Interface
    │
    ▼
Responsable
```

---

# 17. Séquence — Réception de données externes

```text
Fournisseur de données
          │
          │ données
          ▼
   API / Connecteur
          │
          ▼
    Application
          │
          │ identifier source
          ▼
    Geo/Data Engine
          │
          │ validation
          ▼
      Stockage
          │
          │ donnée disponible
          ▼
     Application
          │
          ├────────► Flood Engine
          │
          ├────────► World Engine
          │
          └────────► Intelligence Engine
```

---

# 18. Séquence — Consultation temporelle

```text
Utilisateur
    │
    │ choisir période
    ▼
Interface
    │
    ▼
Application
    │
    │ demander données temporelles
    ▼
Geo/Data Engine
    │
    │ récupérer événements
    ▼
Stockage
    │
    │ événements
    ▼
Geo/Data Engine
    │
    ▼
World Engine
    │
    │ actualiser représentation
    ▼
Interface
    │
    ▼
Utilisateur
```

---

# 19. Séquence — Validation d'une observation

```text
Analyste / Responsable
       │
       │ consulter observation
       ▼
Interface
       │
       ▼
Application
       │
       │ récupérer observation
       ▼
Geo/Data Engine
       │
       ▼
Interface
       │
       │ décision
       ▼
Application
       │
       ├── Valider
       │
       └── Rejeter
       │
       ▼
Geo/Data Engine
       │
       │ modifier statut
       ▼
Stockage
       │
       ▼
Historique
```

---

# 20. Séquence — Gestion d'un conflit de synchronisation

```text
Offline Engine
     │
     │ modification locale
     ▼
Serveur
     │
     │ comparer version
     ▼
Synchronisation
     │
     ◇
     ├── Pas de conflit ─────► Enregistrer
     │
     └── Conflit
          │
          ▼
     Gestionnaire de conflit
          │
          ◇
       ┌──┴───────────┐
       │              │
Automatique       Humain
       │              │
       └──────┬───────┘
              ▼
       Version retenue
              │
              ▼
          Historique
```

---

# 21. Séquence — Situation complète d'inondation

Une situation réelle peut mobiliser plusieurs composants.

```text
Capteur
  │
  │ mesure
  ▼
Geo/Data Engine
  │
  ├────────► Flood Engine
  │               │
  │               ▼
  │         Analyse du risque
  │               │
  │               ▼
  │         Alert Engine
  │               │
  │               ▼
  │         Notification
  │
  └────────► World Engine
                  │
                  ▼
             Mise à jour carte

En parallèle :

Geo/Data Engine
      │
      ▼
Intelligence Engine
      │
      ▼
Analyse / anomalie
      │
      ▼
Application
```

---

# 22. Interactions entre les moteurs

Les séquences permettent de faire apparaître les responsabilités générales :

```text
                    APPLICATION
                         │
        ┌────────────────┼─────────────────┐
        │                │                 │
        ▼                ▼                 ▼
 WORLD ENGINE       FLOOD ENGINE     INTELLIGENCE
        │                │                 │
        └────────────────┼─────────────────┘
                         │
                         ▼
                   GEO/DATA ENGINE
                         │
                         ▼
                OFFLINE & SYNC
```

Cette représentation reste conceptuelle.

---

# 23. Principes architecturaux déduits

Les séquences révèlent plusieurs principes importants.

## 23.1 Les interfaces ne doivent pas accéder directement aux données

Les interfaces doivent passer par les composants applicatifs appropriés.

---

## 23.2 Les moteurs doivent avoir des responsabilités distinctes

Le World Engine ne doit pas devenir responsable de toute la logique métier liée aux inondations.

Le Flood Engine ne doit pas devenir responsable de l'authentification.

L'Intelligence Engine ne doit pas devenir responsable de toute la gestion des données.

---

## 23.3 Le Geo/Data Engine constitue un composant transversal

Plusieurs moteurs auront besoin d'accéder aux données géospatiales et temporelles.

---

## 23.4 L'Offline & Sync Engine constitue une couche transversale

Il doit pouvoir fonctionner avec plusieurs fonctionnalités sans dupliquer toute la logique hors ligne.

---

## 23.5 Les traitements lourds doivent pouvoir être asynchrones

Certaines opérations peuvent prendre du temps :

* simulation ;
* analyse d'image ;
* traitement IA ;
* import massif ;
* génération de rapport ;
* synchronisation importante.

---

# 24. Gestion des erreurs dans les séquences

Les interactions devront prendre en compte les erreurs suivantes :

* utilisateur non authentifié ;
* permission insuffisante ;
* données absentes ;
* données invalides ;
* source externe indisponible ;
* connexion perdue ;
* conflit de synchronisation ;
* modèle IA indisponible ;
* simulation impossible ;
* erreur de stockage ;
* erreur de traitement.

Chaque erreur importante devra produire un comportement défini.

---

# 25. Traçabilité

Les interactions critiques devront pouvoir être enregistrées.

Exemples :

```text
Utilisateur
    │
    ▼
Action
    │
    ▼
Résultat
    │
    ▼
Historique
```

Les événements importants devront pouvoir conserver :

* utilisateur ou système à l'origine ;
* date et heure ;
* action ;
* objet concerné ;
* résultat ;
* statut.

---

# 26. Séquences prioritaires à produire graphiquement

Les diagrammes UML graphiques détaillés devront être réalisés en priorité pour :

1. Authentification ;
2. Création d'une observation ;
3. Création d'une observation hors ligne ;
4. Synchronisation ;
5. Analyse d'une zone ;
6. Gestion d'une alerte ;
7. Simulation ;
8. Utilisation de l'IA ;
9. Réception de données externes ;
10. Génération d'un rapport.

Ces diagrammes pourront être réalisés avec PlantUML, Mermaid ou un outil UML adapté.

---

# 27. Décisions de conception

### DEC-006-001

Les interfaces communiquent avec la logique applicative plutôt qu'avec les données directement.

### DEC-006-002

Les responsabilités des moteurs sont séparées.

### DEC-006-003

Les traitements lourds peuvent être exécutés de manière asynchrone.

### DEC-006-004

Les données géospatiales et temporelles sont gérées par une responsabilité spécialisée.

### DEC-006-005

Les fonctionnalités hors ligne et de synchronisation sont traitées par un composant transversal.

### DEC-006-006

Les actions critiques sont traçables.

---

# 28. Préparation du DOCUMENT007

Le DOCUMENT007 aura pour objectif de définir le **modèle de domaine et le diagramme de classes conceptuel**.

Il permettra notamment d'identifier les objets fondamentaux d'IntelliFlood :

* Utilisateur ;
* Profil ;
* Permission ;
* Observation ;
* Zone ;
* Événement ;
* Alerte ;
* Donnée géographique ;
* Donnée temporelle ;
* Source ;
* Scénario ;
* Simulation ;
* Résultat ;
* Rapport ;
* Notification ;
* Annotation ;
* Synchronisation ;
* etc.

Le DOCUMENT007 transformera donc les interactions précédemment identifiées en **objets et relations métier**.

---

# 29. État du document

**DOCUMENT006 : TERMINÉ — VERSION 1.0**
