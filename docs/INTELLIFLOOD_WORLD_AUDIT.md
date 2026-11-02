# Audit d'IntelliFlood World et choix pour le globe

**Provenance et attribution** : voir [`apps/world/NOTICE-INTELLIFLOOD.md`](../apps/world/NOTICE-INTELLIFLOOD.md). L'application est construite avec CesiumJS, Vite et un serveur Node.

## Constats
- Le logiciel amont propose des fonctions de « renseignement ouvert » étrangères à IntelliFlood : vols civils et militaires, caméras de surveillance (CCTV), lecteurs de plaques (ALPR), radio logicielle (SDR), assistant vocal. Les reprendre n'aurait pas de sens pour un produit de prévention civile, et poserait des questions éthiques et légales.
- La licence MIT ne couvre pas les données tierces : certaines sont non commerciales ou à usage personnel (TeleGeography CC BY-NC-SA, FL511, scène d'inondation du Népal…). À exclure de tout produit IntelliFlood.
- Le code est fortement couplé à son propre système de services : aucun module (nuages, caméra, calques) n'est extractible sans recopier une large part de l'application. Son rendu de pluie par radar ne couvre que les États-Unis (NOAA nowCOAST) ; il n'a pas de pluie 3D.

## Décision
Il existe deux composants à distinguer :

- Le globe de la plateforme (`apps/web/src/globe/`) est une interface CesiumJS indépendante, avec fond Esri, relief Cesium ion facultatif, NASA GIBS et effets météo.
- `apps/world/` est déclaré comme dérivé du logiciel amont v0.3.0 dans `apps/world/NOTICE-INTELLIFLOOD.md`; sa licence MIT et les licences des ressources/données tierces doivent être conservées.

La déclaration antérieure « aucune ligne du code amont n'est reprise » ne s'applique donc pas au dépôt entier et est retirée. Le commit amont utilisé et une comparaison exhaustive des fonctionnalités n'ont pas été enregistrés; il reste impossible d'affirmer que toutes les fonctions sont préservées. `apps/world/` n'est pas inclus dans le service `web` de `docker-compose.yml`.

## Livré dans le globe
Dans la plateforme web : capteurs et points météo sur le globe, pluie 3D, eau illustrative et modes réel/scénario selon les composants livrés. La présence d'un contrôle ou d'une couche ne constitue pas une validation des données ni une équivalence avec le logiciel amont.

Le globe sélectionne par défaut le fond OpenStreetMap, dont les noms de lieux
évoluent avec le zoom et la couverture cartographique; les fonds satellite
peuvent afficher les libellés Esri. Une courte liste locale sert de repère
supplémentaire avec les fonds satellite, mais n'est pas un inventaire exhaustif
des localités ivoiriennes. Les noms OSM/Esri sont fournis par des services
externes : leur disponibilité dépend du réseau et des données de chaque source.
Les rendus réels restent ponctuels : capteur, alerte ou point météo.
La pluie 3D est limitée à la zone autour du point choisi et ne recouvre plus
tout l'écran.

Le panneau de simulation commun aux vues 2D/3D appelle
`POST /api/v1/simulations/flood` et affiche le raster de profondeur calculé à
partir du MNT, avec une animation par étapes, une légende de profondeurs et
l'étendue possible liée à l'incertitude verticale. Les résultats sont
géolocalisés, persistés côté API et affichés sur la carte 2D comme sur le globe
Cesium. La simulation nécessite une session viewer (ou supérieure) et un MNT
disponible; elle signale explicitement les erreurs réseau/relief au lieu de
montrer une empreinte de crue synthétique. Le modèle reste indicatif : il ne
simule ni l'écoulement dynamique, ni les ouvrages, le drainage ou l'infiltration,
et ne constitue pas une prévision opérationnelle. Le panneau peut être replié
pour libérer la carte.

Dans le scénario « niveau », la hausse choisie définit la cote d'eau au point
central, puis le modèle remplit les cellules plus basses qui lui sont connectées.
La profondeur maximale locale peut donc dépasser la hausse saisie. L'interface
l'indique explicitement; cette approximation n'est ni une mesure ni une
prévision hydraulique.

## Fonctions d'IA et frontière avec IntelliFlood

`apps/world` conserve des fonctions IA du logiciel amont, distinctes de l'Intelligence
Engine flood-domain décrit dans `conception/DOCUMENT014.md` :

- **Assistant vocal intégré** : agent vocal temps réel, avec OpenAI par défaut et Gemini en
  option. Il reçoit des commandes parlées et peut interroger le contexte de la
  scène, les entités et les couches du monde 3D, puis appeler des outils à schémas
  bornés pour contrôler la vue, les couches, les annotations et les requêtes
  sur les flux disponibles.
- **Résumé HUD** : OpenAI Responses API (modèle par défaut `gpt-5-nano`) produit
  un résumé de cinq mots limité aux noms de lieux/couches et à la provenance
  des flux fournis. Sans clé, le HUD conserve un résumé déterministe local. Le
  choix Gemini pour la voix ne change pas ce résumé, qui reste OpenAI.
- **MCP** : le serveur expose aussi des outils à des clients externes (par exemple
  Claude, Codex ou ChatGPT Desktop). Le modèle de conversation est alors celui
  du client MCP, pas un modèle IntelliFlood.
- **Module IntelliFlood du viewer** : `apps/world/src/intelliflood/` affiche
  capteurs, météo, alertes et résultats de simulation via le relais API
  `/intelliflood-api`. Il rend notamment pluie et eau de simulation; ces
  rendus et la simulation ne sont pas des traitements IA. Aucun outil vocal
  flood-domain n'est ajouté au MIC par ce module.
- **Assistant IntelliFlood partagé** : le panneau du module appelle
  `/api/v1/ai/assistant` via le relais avec le jeton IntelliFlood et un
  consentement par requête. Il utilise le même gateway, les mêmes clés
  chiffrées, les statistiques agrégées et les documents que le tableau de bord
  web; le monde 3D ne crée ni fournisseur ni stockage de clé distinct.

Les fonctions vocales/HUD préexistantes ne sont ni le moteur d'alerte ni une prévision
hydrologique; elles restent indépendantes du nouvel assistant partagé et
utilisent leurs réglages OpenAI/Gemini existants. Les seuils, calculs de niveau
et simulations IntelliFlood restent déterministes. L'assistant web/IntelliFlood World, la
recherche documentaire, l'analyse visuelle opt-in et la détection statistique
d'anomalies sont décrits dans [`AI_ENGINE.md`](AI_ENGINE.md).

La voix et le résumé HUD utilisent des fournisseurs distants lorsque activés :
audio du microphone, contexte de scène et, pour certains échanges de grounding
visuel, une capture du viewport peuvent leur être transmis. Les clés permanentes
restent côté serveur et des identifiants éphémères sont remis au client. La
voix OpenAI peut aussi utiliser une connexion Codex/ChatGPT locale expérimentale;
ce chemin n'est pas un runtime local et son contrat Realtime n'est pas confirmé.
Les services IA ne sont pas nécessaires au démarrage sans clé, mais impliquent
les conditions, coûts, quotas et traitements de données du fournisseur. Le
serveur IntelliFlood World est local par défaut; l'exposer sur un réseau
élargit l'accès aux outils et aux quotas et doit être évalué selon
`apps/world/SECURITY.md`.

## Limites connues
- L'eau est un disque d'illustration, **pas** un modèle hydrodynamique (cela relève de M10). Sans relief (jeton ion), elle ne suit pas le terrain.
- Le fond Esri est gratuit mais soumis à ses conditions : vérifier l'usage commercial.
- Testé en navigateur de test (rendu logiciel, sans fond de carte car sans Internet) : performances sur vrais appareils non mesurées.
- Le tableau de bord ouvre l'application IntelliFlood World autonome via `VITE_INTELLIFLOOD_WORLD_URL` (par défaut `http://127.0.0.1:4173`). Les deux applications restent déployées séparément.
- Le module 3D Cesium reste chargé à la demande; son téléchargement peut être anticipé au survol ou à la prise de focus du bouton. Le globe utilise le rendu à la demande lorsqu'il est inactif, et ne maintient une animation continue que pour la pluie visible ou la transition de hauteur d'eau.
- Le tableau de bord contraint les vues à la hauteur de la fenêtre; les panneaux de données défilent indépendamment au lieu d'étirer la carte. Leaflet privilégie le rendu Canvas pour ses marqueurs et évite de recharger les tuiles pendant le zoom. Les tuiles de fond restent fournies par des services externes : leur disponibilité et leur temps de réponse dépendent du réseau et du fournisseur.
