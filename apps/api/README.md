# MasterEarth API

FastAPI backend pour le projet MasterEarth.

## Architecture de référence (M0.3)

M0.3 établit une architecture interne modulaire et extensible avec séparation stricte des responsabilités :
- `api/` : Couche d'exposition HTTP (routeurs, points d'entrée `/health`, `/api/v1`).
- `schemas/` : Modèles de validation Pydantic (DTO).
- `services/` : Logique applicative (`SystemService`).
- `core/` : Composants transversaux et configuration.
- `domain/` : Frontière pour les futures entités et invariants métier.

La configuration d'environnement issue de M0.2 est intégralement conservée.

Le backend actuel expose également des comptes et rôles, capteurs/mesures/alertes,
observations terrain et météo, simulation indicative et ingestion IoT. Le statut détaillé,
les lacunes et les vérifications figurent dans
`../../docs/BOATIKS_REQUIREMENTS_MATRIX.md`; la présence de ces fonctionnalités
ne garantit pas l'aptitude à la diffusion d'alertes opérationnelles.
La déconnexion révoque le jeton côté serveur; appliquer les migrations Alembic
jusqu'à `head` pour créer la table de révocation.

## Architecture interne

```text
app/
├── api/
│   ├── router.py
│   └── routes/
│       ├── health.py
│       └── root.py
├── core/
├── domain/
├── schemas/
│   └── system.py
├── services/
│   └── system.py
├── config.py
└── main.py
```

## Prérequis

- Python 3.11+
- pip et venv

## Installation & Configuration locale

1. **Création de l'environnement virtuel** :
   ```bash
   python -m venv .venv
   ```

2. **Installation des dépendances (mode dev)** :
   ```bash
   .venv/Scripts/python.exe -m pip install -e ".[dev]"
   ```

3. **Préparation du fichier `.env`** :
   ```bash
   cp .env.example .env
   ```

   Variables supportées :
   - `APP_NAME` : nom de l'application (défaut: `MasterEarth API`)
   - `API_VERSION` : version de l'API (défaut: `0.1.0`)
   - `APP_ENV` : environnement d'exécution (défaut: `development`)
   - `API_HOST` : hôte d'écoute (défaut: `127.0.0.1`)
   - `API_PORT` : port d'écoute (défaut: `8000`)
   - `API_DEBUG` : mode debug (défaut: `false`)
   - `CORS_ORIGINS` : liste d'origines autorisées (défaut: `http://localhost:5173,http://127.0.0.1:5173`)

4. **Lancement du serveur** :
   ```bash
   .venv/Scripts/python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```
   ou directement :
   ```bash
   .venv/Scripts/python.exe -m app.main
   ```

5. **Exécution des tests** :
   ```bash
   .venv/Scripts/python.exe -m pytest -v
   ```

## Sécurité

- Ne jamais committer de fichier `.env` réel contenant des secrets.
- Seul `.env.example` est versionné avec des valeurs d'exemple locales sécurisées.
