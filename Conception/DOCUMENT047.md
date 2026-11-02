# DOCUMENT047 — ARCHITECTURE DE GESTION DES DONNÉES EXTERNES & INGESTION

**Projet : IntelliFlood**
**Version : V1.0**
**Statut : Spécification technique**

---

## 1. Objectif

IntelliFlood doit pouvoir exploiter des données provenant de sources externes afin d'enrichir sa représentation du monde, améliorer l'analyse des phénomènes hydrologiques et alimenter ses moteurs spécialisés.

Le présent document définit l'architecture permettant de :

* connecter des sources externes ;
* récupérer des données ;
* valider leur structure ;
* contrôler leur qualité ;
* normaliser les données ;
* conserver leur provenance ;
* détecter les erreurs ;
* gérer les doublons ;
* gérer les mises à jour ;
* intégrer les données dans IntelliFlood ;
* fonctionner avec des connexions instables ou intermittentes ;
* conserver un historique des importations.

L'ingestion ne doit jamais permettre à une source externe de modifier directement les données critiques d'IntelliFlood sans passer par les mécanismes de validation prévus.

---

# 2. Principe fondamental

Le système suit le flux :

```text
SOURCE EXTERNE
      │
      ▼
CONNECTEUR
      │
      ▼
COLLECTE
      │
      ▼
VALIDATION
      │
      ▼
NORMALISATION
      │
      ▼
DÉDUPLICATION
      │
      ▼
CONTRÔLE QUALITÉ
      │
      ▼
ENRICHISSEMENT
      │
      ▼
STOCKAGE
      │
      ▼
WORLD / FLOOD / GEO / INTELLIGENCE
```

Une donnée externe ne devient donc pas automatiquement une donnée officielle du système.

---

# 3. Types de sources

IntelliFlood doit pouvoir intégrer différentes catégories de sources.

**⚠️ EXEMPLES NON EXHAUSTIFS :**

* API ;
* fichiers CSV ;
* fichiers JSON ;
* fichiers XML ;
* fichiers GeoJSON ;
* fichiers GeoPackage ;
* données raster ;
* données provenant de capteurs ;
* stations météorologiques ;
* stations hydrologiques ;
* systèmes institutionnels ;
* bases de données externes ;
* flux temps réel ;
* données historiques ;
* données importées manuellement ;
* données scientifiques.

La liste réelle des connecteurs devra être définie selon les besoins du projet.

---

# 4. Architecture du Data Ingestion Engine

```text
                ┌───────────────────────┐
                │   SOURCES EXTERNES    │
                └───────────┬───────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │ Source Connectors     │
                └───────────┬───────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │ Collection Manager    │
                └───────────┬───────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │ Validation Engine     │
                └───────────┬───────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │ Normalization Engine  │
                └───────────┬───────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │ Deduplication Engine  │
                └───────────┬───────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │ Quality Engine        │
                └───────────┬───────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │ Provenance Manager    │
                └───────────┬───────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │ IntelliFlood Data     │
                │ Layer                 │
                └───────────────────────┘
```

---

# 5. Source Registry

Toutes les sources doivent être enregistrées dans un registre.

Une source peut posséder :

* un identifiant ;
* un nom ;
* une description ;
* un type ;
* un propriétaire ;
* une organisation ;
* une URL ou localisation ;
* une fréquence de mise à jour ;
* un format ;
* un niveau de confiance ;
* un statut ;
* une date de dernière synchronisation ;
* une configuration d'authentification ;
* une politique de rétention.

**⚠️ EXEMPLE NON EXHAUSTIF :**

```text
Source :
    id = source-001
    name = Station Hydrologique A
    type = SENSOR_API
    format = JSON
    update_frequency = 5 minutes
    status = ACTIVE
```

---

# 6. Connecteurs

Chaque source possède un connecteur adapté.

Architecture :

```text
Data Source
     │
     ▼
Connector Interface
     │
     ├── API Connector
     ├── File Connector
     ├── Sensor Connector
     ├── Database Connector
     └── Stream Connector
```

**⚠️ EXEMPLES NON EXHAUSTIFS.**

Les technologies concrètes utilisées pour chaque connecteur restent à définir.

---

# 7. Interface de connecteur

Un connecteur doit au minimum pouvoir :

```text
connect()
disconnect()
test_connection()
fetch()
fetch_incremental()
validate_configuration()
get_metadata()
```

Les méthodes exactes pourront évoluer selon le type de source.

---

# 8. Collecte

La collecte doit être :

* contrôlée ;
* traçable ;
* répétable ;
* tolérante aux erreurs ;
* capable de reprendre après interruption.

Chaque opération de collecte possède un identifiant unique.

**Exemple :**

```text
Ingestion Run
    ID: ingest-7f83...
    Source: source-001
    Started: ...
    Finished: ...
    Status: COMPLETED
```

---

# 9. Validation

Avant intégration, les données sont validées.

La validation peut concerner :

### Structure

* champs obligatoires ;
* types ;
* formats ;
* encodage.

### Valeurs

* plages numériques ;
* unités ;
* valeurs impossibles ;
* valeurs manquantes.

### Géographie

* coordonnées valides ;
* géométrie valide ;
* système de coordonnées connu.

### Temporalité

* timestamp valide ;
* ordre temporel ;
* date raisonnable.

---

# 10. Normalisation

Les sources peuvent utiliser des conventions différentes.

Exemple :

```text
Source A:
water_level = 2.5
unit = m

Source B:
niveau_eau = 250
unit = cm
```

Après normalisation :

```text
water_level = 2.5
unit = meter
```

La normalisation doit être déterministe lorsqu'elle concerne des transformations scientifiques ou numériques.

---

# 11. Unités

Chaque mesure doit conserver son unité.

Lorsqu'une conversion est effectuée :

```text
Valeur originale
        │
        ▼
Conversion déterministe
        │
        ▼
Valeur normalisée
```

La valeur originale ne doit pas être supprimée lorsque sa conservation est nécessaire à la traçabilité.

---

# 12. Géospatial

Les données géographiques doivent être normalisées vers les conventions internes d'IntelliFlood.

Le système doit notamment contrôler :

* latitude ;
* longitude ;
* système de coordonnées ;
* géométrie ;
* validité topologique ;
* précision.

Les données géospatiales sont ensuite transmises au Geo/Data Engine.

---

# 13. Déduplication

Une même donnée peut être reçue plusieurs fois.

Le système doit pouvoir détecter les doublons grâce à des informations telles que :

**⚠️ EXEMPLES NON EXHAUSTIFS :**

* identifiant externe ;
* source ;
* timestamp ;
* localisation ;
* type de mesure ;
* hash du contenu.

La stratégie exacte dépendra du type de données.

---

# 14. Contrôle qualité

Chaque donnée peut recevoir un état de qualité.

**⚠️ EXEMPLES NON EXHAUSTIFS :**

```text
VALID
WARNING
SUSPICIOUS
INVALID
UNKNOWN
```

Le système ne doit pas supprimer automatiquement une donnée simplement parce qu'elle est inhabituelle.

Une donnée inhabituelle peut représenter un événement réel.

---

# 15. Provenance

Chaque donnée externe doit pouvoir répondre à :

> D'où vient cette donnée ?

Informations possibles :

```text
source_id
external_id
collection_time
original_timestamp
ingestion_time
connector_version
transformation_version
validation_status
```

La provenance est essentielle pour l'audit et l'intelligence artificielle.

---

# 16. Raw Data vs Normalized Data

Architecture recommandée :

```text
SOURCE
  │
  ├──────────────► RAW DATA
  │
  ▼
NORMALIZATION
  │
  ▼
VALIDATED DATA
  │
  ▼
OPERATIONAL DATA
```

Les données brutes peuvent être conservées lorsqu'elles sont nécessaires à :

* l'audit ;
* la reconstruction ;
* la correction ;
* la comparaison ;
* la recherche d'erreur.

---

# 17. Ingestion incrémentale

Lorsque la source le permet, IntelliFlood ne doit pas récupérer systématiquement toutes les données.

Exemple :

```text
Dernière synchronisation
        │
        ▼
Cursor / Timestamp
        │
        ▼
Nouvelles données uniquement
```

Cela réduit :

* la bande passante ;
* le temps ;
* la charge serveur ;
* le stockage temporaire.

---

# 18. Gestion des erreurs

Une ingestion peut échouer.

Le système doit distinguer :

```text
NETWORK_ERROR
AUTHENTICATION_ERROR
FORMAT_ERROR
VALIDATION_ERROR
SOURCE_ERROR
TIMEOUT
RATE_LIMIT
INTERNAL_ERROR
```

Une erreur ne doit pas provoquer automatiquement la perte des données déjà correctement ingérées.

---

# 19. Retry

Les erreurs temporaires peuvent être réessayées.

```text
Attempt 1
   │
   ├── FAIL
   ▼
Wait
   │
Attempt 2
   │
   ├── FAIL
   ▼
Wait
   │
Attempt 3
```

Le nombre maximal de tentatives devra être défini techniquement.

---

# 20. Mode offline

L'ingestion doit être compatible avec l'architecture Offline-first.

Lorsqu'une connexion n'est pas disponible :

```text
SOURCE
  │
  X réseau indisponible
  │
  ▼
LOCAL BUFFER
  │
  ▼
RETRY
  │
  ▼
SERVER
```

Les données collectées localement doivent conserver leur timestamp original.

---

# 21. Data Quality Pipeline

```text
Raw
 │
 ▼
Schema Validation
 │
 ▼
Semantic Validation
 │
 ▼
Geospatial Validation
 │
 ▼
Temporal Validation
 │
 ▼
Unit Validation
 │
 ▼
Deduplication
 │
 ▼
Quality Score / Status
 │
 ▼
Accepted / Rejected / Quarantined
```

Une zone de quarantaine peut être utilisée pour les données nécessitant une analyse supplémentaire.

---

# 22. Intégration avec les moteurs

Le Data Ingestion Engine ne doit pas devenir propriétaire de tous les domaines.

```text
                 DATA INGESTION
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
        GEO          FLOOD        WORLD
          │            │            │
          └────────────┼────────────┘
                       ▼
                  INTELLIGENCE
```

Le moteur d'ingestion fournit les données validées aux moteurs concernés.

---

# 23. Sécurité

Les connecteurs externes peuvent contenir des secrets.

Il est interdit de stocker directement des secrets dans :

* le code source ;
* les logs ;
* les données publiques ;
* les fichiers versionnés.

Les credentials doivent utiliser le mécanisme sécurisé prévu par l'infrastructure.

---

# 24. Observabilité

Chaque ingestion doit pouvoir être observée.

**⚠️ EXEMPLES NON EXHAUSTIFS :**

* durée ;
* nombre d'éléments reçus ;
* nombre d'éléments valides ;
* nombre d'éléments rejetés ;
* erreurs ;
* volume ;
* dernière synchronisation ;
* latence.

---

# 25. Audit

Une trace doit être conservée pour les opérations importantes :

```text
SOURCE
COLLECT
VALIDATE
NORMALIZE
IMPORT
REJECT
RETRY
DELETE
```

---

# 26. Tests

Les tests doivent couvrir :

* connecteurs ;
* validation ;
* conversion ;
* unités ;
* géométrie ;
* déduplication ;
* provenance ;
* erreurs ;
* retry ;
* ingestion incrémentale ;
* offline ;
* sécurité.

---

# 27. Décisions

### ING-001

Toute donnée externe passe par un pipeline contrôlé avant intégration.

### ING-002

La provenance doit être conservée.

### ING-003

Les transformations importantes doivent être traçables.

### ING-004

Les données brutes peuvent être conservées lorsqu'elles sont nécessaires à l'audit.

### ING-005

Les calculs de transformation critiques doivent être déterministes.

### ING-006

L'ingestion incrémentale doit être privilégiée lorsque possible.

### ING-007

Les erreurs temporaires doivent pouvoir être réessayées.

### ING-008

Les données suspectes ne doivent pas être automatiquement considérées comme fausses.

### ING-009

Les connecteurs sont découplés du reste du système.

### ING-010

Aucune source externe ne doit contourner les contrôles d'IntelliFlood.

---

# 28. Principe final

> **IntelliFlood ne fait pas simplement entrer des données : il établit leur provenance, contrôle leur qualité et transforme progressivement des données externes en données exploitables.**

**⚠️ EXEMPLES NON EXHAUSTIFS : les éléments présentés comme exemples illustrent le fonctionnement attendu, mais ne constituent pas une liste complète des fonctionnalités, données, cas d'utilisation ou composants à implémenter.**


---

## Complément — connecteurs IoT et sources météo (29 octobre 2026)

Le Data Ingestion Engine doit prendre en charge une architecture de connecteurs indépendants des fabricants. Selon les capacités des sources, les voies d'intégration possibles comprennent :
- envoi direct HTTPS ou MQTT par un appareil ou contrôleur compatible ;
- récupération via API de plateforme/fabricant ;
- réception de webhooks ou de flux d'événements ;
- passerelle locale pour protocoles ou appareils qui ne communiquent pas directement avec le backend ;
- import de jeux de données météorologiques, géospatiaux, hydrologiques, satellitaires/radar ou de relevés terrain lorsque accessibles et autorisés.

Ces voies ne sont pas toutes à développer dès le départ et ne sont pas disponibles pour chaque appareil. La sélection doit s'appuyer sur la documentation réelle, l'accès aux données, la sécurité, les coûts, les quotas, les licences, la couverture nationale, la capacité hors ligne et le risque d'enfermement fournisseur.

Format normalisé indicatif d'une observation : identifiant de source/appareil, type de mesure, valeur, unité, horodatage de mesure, horodatage de réception, localisation, état de qualité, provenance et informations de calibration si disponibles. Ce format est illustratif et non exhaustif.

Les API météo doivent être évaluées spécifiquement pour la Côte d'Ivoire avant sélection. Les clés doivent rester dans une configuration secrète ; un catalogue d'API ne constitue pas en lui-même un service de données. Les doublons, données tardives, capteurs silencieux, valeurs aberrantes et interruptions de réseau doivent être traités explicitement.
