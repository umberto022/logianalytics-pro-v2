// Copia el token de verificación del webhook (generado para el sandbox) al portapapeles de Windows,
// sin imprimirlo. Pegalo en el campo "Token de verificación" de Meta y no lo compartas por chat.
import { spawnSync } from "node:child_process";
import { readEnvFile } from "./env.mjs";

const token = readEnvFile().WHATSAPP_WEBHOOK_VERIFY_TOKEN;
if (!token) { console.error("No hay token de verificación: corré primero npm run sandbox:secrets"); process.exit(1); }
const r = spawnSync("clip.exe", { input: token });
if (r.status !== 0) { console.error("No se pudo copiar al portapapeles."); process.exit(1); }
console.log("Token de verificación copiado al portapapeles (no se muestra). Pegalo en Meta.");
