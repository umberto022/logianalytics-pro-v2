// Comprobaciones de SOLO LECTURA contra Meta (no cambia nada, no envía mensajes):
//  1. Suscripción a nivel de APP: callback_url y campos suscritos (¿está `messages`?). Usa el token de app (APP_ID|APP_SECRET).
//  2. Suscripción de la app a la WABA (subscribed_apps). Requiere el token de acceso.
//  3. Coincidencia de la URL registrada con la del túnel actual.
// Nunca imprime secretos. Ejecutar:  npm run sandbox:meta-check
import { readEnvFile, secretState, appSecretLooksValid } from "./env.mjs";

const env = readEnvFile();
const version = process.env.WHATSAPP_API_VERSION || "v23.0";
const appId = env.WHATSAPP_APP_ID;
if (!appId) { console.error("Falta WHATSAPP_APP_ID en .env.sandbox.local."); process.exit(2); }
const waba = env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const ok = (b, m, d = "") => console.log(`${b ? "PASA " : "FALLA"}  ${m}${d ? " — " + d : ""}`);
const safeError = (j) => (j?.error ? `code ${j.error.code}: ${j.error.message}` : "");

async function graph(path, bearer) {
  const res = await fetch(`https://graph.facebook.com/${version}/${path}`, { headers: { Authorization: `Bearer ${bearer}` } });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

let expectedUrl = "";
try {
  const t = await (await fetch("http://127.0.0.1:4040/api/tunnels")).json();
  expectedUrl = t.tunnels.find((x) => x.public_url.startsWith("https://")).public_url + "/api/webhooks/whatsapp";
} catch { /* sin túnel */ }

const secretOk = appSecretLooksValid(env.WHATSAPP_APP_SECRET);
if (!secretOk) {
  console.log(`App Secret: ${secretState(env.WHATSAPP_APP_SECRET, "secret")} — se OMITEN las comprobaciones que lo usan (suscripción de la app a messages y validación del token). Cárgalo con: npm run sandbox:secrets`);
} else {
  const { status, json } = await graph(`${appId}/subscriptions`, `${appId}|${env.WHATSAPP_APP_SECRET}`);
  if (status !== 200) {
    ok(false, "Consulta de suscripciones de la app", `HTTP ${status} ${safeError(json)}`);
  } else {
    const sub = (json.data ?? []).find((s) => s.object === "whatsapp_business_account");
    ok(!!sub, "La app tiene suscripción de webhooks para whatsapp_business_account");
    if (sub) {
      ok(!expectedUrl || sub.callback_url === expectedUrl, "callback_url registrada coincide con el túnel actual", sub.callback_url);
      const fields = (sub.fields ?? []).map((f) => f.name);
      ok(fields.includes("messages"), "Campo `messages` suscrito", `campos: ${fields.join(", ") || "ninguno"}`);
      ok(sub.active !== false, "Suscripción activa", `active=${sub.active}`);
    }
  }
}

if (!env.WHATSAPP_ACCESS_TOKEN) {
  console.log("Token de acceso: vacío — se omiten las comprobaciones de la WABA (subscribed_apps, número, plantillas).");
} else {
  // 0. El token: ¿válido?, ¿de qué tipo?, ¿con qué permisos y cuándo vence? (debug_token con el token de app; nunca se imprime el token)
  if (secretOk) {
    const d = await graph(`debug_token?input_token=${encodeURIComponent(env.WHATSAPP_ACCESS_TOKEN)}`, `${appId}|${env.WHATSAPP_APP_SECRET}`);
    const t = d.json?.data;
    if (d.status === 200 && t) {
      ok(t.is_valid === true, "Token de acceso válido", `tipo=${t.type} vence=${t.expires_at ? new Date(t.expires_at * 1000).toISOString() : "no vence"}`);
      ok((t.scopes ?? []).includes("whatsapp_business_messaging"), "Permiso whatsapp_business_messaging", `permisos: ${(t.scopes ?? []).join(", ")}`);
      ok((t.scopes ?? []).includes("whatsapp_business_management"), "Permiso whatsapp_business_management (crear/consultar plantillas)");
      ok(t.app_id === appId, "El token pertenece a la app LogiAnalytics Avisos");
    } else ok(false, "Consulta debug_token", `HTTP ${d.status} ${safeError(d.json)}`);
  }
  const { status, json } = await graph(`${waba}/subscribed_apps`, env.WHATSAPP_ACCESS_TOKEN);
  if (status !== 200) ok(false, "Consulta subscribed_apps de la WABA", `HTTP ${status} ${safeError(json)}`);
  else {
    const apps = (json.data ?? []).map((d) => ({ id: d.whatsapp_business_api_data?.id ?? d.id, name: d.whatsapp_business_api_data?.name ?? d.name }));
    const linked = apps.some((a) => a.id === appId);
    ok(linked, "NUESTRA app (LogiAnalytics Avisos) está vinculada a la WABA (subscribed_apps)",
      `apps vinculadas: ${apps.map((a) => `${a.name} [${a.id}]`).join(", ") || "ninguna"}`);
    if (!linked) {
      console.log("      → Sin esta vinculación, los eventos de mensajes de ESTA WABA no se entregan a nuestro webhook, aunque el campo `messages` esté suscrito a nivel de app.");
      console.log("        Para vincularla: npm run sandbox:link-waba  (muestra el cambio; con -- --apply lo aplica, solo con tu autorización).");
    }
  }

  // 3. Número emisor y modo de la cuenta.
  const ph = await graph(`${waba}/phone_numbers?fields=id,display_phone_number,verified_name,account_mode,platform_type,quality_rating`, env.WHATSAPP_ACCESS_TOKEN);
  if (ph.status !== 200) ok(false, "Consulta de números de la WABA", `HTTP ${ph.status} ${safeError(ph.json)}`);
  else for (const n of ph.json.data ?? []) console.log(`      número ${n.id}${n.id === env.WHATSAPP_PHONE_NUMBER_ID ? " (el configurado)" : ""}: modo=${n.account_mode ?? "?"} plataforma=${n.platform_type ?? "?"} calidad=${n.quality_rating ?? "?"}`);
  // 4. Plantillas existentes (sin crear nada).
  const tp = await graph(`${waba}/message_templates?fields=name,status,category,language&limit=50`, env.WHATSAPP_ACCESS_TOKEN);
  if (tp.status !== 200) ok(false, "Consulta de plantillas de la WABA", `HTTP ${tp.status} ${safeError(tp.json)}`);
  else {
    const list = tp.json.data ?? [];
    console.log(`      plantillas en la WABA: ${list.length ? list.map((t) => `${t.name}[${t.language}]=${t.status}`).join(", ") : "ninguna"}`);
    console.log(`      ¿existe nueva_solicitud_cotizacion? ${list.some((t) => t.name === "nueva_solicitud_cotizacion") ? "SÍ" : "no"}`);
  }
}
