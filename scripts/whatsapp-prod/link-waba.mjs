// Vincula NUESTRA app a la WABA de PRODUCCIÓN (POST /{waba-id}/subscribed_apps), con el archivo de entorno de producción.
//   npm.cmd run prod:link-waba            → NO cambia nada: muestra el estado actual
//   npm.cmd run prod:link-waba -- --apply → vincula (configuración persistente en Meta; solo con autorización)
//   npm.cmd run prod:link-waba -- --undo  → desvincula SOLO nuestra app
// Reutiliza scripts/whatsapp-sandbox/link-waba.mjs. Refuerzo de seguridad: se niega a operar sobre la WABA de prueba.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { ROOT, PROD_ENV_FILE, readProdEnv, accessTokenLooksValid, numericIdLooksValid } from "./env.mjs";

async function main() {
  const env = readProdEnv();
  if (!accessTokenLooksValid(env.WHATSAPP_ACCESS_TOKEN) || !numericIdLooksValid(env.WHATSAPP_BUSINESS_ACCOUNT_ID) || !numericIdLooksValid(env.WHATSAPP_APP_ID)) {
    console.error("Faltan token, ID de WABA o ID de app de producción: npm.cmd run prod:secrets"); return 2;
  }
  const info = await fetch(`https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || "v23.0"}/${env.WHATSAPP_BUSINESS_ACCOUNT_ID}?fields=name`, { headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` } }).then((r) => r.json()).catch(() => ({}));
  if (/^test whatsapp business account/i.test(info.name ?? "")) { console.error("Esa es la WABA de PRUEBA: este script solo opera sobre la de producción."); return 1; }
  console.log(`WABA de producción: ${info.name ?? "(no se pudo leer el nombre)"}`);
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "whatsapp-sandbox", "link-waba.mjs"), ...process.argv.slice(2)], {
    stdio: "inherit", cwd: ROOT, env: { ...process.env, WHATSAPP_META_ENV_FILE: PROD_ENV_FILE },
  });
  return r.status ?? 1;
}
// Sin process.exit() tras usar fetch: en Windows puede abortar con un fallo de libuv.
process.exitCode = await main();
