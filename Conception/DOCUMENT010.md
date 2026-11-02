# DOCUMENT010 — ARCHITECTURE DES DONNÉES GÉOSPATIALES & TEMPORELLES

**Projet :** IntelliFlood
**Type :** Architecture des données
**Version :** 1.0
**Statut :** Conception
**Date :** 30 septembre 2026

---

## 1. Objet du document

Ce document définit l'architecture conceptuelle des données géospatiales et temporelles d'IntelliFlood.

Il précise :

* les types de données géographiques ;
* les types de données temporelles ;
* la représentation des objets du territoire ;
* la localisation des observations ;
* la gestion des géométries ;
* la gestion de l'historique ;
* les relations entre données géographiques et phénomènes ;
* les métadonnées ;
* les principes de stockage et de recherche ;
* la gestion des données 2D, 3D et temporelles.

Ce document constitue une base pour :

* le modèle de données ;
* les bases de données géospatiales ;
* le World Engine ;
* le Flood Engine ;
* les simulations ;
* les analyses ;
* les interfaces cartographiques.

---

# 2. Principes fondamentaux

L'architecture des données d'IntelliFlood repose sur les principes suivants :

1. Toute donnée importante doit pouvoir être localisée.
2. Toute donnée importante doit pouvoir être datée.
3. Une donnée doit conserver sa source.
4. Une donnée calculée doit être distinguée d'une donnée observée.
5. Une donnée simulée doit être distinguée d'une donnée réelle.
6. Les données doivent pouvoir être historisées.
7. Les données géographiques doivent supporter plusieurs types de géométrie.
8. Les données doivent pouvoir être utilisées hors connexion.
9. Les données doivent pouvoir être synchronisées.
10. Les données doivent être traçables.

---

# 3. Dimensions principales des données

Une donnée IntelliFlood peut être décrite selon plusieurs dimensions.

## 3.1 Dimension spatiale

Elle répond à la question :

> Où se trouve cette donnée ?

Exemples :

* latitude ;
* longitude ;
* altitude ;
* point ;
* ligne ;
* polygone ;
* multipolygone ;
* volume 3D ;
* zone administrative ;
* bassin versant.

---

## 3.2 Dimension temporelle

Elle répond à la question :

> Quand cette donnée est-elle valable ?

Exemples :

* date d'observation ;
* date de création ;
* période de validité ;
* heure de début ;
* heure de fin ;
* historique ;
* prévision future.

---

## 3.3 Dimension sémantique

Elle répond à la question :

> Que représente cette donnée ?

Exemples :

* bâtiment ;
* route ;
* rivière ;
* pluie ;
* niveau d'eau ;
* inondation ;
* population ;
* risque ;
* observation ;
* simulation.

---

## 3.4 Dimension de provenance

Elle répond à la question :

> D'où vient cette donnée ?

Exemples :

* agent de terrain ;
* capteur ;
* satellite ;
* API ;
* modèle ;
* utilisateur ;
* organisme partenaire ;
* simulation.

---

# 4. Types de données géographiques

## 4.1 Point

Utilisé pour représenter un emplacement précis.

Exemples :

* capteur ;
* caméra ;
* observation ;
* véhicule ;
* position d'un agent ;
* point de mesure ;
* incident.

---

## 4.2 Ligne

Utilisée pour représenter un élément linéaire.

Exemples :

* route ;
* rivière ;
* canal ;
* conduite ;
* itinéraire ;
* trajet.

---

## 4.3 Polygone

Utilisé pour représenter une surface.

Exemples :

* zone inondée ;
* quartier ;
* commune ;
* bassin ;
* zone à risque ;
* zone d'étude.

---

## 4.4 Multipolygone

Utilisé lorsqu'une entité possède plusieurs surfaces distinctes.

Exemples :

* plusieurs zones inondées appartenant au même événement ;
* archipel ;
* zones administratives discontinues.

---

## 4.5 Géométrie 3D

Le système doit pouvoir représenter ultérieurement :

* bâtiments ;
* terrain ;
* volumes d'eau ;
* structures ;
* relief ;
* objets 3D.

---

# 5. Système de coordonnées

Chaque donnée géographique doit être associée à un système de coordonnées identifiable.

Une donnée doit donc conserver au minimum :

* géométrie ;
* système de référence spatial ;
* précision éventuelle ;
* altitude si disponible.

Le système doit éviter les conversions implicites non traçables.

---

# 6. Objets géographiques

Les principaux objets du territoire sont :

| Objet          | Exemple           |
| -------------- | ----------------- |
| Bâtiment       | Maison            |
| Route          | Autoroute         |
| Pont           | Pont routier      |
| Cours d'eau    | Rivière           |
| Canal          | Canal de drainage |
| Infrastructure | Hôpital           |
| Capteur        | Capteur de niveau |
| Caméra         | CCTV              |
| Zone           | Quartier          |
| Terrain        | Relief            |

Ces objets constituent la base du **World Engine**.

---

# 7. Données d'observation

Une observation représente une information constatée ou mesurée.

Exemple :

> Un agent constate que la route X est recouverte par environ 30 cm d'eau à 14h35.

Une observation doit pouvoir conserver :

* identifiant ;
* type ;
* description ;
* position ;
* date/heure ;
* auteur ;
* source ;
* média associé ;
* niveau de confiance ;
* statut de validation.

---

# 8. Données calculées

Une donnée calculée est produite par un algorithme.

Exemples :

* niveau de risque ;
* distance ;
* surface inondée ;
* vitesse estimée de propagation ;
* zone potentiellement touchée.

Elle doit être distinguée de l'observation originale.

---

# 9. Données prédites

Une donnée prédite représente une estimation future produite par un modèle.

Exemples :

* niveau d'eau prévu ;
* zone susceptible d'être inondée ;
* évolution probable d'une rivière.

Une prédiction doit conserver :

* modèle utilisé ;
* date de calcul ;
* horizon temporel ;
* données d'entrée ;
* résultat ;
* incertitude ou confiance lorsqu'elle est disponible.

---

# 10. Données simulées

Une simulation ne représente pas nécessairement la réalité.

Elle représente un scénario hypothétique.

Exemple :

> Que se passerait-il si 120 mm de pluie tombaient en 3 heures ?

Les résultats doivent donc être clairement marqués comme **SIMULÉS**.

---

# 11. Modèle temporel

IntelliFlood utilise trois grandes dimensions temporelles :

### Passé

Historique des événements.

### Présent

Situation actuelle connue.

### Futur

Prévisions et scénarios.

Le système doit permettre de naviguer dans le temps.

---

# 12. Timeline

Le World Engine devra pouvoir afficher une timeline.

Exemple :

```text
08:00 ─── 10:00 ─── 12:00 ─── 14:00 ─── 16:00
             │
             ├── pluie
             ├── montée des eaux
             ├── première observation
             ├── zone inondée
             └── alerte
```

Cette timeline pourra être utilisée pour :

* analyser un événement passé ;
* suivre un événement actuel ;
* visualiser une simulation ;
* comparer plusieurs périodes.

---

# 13. Métadonnées

Chaque donnée importante doit pouvoir conserver des métadonnées.

Exemple :

```text
id
type
source
created_at
observed_at
updated_at
geometry
confidence
status
version
```

---

# 14. Provenance

La provenance permet de répondre à la question :

> Comment cette information a-t-elle été obtenue ?

Exemple :

```text
Satellite
   ↓
Image
   ↓
Analyse
   ↓
Détection d'une zone humide
   ↓
Résultat géospatial
   ↓
Analyse du risque
```

Cette chaîne doit être conservée lorsque cela est pertinent.

---

# 15. Historisation

Les données importantes doivent pouvoir conserver leur évolution.

Exemple :

```text
Zone A
│
├── 10:00 : normale
├── 11:00 : faible accumulation
├── 12:00 : inondation légère
├── 13:00 : inondation importante
└── 14:00 : zone critique
```

---

# 16. Qualité des données

Chaque donnée peut être associée à un état de qualité.

Exemples :

* inconnue ;
* faible ;
* moyenne ;
* bonne ;
* vérifiée.

La qualité ne doit pas être confondue avec le niveau de risque.

---

# 17. Requêtes spatiales

Le système devra supporter des opérations telles que :

* trouver les objets dans une zone ;
* trouver les observations proches d'un point ;
* calculer une intersection ;
* calculer une distance ;
* rechercher les zones touchées ;
* trouver les infrastructures présentes dans une zone inondée.

---

# 18. Requêtes temporelles

Le système devra permettre :

* rechercher les événements d'une période ;
* comparer deux périodes ;
* retrouver l'état d'une zone à une date ;
* reconstruire l'évolution d'une inondation ;
* comparer simulation et observation.

---

# 19. Requêtes spatio-temporelles

Les requêtes les plus importantes combineront espace et temps.

Exemple :

> Quelles routes situées dans cette zone ont été déclarées impraticables entre 12h et 16h ?

Ou :

> Quelle était la surface inondée dans cette zone à 14h ?

---

# 20. Architecture conceptuelle

```text
                    DONNÉES INTELLIFLOOD
                            │
             ┌──────────────┴──────────────┐
             │                             │
        SPATIALE                       TEMPORELLE
             │                             │
     ┌───────┼────────┐             ┌──────┼──────┐
     │       │        │             │      │      │
   Point   Ligne   Polygone       Passé  Présent Futur
     │       │        │
     └───────┴────────┘
             │
       MÉTADONNÉES
             │
       PROVENANCE
             │
        HISTORIQUE
             │
       QUALITÉ / CONFIANCE
```

---

# 21. Règle de séparation des données

IntelliFlood doit clairement distinguer :

```text
OBSERVÉ
   ↓
CALCULÉ
   ↓
PRÉDIT
   ↓
SIMULÉ
```

Ces catégories ne doivent pas être mélangées.

---

# 22. Compatibilité avec les moteurs

### World Engine

Utilise principalement :

* données géographiques ;
* objets du territoire ;
* terrain ;
* bâtiments ;
* routes ;
* événements ;
* positions.

### Flood Engine

Utilise principalement :

* pluie ;
* eau ;
* relief ;
* drainage ;
* zones ;
* risques ;
* simulations.

### Intelligence Engine

Utilise :

* observations ;
* images ;
* données géographiques ;
* historiques ;
* modèles ;
* résultats.

---

# 23. Principes de stockage

Le choix technologique définitif sera effectué dans les documents techniques ultérieurs.

Cependant, le système devra supporter :

* données relationnelles ;
* géométries ;
* données temporelles ;
* fichiers médias ;
* données volumineuses ;
* index spatiaux ;
* index temporels.

---

# 24. Décisions de conception

Les décisions suivantes sont retenues :

1. IntelliFlood est nativement géospatial.
2. Le temps est une dimension fondamentale.
3. Les données observées, calculées, prédites et simulées sont séparées.
4. La provenance est conservée.
5. Les données importantes sont historisables.
6. Les requêtes spatiales et temporelles sont natives.
7. Le système doit être compatible avec le fonctionnement offline.
8. Le stockage technique précis sera défini ultérieurement.
9. Les données du World Engine constituent une base commune aux autres moteurs.

---

# 25. Préparation du DOCUMENT011

Le document suivant définira l'architecture **Offline-first & Synchronisation**.

Il précisera notamment :

* stockage local ;
* fonctionnement sans Internet ;
* file d'opérations ;
* synchronisation ;
* conflits ;
* reprise après erreur ;
* stratégie réseau ;
* cohérence des données.

---

# 26. État du document

**DOCUMENT010 : TERMINÉ — VERSION 1.0**


---

## Complément — couverture géographique et provenance des données (29 octobre 2026)

Le modèle géospatial doit prendre en charge à la fois le globe terrestre complet et les données d'analyse du territoire ivoirien. La Côte d'Ivoire est la zone d'intérêt opérationnel prioritaire, sans constituer une limite spatiale de l'application. Les données administratives, hydrographiques, topographiques et environnementales doivent être intégrées progressivement selon leur disponibilité et leurs licences.

La présence d'une géométrie ou d'une zone sur la carte ne signifie pas qu'une mesure ou une prévision y est disponible. Les objets de données doivent permettre, lorsque pertinent, de représenter la source, la méthode, l'horodatage, la période de validité, la résolution, la qualité et les lacunes connues. Cette distinction est essentielle pour éviter de donner une fausse impression de couverture nationale uniforme.
