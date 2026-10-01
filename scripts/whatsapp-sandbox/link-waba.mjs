// Vincula NUESTRA app (LogiAnalytics Avisos) a la WABA de prueba: POST /{waba-id}/subscribed_apps.
//   node scripts/whatsapp-sandbox/link-waba.mjs           → NO cambia nada: muestra el estado actual y qué haría
//   node scripts/whatsapp-sandbox/link-waba.mjs --apply   → aplica el cambio (configuración persistente en Meta; solo con autorización expresa)
//   node scripts/whatsapp-sandbox/link-waba.mjs --undo    → desvincula NUESTRA app (DELETE); no toca las otras apps vinculadas
// El POST usa el token de usuario de NUESTRA app, así que suscribe a NUESTRA app (no a otra). Después vuelve a consultar para verificar.
// Nunca imprime credenciales.
import { readEnvFile, accessTokenLooksValid } from "./env.mjs";

const env = readEnvFile();
const version = process.env.WHATSAPP_API_VERSION || "v23.0";
const appId = env.WHATSAPP_APP_ID;
if (!appId) { console.error("Falta WHATSAPP_APP_ID en .env.sandbox.local."); process.exit(2); }
const waba = env.WHATSAPP_BUSINESS_ACCOUNT_ID;
if (!accessTokenLooksValid(env.WHATSAPP_ACCESS_TOKEN)) { console.error("Falta un token de acceso válido (npm run sandbox:secrets)."); process.exit(2); }

async function graph(method) {
  const r = await fetch(`https://graph.facebook.com/${version}/${waba}/subscribed_apps`, { method, headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` } });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
const list = async () => {
  const { status, json } = await graph("GET");
  if (status !== 200) throw new Error(`HTTP ${status} ${json?.error?.message ?? ""}`);
  return (json.data ?? []).map((d) => ({ id: d.whatsapp_business_api_data?.id ?? d.id, name: d.whatsapp_business_api_data?.name ?? d.name }));
};
const show = (apps) => (apps.length ? apps.map((a) => `${a.name} [${a.id}]`).join(", ") : "ninguna");

const before = await list();
console.log(`WABA ${waba} — apps vinculadas ahora: ${show(before)}`);
console.log(`Nuestra app ${appId} vinculada: ${before.some((a) => a.id === appId) ? "sí" : "NO"}`);

if (process.argv.includes("--apply") || process.argv.includes("--undo")) {
  const undo = process.argv.includes("--undo");
  const r = await graph(undo ? "DELETE" : "POST");
  console.log(`${undo ? "DELETE" : "POST"} subscribed_apps → HTTP ${r.status} ${r.json?.success === true ? "success" : JSON.stringify(r.json?.error?.message ?? r.json)}`);
  const after = await list();
  console.log(`Apps vinculadas después: ${show(after)}`);
  console.log(`Nuestra app vinculada: ${after.some((a) => a.id === appId) ? "sí" : "no"} · otras apps conservadas: ${before.filter((a) => a.id !== appId).every((a) => after.some((x) => x.id === a.id)) ? "sí" : "NO — REVISAR"}`);
} else {
  console.log(`\nNo se cambió nada. Con --apply se enviaría: POST /${waba}/subscribed_apps (con el token de nuestra app).`);
  console.log("Riesgo a conocer: no está documentado si añadir nuestra app desplaza a la app de Meta ya vinculada; el script lo verifica tras aplicar y --undo revierte lo nuestro.");
}
