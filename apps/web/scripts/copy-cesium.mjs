// Copie les ressources statiques de CesiumJS (workers, textures, CSS) vers public/cesium (multi-plateforme).
import { cpSync, existsSync, mkdirSync } from "node:fs";

const src = "node_modules/cesium/Build/Cesium";
if (!existsSync(src)) { console.error("CesiumJS absent : lancez d'abord `npm install`."); process.exit(1); }
mkdirSync("public/cesium", { recursive: true });
for (const d of ["Workers", "ThirdParty", "Assets", "Widgets"]) cpSync(`${src}/${d}`, `public/cesium/${d}`, { recursive: true });
console.log("CesiumJS : ressources copiées dans public/cesium");
