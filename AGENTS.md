# IntelliFlood — Instructions for coding agents

## Before modifying code

1. Read this file.
2. Read the relevant project documents in `docs/`.
3. Identify the exact requested scope.
4. Do not implement features that were not requested merely because they seem useful.

## Architecture rules

- Respect the modular architecture.
- Keep backend, frontend, shared contracts and domain responsibilities separated.
- Critical scientific/business calculations must not live in the UI.
- Do not couple business modules directly to a specific LLM runtime.
- AI must not be treated as the source of truth for deterministic calculations.
- Preserve multi-tenancy and authorization boundaries.
- Preserve provenance and auditability.
- Do not bypass synchronization rules.
- Prefer free, open-source and self-hostable technologies when compatible.

## Current baseline

The living repository is the root of this project (`Current/IntelliFlood/`).

M0.1 provided the repository skeleton plus a minimal FastAPI health API and a React + Vite frontend.

M0.2 introduced explicit, safe, reproducible environment configuration via `pydantic-settings` and Vite `loadEnv`.

M0.3 establishes the modular internal architecture. The backend is now organized into `api/`, `schemas/`, `services/`, `domain/`, and `core/` layers. The frontend is organized into `app/`, `components/`, and `services/`. See `docs/ARCHITECTURE.md` for the full architectural reference.

Do not add features belonging to later milestones unless they are explicitly requested.

## Examples

⚠️ EXEMPLES NON EXHAUSTIFS : les éléments présentés comme exemples illustrent le fonctionnement attendu, mais ne constituent pas une liste complète des fonctionnalités, données, cas d’utilisation ou composants à implémenter.

Never interpret an `EXEMPLE` list as exhaustive.

## Undefined decisions

Anything explicitly marked `À DÉFINIR` must not be invented by the coding agent. Report it or propose options before implementation when the decision is required.

## Quality

Every meaningful change should include appropriate tests. Add tests for changed backend behavior. Do not remove tests to make a build pass. Update documentation when an architectural decision changes.
