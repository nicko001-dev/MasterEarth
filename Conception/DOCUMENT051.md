# DOCUMENT051 — DÉCISIONS COMPLÉMENTAIRES DE CONCEPTION : GLOBE, COUVERTURE NATIONALE, IoT ET MÉTÉO

**Projet :** IntelliFlood  
**Version :** 1.0  
**Date :** 29 octobre 2026  
**Statut :** Addendum de conception à examiner lors du prochain audit  
**Nature :** Décisions transversales et règles de cohérence  
**Portée :** Complète les DOCUMENT001 à DOCUMENT050 sans remplacer leur contenu historique.

---

## 1. Objectif

Ce document rassemble les décisions transversales prises après la version des 50 documents fournie pour mise à jour. Il vise à éviter que les mêmes exigences soient interprétées différemment dans plusieurs documents.

Ce document exprime des décisions de conception et des exigences à vérifier. Il ne prouve pas que les fonctionnalités décrites sont déjà implémentées dans le dépôt actuel.

## 2. Règle de préservation de God’s Eye View

IntelliFlood est une évolution et une spécialisation du projet open source God’s Eye View, et non une application qui doit en abandonner les capacités de visualisation.

Exigences :
- préserver l'exploration du globe terrestre complet ;
- conserver les fonctionnalités de God’s Eye View effectivement présentes et pertinentes, après inventaire du code source d'origine et comparaison avec le dépôt IntelliFlood ;
- ajouter les fonctions de prévention, d'observation, de gestion, d'analyse et de simulation des inondations sans réduire le produit à une carte locale ;
- ne supprimer ou remplacer aucune capacité héritée sans justification documentée, analyse d'impact et décision explicite.

Le terme « toutes les fonctionnalités » impose un inventaire vérifiable. Il ne faut pas présumer que chaque fonctionnalité d'origine a déjà été portée dans IntelliFlood, ni promettre une conservation sans avoir comparé les deux bases de code.

## 3. Couverture géographique

### 3.1 Globe mondial

Le globe terrestre complet reste explorable. L'application ne doit pas être artificiellement limitée à la Côte d'Ivoire, même si celle-ci constitue le périmètre opérationnel prioritaire pour les risques d'inondation.

### 3.2 Territoire ivoirien

La couverture opérationnelle cible comprend l'ensemble du territoire national de Côte d'Ivoire, pas uniquement Cocody ou Abidjan. Cocody, notamment les quartiers cités dans les documents BOATIKS, est un exemple possible de zone pilote et non une limite géographique ou fonctionnelle.

La couverture cartographique doit être distinguée de la disponibilité des données :
- une zone peut être représentée sur la carte sans disposer de capteurs ;
- certaines zones peuvent disposer de données météo ou géospatiales générales, mais pas de mesures en temps réel ;
- des simulations détaillées peuvent nécessiter des données topographiques, hydrologiques et de terrain plus précises ;
- l'absence de données ne doit pas être présentée comme une absence de risque.

## 4. Architecture d'ingestion multi-sources

L'ingestion doit être organisée autour de connecteurs/adaptateurs séparant les protocoles externes des services métier. IntelliFlood ne doit pas dépendre obligatoirement d'un seul fabricant, d'une seule plateforme IoT ou d'une seule source météo.

### 4.1 Voies possibles d'intégration

Les options suivantes sont des voies complémentaires, à choisir selon les capacités réelles des équipements et services :
1. **Connexion directe** d'un appareil ou contrôleur compatible vers IntelliFlood, par HTTPS ou MQTT ;
2. **API de fabricant ou de plateforme IoT**, lorsqu'elle donne un accès documenté aux données ;
3. **Webhook ou flux d'événements**, si la source peut pousser les mesures ou événements ;
4. **Passerelle locale**, lorsqu'un appareil utilise un protocole, une liaison ou un réseau qui n'est pas directement accessible au backend ;
5. **Import ou collecte de données externes**, notamment météo, géospatiales, topographiques, hydrologiques, satellitaires/radar, ou observations de terrain, selon l'accès et les licences.

Toutes ces voies ne doivent pas être développées simultanément. L'architecture doit permettre leur ajout progressif. La connexion directe HTTPS/MQTT est l'option de départ à privilégier lorsque les équipements la supportent et que les exigences de sécurité peuvent être satisfaites.

### 4.2 Exemple de chaîne IoT

Exemple illustratif et non exhaustif : un capteur de niveau d'eau tel qu'un JSN-SR04T peut être associé à un contrôleur comme l'ESP32. Le contrôleur traite la mesure, l'associe à un appareil et à un horodatage, puis la transmet à IntelliFlood par HTTPS/MQTT ou à une passerelle. IntelliFlood valide et normalise ensuite l'observation avant de l'enregistrer et de l'afficher.

Le choix final de matériel, de protocole, de calibration et de mode de transmission nécessite des tests réels. Cet exemple ne rend ni ce capteur ni l'ESP32 obligatoires pour tous les déploiements.

### 4.3 Contrat interne d'observation

Le format normalisé devrait permettre, lorsque les informations sont disponibles, de représenter :
- l'identifiant de la source ou de l'appareil ;
- le type de mesure ;
- la valeur et l'unité ;
- l'heure de mesure et l'heure de réception ;
- la localisation ou la zone concernée ;
- la provenance et la méthode de collecte ;
- le statut de qualité, de calibration et de validation ;
- les informations de version ou de schéma utiles à la compatibilité.

Cette liste est indicative et non exhaustive. La normalisation ne doit pas effacer les unités, les métadonnées, les incertitudes ou la provenance de la source.

### 4.4 Résilience et sécurité

Prévoir selon les capacités de chaque équipement :
- authentification des appareils et des sources ;
- gestion sécurisée des clés, certificats et secrets ;
- validation des données et limites de débit ;
- déduplication et idempotence ;
- traitement des horodatages incorrects, données tardives ou désordonnées ;
- détection de capteurs silencieux et valeurs aberrantes ;
- reprise après interruption réseau ;
- journalisation sans divulgation de secrets.

## 5. Sources météorologiques et géospatiales

Les sources doivent être choisies après une évaluation documentée, en particulier pour la Côte d'Ivoire :
- couverture géographique et disponibilité des données ;
- résolution spatiale et temporelle ;
- historique, prévisions et fraîcheur ;
- licences et conditions de réutilisation ;
- quotas, authentification, clés et coûts éventuels ;
- disponibilité hors ligne ou possibilités de mise en cache ;
- limites connues, continuité et dépendance fournisseur.

Un catalogue d'API aide à découvrir des options mais n'est pas lui-même une source météo. Aucune API, clé, gratuité ou couverture précise ne doit être considérée comme acquise avant vérification.

## 6. Données, risques et simulations

IntelliFlood doit distinguer clairement :
- une observation réelle issue d'un capteur ou d'un relevé ;
- une prévision météorologique ;
- une estimation de risque ;
- un signalement citoyen ou terrain ;
- un résultat de simulation.

Une prévision météo n'est pas une preuve qu'une inondation est déjà en cours. Les analyses et alertes doivent tenir compte de la fraîcheur, de la provenance, de la qualité et de l'incertitude des données.

Les simulations 3D doivent être reproductibles autant que possible et présenter leurs hypothèses, données d'entrée, résolution, date et limites. Une simulation illustrative ne doit pas être présentée comme un résultat opérationnel validé sans validation appropriée.

## 7. Offline-first et alertes locales

La collecte locale, la mise en cache et la synchronisation différée doivent être prévues lorsque les équipements et applications le permettent. Les alarmes locales (par exemple sirène ou gyrophare) peuvent fonctionner indépendamment du serveur uniquement si le matériel et la logique locale ont été conçus et testés à cet effet.

Les alertes distantes dépendent de la disponibilité du réseau et du canal utilisé. Le système ne doit pas promettre l'envoi d'une notification distante pendant une coupure totale de communication.

Les seuils, numéros d'urgence, procédures d'évacuation et coordonnées opérationnelles doivent être validés auprès des autorités et acteurs compétents avant un usage réel.

## 8. Règles de documentation

- Les exemples de matériel, lieux, sources, protocoles, rôles, scénarios et canaux sont illustratifs et non exhaustifs, sauf déclaration explicite contraire.
- Chaque document doit distinguer conception, implémentation réelle, validation et éléments restant à vérifier.
- Les fonctionnalités existantes de God’s Eye View doivent être prouvées par inventaire du projet source, pas uniquement par des descriptions.
- Les documents spécialisés doivent rester cohérents avec cet addendum ; en cas de conflit, le conflit doit être signalé et résolu explicitement, pas masqué par une simple duplication de texte.

## 9. Prochain audit recommandé

Avant tout changement de code, effectuer une analyse en lecture seule qui :
1. inventorie les fonctionnalités de God’s Eye View et leur état dans IntelliFlood ;
2. vérifie le globe terrestre complet et les fonctions cartographiques/3D réellement présentes ;
3. identifie les documents contradictoires ou incomplets ;
4. vérifie les modèles de données et points d'entrée pour les sources IoT et météo ;
5. distingue couverture nationale visée et couverture réelle des données ;
6. examine les besoins de validation des simulations et des alertes ;
7. propose les modifications minimales aux documents et à la feuille de route ;
8. n'altère aucun code, aucune release et aucun jalon terminé pendant cette première étape.

Les jalons déjà terminés, notamment M0.1 à M2.1 selon les rapports de livraison disponibles, ne doivent pas être recommencés simplement parce que ces exigences transversales sont précisées.

## 10. Documents modifiés dans cette édition

Les addenda ciblés ont été ajoutés aux documents suivants : DOCUMENT001, DOCUMENT003, DOCUMENT009, DOCUMENT010, DOCUMENT011, DOCUMENT012, DOCUMENT013, DOCUMENT017, DOCUMENT018, DOCUMENT019, DOCUMENT023, DOCUMENT025, DOCUMENT026, DOCUMENT028, DOCUMENT029, DOCUMENT032, DOCUMENT034, DOCUMENT035, DOCUMENT036, DOCUMENT041, DOCUMENT042, DOCUMENT043, DOCUMENT044, DOCUMENT047, DOCUMENT049 et DOCUMENT050.

Les autres documents ont été conservés sans modification, car une modification systématique des 50 fichiers n'est pas justifiée sans audit supplémentaire. DOCUMENT051 centralise les décisions transversales ; les documents ci-dessus les reprennent uniquement là où elles ont un impact direct.
