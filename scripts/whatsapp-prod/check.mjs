// Verificación de SOLO LECTURA del flujo de PRODUCCIÓN del aviso por WhatsApp. No envía ningún mensaje, no cambia nada.
//   npm.cmd run prod:check
//
// Cada comprobación termina en PASA / FALLA / PENDIENTE (aún no hay dato: falta un paso tuyo, con la indicación de cuál).
// Solo si TODAS las obligatorias pasan imprime "LISTO PARA ACTIVAR". Aun así el envío sigue APAGADO: se activa aparte, con tu OK.
// Las pruebas HTTP a producción llevan la marca x-sandbox-synthetic (no son tráfico de Meta) y no escriben datos.
import crypto from "node:crypto";
import {
  readProdEnv, vercelProductionNames, WEBHOOK_URL, WORKER_URL, SCHEDULE_ID, TEMPLATE,
  appSecretLooksValid, accessTokenLooksValid, numericIdLooksValid,
} from "./env.mjs";
import { syntheticInit } from "../whatsapp-sandbox/meta-origin.mjs";
import { BUTTON_URL } from "../whatsapp-sandbox/template-def.mjs";

const env = readProdEnv();
const version = process.env.WHATSAPP_API_VERSION || "v23.0";
const results = [];
function row(state, name, detail = "", required = true) {
  results.push({ state, required });
  const tag = { PASA: "PASA     ", FALLA: "FALLA    ", PENDIENTE: "PENDIENTE", INFO: "INFO     " }[state];
  console.log(`${tag}  ${name}${detail ? " — " + detail : ""}`);
}
const graph = async (path, bearer) => {
  try { const r = await fetch(`https://graph.facebook.com/${version}/${path}`, { headers: { Authorization: `Bearer ${bearer}` } }); return { s: r.status, j: await r.json().catch(() => ({})) }; }
  catch { return { s: 0, j: {} }; }
};
const err = (j) => (j?.error ? `code ${j.error.code}: ${j.error.message}` : "");

// ── A. Configuración en Vercel (solo NOMBRES) ────────────────────────────────
console.log("A. Configuración en Vercel (Production, solo nombres)");
const names = vercelProductionNames();
if (!names) row("PENDIENTE", "Leer variables de Vercel", "no pude consultar (¿sesión de vercel?)");
else {
  for (const n of ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_BUSINESS_ACCOUNT_ID", "WHATSAPP_WEBHOOK_VERIFY_TOKEN", "WHATSAPP_TEMPLATE_NAME", "WHATSAPP_TEMPLATE_LANG", "CRON_SECRET", "QSTASH_TOKEN", "QSTASH_CURRENT_SIGNING_KEY", "QSTASH_NEXT_SIGNING_KEY"]) {
    row(names.has(n) ? "PASA" : "PENDIENTE", `Variable ${n}`, names.has(n) ? "" : "falta: npm.cmd run prod:secrets");
  }
  row("INFO", "WHATSAPP_SENDING_ENABLED", names.has("WHATSAPP_SENDING_ENABLED") ? "PRESENTE: el envío puede estar ENCENDIDO" : "ausente → envío APAGADO (correcto hasta verificar)", false);
}

// ── B. Producción (HTTP) ─────────────────────────────────────────────────────
console.log("\nB. Producción (HTTP, sin escribir datos)");
const w1 = await fetch(WORKER_URL, syntheticInit({ headers: { authorization: "Bearer undefined" } })).catch(() => null);
row(w1?.status === 401 ? "PASA" : "FALLA", "Worker cerrado ante 'Bearer undefined'", `HTTP ${w1?.status ?? "sin respuesta"}`);
const h403 = await fetch(`${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=falso&hub.challenge=1`, syntheticInit()).catch(() => null);
row(h403?.status === 403 ? "PASA" : "FALLA", "Webhook rechaza un token de verificación falso", `HTTP ${h403?.status ?? "sin respuesta"}`);
if (!env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) row("PENDIENTE", "Webhook acepta el token de verificación real", "falta el token local: npm.cmd run prod:secrets");
else {
  const ch = String(Math.floor(Math.random() * 1e9));
  const ok = await fetch(`${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=${env.WHATSAPP_WEBHOOK_VERIFY_TOKEN}&hub.challenge=${ch}`, syntheticInit()).catch(() => null);
  row(ok?.status === 200 && (await ok.text()) === ch ? "PASA" : "FALLA", "Webhook de producción responde al token de verificación real", ok ? `HTTP ${ok.status}${ok.status === 403 ? " (¿redeploy pendiente tras cargar las variables?)" : ""}` : "sin respuesta");
}
if (!appSecretLooksValid(env.WHATSAPP_APP_SECRET)) row("PENDIENTE", "Webhook valida la firma con el App Secret de producción", "falta el App Secret local");
else {
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "0", changes: [{ field: "messages", value: { metadata: { phone_number_id: "0" }, statuses: [] } }] }] });
  const sig = "sha256=" + crypto.createHmac("sha256", env.WHATSAPP_APP_SECRET).update(body, "utf8").digest("hex");
  const p = await fetch(WEBHOOK_URL, syntheticInit({ method: "POST", headers: { "x-hub-signature-256": sig, "content-type": "application/json" }, body })).catch(() => null);
  row(p?.status === 200 ? "PASA" : "FALLA", "Webhook de producción valida una firma hecha con el App Secret local (prueba SINTÉTICA, sin datos)", p ? `HTTP ${p.status}${p.status === 401 ? " (el App Secret de Vercel no coincide o falta el redeploy)" : ""}` : "sin respuesta");
}

// ── C. Meta ──────────────────────────────────────────────────────────────────
console.log("\nC. Meta (API, solo lectura)");
const token = env.WHATSAPP_ACCESS_TOKEN, appId = env.WHATSAPP_APP_ID, waba = env.WHATSAPP_BUSINESS_ACCOUNT_ID, phoneId = env.WHATSAPP_PHONE_NUMBER_ID;
if (!accessTokenLooksValid(token) || !appSecretLooksValid(env.WHATSAPP_APP_SECRET) || !numericIdLooksValid(appId) || !numericIdLooksValid(waba) || !numericIdLooksValid(phoneId)) {
  row("PENDIENTE", "Datos de Meta de producción", "faltan token, App Secret, ID de app, de WABA o de número: npm.cmd run prod:secrets");
} else {
  const d = (await graph(`debug_token?input_token=${encodeURIComponent(token)}`, `${appId}|${env.WHATSAPP_APP_SECRET}`)).j.data;
  row(d?.is_valid ? "PASA" : "FALLA", "Token válido y de la app LogiAnalytics Avisos", d ? `válido=${d.is_valid} app=${d.app_id === appId ? "correcta" : "OTRA"}` : "no se pudo validar");
  const permanent = d && (d.expires_at === 0 || d.expires_at === undefined);
  row(d?.type === "SYSTEM_USER" && permanent ? "PASA" : "FALLA", "Token de USUARIO DEL SISTEMA y sin vencimiento", d ? `tipo=${d.type} vence=${permanent ? "nunca" : new Date(d.expires_at * 1000).toISOString()}` : "");
  const sc = d?.scopes ?? [];
  row(sc.includes("whatsapp_business_messaging") && sc.includes("whatsapp_business_management") ? "PASA" : "FALLA", "Permisos whatsapp_business_messaging y whatsapp_business_management", sc.join(", "));

  const w = (await graph(`${waba}?fields=id,name,account_review_status,business_verification_status`, token)).j;
  row(w.id ? "PASA" : "FALLA", "La WABA de producción es accesible con el token", w.id ? w.name : err(w));
  if (w.id) {
    row(/^test whatsapp business account/i.test(w.name ?? "") ? "FALLA" : "PASA", "NO es la WABA de prueba", w.name);
    row(w.account_review_status === "APPROVED" ? "PASA" : "FALLA", "Cuenta de WhatsApp Business aprobada", `account_review_status=${w.account_review_status}`);
    row("INFO", "Verificación del negocio", `${w.business_verification_status ?? "no informada"} (no es obligatoria para empezar; limita el volumen)`, false);
  }
  const ph = (await graph(`${phoneId}?fields=id,display_phone_number,verified_name,code_verification_status,name_status,quality_rating,platform_type,account_mode,messaging_limit_tier,status`, token)).j;
  if (!ph.id) row("FALLA", "El número de producción existe y es accesible", err(ph));
  else {
    row("PASA", "El número existe y es accesible", `${ph.display_phone_number} · nombre: ${ph.verified_name}`);
    row(ph.code_verification_status === "VERIFIED" ? "PASA" : "FALLA", "Número verificado por SMS/llamada", `code_verification_status=${ph.code_verification_status}`);
    row(["APPROVED", "AVAILABLE_WITHOUT_REVIEW"].includes(ph.name_status) ? "PASA" : "FALLA", "Nombre para mostrar aprobado", `name_status=${ph.name_status}`);
    row(ph.verified_name === "Test Number" || /^\+?1[ -]?555/.test(ph.display_phone_number ?? "") ? "FALLA" : "PASA", "NO es el número de prueba de Meta", ph.display_phone_number);
    row(ph.platform_type === "CLOUD_API" && ph.account_mode !== "SANDBOX" ? "PASA" : "FALLA", "Registrado en la Cloud API y fuera de modo SANDBOX", `plataforma=${ph.platform_type} modo=${ph.account_mode}`);
    row(ph.quality_rating === "RED" ? "FALLA" : "PASA", "Calidad del número no es ROJA", `calidad=${ph.quality_rating} · límite=${ph.messaging_limit_tier ?? "no informado"}`);
  }
  const sub = (await graph(`${waba}/subscribed_apps`, token)).j;
  const linked = (sub.data ?? []).map((x) => x.whatsapp_business_api_data?.id ?? x.id);
  row(linked.includes(appId) ? "PASA" : "FALLA", "Nuestra app está vinculada a la WABA de producción (subscribed_apps)", `${linked.length} app(s) vinculada(s)`);
  const appSub = (await graph(`${appId}/subscriptions`, `${appId}|${env.WHATSAPP_APP_SECRET}`)).j.data?.find((x) => x.object === "whatsapp_business_account");
  const fields = (appSub?.fields ?? []).map((f) => f.name);
  row(appSub?.callback_url === WEBHOOK_URL ? "PASA" : "FALLA", "La URL de callback de la app es la de PRODUCCIÓN", appSub ? appSub.callback_url : "sin suscripción");
  row(fields.includes("messages") && fields.includes("message_template_status_update") ? "PASA" : "FALLA", "Campos messages y message_template_status_update suscritos", fields.join(", ") || "ninguno");
  const t = (await graph(`${waba}/message_templates?name=${TEMPLATE.name}&fields=id,name,status,language,category,components`, token)).j.data?.[0];
  row(t?.status === "APPROVED" ? "PASA" : t ? "PENDIENTE" : "PENDIENTE", `Plantilla ${TEMPLATE.name} APPROVED en la WABA de producción`, t ? `estado=${t.status} categoría=${t.category}` : "no existe todavía: npm.cmd run prod:template -- --submit");
  if (t) {
    const btn = (t.components ?? []).find((c) => c.type === "BUTTONS")?.buttons?.find((b) => b.type === "URL");
    row(btn?.url === BUTTON_URL ? "PASA" : "FALLA", "El botón de la plantilla apunta a PRODUCCIÓN", btn?.url ?? "sin botón de URL");
  }
}

// ── D. Cola de reintentos (QStash) ───────────────────────────────────────────
console.log("\nD. Cola de reintentos (QStash)");
if (!env.QSTASH_TOKEN) row("PENDIENTE", "Credenciales de QStash", "faltan: crea la cuenta de Upstash y corre npm.cmd run prod:secrets");
else {
  const r = await fetch("https://qstash.upstash.io/v2/schedules", { headers: { Authorization: `Bearer ${env.QSTASH_TOKEN}` } }).catch(() => null);
  if (!r || r.status !== 200) row("FALLA", "El token de QStash es válido", `HTTP ${r?.status ?? "sin respuesta"}`);
  else {
    row("PASA", "El token de QStash es válido");
    const list = await r.json();
    const sch = (Array.isArray(list) ? list : []).find((s) => s.scheduleId === SCHEDULE_ID || s.destination === WORKER_URL);
    row(sch ? "PASA" : "PENDIENTE", `Schedule de barrido hacia el worker`, sch ? `cron=${sch.cron} destino=${sch.destination === WORKER_URL ? "correcto" : "OTRO"} pausado=${!!sch.isPaused}` : "no existe: npm.cmd run prod:qstash -- --apply");
  }
}

// ── Resumen ──────────────────────────────────────────────────────────────────
const req = results.filter((r) => r.required && r.state !== "INFO");
const c = (s) => req.filter((r) => r.state === s).length;
console.log(`\nResumen: ${c("PASA")} PASA · ${c("FALLA")} FALLA · ${c("PENDIENTE")} PENDIENTE (de ${req.length} obligatorias)`);
if (c("FALLA") === 0 && c("PENDIENTE") === 0) console.log("LISTO PARA ACTIVAR el flujo (el envío sigue APAGADO: se activa aparte, con autorización expresa).");
else console.log("NO está listo: resuelve los FALLA/PENDIENTE de arriba. El envío sigue APAGADO.");
process.exitCode = c("FALLA") === 0 ? 0 : 1;
