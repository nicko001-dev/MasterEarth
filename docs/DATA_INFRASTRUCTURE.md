# IntelliFlood — Infrastructure de Données (M1)

Ce document décrit l'infrastructure de données mise en place au jalon **M1** : PostgreSQL, PostGIS, SQLAlchemy et Alembic. Il détaille l'architecture, la configuration d'environnement, le démarrage local, la gestion des migrations ainsi que les bonnes pratiques et limites opérationnelles.

---

## 1. Rôle des composants

| Composant | Rôle dans IntelliFlood |
|-----------|------------------------|
| **PostgreSQL** | Base de données relationnelle principale, garantissant le stockage persistant, transactionnel et intègre des données du système. |
| **PostGIS** | Extension spatiale native pour PostgreSQL. Fournit les types géométriques et géographiques (`geometry`, `geography`), les index spatiaux (R-Tree / GiST) et les fonctions SIG requises pour les zones inondables, capteurs, tronçons et analyses spatiales. |
| **SQLAlchemy 2.x** | Toolkit SQL et ORM moderne pour Python. Assure l'abstraction relationnelle, le mapping objet/relationnel, la construction typée de requêtes, ainsi que la gestion centralisée du pool de connexions et des sessions transactionnelles. |
| **Alembic** | Outil officiel de migration de schéma pour SQLAlchemy. Permet le versionnement reproductible, auditable et progressif du schéma de base de données à travers des scripts de migration (`versions/`). |
| **GeoAlchemy2** | Extension intégrant PostGIS avec SQLAlchemy. Permet de déclarer des colonnes spatiales typées dans les modèles déclaratifs. |

---

## 2. Variables d'environnement `POSTGRES_*`

Les variables de configuration de l'infrastructure de données sont normalisées dans `apps/api/app/config.py` (`Settings`) et documentées dans les fichiers d'exemple sécurisés :

- `.env.example` (racine du projet)
- `apps/api/.env.example` (backend API)

Correspondance normative des variables avec `docker-compose.yml` et les fichiers `.env.example` :

| Variable | Description | Valeur par défaut locale | Correspondance `docker-compose.yml` |
|----------|-------------|--------------------------|-------------------------------------|
| `POSTGRES_HOST` | Hôte du serveur PostgreSQL | `127.0.0.1` | Hôte de liaison locale pour l'accès client / API |
| `POSTGRES_PORT` | Port d'écoute PostgreSQL | `5432` | Mapping de port : `"${POSTGRES_PORT:-5432}:5432"` |
| `POSTGRES_USER` | Nom de l'utilisateur de la base | `intelliflood` | Variable d'environnement du conteneur : `POSTGRES_USER` |
| `POSTGRES_PASSWORD` | Mot de passe de l'utilisateur | `change-me` | Variable d'environnement du conteneur : `POSTGRES_PASSWORD` |
| `POSTGRES_DB` | Nom de la base de données créée à l'initialisation | `intelliflood` | Variable d'environnement du conteneur : `POSTGRES_DB` |
| `POSTGRES_POOL_SIZE` | Nombre de connexions maintenues dans le pool SQLAlchemy | `5` | Paramètre applicatif SQLAlchemy (non applicable à docker-compose) |
| `POSTGRES_MAX_OVERFLOW` | Nombre maximal de connexions temporaires au-delà du pool | `10` | Paramètre applicatif SQLAlchemy (non applicable à docker-compose) |

> 🔒 **Règle de sécurité stricte** :
> Les valeurs figurant dans `.env.example` et dans ce document sont des valeurs locales de développement et de test.
> **Aucun secret réel, mot de passe de production ou clé privée ne doit jamais être commité dans le dépôt.**
> Le fichier `.gitignore` racine ignore strictement tous les fichiers `.env` réels (`.env`, `.env.local`, `.env.production`).

---

## 3. Préparation locale et démarrage

### 3.1 Préparation du fichier `.env` local

Pour configurer l'environnement local sans exposer de secrets :

```bash
# Windows PowerShell (depuis apps/api)
cp .env.example .env

# Ou depuis la racine
cp .env.example .env
```

Le fichier `.env` généré utilise par défaut des identifiants locaux réservés au développement (`intelliflood` / `change-me`). Ajustez ces valeurs selon vos besoins locaux sans les versionner.

### 3.2 Démarrage de PostgreSQL / PostGIS avec Docker Compose

Prérequis : Docker Desktop ou moteur Docker avec le plugin Docker Compose installé.

Depuis la racine du projet (`D:\app3\Current\IntelliFlood\`) :

```bash
# Démarrer le service PostgreSQL/PostGIS en arrière-plan
docker compose up -d postgres
```

### 3.3 Vérification de l'état du conteneur

Vérifiez que le conteneur s'exécute correctement :

```bash
# Vérifier l'état d'exécution
docker ps --filter "name=intelliflood-postgres"

# Exemple de statut attendu :
# intelliflood-postgres   postgis/postgis:17-3.5   Up (healthy/running)   0.0.0.0:5432->5432/tcp

# Vérifier les logs du conteneur
docker logs intelliflood-postgres
```

Le service utilise l'image officielle PostGIS `postgis/postgis:17-3.5` et persiste ses données dans le volume Docker nommé `postgres-data`.

### 3.4 Vérification de PostGIS

Pour s'assurer que l'extension PostGIS est opérationnelle dans l'instance PostgreSQL :

```bash
# Exécution directe dans le conteneur
docker exec -it intelliflood-postgres psql -U intelliflood -d intelliflood -c "SELECT postgis_version();"
```

Résultat attendu (exemple indicatif selon la révision de l'image) :
```text
            postgis_version            
---------------------------------------
 3.5 USE_GEOS=1 USE_PROJ=1 USE_STATS=1
(1 row)
```

---

## 4. Migrations Alembic

### 4.1 Configuration

- Fichier de configuration : `alembic.ini` (à la racine du projet).
- Répertoire des migrations : `database/migrations/`.
- Environnement Alembic : `database/migrations/env.py`.
- L'URL de connexion est résolue dynamiquement à partir des paramètres de configuration de l'application (`app.config.settings.database_url`), garantissant la cohérence stricte entre l'API et Alembic.
- La directive `path_separator = os` est configurée dans `alembic.ini` pour assurer la portabilité multiplateforme (Windows / Linux / macOS).

### 4.2 Application et vérification des migrations

Depuis la racine du projet :

```bash
# 1. Vérifier la révision courante appliquée sur la base
alembic current

# 2. Appliquer les migrations jusqu'à la dernière version (head)
alembic upgrade head

# 3. Vérifier que la migration initiale est bien enregistrée
alembic current
# Résultat attendu : 20261027_1030_initial (head)

# 4. Consulter l'historique complet des migrations
alembic history --verbose
```

### 4.3 Génération SQL hors ligne (mode offline)

Il est possible de visualiser le code SQL sans se connecter à une base active :

```bash
alembic upgrade --sql base:head
```

---

## 5. Pool de connexions SQLAlchemy

La gestion des connexions est centralisée dans `apps/api/app/infrastructure/db/session.py` et paramétrée via `Settings` (`apps/api/app/config.py`).

### 5.1 Rôle des paramètres de connexion

| Paramètre | Valeur locale | Rôle technique |
|-----------|---------------|----------------|
| `pool_size` (`POSTGRES_POOL_SIZE`) | `5` | Nombre de connexions TCP maintenues constamment ouvertes dans le pool pour absorber les requêtes courantes sans surcoût de négociation TLS / connexion. |
| `max_overflow` (`POSTGRES_MAX_OVERFLOW`) | `10` | Nombre maximal de connexions temporaires pouvant être ouvertes au-delà de `pool_size` lors de pics de trafic. Une fois refermées, ces connexions excédentaires sont libérées. |
| `pool_pre_ping` | `True` | Exécute un test de vivacité rapide (`SELECT 1`) avant de distribuer une connexion issue du pool. Évite l'émission de requêtes sur des sockets obsolètes ou interrompues par un pare-feu ou un redémarrage de la base. |

> ℹ️ **Note sur les environnements de production** :
> Les valeurs `pool_size=5` et `max_overflow=10` sont des valeurs adaptées au développement et aux tests.
> En environnement de production, ces paramètres ne doivent pas être imposés arbitrairement : ils doivent être dimensionnés en fonction du nombre de workers ASGI (Uvicorn / Gunicorn), du paramètre serveur PostgreSQL `max_connections`, et de la capacité mémoire du serveur hôte.

---

## 6. Problèmes fréquents de connexion et solutions

*(Liste illustrative — non exhaustive de diagnostics courants)*

| Symptôme | Cause probable | Solution recommandée |
|----------|----------------|----------------------|
| `connection refused` / `10061` / `timeout` | Le service PostgreSQL n'est pas démarré ou le port 5432 n'est pas exposé. | Démarrer le conteneur (`docker compose up -d postgres`) et vérifier avec `docker ps`. |
| `password authentication failed for user` | Divergence entre le mot de passe dans `.env` et celui initialisé dans le conteneur. | Vérifier que `POSTGRES_PASSWORD` dans `.env` correspond à celui défini lors de la création du conteneur. En environnement local jetable, réinitialiser le volume avec `docker compose down -v` puis redémarrer. |
| `database "intelliflood" does not exist` | La base n'a pas été créée lors du premier démarrage. | Vérifier `POSTGRES_DB` dans `docker-compose.yml`. Si le volume persistait une ancienne base vide, supprimer le volume local avec `docker compose down -v`. |
| `type "geometry" does not exist` | La migration d'activation PostGIS n'a pas été exécutée sur la base. | Exécuter `alembic upgrade head` pour appliquer la migration `20261027_1030_initial`. |
| `SSL SYSCALL error: EOF detected` / Connexion coupée | Déconnexion après inactivité (idle timeout) par le système hôte ou un proxy. | Le paramètre `pool_pre_ping=True` activé dans l'application gère automatiquement ce cas en renouvelant la connexion transparente. |

---

## 7. Différence entre tests unitaires/configuration et tests d'intégration

Le projet sépare nettement les tests selon leur dépendance à l'infrastructure :

| Catégorie | Périmètre et exemples *(illustratifs)* | Nécessite un PostgreSQL / PostGIS actif ? |
|-----------|----------------------------------------|-------------------------------------------|
| **Tests unitaires et configuration** | - Validation de l'assemblage de l'URL SQLAlchemy (`test_settings_database_url`)<br>- Vérification de la création paresseuse de l'Engine (`test_get_engine_creates_engine`)<br>- Découverte et validation statique des scripts Alembic (`test_alembic_script_directory_loads`)<br>- Vérification des contrats API `/health` et `/api/v1` sans accès BD | **NON** — Exécutables en toute autonomie en CI ou localement sans Docker. |
| **Tests d'intégration réels** | - Exécution effective des migrations (`alembic upgrade head`) sur une base active<br>- Vérification de requêtes géospatiales réelles PostGIS (`ST_Contains`, `ST_Intersects`)<br>- Validation des transactions et rollbacks réels avec `session_scope` | **OUI** — Requiert une instance PostgreSQL/PostGIS accessible et initialisée. |

---

## 8. Limites de la migration initiale et précautions de downgrade

La migration initiale `20261027_1030_initial` établit le socle technique du jalon M1 :

- **Rôle et limites** : Elle active l'extension PostGIS (`CREATE EXTENSION IF NOT EXISTS postgis;`). Elle ne crée volontairement aucune table métier (les entités métier relèvent des jalons ultérieurs M2+).
- **Opération de downgrade** : Le script de rollback contient l'instruction `DROP EXTENSION IF EXISTS postgis CASCADE;`.

> ⚠️ **AVERTISSEMENT CRITIQUE SUR LE DOWNGRADE EN PRODUCTION** :
> L'instruction `DROP EXTENSION IF EXISTS postgis CASCADE` est une opération **destructrice irréversible**.
> La clause `CASCADE` force la suppression immédiate de **tous les objets dépendants de l'extension**, incluant :
> - Toutes les tables possédant des colonnes géospatiales (`geometry`, `geography`),
> - Tous les index spatiaux (GiST, SP-GiST),
> - Toutes les fonctions, procédures et vues associées.
>
> **Le downgrade ne doit en aucun cas être considéré comme une opération anodine ou sans risque.**
> Sur un environnement de production ou une base contenant des données réelles, un downgrade sans sauvegarde préalable (`pg_dump`) et sans plan de reprise validé entraînera une **perte irrémédiable de données**.

---

## 9. Procédure générale d'ajout futur d'un modèle et création de migration

*(Procédure illustrative — non exhaustive pour les jalons ultérieurs M2+)*

Pour ajouter une nouvelle entité de persistance lors des étapes ultérieures du projet :

1. **Déclaration du modèle SQLAlchemy** :
   Créer la classe du modèle dans le module approprié (par exemple sous `app/infrastructure/db/models.py` ou le domaine concerné) en héritant de `Base` (`from app.infrastructure.db.base import Base`).

2. **Enregistrement dans les métadonnées** :
   S'assurer que le modèle est importé dans `app/infrastructure/db/models.py` de façon à être découvert par `Base.metadata`.

3. **Génération de la migration Alembic** :
   Générer le script de migration par comparaison différentielle :
   ```bash
   alembic revision --autogenerate -m "Add <model_name> table"
   ```

4. **Revue manuelle obligatoire** :
   Inspecter systématiquement le fichier créé dans `database/migrations/versions/` :
   - Vérifier les types de colonnes et la nullabilité.
   - Vérifier la présence et la pertinence des index spatiaux (ex: `GIST index` sur colonnes géométriques).
   - Vérifier les contraintes de clés primaires et étrangères.
   - Valider la fonction `downgrade()` correspondante.

5. **Application locale et test** :
   Appliquer la migration sur la base de test locale :
   ```bash
   alembic upgrade head
   ```

6. **Validation de l'état** :
   Vérifier la bonne prise en compte avec `alembic current`.

---

## 10. Commandes récapitulatives d'arrêt et de maintenance

*(Commandes de maintenance locale — exemples illustratifs)*

```bash
# Arrêter le conteneur PostgreSQL sans effacer les données
docker compose stop postgres

# Redémarrer le conteneur arrêté
docker compose start postgres

# Arrêter et supprimer le conteneur ainsi que le volume de données (réinitialisation complète)
# ⚠️ Attention : supprime toutes les données locales
docker compose down -v
```
