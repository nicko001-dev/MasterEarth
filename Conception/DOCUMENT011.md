# DOCUMENT011 — ARCHITECTURE OFFLINE-FIRST & SYNCHRONISATION

**Projet :** IntelliFlood
**Type :** Architecture technique et fonctionnelle
**Version :** 1.0
**Statut :** Conception
**Date :** 30 septembre 2026

---

# 1. Objet du document

Ce document définit la stratégie **Offline-first** d'IntelliFlood.

L'objectif est de permettre à l'utilisateur de continuer à travailler même lorsque :

* Internet est absent ;
* le réseau est faible ;
* le serveur est temporairement indisponible ;
* la connexion est intermittente.

---

# 2. Pourquoi l'Offline-first ?

Dans un contexte d'inondation, les utilisateurs peuvent intervenir dans des zones où la connexion est mauvaise.

Un agent doit pouvoir :

* consulter une carte déjà chargée ;
* créer une observation ;
* prendre une photo ;
* enregistrer une position ;
* consulter certaines données ;
* préparer une analyse ;
* modifier des informations ;
* continuer son travail.

La connexion ne doit donc pas être une condition obligatoire pour les opérations essentielles.

---

# 3. Principe général

Architecture :

```text
             UTILISATEUR
                  │
                  ▼
        APPLICATION LOCALE
                  │
          ┌───────┴───────┐
          │               │
     DONNÉES LOCALES   FILE SYNC
          │               │
          └───────┬───────┘
                  │
             CONNEXION
                  │
                  ▼
            SERVEUR DISTANT
```

---

# 4. Principe Offline-first

L'application ne doit pas systématiquement demander :

> "Suis-je connecté ?"

avant d'effectuer une opération.

Elle doit privilégier :

> "Puis-je effectuer cette opération localement ?"

Si oui, elle l'effectue immédiatement.

La synchronisation est réalisée ensuite lorsque cela est possible.

---

# 5. Données disponibles hors ligne

Selon les permissions et les capacités de l'appareil, les données locales peuvent comprendre :

* cartes ;
* zones ;
* objets géographiques ;
* observations ;
* événements ;
* photos ;
* données récemment consultées ;
* scénarios ;
* résultats nécessaires ;
* paramètres ;
* données de référence.

---

# 6. Opérations hors ligne

Exemples :

### Observation

```text
Créer observation
      ↓
Enregistrer localement
      ↓
Ajouter à la file de synchronisation
      ↓
Synchroniser plus tard
```

### Média

```text
Prendre photo
     ↓
Stockage local
     ↓
Association à l'observation
     ↓
Upload ultérieur
```

---

# 7. File de synchronisation

Chaque modification nécessitant une synchronisation produit une opération.

Exemple :

```text
SYNC-001
type = CREATE
entity = OBSERVATION
entity_id = OBS-458
created_at = 14:32
status = PENDING
```

---

# 8. États d'une opération

Une opération peut suivre le cycle :

```text
PENDING
   ↓
PROCESSING
   ↓
SYNCED
```

Ou :

```text
PENDING
   ↓
PROCESSING
   ↓
FAILED
   ↓
RETRY
   ↓
PROCESSING
```

---

# 9. Types d'opérations

Les opérations principales sont :

* CREATE ;
* UPDATE ;
* DELETE ;
* UPLOAD ;
* DOWNLOAD ;
* LINK ;
* UNLINK.

---

# 10. Synchronisation

Lorsque la connexion revient :

```text
Connexion détectée
        ↓
Vérification réseau
        ↓
Lecture de la file
        ↓
Envoi des opérations
        ↓
Réception des réponses
        ↓
Mise à jour locale
        ↓
Résolution des conflits
        ↓
Synchronisation terminée
```

---

# 11. Synchronisation automatique

La synchronisation peut être déclenchée :

* au retour du réseau ;
* à l'ouverture de l'application ;
* périodiquement ;
* manuellement ;
* après une opération importante.

---

# 12. Synchronisation manuelle

L'utilisateur peut également disposer d'une commande :

> **Synchroniser maintenant**

Cette fonctionnalité permet notamment à un agent de vérifier que ses données ont bien été transmises.

---

# 13. Gestion des conflits

Un conflit apparaît lorsque deux modifications incompatibles concernent la même donnée.

Exemple :

```text
Agent A hors ligne
       ↓
Observation modifiée
       ↓
        ┐
        │
        ├── Synchronisation
        │
        ┘
Agent B a aussi modifié l'observation
```

Le système doit détecter le conflit.

---

# 14. Stratégies de résolution

Selon le type de donnée, plusieurs stratégies peuvent être utilisées :

### Résolution automatique

Lorsque le conflit est simple.

### Priorité à la version validée

Pour certaines données officielles.

### Priorité temporelle

Lorsque la modification la plus récente est applicable.

### Fusion

Lorsque les modifications peuvent être combinées.

### Intervention humaine

Pour les données critiques ou ambiguës.

---

# 15. Principe de sécurité

Une résolution automatique ne doit pas écraser silencieusement une donnée importante.

Pour les données sensibles :

```text
CONFLIT
   ↓
DÉTECTION
   ↓
BLOCAGE OU VERSIONNAGE
   ↓
VÉRIFICATION
   ↓
RÉSOLUTION
```

---

# 16. Versionnement

Les données susceptibles d'être modifiées doivent pouvoir conserver :

* version ;
* auteur ;
* date ;
* modification ;
* origine ;
* état.

Exemple :

```text
Observation OBS-100

Version 1 → Agent A
Version 2 → Agent B
Version 3 → Validation analyste
```

---

# 17. Idempotence

Une opération de synchronisation doit être conçue pour éviter les doublons.

Exemple :

Si une opération CREATE est envoyée deux fois à cause d'une mauvaise connexion, le serveur ne doit pas créer deux observations identiques.

Chaque opération doit donc posséder un identifiant unique.

---

# 18. Reprise après interruption

Si la connexion est interrompue pendant une synchronisation :

```text
Synchronisation
     ↓
Opération 1 ✓
Opération 2 ✓
Opération 3 ✗
     ↓
Connexion perdue
     ↓
Reprise ultérieure
     ↓
Opération 3
```

Le système ne doit pas recommencer inutilement les opérations déjà confirmées.

---

# 19. Médias

Les photos et vidéos peuvent être beaucoup plus volumineuses que les données textuelles.

Le système doit donc prévoir :

* compression éventuelle ;
* file d'upload ;
* reprise d'upload ;
* contrôle de taille ;
* stockage local temporaire ;
* suppression locale après confirmation selon configuration.

---

# 20. Cartographie offline

Le système pourra permettre le téléchargement préalable de zones.

Exemple :

```text
Zone d'intervention
        ↓
Télécharger
        ↓
Carte locale
        ↓
Utilisation hors ligne
```

---

# 21. Indicateur de synchronisation

L'interface doit informer l'utilisateur de l'état des données.

Exemples :

```text
✓ Synchronisé
⟳ Synchronisation
○ En attente
⚠ Conflit
✕ Échec
```

---

# 22. Mode dégradé

Lorsque certaines fonctionnalités nécessitent une connexion ou une puissance importante, IntelliFlood doit pouvoir fonctionner en mode dégradé.

Exemple :

```text
ONLINE
→ toutes les fonctions disponibles

OFFLINE
→ fonctions locales disponibles

RÉSEAU FAIBLE
→ synchronisation différée
```

---

# 23. Données prioritaires

En cas de bande passante limitée, le système peut donner priorité à :

1. alertes critiques ;
2. observations importantes ;
3. positions opérationnelles ;
4. données textuelles ;
5. métadonnées ;
6. médias ;
7. données volumineuses secondaires.

---

# 24. Architecture

```text
┌─────────────────────────────────────────┐
│              APPLICATION                │
├─────────────────────────────────────────┤
│ Interface                               │
│ Application                             │
│ Domain                                  │
├─────────────────────────────────────────┤
│          OFFLINE & SYNC ENGINE          │
│                                         │
│ Local Store                             │
│ Cache                                   │
│ Sync Queue                              │
│ Conflict Manager                        │
│ Retry Manager                           │
│ Network Monitor                         │
└────────────────────┬────────────────────┘
                     │
                INTERNET
                     │
┌────────────────────▼────────────────────┐
│              SERVICES DISTANTS          │
│                                         │
│ API                                     │
│ Database                                │
│ Object Storage                          │
│ Processing                              │
└─────────────────────────────────────────┘
```

---

# 25. Données locales et distantes

Il faut distinguer :

### Source locale

Donnée disponible immédiatement sur l'appareil.

### Source distante

Donnée disponible depuis un serveur ou service externe.

### Donnée synchronisée

Donnée ayant été transférée entre les deux environnements.

---

# 26. Confidentialité

Les données locales peuvent contenir des informations sensibles.

L'architecture devra donc prévoir :

* authentification ;
* protection du stockage local ;
* contrôle d'accès ;
* expiration de session ;
* chiffrement lorsque nécessaire ;
* suppression sécurisée selon les besoins.

---

# 27. Traçabilité

Chaque synchronisation importante doit pouvoir être auditée.

Exemple :

```text
Qui ?
Quand ?
Quelle donnée ?
Quelle opération ?
Quel appareil ?
Succès ou échec ?
Conflit ?
Résolution ?
```

---

# 28. Décisions de conception

Les décisions suivantes sont retenues :

1. IntelliFlood est conçu **Offline-first**.
2. Les opérations essentielles doivent fonctionner sans connexion.
3. Les modifications sont enregistrées localement avant synchronisation.
4. Une file de synchronisation est utilisée.
5. Les opérations possèdent des identifiants uniques.
6. Le système doit être idempotent.
7. Les conflits sont détectés explicitement.
8. Les données critiques ne doivent pas être écrasées silencieusement.
9. Les médias disposent d'une stratégie spécifique.
10. La synchronisation doit pouvoir reprendre après interruption.
11. L'interface doit afficher l'état de synchronisation.
12. Le mécanisme exact de stockage local sera défini ultérieurement.

---

# 29. Préparation du DOCUMENT012

Le document suivant définira l'architecture du **World Engine**.

Il détaillera :

* représentation du monde ;
* globe ;
* carte ;
* terrain ;
* bâtiments ;
* routes ;
* infrastructures ;
* objets dynamiques ;
* couches ;
* 2D/3D ;
* navigation ;
* timeline ;
* cockpit ;
* interactions géographiques.

---

# 30. État du document

**DOCUMENT011 : TERMINÉ — VERSION 1.0**


---

## Complément — capteurs, passerelles et sécurité locale (29 octobre 2026)

L'architecture offline-first doit considérer les capteurs et passerelles comme des producteurs de données potentiellement déconnectés. Selon les capacités des appareils, ils peuvent conserver temporairement les mesures, horodater les observations, réessayer l'envoi et transmettre les données lors du rétablissement de la connexion. Les duplications, retards, désordres temporels et pertes de liaison doivent être gérés explicitement.

Les alarmes locales éventuelles (sirène, gyrophare ou autre dispositif) doivent être commandées par une logique locale validée et indépendante de la disponibilité du backend lorsqu'un tel comportement est requis et supporté par le matériel. Une panne réseau ne doit pas être présentée comme compatible avec l'envoi garanti d'alertes distantes.

Le mode hors ligne ne limite pas la couverture géographique du globe ou du territoire ivoirien ; il limite uniquement les données et opérations réellement disponibles localement.
