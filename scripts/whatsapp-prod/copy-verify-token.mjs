// Copia al portapapeles el token de verificación del webhook de PRODUCCIÓN (sin imprimirlo), para pegarlo en Meta.
import { spawnSync } from "node:child_process";
import { readProdEnv } from "./env.mjs";

const token = readProdEnv().WHATSAPP_WEBHOOK_VERIFY_TOKEN;
if (!token) { console.error("No hay token de verificación de producción: npm.cmd run prod:secrets"); process.exit(1); }
const r = spawnSync("clip.exe", { input: token });
if (r.status !== 0) { console.error("No se pudo copiar al portapapeles."); process.exit(1); }
console.log("Token de verificación de PRODUCCIÓN copiado al portapapeles (no se muestra). Pégalo en Meta → Webhooks → Token de verificación.");
