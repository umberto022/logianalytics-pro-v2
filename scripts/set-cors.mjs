/**
 * Configura CORS en Firebase Storage.
 * Requiere una Service Account Key de Firebase.
 *
 * Uso:
 *   node scripts/set-cors.mjs
 *
 * Necesita instalar: npm install --save-dev @google-cloud/storage
 */

import { Storage } from "@google-cloud/storage";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const BUCKET = "logianalytics-pro.firebasestorage.app";

const CORS = [
  {
    origin: [
      "https://logianalytics-pro-v2.vercel.app",
      "http://localhost:3000",
      "http://localhost:3001",
    ],
    method: ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"],
    responseHeader: [
      "Content-Type",
      "Authorization",
      "Content-Length",
      "X-Requested-With",
    ],
    maxAgeSeconds: 3600,
  },
];

// ── Opción A: usa Application Default Credentials (gcloud auth login)
// ── Opción B: usa Service Account Key (descarga desde Firebase Console)
const KEY_PATH = resolve(ROOT, "serviceAccountKey.json");
let storageOptions = {};

try {
  readFileSync(KEY_PATH); // comprueba si existe
  storageOptions = { keyFilename: KEY_PATH };
  console.log("✅ Usando Service Account Key:", KEY_PATH);
} catch {
  console.log("ℹ️  No se encontró serviceAccountKey.json — usando Application Default Credentials");
}

const storage = new Storage(storageOptions);

async function main() {
  try {
    await storage.bucket(BUCKET).setCorsConfiguration(CORS);
    console.log(`✅ CORS configurado exitosamente en gs://${BUCKET}`);
    console.log("   Orígenes permitidos:");
    CORS[0].origin.forEach((o) => console.log("   •", o));
  } catch (err) {
    console.error("❌ Error al configurar CORS:", err.message);
    console.error("\nPosibles causas:");
    console.error("  1. No estás autenticado → ejecuta: gcloud auth application-default login");
    console.error("  2. No tienes permisos en el bucket");
    console.error("  3. El bucket name es incorrecto");
  }
}

main();
