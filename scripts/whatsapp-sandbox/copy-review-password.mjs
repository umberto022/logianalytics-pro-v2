// Copia la contraseña de la página de revisión al portapapeles (sin imprimirla). Usuario: revision
import { spawnSync } from "node:child_process";
import { readEnvFile } from "./env.mjs";

const pw = readEnvFile().SANDBOX_REVIEW_PASSWORD;
if (!pw) { console.error("No hay contraseña de revisión: corré npm run sandbox:secrets -- --init"); process.exit(1); }
const r = spawnSync("clip.exe", { input: pw });
if (r.status !== 0) { console.error("No se pudo copiar al portapapeles."); process.exit(1); }
console.log('Contraseña de revisión copiada al portapapeles (no se muestra). Usuario: revision');
