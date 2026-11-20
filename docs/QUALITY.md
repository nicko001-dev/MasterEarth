# MasterEarth — Guide de Qualité, Tests et Outillage (M0.4)

Ce document formalise les outils de qualité, les procédures de test, le lintage, le typage et la validation pour le projet **MasterEarth** dans le cadre du jalon **M0.4**.

---

## 1. Vue d'ensemble des outils de qualité

MasterEarth privilégie des outils de qualité robustes, gratuits, open source et exécutables localement :

- **Backend (Python 3.11+)** :
  - **Pytest** : Suite de tests unitaires et d'intégration (`pytest`).
  - **Ruff** : Linter et formateur de code Python rapide (optionnel / recommandé).
  - **Pydantic-Settings** : Validation rigoureuse et isolation des variables d'environnement.
- **Frontend (React + TypeScript + Vite)** :
  - **TypeScript (`tsc --noEmit`)** : Vérification stricte des types statiques.
  - **Vite** : Bundler et outil de build de production ultra-rapide.

---

## 2. Commandes de Validation Reproductibles

Toutes les commandes doivent être exécutées depuis les répertoires applicatifs respectifs.

### A. Backend (`apps/api/`)

1. **Activation de l'environnement virtuel** :
   ```bash
   # Windows PowerShell
   .venv\Scripts\Activate.ps1

   # Linux / macOS
   # source .venv/bin/activate
   ```

2. **Exécution des tests complets** :
   ```bash
   python -m pytest -v
   ```

3. **Vérification du lintage (avec Ruff si installé)** :
   ```bash
   python -m ruff check app/ tests/
   ```

4. **Vérification du formatage** :
   ```bash
   python -m ruff format --check app/ tests/
   ```

### B. Frontend (`apps/web/`)

1. **Installation des dépendances** (si nécessaire) :
   ```bash
   npm install
   ```

2. **Vérification stricte des types TypeScript** :
   ```bash
   npm run typecheck
   ```

3. **Build de production (incluant typecheck)** :
   ```bash
   npm run build
   ```

---

## 3. Procédure de Validation avant Release

Avant de valider ou de préparer une livraison, l'équipe doit exécuter l'intégralité des vérifications suivantes sans erreur :

1. Lancer pytest sur le backend (`apps/api`).
2. Lancer la vérification de type TypeScript sur le frontend (`apps/web`).
3. Lancer le build de production frontend (`apps/web`).
4. Vérifier les endpoints techniques :
   - `GET /health` (doit retourner `{ "status": "ok", "service": "MasterEarth API" }`)
   - `GET /api/v1` (doit retourner les métadonnées techniques et l'environnement)

---

## 4. Interprétation des Échecs

- **Échec de test pytest** :
  - Vérifier si une variable d'environnement contamine l'environnement de test (les tests utilisent `monkeypatch` pour s'isoler).
  - S'assurer que le package `intelliflood_api` est installé en mode éditable (`pip install -e ".[dev]"`).
- **Échec de typecheck TypeScript** :
  - Vérifier les incompatibilités de types dans `src/` ou les contrats partagés (`packages/contracts`).
- **Échec de build Vite** :
  - Vérifier l'absence d'erreurs de syntaxe JSX ou d'import manquant.

---

## 5. Limites Connues & Périmètre M0.4

- Aucun système de base de données (PostgreSQL/PostGIS) ni d'authentification n'est actif à ce stade (réservé à M1 et M2).
- Les tests se concentrent sur la robustesse de l'API, de la configuration et de l'architecture modulaire M0.3.
- Les exemples de fonctionnalités et de données restent **non exhaustifs** conformément aux consignes d'architecture.

---

*INTELLIFLOOD M0.4 — IMPLEMENTATION COMPLETE — READY FOR ARCHITECTURAL AUDIT*
