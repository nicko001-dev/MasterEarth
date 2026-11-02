# Intelligence Engine IntelliFlood

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
  IntelliFlood retire les métadonnées en réencodant l'image, la limite à
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
- au maximum quatre passages documentaires pertinents.

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

## API et intégration d'IntelliFlood World

- `GET /api/v1/ai/providers` — statut sans secret, administrateur.
- `GET /api/v1/ai/status` — fournisseurs actifs et notes de confidentialité,
  utilisateur connecté; les interfaces vérifient ces destinataires avant le
  consentement et l'envoi.
- `POST /api/v1/ai/providers/{id}/catalog` — catalogue gratuit, administrateur.
- `PUT` / `DELETE /api/v1/ai/providers/{id}` — configuration, administrateur.
- `POST /api/v1/ai/assistant` — réponse ou rapport, utilisateur connecté,
  consentement obligatoire.
- `POST /api/v1/ai/vision` — analyse d'image, utilisateur connecté et double
  consentement.
- `GET /api/v1/ai/anomalies` — candidats déterministes d'anomalie.

Le tableau de bord web et le module IntelliFlood de `apps/world` utilisent le
même endpoint assistant, les mêmes fournisseurs configurés et le même jeton
IntelliFlood. Le module ne transmet pas de question si le statut des
destinataires ne peut pas être vérifié et réinitialise le consentement après
chaque tentative. Il ne stocke aucune deuxième clé de modèle. L'assistant vocal
Realtime et le résumé HUD préexistants demeurent toutefois des fonctions
distinctes qui utilisent leurs propres réglages OpenAI/Gemini; ils ne reçoivent
pas automatiquement les données de crue et ne sont pas remplacés par ce moteur.

## Vérification

Tests ciblés : `apps/api/tests/test_ai_engine.py` et
`apps/web/src/components/AssistantPanel.test.tsx`. Les tests contre PostgreSQL
et la migration nécessitent une base PostGIS démarrée et migrée.
