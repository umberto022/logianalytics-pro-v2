// Plantilla nueva_solicitud_cotizacion en Meta.
//   node scripts/whatsapp-sandbox/template.mjs [--prod]        → muestra el cuerpo EXACTO que se enviaría a Meta (no llama a la red)
//   node scripts/whatsapp-sandbox/template.mjs status          → consulta su estado en la WABA (solo lectura; requiere token de acceso)
//   node scripts/whatsapp-sandbox/template.mjs --submit        → la ENVÍA A REVISIÓN (crea configuración persistente en Meta)
// Por defecto el botón apunta al dominio del sandbox (túnel actual) porque la WABA de prueba es de pruebas; con --prod usa el
// dominio de producción (para la WABA definitiva). `--submit` solo debe ejecutarse tras aprobación expresa. Nunca imprime el token.
import { BODY_TEXT, BUTTON_TEXT, BUTTON_URL, TEMPLATE_NAME, templatePayload } from "./template-def.mjs";
import { readEnvFile, secretState } from "./env.mjs";

const env = readEnvFile();
const version = process.env.WHATSAPP_API_VERSION || "v23.0";
const waba = env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const args = process.argv.slice(2);
const prod = args.includes("--prod");

async function tunnelBase() {
  try {
    const t = await (await fetch("http://127.0.0.1:4040/api/tunnels")).json();
    return t.tunnels.find((x) => x.public_url.startsWith("https://")).public_url;
  } catch {
    console.error("No hay túnel de ngrok activo (127.0.0.1:4040): sin él no se puede fijar el dominio del botón del sandbox.");
    process.exit(2);
  }
}
const buttonUrl = prod ? BUTTON_URL : `${await tunnelBase()}/solicitudes?ref={{1}}`;

function requireToken() {
  if (!env.WHATSAPP_ACCESS_TOKEN) {
    console.error(`Falta el token de acceso (${secretState(env.WHATSAPP_ACCESS_TOKEN)}). Cárgalo con: npm run sandbox:secrets`);
    process.exit(2);
  }
}
async function graph(method, path, body) {
  const res = await fetch(`https://graph.facebook.com/${version}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
const safeError = (j) => (j?.error ? `code ${j.error.code}${j.error.error_subcode ? "/" + j.error.error_subcode : ""}: ${j.error.error_user_msg || j.error.message}` : "");

if (args.includes("status")) {
  requireToken();
  const { status, json } = await graph("GET", `${waba}/message_templates?name=${TEMPLATE_NAME}&fields=name,status,category,language,rejected_reason`);
  if (status !== 200) { console.error(`HTTP ${status} ${safeError(json)}`); process.exit(1); }
  if (!json.data?.length) console.log(`La plantilla ${TEMPLATE_NAME} NO existe en la WABA ${waba}.`);
  for (const t of json.data ?? []) console.log(`${t.name} [${t.language}] estado=${t.status} categoría=${t.category}${t.rejected_reason && t.rejected_reason !== "NONE" ? " motivo_rechazo=" + t.rejected_reason : ""}`);
} else if (args.includes("--submit")) {
  requireToken();
  const { status, json } = await graph("POST", `${waba}/message_templates`, templatePayload(buttonUrl));
  if (status !== 200) { console.error(`No se pudo crear: HTTP ${status} ${safeError(json)}`); process.exit(1); }
  console.log(`Enviada a revisión: id=${json.id} estado=${json.status} categoría=${json.category} · botón → ${buttonUrl}`);
} else {
  console.log(`Plantilla: ${TEMPLATE_NAME} (UTILITY, es) en la WABA ${waba} — destino del botón: ${prod ? "PRODUCCIÓN" : "sandbox (túnel actual)"}\n`);
  console.log("── Cuerpo ─────────────────────────────────────────");
  console.log(BODY_TEXT);
  console.log("── Botón ──────────────────────────────────────────");
  console.log(`${BUTTON_TEXT} → ${buttonUrl}`);
  console.log("\nPayload exacto (POST /{waba-id}/message_templates):");
  console.log(JSON.stringify(templatePayload(buttonUrl), null, 2));
}
