# Intelligence Engine MasterEarth

## Capacités et limites

L'Intelligence Engine est une fonction facultative. Les calculs de niveaux, les
seuils, les alertes et les simulations restent déterministes; aucun modèle ne
peut confirmer une crue, changer une alerte ou prendre une décision
opérationnelle.

- **Assistant et rapports** : réponses et synthèses à la demande à partir de
  statistiques agrégées et de passages pertinents des documents `DOCUMENT*.md`.
- **Anomalies** : comparaison locale du dernier niveau d'eau à l'historique avec
  la médiane et l'écart absolu médian (MAD, seuil 3,5). Le résultat est une
  anomalie statistique candidate, pas un incident confirmé ni une décision IA.
- **Vision** : analyse facultative d'une photo sélectionnée par l'utilisateur,
  seulement avec un consentement distinct. JPEG/PNG/WebP jusqu'à 4 Mio;
  MasterEarth retire les métadonnées en réencodant l'image, la limite à
  2048 pixels de côté et ne la conserve pas. Elle est envoyée au fournisseur
  choisi pour l'analyse.
- **Mode hors ligne** : résumé déterministe à partir des données déjà chargées
  dans le navigateur ou par l'API. Il est explicitement marqué
  `offline_deterministic` et n'est jamais présenté comme une réponse IA. Aucun
  modèle de langage local n'est installé par cette fonctionnalité. Un bouton
  permet également de demander ce résumé local sans compte ni consentement.
  Si la connexion API est interrompue pendant une requête, l'interface peut
  afficher ce résumé, mais avertit que la question a peut-être déjà atteint le
  serveur et ne prétend pas que l'envoi n'a pas eu lieu.
- **Accès sans compte** : l'assistant, les anomalies et la vision sont ouverts
  aux visiteurs anonymes dès qu'un administrateur a configuré au moins un
  fournisseur. L'identité transmise au service est `anonyme@intelliflood.local`
  (rôle `citoyen`), et les clés fournisseur ne sont jamais exposées au client.
  Les journaux d'audit distinguent ces appels anonymes des appels authentifiés.

## Fournisseurs et garantie de gratuité

L'administration propose exactement cinq emplacements :

| Fournisseur | Repérage strict des modèles gratuits | Remarque |
|---|---|---|
| Google Gemini | Liste d'autorisation étroite issue du catalogue et de la tarification officielle | Les quotas varient selon le compte; Google indique que le contenu du niveau gratuit peut être utilisé pour améliorer ses produits. |
| Groq | Catalogue actif, utilisable uniquement après confirmation de l'offre gratuite du compte | Limites d'usage dépendantes du compte; une indisponibilité entraîne le passage au modèle suivant. |
| Mistral AI | Catalogue actif, utilisable uniquement après confirmation du mode Studio gratuit | Un compte non éligible peut renvoyer HTTP 402; aucun modèle payant n'est tenté. |
| xKiro | `access_tier=free`; les modèles pay-as-you-go sont exclus | Le catalogue est relu périodiquement; un modèle retiré du niveau gratuit est ignoré. |
| OpenRouter | Variante `:free` et prix d'entrée/sortie nuls | Aucun tableau de repli n'est transmis à OpenRouter; seuls les modèles `:free` sélectionnés sont tentés. |

Une offre gratuite, un quota suffisant ou la disponibilité des cinq fournisseurs
ne peuvent pas être garantis par l'application. Les catalogues, prix, limites et
conditions peuvent changer; l'interface et les journaux exposent les erreurs
sans les transformer en réponses IA. La bascule s'effectue uniquement entre
modèles sélectionnés et éligibles au gratuit, avec au plus cinq tentatives par
requête. Une erreur de quota, d'authentification ou de réseau entraîne un
cooldown et/ou le fournisseur suivant. Aucun repli payant n'est configuré.

## Configuration et clés

1. Installer les dépendances API mises à jour.
2. Générer une clé maître Fernet :

   ```powershell
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```

3. La placer dans `AI_ENCRYPTION_KEY` dans l'environnement privé de l'API.
   Ne pas la committer; conserver une sauvegarde séparée. Sans cette clé, le
   backend refuse explicitement de stocker les clés fournisseurs. Si elle est
   perdue, les valeurs chiffrées ne sont pas récupérables; les clés fournisseurs
   doivent être ressaisies.
4. Appliquer la migration Alembic `20261102_1100_ai_provider_configs`.
5. Se connecter avec le rôle administrateur, ouvrir **Gestion → Fournisseurs
   IA**, saisir une clé, découvrir les modèles gratuits, choisir leur ordre
   (l'ordre de sélection est l'ordre de repli), régler la priorité du fournisseur
   (1 est prioritaire), confirmer l'offre gratuite, puis enregistrer.

Les clés sont chiffrées dans `ai_provider_configs`, ne sont jamais renvoyées à
l'interface, et ne figurent pas dans les journaux d'audit. L'API-key est utilisée
uniquement sur les hôtes fixes des cinq fournisseurs. Le navigateur n'appelle
jamais directement les modèles. La suppression d'un fournisseur révoque sa
configuration locale; la révocation de la clé auprès du fournisseur reste à
faire dans son tableau de bord.

## Consentement et données transmises

Chaque requête textuelle nécessite un consentement explicite. À la demande, le
serveur transmet au fournisseur sélectionné :

- la question saisie par l'utilisateur;
- des statistiques agrégées de capteurs, alertes et météo, sans coordonnées,
  noms/codes de capteurs, identifiants d'alertes ou texte d'observations;
- au maximum quatre passages documentaires pertinents;
- le catalogue produit compact et le contexte d'écran borné décrits ci-dessous
  (vue, onglet, code de capteur sélectionné, centre de caméra, couches, langue,
  état en ligne). La position de l'utilisateur n'est jamais transmise.

Les adresses e-mail et les numéros de téléphone usuels sont rejetés par une
validation préliminaire, mais celle-ci ne peut pas identifier toutes les données
personnelles. Ne saisissez aucune information personnelle, confidentielle ou
inutile. Les questions ne sont ni stockées ni inscrites dans l'audit; seuls le
type d'action, l'identité authentifiée et le fournisseur/modèle sont tracés. Le
consentement est réinitialisé après chaque tentative. Les interfaces affichent
et vérifient les fournisseurs destinataires avant d'autoriser l'envoi.

Une image n'est incluse que si elle est sélectionnée et si l'utilisateur coche
une seconde case dédiée. Elle n'est ni stockée dans la base ni ajoutée à
l'historique local.

## Assistant intégré à la plateforme

### Connaissance du produit

Le catalogue produit `apps/api/app/domain/platform_catalog.py` décrit, en
français et de façon structurée, le produit réel : `product`, `pages`, `maps`,
`layers`, `data_sources`, `simulation`, `alerts`, `runtime`, `ai`, `accounts`,
`privacy` et `limits`. Il fait foi pour les questions « comment fonctionne
MasterEarth ? ».
`catalog_summary()` en produit une version compacte (moins de 3 500 caractères)
injectée dans chaque prompt ; `catalog_text()` fournit un rendu court pour les
réponses déterministes.

Ce plafond ne bride plus la connaissance produit : `catalog_detail(question)`
sélectionne, selon les mots de la question, les sections **complètes** du
catalogue qui la concernent (couches et cartes, sources, simulation, alertes,
assistant, comptes, confidentialité, limites) et les joint sous la clé
`platform_detail` du prompt, dans un budget distinct de 4 000 caractères. Quand
une section dépasse le budget restant, ses listes sont réduites par paliers
(`_fit`) plutôt que la section supprimée ; si même la version la plus courte ne
tient pas, elle n'est pas jointe. Une question hors sujet produit un prompt
identique à l'ancien : le mécanisme ne coûte rien quand il ne sert pas.
`_messages` ne modifie jamais le contexte d'origine (copie superficielle). Aucun chiffre de performance, aucune date de livraison
et aucune fonction absente du dépôt n'y figurent ; les éléments non décidés
restent marqués `À DÉFINIR` (conservation des données, permissions métier
fines, validation des seuils). Le catalogue précise aussi les licences : le
radar RainViewer est gratuit pour un usage personnel, éducatif et communautaire
à petite échelle, avec attribution obligatoire et sans garantie de
disponibilité ; un usage commercial doit être négocié auprès du fournisseur.
Le trafic aérien provient d'OpenSky Network sous **CC BY-NC 4.0** : attribution
obligatoire, usage non commercial et quota à respecter. Les positions entre deux
observations sont interpolées et signalées comme telles ; aucun flux mondial de
véhicules routiers en direct n'est promis.

Le catalogue décrit notamment : les sept pages, la carte 2D Leaflet (fonds
OpenStreetMap, Esri, NASA ; radar RainViewer, frontières Natural Earth, noms
GeoNames, voile jour/nuit et trafic aérien) et le globe 3D Cesium mondial
(imagerie, relief facultatif, radar animé, voile jour/nuit calculé avec
lumières NASA, frontières, noms de villes, pluie 3D, avions OpenSky,
circulation et flux mondiaux animés, simulation et localisation) ;
l'application séparée **MasterEarth World** (`apps/world`) et son trafic
routier simulé ou tiers, jamais présenté comme une observation mondiale en
direct ; les couches activables (`radar`, `rain`, `flood`, `labels`, `borders`,
`night`, `traffic`, `aircraft`, `sensors`, `weather`, `alerts`) ; les sources de
données et leurs licences, dont `/api/v1/weather/global-rain` (198 points de
sondage, précipitation courante, affinage et lieux nommés) et `/api/v1/live/aircraft/global` (600 appareils
répartis) ; la simulation indicative sur MNT ; les seuils provisoires ; les
comptes et rôles ; la confidentialité ; l'exécution (`runtime`) ; les limites
connues.

La section `runtime`, sélectionnée par `catalog_detail()` sur les questions de
disponibilité, de statistiques ou de démarrage, documente la tolérance aux
pannes partielles (sources interrogées séparément, dernières valeurs connues
conservées, « Hors ligne » réservé à une API entièrement injoignable), la
distinction entre compteurs des zones affichées et scan de pluie mondial, la
règle « donnée indisponible ≠ zéro », le basculement régional/mondial du trafic
aérien, les flux de mobilité modélisés et `start.bat health` (11 endpoints).

La recherche documentaire lit les `DOCUMENT*.md` du dossier `Conception/` avec
tolérance de casse, pour que la même lecture fonctionne sous Windows et Linux.

### Contexte d'écran transmis

La requête `POST /api/v1/ai/assistant` peut inclure un objet `client_context`
borné, validé par `apps/api/app/schemas/ai.py` (`extra="forbid"` à tous les
niveaux) puis re-borné par le service avant tout prompt :

| Champ | Type | Borne |
|---|---|---|
| `view` | `"map"` ou `"globe"` | — |
| `tab` | chaîne | 32 caractères maximum |
| `selected_sensor` | chaîne | 64 caractères maximum |
| `center` | `{lat, lon, height?}` | latitude ±90, longitude ±180, hauteur finie |
| `layers` | `{nom: booléen}` | 20 entrées maximum, clés de 64 caractères |
| `user_location` | `{lat, lon}` | accepté par le schéma mais **retiré** avant le prompt |
| `online` | booléen | `true` par défaut |
| `locale` | `"fr"` ou `"en"` | `fr` par défaut |

Le service tronque les chaînes à 64 caractères, ignore les champs inconnus ou
mal typés, rejette les nombres non finis et écrase le contexte client avec la
version nettoyée. Ce contexte est présenté au modèle comme une donnée non
fiable, jamais comme une instruction.

La **position de l'utilisateur n'est jamais envoyée** : le schéma tolère
`user_location` pour rester compatible avec les clients existants, mais le
service l'écarte systématiquement du contexte transmis au fournisseur. La
question « où suis-je ? » est résolue dans le navigateur, avec la position
locale, sans envoi de coordonnées. Le centre de caméra, lui, décrit seulement la
zone regardée et est transmis comme contexte d'affichage. En 3D, il vient de la
caméra ; en 2D, il est calculé depuis l'emprise visible, y compris lorsqu'elle
traverse l'antiméridien.

### Actions d'interface (liste blanche)

La requête accepte `allow_actions` (booléen, `true` par défaut). Quand il est
actif, le modèle doit terminer sa réponse par un unique bloc clôturé
` ```actions ` contenant `{"actions": [...], "spoken": "..."}`. Le serveur
extrait ce bloc, le retire du texte affiché et valide chaque action
individuellement avec Pydantic :

| `type` | Clés |
|---|---|
| `fly_to` | `lat`, `lon`, `height` (nullable), `label` (nullable) |
| `set_view` | `view` : `map` ou `globe` |
| `open_tab` | `tab` : `carte`, `capteurs`, `alertes`, `meteo`, `observations`, `ia`, `gestion` |
| `select_sensor` | `code` |
| `set_layer` | `layer` : `radar`, `rain`, `flood`, `labels`, `borders`, `night`, `traffic`, `aircraft`, `sensors`, `weather`, `alerts` ; `enabled` |
| `set_basemap` | `basemap` : `osm`, `esri`, `nasa` |
| `locate_user` | — |
| `open_simulation` | `mode` : `level`, `rain`, `sensor` ; `lat`, `lon` (nullables) |
| `zoom` | `direction` : `in` ou `out` |
| `reset_view` | — |

Le client applique `open_simulation` en ouvrant les paramètres avec le scénario
et, si elles sont fournies, les coordonnées demandées : le calcul n'est jamais
lancé automatiquement.

Au plus six actions sont renvoyées. Une action invalide, inconnue, avec clés
supplémentaires ou coordonnées non finies est ignorée sans erreur, et le bloc
est retiré même quand `allow_actions` est faux. Le mode `report` autorise
également les actions. La réponse contient toujours `actions` (liste vide si
aucune) et `spoken`.

### Voix

`spoken` est une version courte de la réponse (600 caractères maximum) destinée
à la synthèse vocale du navigateur ; à défaut, le serveur utilise les 400
premiers caractères de la réponse nettoyée. Le mode hors ligne fournit aussi un
`spoken` déterministe de 300 caractères maximum.

### Limites

- Le modèle ne doit jamais inventer de coordonnées pour un lieu réel : seules
  les coordonnées du contexte, du catalogue ou des extraits sont utilisables.
- Les actions sont purement visuelles et réversibles : elles déplacent ou
  configurent l'interface, sans calcul, sans alerte, sans écriture en base.
  L'IA ne déclenche et ne confirme aucune alerte.
- Une action reste visible par l'utilisateur ; le client peut l'ignorer ou la
  refuser. Le serveur ne garantit pas qu'elle sera exécutée.
- Aucun prompt, contexte client ou coordonnée n'est journalisé ; seuls le type
  d'action, l'identité et le fournisseur/modèle sont audités.

## API et intégration de MasterEarth World

- `GET /api/v1/ai/providers` — statut sans secret, administrateur.
- `GET /api/v1/ai/status` — fournisseurs actifs et notes de confidentialité,
  utilisateur connecté; les interfaces vérifient ces destinataires avant le
  consentement et l'envoi.
- `POST /api/v1/ai/providers/{id}/catalog` — catalogue gratuit, administrateur.
- `PUT` / `DELETE /api/v1/ai/providers/{id}` — configuration, administrateur.
- `POST /api/v1/ai/assistant` — réponse ou rapport, consentement obligatoire ;
  accepte `client_context` (contexte d'écran borné) et `allow_actions`, et
  renvoie `actions` et `spoken` en plus de la réponse.
- `POST /api/v1/ai/vision` — analyse d'image, utilisateur connecté et double
  consentement.
- `GET /api/v1/ai/anomalies` — candidats déterministes d'anomalie.

Le tableau de bord web et le module MasterEarth de `apps/world` utilisent le
même endpoint assistant, les mêmes fournisseurs configurés et le même jeton
MasterEarth. Le module ne transmet pas de question si le statut des
destinataires ne peut pas être vérifié et réinitialise le consentement après
chaque tentative. Il ne stocke aucune deuxième clé de modèle. L'assistant vocal
Realtime et le résumé HUD préexistants demeurent toutefois des fonctions
distinctes qui utilisent leurs propres réglages OpenAI/Gemini; ils ne reçoivent
pas automatiquement les données de crue et ne sont pas remplacés par ce moteur.

## Vérification

Tests ciblés : `apps/api/tests/test_ai_engine.py` et
`apps/web/src/components/AssistantPanel.test.tsx`. Les tests contre PostgreSQL
et la migration nécessitent une base PostGIS démarrée et migrée.
