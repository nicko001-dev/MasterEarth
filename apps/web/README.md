# IntelliFlood Web

React + TypeScript + Vite frontend pour le projet IntelliFlood.

## Statut (M0.3)

M0.3 établit une organisation interne modulaire pour le frontend :
- `src/app/` : Composant racine applicatif (`App.tsx`).
- `src/components/` : Composants UI réutilisables (`StatusCard.tsx`).
- `src/services/` : Clients d'API centralisés (`api.ts`).
- `src/config.ts` : Configuration d'environnement runtime issue de M0.2.
- `src/main.tsx` : Point d'entrée de montage React.

## Prérequis

- Node.js 20+
- npm

## Installation & Configuration locale

1. **Installation des dépendances** :
   ```bash
   npm install
   ```

2. **Préparation du fichier `.env`** :
   ```bash
   cp .env.example .env
   ```

   Variables disponibles :
   - `VITE_API_BASE_URL` : URL de base de l'API FastAPI (défaut: `http://127.0.0.1:8000`)
   - `VITE_PORT` : port d'écoute du serveur de développement local Vite (défaut: `5173`)

   *Rappel : Seules les variables préfixées par `VITE_` sont exposées au client navigateur par Vite.*

3. **Lancement du serveur de développement** :
   ```bash
   npm run dev
   ```

4. **Vérification TypeScript & Build de production** :
   ```bash
   npm run typecheck
   npm run build
   ```

## Sécurité

- Ne jamais placer de secrets, tokens ou mots de passe dans les variables `VITE_*` car elles sont intégrées au code JavaScript servi aux navigateurs.
- Le fichier `.gitignore` ignore les fichiers `.env` locaux.
