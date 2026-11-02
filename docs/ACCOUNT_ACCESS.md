# Accès aux comptes

## Inscription publique

Un visiteur peut créer un compte depuis la fenêtre **Connexion → Créer un
compte viewer**. L'inscription demande un nom, une adresse e-mail et un mot de
passe d'au moins 10 caractères, puis ouvre une session viewer.

L'API `POST /api/v1/auth/register` ne reçoit ni rôle ni organisation : elle
crée exclusivement un compte `viewer`. Les rôles `operator` et `admin` restent
créés par un administrateur via l'API de gestion; l'inscription publique ne
peut donc pas élever les privilèges. Chaque création est inscrite dans le
journal d'audit. Les mots de passe sont stockés sous forme de hash scrypt.

Les inscriptions sont limitées à cinq tentatives par adresse IP de connexion
et par heure dans chaque processus API. Cette protection en mémoire est adaptée
à l'environnement local; un déploiement derrière un proxy doit transmettre
l'adresse client de manière fiable et un déploiement multi-processus ou
multi-instance doit utiliser une limite partagée et persistante. L'adresse
e-mail n'est pas vérifiée automatiquement à ce stade.

## Fonctionnalités ouvertes sans compte

L'Intelligence Engine et les observations terrain sont accessibles à un
visiteur non authentifié :

- `GET /api/v1/ai/status`, `POST /api/v1/ai/assistant`, `GET /api/v1/ai/anomalies`
  et `POST /api/v1/ai/vision` utilisent une identité anonyme
  (`anonyme@intelliflood.local`, rôle `citoyen`). Les fournisseurs et leurs clés
  restent configurés globalement par un administrateur; un visiteur ne peut ni
  les lire ni les modifier. Les mêmes limites de débit (8 requêtes IA par
  5 minutes) s'appliquent, indexées par identité ou par adresse IP.
- `POST /api/v1/observations` accepte un signalement anonyme
  (`created_by_user_id` nul). `GET /api/v1/observations` sans jeton ne renvoie
  que les observations au statut `verified`; les signalements bruts restent
  visibles uniquement par leur auteur, leur organisation ou un administrateur.
- La revue et la modération (`PATCH /api/v1/observations/{id}/status`) restent
  réservées aux rôles opérateur/administrateur authentifiés.

Les simulations d'inondation restent protégées par `require_role("viewer")` :
un visiteur peut consulter la carte et demander l'IA ou signaler un terrain,
mais doit posséder un compte pour lancer un calcul coûteux.

Chaque appel IA ou création d'observation est tracé dans le journal d'audit,
avec l'identité anonyme explicite lorsque aucun compte n'est connecté.

