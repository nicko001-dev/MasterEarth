import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Deux pages : l'accueil immersif (/) et la plateforme React (/app/).
// index.html est un fichier statique vanilla (Three.js) — pas de React HMR.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = Number(env.VITE_PORT || process.env.VITE_PORT) || 5173;
  return {
    plugins: [react()],
    // Bind on all interfaces so both http://localhost and http://127.0.0.1 work.
    server: { host: true, port, strictPort: true },
    build: {
      chunkSizeWarningLimit: 6000,
      rollupOptions: {
        input: { main: resolve(__dirname, "index.html"), app: resolve(__dirname, "app/index.html") },
      },
    },
    // Ne pas injecter HMR dans index.html (page d'accueil Three.js vanilla)
    optimizeDeps: {
      exclude: ["three"],
    },
    // Configuration pour servir index.html comme page statique sans HMR
    appType: "mpa",
  };
});
