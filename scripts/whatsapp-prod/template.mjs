// Plantilla nueva_solicitud_cotizacion en la WABA de PRODUCCIÓN (usa la config de .env.production-meta.local).
//   npm.cmd run prod:template                → muestra el cuerpo y el payload EXACTOS (botón → https://logianalytics-pro-v2.vercel.app/solicitudes?ref={{1}})
//   npm.cmd run prod:template -- status      → consulta su estado en la WABA de producción (solo lectura)
//   npm.cmd run prod:template -- --submit    → la ENVÍA A REVISIÓN (crea configuración en Meta; solo con tu OK expreso)
// Reutiliza scripts/whatsapp-sandbox/template.mjs con --prod y el archivo de entorno de producción. Nunca imprime el token.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { ROOT, PROD_ENV_FILE, readProdEnv } from "./env.mjs";

const env = readProdEnv();
if (process.argv.includes("--submit") || process.argv.includes("status")) {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_BUSINESS_ACCOUNT_ID) { console.error("Faltan el token o el ID de la WABA de producción: npm.cmd run prod:secrets"); process.exit(2); }
}
const script = path.join(ROOT, "scripts", "whatsapp-sandbox", "template.mjs");
const r = spawnSync(process.execPath, [script, "--prod", ...process.argv.slice(2)], {
  stdio: "inherit", cwd: ROOT, env: { ...process.env, WHATSAPP_META_ENV_FILE: PROD_ENV_FILE },
});
process.exit(r.status ?? 1);
