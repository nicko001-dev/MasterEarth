# DOCUMENT017 — ÉVÉNEMENTS, ALERTES & NOTIFICATIONS

**Projet :** IntelliFlood
**Type :** Architecture fonctionnelle
**Version :** 1.0
**Statut :** Conception
**Date :** 30 septembre 2026

---

# 1. Objet du document

Ce document définit le système permettant à IntelliFlood de :

* détecter des événements ;
* analyser leur importance ;
* générer des alertes ;
* notifier les utilisateurs ;
* suivre le traitement ;
* conserver l'historique.

---

# 2. Définitions

## Événement

Un fait ou changement détecté dans le système.

Exemple :

> Le niveau d'une rivière augmente.

## Alerte

Une information nécessitant potentiellement l'attention d'un utilisateur.

## Notification

Le moyen par lequel une alerte ou information est transmise.

---

# 3. Chaîne générale

```text
Donnée
  ↓
Événement
  ↓
Règle d'analyse
  ↓
Alerte éventuelle
  ↓
Notification
  ↓
Utilisateur
```

---

# 4. Sources d'événements

Un événement peut provenir :

* d'un capteur ;
* d'un utilisateur ;
* d'une observation ;
* d'une analyse ;
* du Flood Engine ;
* de l'Intelligence Engine ;
* d'un système externe ;
* d'une simulation.

---

# 5. Types d'événements

Exemples :

```text
PLUIE_IMPORTANTE
MONTEE_EAU
INONDATION
ROUTE_BLOQUEE
ANOMALIE
CAPTEUR_HORS_SERVICE
NOUVELLE_OBSERVATION
SIMULATION_TERMINEE
SYNCHRONISATION
```

---

# 6. Structure d'un événement

Un événement doit pouvoir contenir :

```text
id
type
date
position
source
description
données associées
niveau
statut
```

---

# 7. Déclenchement d'alerte

Tous les événements ne produisent pas nécessairement une alerte.

Exemple :

```text
Événement
   ↓
Évaluation
   ↓
Important ?
 ┌─┴─┐
Non Oui
 │    │
 ∅   Alerte
```

---

# 8. Règles

Une règle peut être conceptuellement définie ainsi :

```text
SI
    condition

ALORS
    créer une alerte
```

Exemple :

```text
SI niveau_eau > seuil
ALORS créer ALERTE_NIVEAU_EAU
```

---

# 9. Règles multiples

Une alerte peut dépendre de plusieurs facteurs.

Exemple :

```text
Pluie élevée
+
Sol saturé
+
Niveau rivière élevé
+
Zone vulnérable
        ↓
   Alerte potentielle
```

---

# 10. Niveaux

Le système peut utiliser plusieurs niveaux.

Exemple :

```text
INFO
FAIBLE
MODÉRÉ
IMPORTANT
CRITIQUE
```

Ces niveaux doivent être définis précisément lors de l'implémentation.

---

# 11. Statut d'une alerte

Cycle conceptuel :

```text
CREATED
   ↓
ACTIVE
   ↓
ACKNOWLEDGED
   ↓
RESOLVED
   ↓
CLOSED
```

Une alerte peut également être annulée lorsqu'elle est invalidée.

---

# 12. Acquittement

Un utilisateur autorisé peut indiquer :

> "J'ai pris connaissance de cette alerte."

L'acquittement ne signifie pas nécessairement que l'événement est terminé.

---

# 13. Résolution

Une alerte peut être considérée comme résolue lorsque la condition correspondante n'est plus active ou qu'un utilisateur autorisé l'a traitée selon les règles définies.

---

# 14. Notifications

Les notifications peuvent être transmises par :

* notification dans l'application ;
* notification mobile ;
* email ;
* SMS ;
* mécanisme externe.

Les canaux exacts dépendront du contexte et des contraintes techniques.

---

# 15. Priorité des notifications

Une notification peut avoir une priorité :

```text
LOW
NORMAL
HIGH
CRITICAL
```

---

# 16. Notification ciblée

Une notification peut être adressée :

* à un utilisateur ;
* à un groupe ;
* à un rôle ;
* à une organisation ;
* à une zone géographique.

---

# 17. Exemple opérationnel

```text
Capteur
   ↓
Niveau d'eau = 4,2 m
   ↓
Événement
   ↓
Règle
   ↓
Seuil dépassé
   ↓
Alerte
   ↓
Responsable opérationnel
   ↓
Notification
```

---

# 18. Faux positifs

Une alerte peut être incorrecte.

Le système doit donc permettre :

* validation ;
* invalidation ;
* correction ;
* retour utilisateur ;
* analyse historique.

---

# 19. Traçabilité

Une alerte doit conserver :

* événement d'origine ;
* règle déclenchée ;
* source ;
* date ;
* destinataires ;
* statut ;
* actions ;
* historique.

---

# 20. Historique

L'utilisateur autorisé doit pouvoir consulter :

* alertes actives ;
* alertes passées ;
* alertes résolues ;
* alertes annulées ;
* fréquence ;
* origine.

---

# 21. Événements temps réel

Lorsque le système reçoit une nouvelle donnée :

```text
Nouvelle donnée
      ↓
Traitement
      ↓
Événement
      ↓
Évaluation
      ↓
Alerte éventuelle
```

---

# 22. Architecture événementielle

```text
┌─────────────────────────────┐
│       SOURCES DE DONNÉES    │
└──────────────┬──────────────┘
               ↓
        Event Processor
               ↓
        Rule Engine
               ↓
        Alert Manager
               ↓
       Notification Manager
               ↓
       Utilisateurs / Systèmes
```

---

# 23. Offline

Une application offline peut :

* recevoir les alertes déjà synchronisées ;
* créer certaines alertes locales ;
* enregistrer des événements ;
* mettre en file certaines notifications.

Les alertes nécessitant une diffusion distante seront synchronisées lorsque possible.

---

# 24. Notifications critiques

Les notifications critiques doivent faire l'objet de règles spécifiques.

Le système doit éviter :

* la duplication excessive ;
* le spam ;
* les alertes contradictoires ;
* les notifications inutiles.

---

# 25. Escalade

Pour certaines alertes, une procédure d'escalade peut être prévue :

```text
Alerte
 ↓
Utilisateur primaire
 ↓
Pas d'acquittement
 ↓
Utilisateur secondaire
 ↓
Responsable
```

Cette fonctionnalité devra être activée selon les besoins organisationnels.

---

# 26. Simulation et alertes

Une simulation ne doit pas automatiquement être traitée comme une alerte réelle.

Elle doit être explicitement identifiée comme :

```text
SIMULATION
```

---

# 27. Séparation réel / simulation

```text
DONNÉE RÉELLE
    ↓
ÉVÉNEMENT RÉEL
    ↓
ALERTE RÉELLE

SCÉNARIO
    ↓
SIMULATION
    ↓
RÉSULTAT SIMULÉ
```

---

# 28. Décisions de conception

1. Un événement est distinct d'une alerte.
2. Une alerte est distincte d'une notification.
3. Les alertes sont déclenchées par des règles ou des processus explicitement définis.
4. Les niveaux sont configurables.
5. Les alertes sont historisées.
6. Les alertes peuvent être acquittées et résolues.
7. Les événements simulés sont séparés des événements réels.
8. Le système doit limiter les notifications inutiles.
9. Les actions importantes sont traçables.

---

# 29. Préparation du DOCUMENT018

Le document suivant définira :

**Système de simulation & scénarios**

Il détaillera :

* création de scénarios ;
* paramètres ;
* modèles ;
* exécution ;
* résultats ;
* comparaison ;
* versionnement ;
* reproductibilité ;
* visualisation.

---

# 30. État du document

**DOCUMENT017 : TERMINÉ — VERSION 1.0**


---

## Complément — provenance et résilience des alertes (29 octobre 2026)

Les événements pouvant déclencher une évaluation du risque peuvent provenir de capteurs, de données météo, de passerelles, d'observations citoyennes ou d'analyses géospatiales. Les règles doivent différencier une mesure observée, une prévision, une estimation de risque et une confirmation validée sur le terrain.

Les alertes locales peuvent fonctionner indépendamment du serveur lorsque l'équipement et sa configuration le permettent. Les notifications distantes dépendent toutefois des canaux de communication disponibles. Les canaux mentionnés (SMS, application, web, messagerie, sirène, relais communautaire ou autres) sont des options à évaluer, pas des intégrations déjà acquises. Les numéros d'urgence et procédures opérationnelles doivent être vérifiés auprès de sources officielles avant utilisation réelle.
