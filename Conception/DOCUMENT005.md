# DOCUMENT005 — DIAGRAMMES D'ACTIVITÉS

**Projet :** IntelliFlood
**Document :** DOCUMENT005
**Titre :** Diagrammes d'activités
**Version :** 1.0
**Date :** 30 septembre 2026
**Statut :** Conception initiale

---

# 1. Objet du document

Ce document décrit les principaux flux d'activités d'IntelliFlood.

Les diagrammes d'activités permettent de représenter :

* les étapes d'une fonctionnalité ;
* les décisions ;
* les conditions ;
* les traitements ;
* les chemins alternatifs ;
* les erreurs ;
* les traitements hors ligne ;
* les synchronisations.

La question principale devient :

> **Comment se déroule une fonctionnalité ?**

---

# 2. Documents de référence

* DOCUMENT001 — Vision & Périmètre ;
* DOCUMENT002 — Parties prenantes & utilisateurs ;
* DOCUMENT003 — Expression des besoins & exigences ;
* DOCUMENT004 — Acteurs & cas d'utilisation.

---

# 3. Convention de modélisation

Les futurs diagrammes utiliseront les éléments UML suivants :

| Élément | Signification             |
| ------- | ------------------------- |
| ●       | Début                     |
| Action  | Activité                  |
| ◇       | Décision                  |
| →       | Flux                      |
| ◎       | Fin                       |
| Fork    | Division parallèle        |
| Join    | Synchronisation parallèle |

---

# 4. Activité globale d'IntelliFlood

Le fonctionnement général peut être représenté ainsi :

```text
●
│
▼
Ouverture d'IntelliFlood
│
▼
Authentification
│
▼
Identification du profil
│
▼
Chargement de l'espace utilisateur
│
▼
Consultation / action
│
├──────────────┬──────────────┬──────────────┐
▼              ▼              ▼              ▼
Carte       Observation    Analyse       Supervision
│              │              │              │
└──────────────┴──────────────┴──────────────┘
                       │
                       ▼
                 Enregistrement
                       │
                       ▼
                     Fin
```

---

# 5. Activité — Authentification

```text
●
│
▼
Afficher écran de connexion
│
▼
Saisir identifiants
│
▼
Envoyer identifiants
│
▼
Vérifier identifiants
│
◇
├── Valides ──────────► Charger profil
│                          │
│                          ▼
│                    Charger interface
│                          │
│                          ▼
│                         ◎
│
└── Invalides ────────► Afficher erreur
                           │
                           ▼
                     Nouvelle tentative
```

---

# 6. Activité — Consultation de la carte

```text
●
│
▼
Ouvrir la carte
│
▼
Charger données disponibles
│
▼
Afficher territoire
│
▼
Choisir une zone
│
▼
Choisir les couches
│
▼
Afficher informations
│
◇
├── Continuer exploration ──► Naviguer
│                               │
│                               └──► Choisir une zone
│
└── Terminer ───────────────► ◎
```

---

# 7. Activité — Création d'une observation

```text
●
│
▼
Créer une observation
│
▼
Choisir le type
│
▼
Décrire le phénomène
│
▼
Obtenir position
│
◇
├── GPS disponible ─────► Enregistrer position
│
└── GPS indisponible ──► Demander position manuelle
                              │
                              ▼
                         Enregistrer position
                              │
                              ▼
                    Ajouter média ? 
                              │
                         ◇────┴────◇
                         │         │
                        Oui       Non
                         │         │
                         ▼         │
                  Ajouter média    │
                         │         │
                         └────┬────┘
                              ▼
                       Enregistrer
                              │
                              ▼
                        Observation créée
                              │
                              ▼
                              ◎
```

---

# 8. Activité — Création d'une observation hors ligne

```text
●
│
▼
Créer observation
│
▼
Connexion disponible ?
│
◇
├── Oui ─────────────► Enregistrer directement
│
└── Non ─────────────► Enregistrer localement
                           │
                           ▼
                     Ajouter à la file
                           │
                           ▼
                     Observation locale
                           │
                           ▼
                           ◎
```

---

# 9. Activité — Synchronisation

```text
●
│
▼
Connexion détectée
│
▼
Rechercher modifications locales
│
◇
├── Aucune ───────────────► ◎
│
└── Modifications trouvées
          │
          ▼
    Préparer synchronisation
          │
          ▼
    Envoyer données
          │
          ▼
    Vérifier réponse
          │
          ◇
       ┌──┴───┐
       │      │
    Succès   Conflit
       │      │
       ▼      ▼
  Marquer    Identifier
 synchronisé conflit
       │      │
       │      ▼
       │  Résoudre conflit
       │      │
       └──┬───┘
          ▼
       Terminer
          │
          ▼
          ◎
```

---

# 10. Activité — Analyse d'une situation

```text
●
│
▼
Sélectionner une zone
│
▼
Sélectionner une période
│
▼
Charger données
│
▼
Vérifier disponibilité
│
◇
├── Données suffisantes
│        │
│        ▼
│      Calculer indicateurs
│        │
│        ▼
│      Effectuer analyse
│        │
│        ▼
│      Afficher résultats
│        │
│        ▼
│        ◎
│
└── Données insuffisantes
         │
         ▼
    Indiquer données manquantes
         │
         ▼
         ◎
```

---

# 11. Activité — Détection d'anomalie

```text
●
│
▼
Recevoir données
│
▼
Vérifier données
│
▼
Appliquer méthode de détection
│
▼
Anomalie détectée ?
│
◇
├── Non ─────► Enregistrer analyse
│                  │
│                  ▼
│                  ◎
│
└── Oui ─────► Créer événement d'anomalie
                    │
                    ▼
              Évaluer gravité
                    │
                    ▼
              Alerte nécessaire ?
                    │
                    ◇
                 ┌──┴──┐
                Oui    Non
                 │      │
                 ▼      │
            Créer alerte│
                 │      │
                 └──┬───┘
                    ▼
                   ◎
```

---

# 12. Activité — Gestion d'une alerte

```text
●
│
▼
Détection d'un événement
│
▼
Évaluer règles d'alerte
│
◇
├── Conditions non satisfaites ──► ◎
│
└── Conditions satisfaites
          │
          ▼
      Créer alerte
          │
          ▼
      Déterminer gravité
          │
          ▼
      Déterminer zone
          │
          ▼
      Identifier utilisateurs
          │
          ▼
      Envoyer notifications
          │
          ▼
      Responsable consulte
          │
          ▼
      Traiter alerte
          │
          ▼
      Enregistrer action
          │
          ▼
          ◎
```

---

# 13. Activité — Simulation

```text
●
│
▼
Créer scénario
│
▼
Définir zone
│
▼
Définir paramètres
│
▼
Vérifier données nécessaires
│
◇
├── Données insuffisantes ──► Afficher impossibilité
│                                  │
│                                  ▼
│                                  ◎
│
└── Données suffisantes
          │
          ▼
      Lancer simulation
          │
          ▼
      Calculer scénario
          │
          ▼
      Générer résultats
          │
          ▼
      Marquer résultats
      comme "SIMULATION"
          │
          ▼
      Afficher sur carte
          │
          ▼
          ◎
```

---

# 14. Activité — Utilisation de l'IA

```text
●
│
▼
Utilisateur formule une demande
│
▼
Analyser la demande
│
▼
Identifier les données nécessaires
│
▼
Récupérer les données autorisées
│
▼
Exécuter traitement IA
│
▼
Produire résultat
│
▼
Associer contexte et sources
│
▼
Afficher résultat
│
▼
Utilisateur vérifie
│
◇
├── Résultat accepté ───► Utiliser résultat
│
└── Résultat à vérifier ─► Marquer comme non validé
                               │
                               ▼
                               ◎
```

---

# 15. Activité — Génération d'un rapport

```text
●
│
▼
Sélectionner zone / période
│
▼
Sélectionner données
│
▼
Calculer indicateurs
│
▼
Construire synthèse
│
▼
Ajouter cartes / graphiques
│
▼
Ajouter sources
│
▼
Générer rapport
│
▼
Prévisualiser
│
◇
├── Modifier ─────► Retour à sélection
│
└── Valider ──────► Enregistrer rapport
                         │
                         ▼
                         ◎
```

---

# 16. Activité — Traitement d'une donnée externe

```text
●
│
▼
Réception donnée externe
│
▼
Identifier source
│
▼
Vérifier format
│
◇
├── Format valide ───────► Vérifier contenu
│                              │
│                              ▼
│                         Enregistrer métadonnées
│                              │
│                              ▼
│                         Intégrer donnée
│                              │
│                              ▼
│                              ◎
│
└── Format invalide ─────► Rejeter / mettre en attente
                                │
                                ▼
                                ◎
```

---

# 17. Activité — Validation d'une observation

```text
●
│
▼
Sélectionner observation
│
▼
Consulter informations
│
▼
Vérifier source
│
▼
Vérifier position
│
▼
Vérifier médias
│
▼
Vérifier cohérence
│
◇
├── Valide ─────► Statut = Vérifiée
│
└── Non valide ─► Statut = Rejetée
                     │
                     ▼
              Enregistrer décision
                     │
                     ▼
                     ◎
```

---

# 18. Activité — Consultation temporelle

```text
●
│
▼
Ouvrir timeline
│
▼
Choisir période
│
▼
Charger événements
│
▼
Afficher événements
│
▼
Déplacer curseur temporel
│
▼
Actualiser carte
│
◇
├── Continuer ─────► Déplacer curseur
│
└── Terminer ──────► ◎
```

---

# 19. Activité globale d'une situation d'inondation

Une situation réelle peut entraîner plusieurs traitements parallèles.

```text
                  Détection / Observation
                           │
                           ▼
                    Situation identifiée
                           │
              ┌────────────┼─────────────┐
              │            │             │
              ▼            ▼             ▼
          Données       Analyse       Cartographie
              │            │             │
              └────────────┼─────────────┘
                           ▼
                    Évaluation du risque
                           │
                           ▼
                    Alerte nécessaire ?
                       ◇────┴────◇
                      Oui        Non
                       │          │
                       ▼          │
                    Alerte       │
                       │          │
                       └────┬─────┘
                            ▼
                     Suivi situation
                            │
                            ▼
                          Rapport
                            │
                            ▼
                            ◎
```

---

# 20. Activités parallèles

Certaines activités peuvent fonctionner simultanément.

Exemple :

```text
                 Situation détectée
                        │
                      FORK
            ┌───────────┼───────────┐
            │           │           │
            ▼           ▼           ▼
        Analyse      Mise à jour   Notification
        données        carte       utilisateurs
            │           │           │
            └───────────┼───────────┘
                      JOIN
                        │
                        ▼
                  Mise à jour état
```

Cette notion sera importante dans l'architecture événementielle et les traitements asynchrones.

---

# 21. Principes issus des activités

Les diagrammes d'activités font apparaître plusieurs besoins architecturaux :

1. traitements synchrones et asynchrones ;
2. événements ;
3. gestion des erreurs ;
4. fonctionnement hors ligne ;
5. synchronisation ;
6. traitements parallèles ;
7. validation humaine ;
8. historique des actions.

---

# 22. Préparation du DOCUMENT006

Le DOCUMENT006 détaillera les **interactions entre acteurs et composants dans le temps**.

Il décrira notamment :

* qui appelle quoi ;
* dans quel ordre ;
* quelles données circulent ;
* quelles réponses sont retournées ;
* quelles erreurs peuvent apparaître ;
* comment les systèmes externes interviennent.

Il servira à produire les diagrammes de séquence.

---

# 23. État du document

**DOCUMENT005 : TERMINÉ — VERSION 1.0**
