# Matrice de traçabilité BOATIKS — audit du 1er novembre 2026

## Périmètre et méthode

Audit en lecture seule des 51 documents `DOCUMENT001.md` à `DOCUMENT051.md` de
[`conception/`](../conception/), sans lacune de numérotation. `DOCUMENT003`
(Expression des besoins & exigences) est la base normative; `DOCUMENT051`
complète les exigences sans remplacer les documents antérieurs. Les
conceptions décrivent des objectifs, pas une preuve d'implémentation.

Les priorités P0/P1 ci-dessous sont celles de `DOCUMENT003`. `DOCUMENT051`
n'attribue pas de priorité. Les éléments marqués exemple, optionnel ou proposés
ne sont pas transformés en obligations (`DOCUMENT040 §26`). Les seuils de
performance, disponibilité et précision scientifique ne sont pas chiffrés dans
les documents.

**Légende :** `Présent` = capacité identifiée dans le code; `Partiel` = une
partie seulement, ou absence de validation/acceptation; `Absent` = aucun
parcours identifié; `À définir` = décision, source ou validation externe
nécessaire. La présence d'un endpoint n'implique pas que le parcours produit
complet est accepté.

## Exigences fonctionnelles — DOCUMENT003

| Référence (document/section) | Exigence / critère de conception | Module cible | État constaté dans le dépôt | Test ou preuve |
|---|---|---|---|---|
| P0 `REQ-AUTH-001` §5.1 | Un utilisateur autorisé peut s'authentifier. | API comptes | Présent : mot de passe scrypt et JWT. | `apps/api/tests/test_auth.py`; suite API complète exécutée sur la base locale. |
| P0 `REQ-AUTH-002` §5.1 | Profils Citoyen, Agent de terrain, Analyste/Expert, Responsable opérationnel et Administrateur. | Comptes / permissions | Partiel : seuls viewer, operator et admin existent. | `apps/api/tests/test_auth.py`; rôles requis incomplets. |
| P0 `REQ-AUTH-003` §5.1 | Les fonctions et données sont contrôlées par permissions. | API / domaines | Partiel : hiérarchie de rôles, sans isolation par organisation ni permissions métier fines. | `apps/api/tests/test_auth.py`; suite API complète exécutée sur la base locale. |
| P0 `REQ-AUTH-004` §5.1 | L'utilisateur peut se déconnecter. | API / web | Présent dans le code : révocation du JWT par identifiant de session, purge des révocations expirées à la déconnexion et suppression locale avec erreur visible si le serveur est indisponible. | `apps/api/tests/test_auth.py`; `apps/web/src/services/auth.test.ts`. |
| P0 `REQ-WORLD-001` §5.2 | Afficher une carte interactive. | Web / World Engine | Présent : carte Leaflet et vue globe Cesium. | Build web; pas de test de parcours cartographique. |
| P0 `REQ-WORLD-002` §5.2 | Déplacement, zoom, sélection de zone et recherche de lieu. | Web / World Engine | Partiel : déplacement/zoom et sélection de capteur; recherche et sélection de zone non établies. | Aucun test UI de navigation. |
| P1 `REQ-WORLD-003` §5.2 | Représentation 3D lorsque les données nécessaires existent. | Globe | Partiel : vue Cesium avec fond OSM par défaut et noms de lieux dépendant du zoom; couverture et performances réelles non garanties. | Build web et contrôle navigateur mobile; aucun test appareil réel. |
| P1 `REQ-WORLD-004` §5.2 | Représenter les caractéristiques topographiques disponibles. | Globe / MNT | Partiel : relief facultatif et MNT Terrarium pour simulation; couverture/précision non validées. | Téléchargement Terrarium ponctuel réussi à Abidjan; pas de validation topographique. |
| P1 `REQ-WORLD-005` §5.2 | Afficher bâtiments, routes, ponts, réseaux et infrastructures selon les données disponibles. | Géospatial / Globe | Partiel : couches héritées présentes, couverture ivoirienne et licences d'usage à vérifier. | Pas de test de couverture. |
| P0 `REQ-WORLD-006` §5.2 | Activer/désactiver les couches géographiques. | Web / World Engine | Partiel : capacités de couches dans le monde 3D; contrôle équivalent de la carte 2D non établi. | Aucun test UI. |
| P1 `REQ-WORLD-007` §5.2 | Représenter des objets/phénomènes dynamiques si une source adaptée existe. | World Engine / météo | Partiel : capteurs, météo et alertes; pas de validation de flux national. | Appel Open-Meteo réel vérifié pour Abidjan seulement. |
| P0 `REQ-WORLD-008` §5.2 | Consulter les informations dans le temps, en distinguant passé, présent et futur simulé/prévu. | Web / temporel | Partiel : API de mesures et courbe des 100 dernières mesures; timeline globale absente. | `apps/web/src/dashboard/SensorHistory.test.tsx`. |
| P0 `REQ-FLOOD-001` §5.3 | Intégrer les précipitations disponibles. | Météo | Présent techniquement : Open-Meteo et bulletins; usage commercial/licences et validation nationale restent à traiter. | `apps/api/tests/test_weather.py`; appel réel effectué. |
| P0 `REQ-FLOOD-002` §5.3 | Intégrer et afficher les niveaux d'eau. | Capteurs / web | Présent techniquement : ingestion, API et supervision. | `apps/api/tests/test_alerting.py`; suite API complète exécutée sur la base locale. |
| P0 `REQ-FLOOD-003` §5.3 | Représenter les zones touchées par les inondations. | Flood Engine / carte | Partiel : simulation en grille illustrative; pas de zones d'événements validées. | `apps/api/tests/test_flood_model.py`; modèle explicitement simplifié. |
| P1 `REQ-FLOOD-004` §5.3 | Représenter l'évolution spatiale/temporelle si données/modèles disponibles. | Flood Engine | Partiel : frames de scénario; pas de modèle hydrodynamique ni validation de crue. | `apps/api/tests/test_flood_model.py`, `test_simulation_api.py`; simulation locale réelle validée sans valeur prédictive. |
| P0 `REQ-FLOOD-005` §5.3 | Identifier/représenter des niveaux de risque. | Alertes / météo | Partiel : niveaux Vert/Orange/Rouge avec seuils provisoires. | `apps/api/tests/test_alerting.py`, `test_weather.py`. |
| P1 `REQ-FLOOD-006` §5.3 | Associer des informations de vulnérabilité aux zones/infrastructures. | Analyse géospatiale | Absent. | À définir avec données métier. |
| P1 `REQ-FLOOD-007` §5.3 | Représenter bassins, cours d'eau, drainage et écoulements si les données existent. | Géospatial / Flood Engine | Absent dans le domaine IntelliFlood. | Source géographique ivoirienne à identifier. |
| P0 `REQ-OBS-001` §5.4 | Un utilisateur autorisé peut créer une observation terrain. | Observations / API / web | Présent dans le code : formulaire web authentifié; lecture limitée au propriétaire, à l'organisation des opérateurs et aux administrateurs. Les protections anti-abus restent à définir/implémenter. | `apps/api/tests/test_observations.py`; `apps/web/src/dashboard/ObservationsPanel.test.tsx`. |
| P0 `REQ-OBS-002` §5.4 | Associer une position à l'observation. | Observations / PostGIS | Présent : point WGS84 avec bornes de coordonnées et index spatial. | `apps/api/tests/test_observations.py`; SQL Alembic généré en mode offline. |
| P0 `REQ-OBS-003` §5.4 | Enregistrer date et heure. | Observations | Présent : date/heure avec fuseau obligatoire. | `apps/api/tests/test_observations.py`. |
| P0 `REQ-OBS-004` §5.4 | Catégoriser le type d'observation. | Observations | Partiel : catégorie textuelle ouverte; taxonomie contrôlée à valider. | Validation Pydantic dans `apps/api/tests/test_observations.py`. |
| P1 `REQ-OBS-005` §5.4 | Associer des médias lorsque requis. | Observations / stockage | Absent. | Choix stockage, limites, conservation et confidentialité requis. |
| P0 `REQ-OBS-006` §5.4 | Ajouter une description textuelle. | Observations | Présent : texte borné et non vide. | `apps/api/tests/test_observations.py`. |
| P0 `REQ-OBS-007` §5.4 | Conserver la source/origine. | Observations / provenance | Présent pour les apports humains : source `human` et lien utilisateur conservé quand le compte existe. | `apps/api/tests/test_observations.py`; suite API complète exécutée sur la base locale. |
| P1 `REQ-OBS-008` §5.4 | États nouveau, en revue, vérifié, rejeté. | Modération | Partiel : statuts et revue opérateur/administrateur implémentés; critères et procédure de modération restent à définir. | `apps/api/tests/test_observations.py` (test d'intégration PostgreSQL ignoré ici). |
| P0 `REQ-GEO-001` §5.5 **coordonnées** | Stocker des coordonnées géographiques. | PostGIS / API | Présent pour capteurs et météo. | Tests métier/DB; suite API complète exécutée sur la base locale. |
| P0 `REQ-GEO-002` §5.5 **objets géographiques** | Gérer points, lignes, polygones et géométries 3D si nécessaires. | PostGIS / API | Partiel : points; autres géométries métier non établies. | Aucun test lignes/polygones. |
| P0 `REQ-GEO-003` §5.5 | Rechercher les informations relatives à une zone. | API géospatiale | Absent. | À implémenter et tester. |
| P0 `REQ-GEO-004` §5.5 | Superposer plusieurs sources géographiques. | Carte / couches | Partiel : capteurs et météo superposés; catalogue/sources non exhaustifs. | Aucun test d'intégration cartographique. |
| P0 `REQ-ANALYSIS-001` §5.6 | Analyser des données selon leur position. | Analyse géospatiale | Partiel : PostGIS et carte de points, sans requêtes analytiques métier. | Aucun test d'analyse spatiale. |
| P0 `REQ-ANALYSIS-002` §5.6 | Analyser l'évolution temporelle. | Historique capteur | Partiel : API d'historique et courbe ajoutée, limitée aux mesures d'un capteur. | `apps/web/src/dashboard/SensorHistory.test.tsx`. |
| P1 `REQ-ANALYSIS-003` §5.6 | Comparer des situations/périodes. | Analyse | Absent. | À définir et tester. |
| P0 `REQ-ANALYSIS-004` §5.6 | Calculer et afficher des indicateurs pertinents. | Analyse | Partiel : indicateurs de simulation et risque pluie; catalogue métier non défini. | Tests météo/simulation; parcours local réel de simulation validé. |
| P1 `REQ-AI-001` §5.7 | Fournir une assistance intelligente autorisée. | Intelligence Engine | Partiel : assistant web/IntelliFlood World authentifié, à consentement explicite et alimenté par agrégats, documents et cinq fournisseurs configurables; réponse locale déterministe sans modèle en mode dégradé. Les fonctions voix/HUD préexistantes du monde 3D restent distinctes. | `apps/api/tests/test_ai_engine.py`; `apps/web/src/components/AssistantPanel.test.tsx`; parcours DB à exécuter. |
| P1 `REQ-AI-002` §5.7 | Analyser automatiquement des données lorsque les modèles adaptés existent. | Intelligence Engine | Partiel : synthèse à la demande et RAG disponibles; aucune tâche automatique continue ni prévision de crue par modèle. | Tests du gateway et du retrieval; aucune prévision automatique. |
| P1 `REQ-AI-003` §5.7 | Détecter certaines anomalies. | Qualité des données | Partiel : endpoint déterministe MAD renvoyant des candidats sur niveaux d'eau; aucun candidat n'est un incident confirmé et les pannes/dérives longues ne sont pas modélisées. | `apps/api/tests/test_ai_engine.py`; base PostgreSQL requise pour le parcours API. |
| P1 `REQ-AI-004` §5.7 | Intégrer l'analyse d'images si des modèles sont nécessaires. | Intelligence Engine | Partiel : analyse opt-in de photos JPEG/PNG/WebP sans conservation, avec réencodage sans métadonnées et modèles gratuits vision; pas encore liée au workflow d'observation/modération. | Tests de validation/réencodage dans `apps/api/tests/test_ai_engine.py`; test d'intégration fournisseur non exécuté. |
| P1 `REQ-AI-005` §5.7 | Aider à produire rapports/synthèses. | Intelligence Engine / rapports | Partiel : synthèse/réponse rapportée à la demande et sources citées; aucun rapport persistant ou exporté. | Contrats/test gateway; DB et fournisseur à configurer pour le parcours complet. |
| P0 `REQ-AI-006` §5.7 | Distinguer les résultats IA des observations/calculs déterministes. | Provenance | Présent pour l'assistant : mode, fournisseur/modèle, sources, limites, statut informatif et refus d'autorité décisionnelle sont retournés; l'audit exclut questions et réponses. | Tests du gateway; tests API avec PostgreSQL à exécuter. |
| P0 `REQ-AI-007` §5.7 | L'humain valide les résultats IA critiques. | Workflow / audit | Partiel : l'IA ne déclenche aucune action critique et demande une validation humaine; aucune file dédiée de revue de sorties IA, car aucun résultat IA n'est une décision opérationnelle. | Tests de contrats/provenance; flux humain à définir avant toute sortie critique. |
| P1 `REQ-SIM-001–004` §5.8 | Créer/configurer/exécuter un scénario et visualiser son résultat sur carte. | Simulation / Web | Partiel : API et rendu 2D validés en navigateur avec MNT réel; calcul toujours indicatif, sans validation hydrodynamique. | `apps/api/tests/test_simulation_api.py`; test navigateur authentifié réussi. |
| P0 `REQ-SIM-006` §5.8 | Identifier clairement toute simulation comme simulation. | Simulation / Globe | Présent dans les réponses et avertissements du modèle; les profondeurs locales supérieures à la hausse au point source sont expliquées. | `apps/api/tests/test_simulation_api.py`; `apps/web/src/dashboard/SimulationPanel.test.tsx`. |
| P0 `REQ-ALERT-001–003` §5.9 | Détecter, créer et classifier une alerte selon des règles définies. | Alerting | Partiel : règles déterministes et message de fin ajoutés; valeurs toujours provisoires. | `apps/api/tests/test_alerting.py`; suite API complète exécutée sur la base locale. |
| P0 `REQ-ALERT-004` §5.9 | Associer une alerte à la zone concernée. | Alerting / zones | Absent : alerte rattachée à un capteur, sans zone polygonale. | Zones et données géographiques à établir. |
| P1 `REQ-ALERT-005` §5.9 | Notifier les utilisateurs pertinents selon permissions/contexte. | Notifications | Absent. | Canaux, ciblage, consentement, astreintes et responsabilité à définir. |
| P0 `REQ-OFFLINE-001–002` §5.10 | Garder certaines fonctions essentielles et données accessibles hors ligne. | PWA / cache | Partiel : cache local en lecture; périmètre et robustesse non validés. | Aucun test E2E hors ligne. |
| P0 `REQ-OFFLINE-003–005` §5.10 | Créer hors ligne, mettre en file, puis synchroniser les observations. | PWA / Sync API | Absent. | À implémenter; tests réseau intermittent requis. |
| P1 `REQ-OFFLINE-006–007` §5.10 | Détecter les conflits et définir une résolution. | Sync API | Absent. | Politique de résolution à décider. |
| P1 `REQ-REPORT-001–003` §5.11 | Générer des rapports/synthèses traçables aux sources. | Reporting | Absent. | Format et destinataires à définir. |
| P1 `REQ-COLLAB-001–002` §5.12 | Partager des informations et ajouter commentaires/annotations selon activation. | Collaboration | Absent. | Périmètre/permissions à définir. |
| P0 `REQ-COLLAB-003` §5.12 | Enregistrer l'historique des actions importantes. | Audit | Partiel : journal de comptes/administration; couverture métier incomplète. | `apps/api/tests/test_auth.py`; suite API complète exécutée sur la base locale. |
| P0 `REQ-DATA-001–004` §5.13 | Métadonnées, origine, historique et distinction observation/import/calcul/prévision/simulation/IA. | Modèle de données / provenance | Partiel : météo et simulations ont une partie de ces champs; mesures et observations restent incomplètes. | Tests météo/simulation; suite API complète exécutée sur la base locale. |

## Exigences non fonctionnelles — DOCUMENT003

| Référence | Critère de conception | État constaté | Test ou preuve |
|---|---|---|---|
| P0 `REQ-NF-PERF-001` / P1 `002` §6 | Interface réactive; ne charger que le sous-ensemble utile. | Partiel; aucune mesure sur appareil ou charge représentative. | Build seulement; critères chiffrés non définis. |
| P1 `REQ-NF-PERF-003` §6 | Exécuter de façon asynchrone les traitements lourds nécessaires. | Partiel : collecte météo asynchrone; simulation dans la requête HTTP. | Tests simulation; performance non mesurée. |
| P0 `REQ-NF-DISP-001–002` §6 | Fonctions offline critiques et récupération sans perdre les changements locaux. | Partiel : lecture mise en cache, sans file d'écriture/synchronisation. | Aucun test E2E hors ligne. |
| P0 `REQ-NF-SEC-001–004` §6 | Authentification, contrôle serveur, protection des données et traçabilité. | Partiel : JWT/roles/audit; sessions révocables, isolation tenant et audit métier manquent. | `apps/api/tests/test_auth.py`; suite API complète exécutée sur la base locale. |
| P0 `REQ-NF-CONF-001–002` §6 | Moindre privilège et minimisation des données personnelles. | Partiel : rôles grossiers; politique de confidentialité/rétention absente. | Aucune validation juridique. |
| P0 `REQ-NF-MAINT-001,003` / P1 `002` §6 | Modularité, testabilité et évolution indépendante des moteurs. | Partiel : API/domain/services séparés; fonctions multi-domaines encore centralisées. | 116 tests API et 21 tests web passés; typecheck et build web réussis. |
| P1 `REQ-NF-INTER-001–002`, P0 `003` §6 | Échanges externes par formats documentés et sources identifiables. | Partiel : adaptateurs IoT et météo; CAP absent, documentation incomplète. | Tests d'adaptateurs existants; DB indisponible. |
| P1 `REQ-NF-PORT-001` §6 | Web, PWA, mobile et desktop. | Partiel : web responsive/PWA; appareils réels non testés. | Build web; pas de test appareil. |
| P1 `REQ-NF-SCALE-001–002`, P0 `003` §6 | Ajouter sources/modèles/fonctions sans réécriture complète. | Partiel : adaptateurs fournisseurs; connecteurs/calculs non uniformément extensibles. | Tests IoT unitaires; pas de test de montée en charge. |
| P0 `REQ-NF-UX-001–004` §6 | Interface adaptée au profil, simple pour terrain, informations critiques lisibles. | Partiel : dashboard français et vue mobile; profils métier, tests terrain et audit accessibilité manquent. | Tests du graphique UI seulement. |

## Principes IA — DOCUMENT003 §7

Les principes `REQ-AI-PR-001–006` ont collectivement la priorité « P0/P1 selon la
fonctionnalité »; le document ne permet pas de leur assigner individuellement
une priorité.

| Référence | Critère | État constaté | Test |
|---|---|---|---|
| `REQ-AI-PR-001–004` | Identifier les sorties IA, vérifiables par une personne autorisée; ne pas confondre prévision, observation et simulation. | Présent pour l'assistant : résultats identifiés, sources/limites affichées, aucun pouvoir sur les calculs, alertes ou simulations. L'analyse de crue validée par terrain n'est pas fournie. | `apps/api/tests/test_ai_engine.py`; tests UI de consentement et mode local. |
| `REQ-AI-PR-005–006` | Permettre l'IA locale quand approprié et ne pas imposer un fournisseur IA propriétaire/payant. | Partiel : l'IA distante est facultative parmi cinq fournisseurs; aucun modèle local n'est installé. Hors connexion, seul un résumé déterministe est disponible, pas une réponse LLM. | Tests du mode local; fournisseur gratuit à configurer et quotas externes non garantis. |

## Compléments — DOCUMENT051

| Référence | Exigence / contrôle | État constaté | Test ou action |
|---|---|---|---|
| §2, préservation du monde 3D | Inventorier et comparer les capacités du monde 3D intégré; ne pas prétendre qu'elles sont toutes préservées sans comparaison. | Partiel : la notice de `apps/world` documente sa provenance, mais l'inventaire comparatif des fonctions reste incomplet. | Compléter l'inventaire dans `docs/INTELLIFLOOD_WORLD_AUDIT.md`. |
| Addendum `REQ-GEO-001` §3.1 **globe complet** | Ne pas limiter artificiellement l'exploration du globe à la Côte d'Ivoire. | Partiel : globe Cesium et World Engine présents; comparaison de fonctionnalités et essais utilisateur manquants. | Audit amont/visuel requis. |
| Addendum `REQ-GEO-002` §3.2 **couverture nationale** | Cibler tout le territoire ivoirien; Cocody/Abidjan ne sont pas une limite. | Partiel : points configurés dans plusieurs villes; frontières/couches et couverture réelle non établies. | Jeu géographique national à acquérir/valider. |
| Addendum `REQ-DATA-001` §3.2 **couverture/disponibilité** | Distinguer zone cartographiée, mesure temps réel, prévision et modèle validé; l'absence de données ne signifie pas l'absence de risque. | Partiel : données affichées, mais disponibilité/confiance pas uniformément caractérisées. | Ajouter métadonnées/UX et tests. |
| `REQ-IOT-001–002` §§4.1–4.4 | Connecteurs multi-fournisseurs; source, appareil, temps de mesure/réception, unité, localisation et qualité conservés quand disponibles. | Partiel : adaptateurs générique/TTN/ChirpStack et MQTT; statut qualité/réception incomplet. | Tests adaptateurs; test matériel requis. |
| `REQ-WX-001` §5 | Évaluer couverture, résolution, fréquence, licence, quota, clés, offline et coûts des sources. | Partiel : Open-Meteo essayé en réel; sources ivoiriennes/usage commercial à clarifier. | Vérifier contrats et licences avant production. |
| `REQ-SAFE-001` §6 | Ne pas présenter une prévision météo comme preuve d'inondation actuelle; afficher confiance/limites. | Partiel : simulation porte un avertissement; l'interface ne qualifie pas systématiquement chaque observation/prévision. | Tests d'acceptation UX à ajouter. |
| `REQ-EDGE-001` §§4.4, 7 | Règles d'alerte locales si le matériel/passerelle les supporte et les a testées. | Absent/non vérifié : firmware de référence non testé sur matériel. | Essais terrain, protocoles et seuils validés requis. |
| §§4.2–4.3 | Le matériel et les champs proposés (ESP32/JSN-SR04T, etc.) sont illustratifs, pas imposés. | Respecté dans la documentation : firmware qualifié de référence, non testé. | Ne pas généraliser sans essai réel. |
| §§4.4–7 | Authentifier les appareils; gérer secrets, limites, doublons, retards, mesures hors ordre, capteurs muets et reprise réseau selon intégration réelle. | Partiel : clé d'ingestion, limite de distance et détection de silence configurable ajoutées; dérive/calibration/maintenance et sécurité MQTT de production manquent. | `apps/api/tests/test_alerting.py`, `test_sensor_health.py`; matériel non testé. |

## Points transversaux à résoudre

1. `DOCUMENT003` réutilise `REQ-GEO-001`, `REQ-GEO-002` et `REQ-DATA-001`
   entre les exigences originales (§§5.5, 5.13) et l'addendum (globe, couverture
   nationale, disponibilité). Les matrices doivent citer section et intitulé,
   pas l'identifiant seul; les identifiants source sont à renuméroter par les
   responsables de conception.
2. `DOCUMENT035 §31` déclare un no-go et une implémentation non commencée,
   tandis que `DOCUMENT050` et `DOCUMENT051 §9` décrivent une transition et des
   jalons déjà livrés. Établir un statut daté et faisant autorité.
3. La comparaison exhaustive des fonctions amont de `apps/world` reste à
   documenter; l'attribution et les licences sont précisées dans
   `apps/world/NOTICE-INTELLIFLOOD.md`.
4. Le dépôt courant ne contient ni `.git`, ni daemon Docker actif. La base
   PostgreSQL locale est toutefois accessible pour les tests API; ces résultats
   ne valident pas encore un déploiement Compose reproductible.
5. Seuils d'alerte/pluie, cadence opérationnelle des capteurs, contacts d'urgence,
   politiques d'astreinte, validation des observations, conflit de synchronisation,
   conservation/confidentialité et précision/validation hydraulique restent à
   valider par les parties compétentes. Les valeurs provisoires ne constituent
   pas une autorisation de diffusion d'alertes opérationnelles.
6. Matériel, tests longue durée, restauration réelle des sauvegardes,
   performances sur appareils, responsabilités juridiques et accès aux services
   externes nécessitent ressources/partenaires hors du dépôt.

## Vérifications reproductibles effectuées

- Backend : `python -m pytest -q` depuis `apps/api` : **116 réussis**, y compris
  les tests d'intégration PostgreSQL exécutés dans cet environnement.
- Migrations : `alembic upgrade --sql base:head` généré avec succès; migration
  réelle non exécutée pendant cette passe (les tests utilisent le schéma local).
- Frontend : `npm test` : **21 réussis**; `npm run typecheck` et
  `npm run build` : réussis.
- Simulation : parcours navigateur authentifié complet sur le MNT réel, résultat
  rendu sur la carte 2D; ni la précision hydraulique ni la couverture du MNT ne
  sont validées par ce test.
- Globe : libellés de lieux OSM visibles dans la vue 3D au niveau national;
  disponibilité des quartiers et des noms reste liée à la couverture OSM et au
  réseau.
- Open-Meteo : appel réel réussi pour Abidjan, 72 points horaires retournés.
- MNT Terrarium : téléchargement ponctuel vérifié dans un cache temporaire autour
  d'Abidjan; cela ne valide ni la précision ni la couverture de la source.
- Docker : CLI présent, mais daemon Linux absent; configuration Compose complète
  bloquée faute des secrets requis.
