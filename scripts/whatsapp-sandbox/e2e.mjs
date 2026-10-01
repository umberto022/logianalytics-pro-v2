// Prueba de extremo a extremo AISLADA: UN envío REAL de nuestra plantilla al receptor autorizado, desde el sandbox.
//   solicitud ficticia guardada → job persistido → plantilla enviada → evento FIRMADO de Meta recibido por nuestro
//   servidor → estado delivered/read asociado al MISMO mensaje.
//
//   node e2e.mjs precheck   → NO envía nada. Comprueba: plantilla APPROVED, token válido con margen, app vinculada a la WABA,
//                             servidor del webhook y túnel activos, y que el job preparado sea EXACTAMENTE el autorizado
//                             (referencia y receptor), pendiente y con 0 intentos.
//   node e2e.mjs selftest  → NO envía nada. Ensaya el mecanismo del emisor con un id inexistente: lo arranca, lo calienta, lo detiene
//                             y comprueba que el puerto queda libre y que el servidor del webhook y el túnel siguen activos.
//   SANDBOX_ALLOW_REAL_SEND=yes node e2e.mjs send
//                           → arranca un proceso EMISOR aparte (puerto 3102, único con el envío habilitado), le pide procesar
//                             ÚNICAMENTE ese job UNA vez (modo "job" del worker: nunca un barrido, nunca trabajos viejos) y lo
//                             DETIENE en cuanto responde (o falla): desde ese instante no existe ningún proceso capaz de enviar.
//                             Ante un timeout/respuesta ambigua NO reenvía: solo espera el evento que reconcilie.
//                             El servidor del webhook (:3100, envío siempre apagado) y el túnel siguen activos mientras se espera
//                             delivered/read, con un límite de tiempo (6 min).
//
// AUTORIZACIÓN TÉCNICA DE ENVIAR: únicamente la respuesta de la API de Meta (GET /{waba}/message_templates → APPROVED), consultada
// DENTRO de `send` justo antes de enviar. Ninguna señal del webhook (ni eventos reales ni sintéticos) autoriza un envío, y una
// prueba SINTÉTICA (firmada por nuestros propios scripts) jamás cuenta como evidencia de Meta.
// Datos: TODO ficticio (cliente y producto inventados, emulador). Ningún dato comercial ni de clientes reales.
import { execFileSync, spawn } from "node:child_process";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  PROJECT_ID, WORKSPACE_ID, FIRESTORE_HOST, NEXT_PORT, ROOT, readEnvFile, requireEmulators,
  sandboxProcessEnv, secretState, appSecretLooksValid, accessTokenLooksValid,
} from "./env.mjs";
import { TEMPLATE_NAME } from "./template-def.mjs";
import { decodeInspectorEntry } from "./meta-origin.mjs";

const SENDER_PORT = 3102;
const phase = process.argv[2];
if (!["precheck", "selftest", "send"].includes(phase)) { console.error("Uso: e2e.mjs precheck | e2e.mjs selftest | e2e.mjs send"); process.exit(2); }
if (phase === "send" && process.env.SANDBOX_ALLOW_REAL_SEND !== "yes") {
  console.error("Bloqueado: 'send' envía UN mensaje real. Requiere autorización explícita (SANDBOX_ALLOW_REAL_SEND=yes).");
  process.exit(2);
}

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
await requireEmulators();
const env = readEnvFile();
const version = process.env.WHATSAPP_API_VERSION || "v23.0";
const appId = env.WHATSAPP_APP_ID;
if (!appId) { console.error("Falta WHATSAPP_APP_ID en .env.sandbox.local."); process.exit(2); }
const waba = env.WHATSAPP_BUSINESS_ACCOUNT_ID;
initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

const checks = [];
const check = (name, ok, detail = "") => { checks.push(ok); console.log(`${ok ? "PASA " : "FALLA"}  ${name}${detail ? " — " + detail : ""}`); return ok; };
async function graph(path, bearer) {
  const r = await fetch(`https://graph.facebook.com/${version}/${path}`, { headers: { Authorization: `Bearer ${bearer}` } });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
function listeningPid(port) {
  const out = execFileSync("netstat", ["-ano"], { encoding: "utf8" });
  const line = out.split(/\r?\n/).find((l) => l.includes(`127.0.0.1:${port}`) && l.includes("LISTENING"));
  return line ? Number(line.trim().split(/\s+/).pop()) : null;
}
const tunnelUrl = async () => {
  try { return (await (await fetch("http://127.0.0.1:4040/api/tunnels")).json()).tunnels.find((x) => x.public_url.startsWith("https://"))?.public_url ?? null; }
  catch { return null; }
};

const quoteId = env.SANDBOX_QUOTE_ID;
const jobRef = db.collection("whatsappNotifications").doc(WORKSPACE_ID).collection("jobs").doc(quoteId ?? "x");

async function precheck() {
  check("Credenciales con formato correcto", accessTokenLooksValid(env.WHATSAPP_ACCESS_TOKEN) && appSecretLooksValid(env.WHATSAPP_APP_SECRET),
    `token: ${secretState(env.WHATSAPP_ACCESS_TOKEN, "token")} · App Secret: ${secretState(env.WHATSAPP_APP_SECRET, "secret")}`);
  if (!checks.every(Boolean)) return;

  const tp = await graph(`${waba}/message_templates?name=${TEMPLATE_NAME}&fields=id,name,status,category,language,rejected_reason`, env.WHATSAPP_ACCESS_TOKEN);
  const t = tp.json.data?.[0];
  check(`Plantilla ${TEMPLATE_NAME} APPROVED según la API de Meta`, t?.status === "APPROVED", tp.status !== 200 ? `HTTP ${tp.status} ${tp.json?.error?.message ?? ""}` : t ? `id=${t.id} estado=${t.status} categoría=${t.category} consultado a las ${new Date().toISOString().slice(11, 19)}Z${t.rejected_reason && t.rejected_reason !== "NONE" ? " motivo=" + t.rejected_reason : ""}` : "no existe");
  if (env.SANDBOX_TEMPLATE_ID) check("La plantilla es la que creamos (id)", t?.id === env.SANDBOX_TEMPLATE_ID, t ? `id=${t.id}` : "no existe");

  const d = await graph(`debug_token?input_token=${encodeURIComponent(env.WHATSAPP_ACCESS_TOKEN)}`, `${appId}|${env.WHATSAPP_APP_SECRET}`);
  const tok = d.json?.data;
  const minutesLeft = tok?.expires_at ? Math.round((tok.expires_at * 1000 - Date.now()) / 60000) : Infinity;
  check("Token de acceso válido con margen (≥ 5 min)", tok?.is_valid === true && minutesLeft >= 5, tok ? `válido=${tok.is_valid} vence en ${Number.isFinite(minutesLeft) ? minutesLeft + " min" : "nunca"}` : `HTTP ${d.status}`);

  const sub = await graph(`${waba}/subscribed_apps`, env.WHATSAPP_ACCESS_TOKEN);
  const apps = (sub.json.data ?? []).map((x) => x.whatsapp_business_api_data?.id ?? x.id);
  check("Nuestra app está vinculada a la WABA", apps.includes(appId), `${apps.length} app(s) vinculada(s)`);

  const app = await graph(`${appId}/subscriptions`, `${appId}|${env.WHATSAPP_APP_SECRET}`);
  const fields = ((app.json.data ?? []).find((s) => s.object === "whatsapp_business_account")?.fields ?? []).map((f) => f.name);
  check("Campos messages y message_template_status_update suscritos en Meta", fields.includes("messages") && fields.includes("message_template_status_update"));

  // Debe existir la cañería para RECIBIR los estados: servidor del webhook (envío apagado) y túnel.
  check(`Servidor del webhook activo en :${NEXT_PORT} (con el envío APAGADO)`, !!listeningPid(NEXT_PORT) && env.SANDBOX_SENDING_ENABLED !== "true");
  check("Túnel HTTPS activo", !!(await tunnelUrl()));
  check(`Puerto del emisor :${SENDER_PORT} libre (no hay otro emisor)`, !listeningPid(SENDER_PORT));

  // El job debe ser EXACTAMENTE el autorizado.
  const quote = quoteId ? (await db.collection("catalogQuotes").doc(WORKSPACE_ID).collection("records").doc(quoteId).get()).data() : null;
  const job = quoteId ? (await jobRef.get()).data() : null;
  check("La solicitud preparada es la autorizada (referencia = SANDBOX_QUOTE_REF)", !!quote && !!env.SANDBOX_QUOTE_REF && quote.publicRef === env.SANDBOX_QUOTE_REF, quote?.publicRef ?? "no existe");
  check("El receptor del job es el autorizado (SANDBOX_RECIPIENT_E164)", !!env.SANDBOX_RECIPIENT_E164 && job?.recipientPhone === env.SANDBOX_RECIPIENT_E164, job ? `…${job.recipientPhone.slice(-4)}` : "sin job");
  check("El job está pendiente y con 0 intentos (no se envió antes)", job?.status === "pending" && job?.attempts === 0, job ? `status=${job.status} intentos=${job.attempts}` : "sin job");
  const ageMin = job ? Math.round((Date.now() - (job.freshSince ?? job.createdAt).toMillis()) / 60000) : Infinity; // misma base que el worker: freshSince (decisión humana) o createdAt
  check("El job es reciente (no es un trabajo viejo)", ageMin < 24 * 60, `${ageMin} min`);
}

// ── Emisor aparte ────────────────────────────────────────────────────────────
let sender = null;
function killSender() {
  const pids = new Set([sender?.pid, listeningPid(SENDER_PORT)].filter(Boolean));
  for (const pid of pids) { try { execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* ya terminado */ } }
  return pids.size > 0;
}
process.on("exit", () => { try { killSender(); } catch { /* nada */ } });

async function startSender() {
  // Único proceso con el envío habilitado; carpeta de build propia para no chocar con el servidor del webhook.
  const senderEnv = { ...sandboxProcessEnv(env), WHATSAPP_SENDING_ENABLED: "true", NEXT_DIST_DIR: ".next-sandbox-sender" };
  sender = spawn(process.execPath, [`${ROOT}/node_modules/next/dist/bin/next`, "dev", "-p", String(SENDER_PORT), "-H", "127.0.0.1"], { cwd: ROOT, env: senderEnv, stdio: "ignore" });
  const url = `http://127.0.0.1:${SENDER_PORT}/api/cron/process-whatsapp-notifications`;
  const until = Date.now() + 120_000;
  while (Date.now() < until) {
    try { if ((await fetch(url)).status === 401) break; } catch { /* aún arrancando */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  // Calentamiento del worker con un id inexistente: compila la ruta SIN procesar ningún job real (no hay nada que enviar).
  const warm = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${env.CRON_SECRET}`, "content-type": "application/json" }, body: JSON.stringify({ workspaceId: WORKSPACE_ID, quoteId: "warmup00000000" }) });
  const w = await warm.json().catch(() => ({}));
  if (warm.status !== 200 || w.attempted !== false) throw new Error(`El emisor no está listo: HTTP ${warm.status} ${JSON.stringify(w)}`);
  return url;
}

async function send() {
  const started = Date.now();
  // Autorización técnica: TODO el precheck se repite AHORA, incluida la consulta a la API de Meta por APPROVED. Si algo falla, no se envía.
  console.log("Verificación previa al envío (consulta a la API de Meta en este momento):");
  await precheck();
  if (!checks.every(Boolean)) { console.error("\nNO se envía: la verificación previa no pasó (ver FALLA arriba)."); return false; }
  let job = (await jobRef.get()).data();
  console.log(`Job antes del envío: status=${job?.status} intentos=${job?.attempts}`);
  if (job?.status !== "pending" || job?.attempts !== 0) { console.error("El job no está 'pending' con 0 intentos: NO se envía."); return false; }

  const url = await startSender();
  console.log(`Emisor listo en :${SENDER_PORT} (calentado sin procesar ningún job real).`);
  let outcome;
  try {
    // UNA sola llamada, SOLO este job. Sin reintentos en este script.
    const wr = await fetch(url, {
      method: "POST", headers: { authorization: `Bearer ${env.CRON_SECRET}`, "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: WORKSPACE_ID, quoteId }),
    });
    outcome = { http: wr.status, ...(await wr.json().catch(() => ({}))) };
  } catch (e) {
    outcome = { http: 0, error: e.message }; // ambiguo: NO se reenvía; se espera el evento
  } finally {
    killSender(); // ← desde aquí ningún proceso puede enviar
    console.log(`ENVÍO DESACTIVADO a las ${new Date().toISOString().slice(11, 19)}: proceso emisor detenido. Webhook (:${NEXT_PORT}) y túnel siguen activos.`);
  }
  console.log(`Worker (una sola llamada): ${JSON.stringify(outcome)}`);
  job = (await jobRef.get()).data();
  console.log(`Job tras el intento: status=${job?.status} intentos=${job?.attempts} wamid=${job?.providerMessageId ?? "—"} error=${job?.lastErrorSafe ?? "—"}`);
  if (outcome.reason === "not_configured") { console.error("El emisor tenía el envío apagado o sin credenciales: no se envió nada."); return false; }

  // Espera limitada (6 min) a los eventos FIRMADOS de Meta recibidos por nuestro servidor. Lecturas locales al emulador, no a Meta.
  const deadline = Date.now() + 6 * 60_000;
  let last = "";
  while (Date.now() < deadline) {
    job = (await jobRef.get()).data();
    if (`status=${job.status}` !== last) { last = `status=${job.status}`; console.log(`   · ${new Date().toISOString()} ${last}`); }
    if (["delivered", "read", "failed"].includes(job.status)) break;
    await new Promise((r) => setTimeout(r, 4000));
  }
  const events = (await jobRef.collection("events").orderBy("receivedAt").get()).docs.map((d) => d.data());

  // Lo que el túnel recibió, CLASIFICADO POR ORIGEN (solo metadatos): lo sintético no cuenta como evidencia de Meta.
  let tunnelPosts = [];
  try {
    const j = await (await fetch("http://127.0.0.1:4040/api/requests/http?limit=100")).json();
    tunnelPosts = j.requests.map(decodeInspectorEntry)
      .filter((r) => r.method === "POST" && r.path === "/api/webhooks/whatsapp" && new Date(r.at).getTime() >= started - 5000)
      .map((r) => ({ at: r.at.slice(11, 19), origin: r.origin, status: r.status, signed: r.signed }));
  } catch { /* inspector no disponible */ }
  const realMetaPosts = tunnelPosts.filter((p) => p.origin === "META" && p.signed && p.status === 200);

  console.log("\nEVIDENCIA");
  console.log(`  Envío aceptado por Meta (wamid): ${job.providerMessageId ? "sí" : "NO"}  (${job.providerMessageId ?? "—"})`);
  console.log(`  POST al webhook desde el inicio del envío: ${tunnelPosts.length} ${JSON.stringify(tunnelPosts)}`);
  console.log(`  De ellos, REALES de Meta (User-Agent de Meta, sin marca sintética, firmados y aceptados con 200): ${realMetaPosts.length}`);
  for (const e of events) console.log(`  Evento aplicado por nuestro servidor: ${e.status.padEnd(9)} wamid=${e.wamid}  ocurrió=${e.eventAt.toDate().toISOString()}  recibido=${e.receivedAt.toDate().toISOString()}`);
  const sameMessage = events.length > 0 && events.every((e) => e.wamid === job.providerMessageId);
  console.log(`  Eventos asociados al MISMO mensaje (wamid del envío): ${sameMessage ? "sí" : "NO"}`);
  console.log(`  Estado final del job: ${job.status}  (${Math.round((Date.now() - started) / 1000)} s)`);
  const proven = sameMessage && ["delivered", "read"].includes(job.status) && realMetaPosts.length > 0;
  console.log(proven ? "\nRESULTADO: PROBADO de extremo a extremo (delivered/read por evento firmado REAL de Meta, del mismo mensaje)." :"\nRESULTADO: NO PROBADO — revisar el detalle de arriba (no se reenvió nada).");
  return proven;
}

async function selftest() {
  const webhookBefore = !!listeningPid(NEXT_PORT);
  const url = await startSender();
  check("Emisor arrancado y calentado sin procesar ningún job real", true, url);
  const senderUp = !!listeningPid(SENDER_PORT);
  check("El emisor escucha en su puerto", senderUp);
  killSender();
  await new Promise((r) => setTimeout(r, 1500));
  check("Tras detenerlo, el puerto del emisor queda libre (nadie puede enviar)", !listeningPid(SENDER_PORT));
  check("El servidor del webhook sigue activo", webhookBefore && !!listeningPid(NEXT_PORT));
  check("El túnel sigue activo", !!(await tunnelUrl()));
  const job = (await jobRef.get()).data();
  check("El job autorizado sigue intacto (pending, 0 intentos)", job?.status === "pending" && job?.attempts === 0, `status=${job?.status} intentos=${job?.attempts}`);
}

let ok = false;
try {
  if (phase === "selftest") { await selftest(); ok = checks.every(Boolean); console.log(ok ? "\nSELFTEST OK." : "\nSELFTEST: FALLÓ."); }
  else if (phase === "precheck") { await precheck(); ok = checks.every(Boolean); console.log(ok ? "\nPRECHECK OK: todo listo para el envío autorizado." : "\nPRECHECK: NO listo (nada se envió)."); }
  else ok = await send();
} catch (e) {
  console.error("Error inesperado:", e.message);
} finally {
  if (phase === "send" || phase === "selftest") { const killed = killSender(); console.log(killed ? "Emisor detenido (comprobación final)." : "Comprobación final: el emisor ya estaba detenido."); }
}
process.exit(ok ? 0 : 1);
