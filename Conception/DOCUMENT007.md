# DOCUMENT007 — MODÈLE DE DOMAINE & DIAGRAMME DE CLASSES

**Projet :** IntelliFlood
**Document :** DOCUMENT007
**Titre :** Modèle de domaine & diagramme de classes
**Version :** 1.0
**Date :** 30 septembre 2026
**Statut :** Conception initiale

---

# 1. Objet du document

Ce document définit les principaux objets métier d'IntelliFlood et leurs relations.

Après avoir identifié :

* les besoins ;
* les acteurs ;
* les cas d'utilisation ;
* les activités ;
* les interactions ;

nous devons maintenant répondre à la question :

> **De quoi est composé le monde métier d'IntelliFlood ?**

Le modèle de domaine constitue une représentation conceptuelle des objets manipulés par le système.

Il servira de base :

* au diagramme de classes ;
* au modèle conceptuel de données ;
* à la conception de la base de données ;
* aux API ;
* aux services applicatifs ;
* aux tests.

---

# 2. Documents de référence

* DOCUMENT001 — Vision & Périmètre ;
* DOCUMENT002 — Parties prenantes & utilisateurs ;
* DOCUMENT003 — Expression des besoins & exigences ;
* DOCUMENT004 — Acteurs & cas d'utilisation ;
* DOCUMENT005 — Diagrammes d'activités ;
* DOCUMENT006 — Diagrammes de séquence & interactions.

---

# 3. Principes du modèle de domaine

Le modèle doit respecter plusieurs principes :

1. séparation des responsabilités ;
2. distinction entre données réelles et données simulées ;
3. prise en compte de la dimension géographique ;
4. prise en compte de la dimension temporelle ;
5. traçabilité des informations ;
6. gestion des sources ;
7. gestion des utilisateurs et permissions ;
8. support du mode hors ligne ;
9. extensibilité ;
10. indépendance relative vis-à-vis de la technologie de stockage.

---

# 4. Principales catégories d'objets

Le domaine IntelliFlood peut être divisé en plusieurs groupes.

```text
Utilisateur
     │
     ├── Sécurité
     │
     ├── Observation
     │
     ├── Données
     │
     ├── Territoire
     │
     ├── Événements
     │
     ├── Risques
     │
     ├── Simulation
     │
     ├── Intelligence
     │
     ├── Alertes
     │
     └── Rapports
```

---

# 5. Classe Utilisateur

## USER-001 — Utilisateur

Représente une personne utilisant IntelliFlood.

### Attributs conceptuels

* id ;
* nom ;
* identifiant ;
* profil ;
* statut ;
* date de création ;
* dernière activité.

### Responsabilités

* s'authentifier ;
* effectuer des actions ;
* consulter des données ;
* créer des observations ;
* recevoir des notifications selon ses permissions.

---

# 6. Classe Profil

## USER-002 — Profil

Définit le type fonctionnel d'un utilisateur.

Profils initiaux :

* Citoyen ;
* Agent de terrain ;
* Analyste / Expert ;
* Responsable opérationnel ;
* Administrateur.

Un profil possède plusieurs permissions.

---

# 7. Classe Permission

## USER-003 — Permission

Représente une autorisation permettant d'effectuer une action.

Exemples :

* consulter une donnée ;
* créer une observation ;
* modifier une observation ;
* valider une observation ;
* lancer une simulation ;
* gérer les utilisateurs.

---

# 8. Classe Session

## USER-004 — Session

Représente une session d'utilisation.

Attributs conceptuels :

* id ;
* utilisateur ;
* date de début ;
* date d'expiration ;
* état.

---

# 9. Classe Zone

## GEO-001 — Zone

Représente une zone géographique.

Une zone peut être :

* une région ;
* une ville ;
* un quartier ;
* un bassin ;
* une zone d'étude ;
* une zone affectée ;
* une zone administrative.

Attributs :

* id ;
* nom ;
* géométrie ;
* type ;
* propriétés.

---

# 10. Classe Objet géographique

## GEO-002 — GeoObject

Représente un objet localisé dans l'espace.

Exemples :

* bâtiment ;
* route ;
* pont ;
* cours d'eau ;
* infrastructure ;
* capteur.

Attributs :

* id ;
* géométrie ;
* type ;
* propriétés ;
* source.

---

# 11. Classe Observation

## OBS-001 — Observation

Représente une information observée ou collectée.

Attributs :

* id ;
* type ;
* description ;
* date ;
* position ;
* auteur ;
* source ;
* statut ;
* confiance.

Une observation peut être associée à :

* une zone ;
* un média ;
* un événement ;
* une source ;
* un utilisateur.

---

# 12. Classe Média

## OBS-002 — Media

Représente un fichier associé à une observation.

Types possibles :

* image ;
* vidéo ;
* audio ;
* document.

Attributs :

* id ;
* type ;
* emplacement ;
* taille ;
* date ;
* empreinte ;
* métadonnées.

---

# 13. Classe Source

## DATA-001 — Source

Représente l'origine d'une information.

Une source peut être :

* utilisateur ;
* capteur ;
* satellite ;
* API ;
* organisation ;
* base de données ;
* modèle ;
* système externe.

Attributs :

* id ;
* nom ;
* type ;
* description ;
* fiabilité ;
* dernière synchronisation.

---

# 14. Classe Donnée

## DATA-002 — Data

Représente une donnée exploitée par IntelliFlood.

Une donnée peut être :

* géographique ;
* météorologique ;
* hydrologique ;
* environnementale ;
* issue d'une observation ;
* calculée ;
* prédite ;
* simulée ;
* générée par IA.

---

# 15. Classe Événement

## EVENT-001 — Event

Représente un événement significatif.

Exemples :

* forte pluie ;
* montée des eaux ;
* inondation ;
* route bloquée ;
* anomalie ;
* alerte ;
* synchronisation.

Attributs :

* id ;
* type ;
* date ;
* position ;
* gravité ;
* statut.

---

# 16. Classe Risque

## RISK-001 — Risk

Représente un niveau de risque associé à une zone ou un objet.

Attributs :

* id ;
* niveau ;
* type ;
* zone ;
* date d'évaluation ;
* méthode ;
* confiance.

---

# 17. Classe Vulnérabilité

## RISK-002 — Vulnerability

Représente le degré de vulnérabilité d'un élément.

Elle peut concerner :

* population ;
* bâtiment ;
* route ;
* infrastructure ;
* activité ;
* zone.

---

# 18. Classe Alerte

## ALERT-001 — Alert

Représente une alerte générée ou créée par le système.

Attributs :

* id ;
* titre ;
* description ;
* niveau ;
* date ;
* zone ;
* statut ;
* origine.

---

# 19. Classe Notification

## ALERT-002 — Notification

Représente une notification envoyée à un utilisateur.

Attributs :

* id ;
* destinataire ;
* type ;
* contenu ;
* date ;
* statut ;
* alerte associée.

---

# 20. Classe Scénario

## SIM-001 — Scenario

Représente un scénario hypothétique.

Attributs :

* id ;
* nom ;
* description ;
* créateur ;
* paramètres ;
* date de création.

---

# 21. Classe Simulation

## SIM-002 — Simulation

Représente l'exécution d'un scénario.

Attributs :

* id ;
* scénario ;
* date de lancement ;
* date de fin ;
* statut ;
* modèle utilisé ;
* résultats.

---

# 22. Classe Résultat

## SIM-003 — Result

Représente un résultat produit par un calcul, une simulation ou une analyse.

Un résultat DOIT être associé à son type.

Types possibles :

* calcul ;
* prévision ;
* simulation ;
* IA ;
* analyse.

---

# 23. Classe Modèle

## AI-001 — Model

Représente un modèle utilisé pour produire un résultat.

Exemples :

* modèle hydrologique ;
* modèle de vision ;
* modèle de détection ;
* modèle de langage ;
* modèle statistique.

Attributs :

* id ;
* nom ;
* version ;
* type ;
* fournisseur ;
* statut.

---

# 24. Classe Analyse

## AI-002 — Analysis

Représente une opération d'analyse.

Attributs :

* id ;
* type ;
* date ;
* utilisateur ;
* données d'entrée ;
* résultat ;
* méthode.

---

# 25. Classe Rapport

## REPORT-001 — Report

Représente un rapport généré par IntelliFlood.

Attributs :

* id ;
* titre ;
* auteur ;
* date ;
* période ;
* zone ;
* contenu ;
* sources.

---

# 26. Classe Annotation

## COLLAB-001 — Annotation

Représente une annotation placée sur une donnée ou un objet.

Attributs :

* id ;
* auteur ;
* contenu ;
* position ;
* date.

---

# 27. Classe Synchronisation

## SYNC-001 — SyncOperation

Représente une opération de synchronisation.

Attributs :

* id ;
* appareil ;
* date ;
* statut ;
* éléments concernés ;
* erreurs ;
* conflits.

---

# 28. Classe Conflit

## SYNC-002 — SyncConflict

Représente un conflit entre deux versions d'une donnée.

Attributs :

* id ;
* objet concerné ;
* version locale ;
* version distante ;
* date ;
* statut ;
* résolution.

---

# 29. Relations principales

Les relations conceptuelles principales sont :

```text
Utilisateur ───── possède ─────► Profil
Profil ───────── possède ──────► Permission

Utilisateur ───── crée ─────────► Observation
Observation ───── possède ──────► Media
Observation ───── provient ─────► Source
Observation ───── concerne ─────► Zone

Zone ─────────── contient ──────► GeoObject

Zone ─────────── possède ───────► Risk
Risk ─────────── possède ───────► Vulnerability

Event ────────── peut générer ──► Alert
Alert ────────── génère ────────► Notification

Utilisateur ───── crée ─────────► Scenario
Scenario ─────── donne lieu ────► Simulation
Simulation ───── produit ───────► Result

Analysis ─────── produit ───────► Result
Model ─────────── produit ──────► Result

Utilisateur ───── crée ─────────► Report
Utilisateur ───── crée ─────────► Annotation

Utilisateur ───── déclenche ────► SyncOperation
SyncOperation ─── peut générer ─► SyncConflict
```

---

# 30. Modèle de domaine global

```text
                         UTILISATEUR
                              │
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
          Profil         Observation        Analyse
             │                │                │
             ▼                ▼                ▼
        Permission          Média           Résultat
                              │                ▲
                              ▼                │
                            Source          Modèle
                              │
                              ▼
                             Zone
                              │
                   ┌──────────┼──────────┐
                   ▼          ▼          ▼
               GeoObject     Risk      Event
                              │          │
                              ▼          ▼
                        Vulnerability  Alert
                                         │
                                         ▼
                                   Notification

             Scenario ──► Simulation ──► Result

             Report
             Annotation
             SyncOperation ──► SyncConflict
```

---

# 31. États importants

Certaines classes possèdent un cycle de vie.

## Observation

```text
Nouvelle
   │
   ▼
En vérification
   │
   ├──► Vérifiée
   │
   └──► Rejetée
```

## Alerte

```text
Créée
  │
  ▼
Active
  │
  ├──► Prise en charge
  │
  └──► Clôturée
```

## Simulation

```text
Créée
  │
  ▼
Configurée
  │
  ▼
En attente
  │
  ▼
En cours
  │
  ├──► Terminée
  │
  └──► Échouée
```

---

# 32. Principes de conception du modèle

### DEC-007-001

Une observation est différente d'un résultat calculé.

### DEC-007-002

Une simulation ne doit jamais être confondue avec une observation réelle.

### DEC-007-003

Une source doit être identifiable lorsque cela est possible.

### DEC-007-004

Les objets géographiques doivent pouvoir être associés à des données temporelles.

### DEC-007-005

Les résultats produits par l'IA doivent conserver l'identité du modèle utilisé lorsque cette information est disponible.

### DEC-007-006

Les objets du domaine ne doivent pas dépendre directement d'une technologie de base de données.

---

# 33. Préparation du DOCUMENT008

Le DOCUMENT008 transformera ce modèle de domaine en **modèle conceptuel de données**.

Il précisera notamment :

* les entités ;
* les attributs ;
* les identifiants ;
* les relations ;
* les cardinalités ;
* les contraintes ;
* les données géospatiales ;
* les données temporelles.

---

# 34. État du document

**DOCUMENT007 : TERMINÉ — VERSION 1.0**
