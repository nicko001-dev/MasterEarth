# Infrastructure de Base de Données — IntelliFlood

Composants de persistance, migrations Alembic, scripts et schémas PostgreSQL / PostGIS pour IntelliFlood.

## Parcours de démarrage local concis

Pour initialiser et exécuter la base de données en environnement local :

1. **Préparation de la configuration locale** :
   Copier le fichier d'exemple sécurisé (sans secrets) :
   ```bash
   # Depuis la racine du projet
   cp .env.example .env
   ```

2. **Démarrage de PostgreSQL & PostGIS (Docker Compose)** :
   ```bash
   docker compose up -d postgres
   ```
   *Vérifier l'état du conteneur avec `docker ps`.*

3. **Application des migrations Alembic** :
   ```bash
   alembic upgrade head
   ```
   *Vérifier la révision actuelle avec `alembic current`.*

4. **Validation de l'extension PostGIS** :
   ```bash
   docker exec -it intelliflood-postgres psql -U intelliflood -d intelliflood -c "SELECT postgis_version();"
   ```

---

## Arborescence

- `migrations/` : Scripts de migration Alembic versionnés (`versions/`) et environnement d'exécution (`env.py`).
- `scripts/` : Scripts d'administration et de maintenance (jalons ultérieurs).
- `seeds/` : Jeux de données de référence et de test (jalons ultérieurs).

---

## Documentation détaillée

Pour une documentation exhaustive de l'infrastructure de données, consulter :
➡️ **[`docs/DATA_INFRASTRUCTURE.md`](../docs/DATA_INFRASTRUCTURE.md)**

Ce guide complet couvre :
- Le rôle détaillé de PostgreSQL, PostGIS, SQLAlchemy et Alembic.
- La correspondance des variables `POSTGRES_*` avec `docker-compose.yml`.
- La configuration et le dimensionnement du pool de connexions (`pool_size`, `max_overflow`, `pool_pre_ping`).
- Le diagnostic et la résolution des problèmes fréquents de connexion.
- La distinction stricte entre tests unitaires/configuration et tests d'intégration.
- Les limites de la migration initiale et les précautions indispensables avant tout downgrade.
- La procédure de déclaration de futurs modèles et de génération de migrations (M2+).
