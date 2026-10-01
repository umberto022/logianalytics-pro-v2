// Proxy inverso RESTRICTIVO delante del sandbox: es lo único que se expone a Internet (vía túnel HTTPS).
//
// Rutas permitidas, TODO lo demás es 404:
//  1. GET/POST /api/webhooks/whatsapp  → se reenvía al servidor Next del sandbox (que valida la firma de Meta).
//  2. GET /solicitudes?ref=<id>        → PÁGINA DE REVISIÓN servida por este mismo proceso, con autenticación
//                                        (HTTP Basic, usuario y contraseña del sandbox, bloqueo por intentos fallidos).
//
// Por qué una página de revisión y no la app real: la app real lee Firestore desde el NAVEGADOR contra
// 127.0.0.1:8080/9099 (emuladores). Un teléfono no los alcanza, y exponerlos por el túnel dejaría abiertos los emuladores.
// Esta página lee UNA solicitud ficticia por id exacto desde el servidor (Admin SDK → emulador) y solo muestra datos
// inventados: no lista nada, no muestra el número receptor ni ningún dato real.
// No registra querystrings (el GET de verificación lleva el token) ni cuerpos.
import http from "node:http";
import crypto from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { FIRESTORE_HOST, NEXT_PORT, PROJECT_ID, PROXY_PORT, WEBHOOK_PATH, WORKSPACE_ID, readEnvFile } from "./env.mjs";

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
const env = readEnvFile();
const REVIEW_USER = "revision";
const REVIEW_PASSWORD = env.SANDBOX_REVIEW_PASSWORD;
const MAX_BODY = 1_000_000;
const QUOTE_ID_RE = /^[A-Za-z0-9]{8,40}$/;

let db;
const getDb = () => (db ??= (initializeApp({ projectId: PROJECT_ID }), getFirestore()));

// ── Autenticación de la página de revisión ──────────────────────────────────
const failures = new Map(); // ip -> { count, until }
const safeEq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function authorize(req) {
  const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "?").split(",")[0].trim();
  const f = failures.get(ip);
  if (f && f.until > Date.now()) return { ok: false, blocked: true };
  const header = req.headers.authorization ?? "";
  if (REVIEW_PASSWORD && header.startsWith("Basic ")) {
    const [user, ...rest] = Buffer.from(header.slice(6), "base64").toString("utf8").split(":");
    if (safeEq(user ?? "", REVIEW_USER) && safeEq(rest.join(":"), REVIEW_PASSWORD)) { failures.delete(ip); return { ok: true }; }
    const count = (f?.count ?? 0) + 1;
    failures.set(ip, { count, until: count >= 5 ? Date.now() + 15 * 60_000 : 0 });
  }
  return { ok: false, blocked: false };
}

// ── Render ──────────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (cents) => `RD$ ${(cents / 100).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (ts) => (ts?.toDate ? ts.toDate().toLocaleString("es-DO", { timeZone: "America/Santo_Domingo" }) : "—");

const STATUS_LABEL = {
  pending: "pendiente de enviar", sending: "enviando", unconfirmed: "sin confirmar", accepted: "aceptado por Meta (no confirma entrega)",
  sent: "enviado por WhatsApp", delivered: "entregado al teléfono", read: "leído", failed: "falló", expired: "vencido",
};

async function renderQuote(ref) {
  const quoteSnap = await getDb().collection("catalogQuotes").doc(WORKSPACE_ID).collection("records").doc(ref).get();
  if (!quoteSnap.exists) return null;
  const q = quoteSnap.data();
  const jobRef = getDb().collection("whatsappNotifications").doc(WORKSPACE_ID).collection("jobs").doc(ref);
  const job = (await jobRef.get()).data();
  const events = job ? (await jobRef.collection("events").orderBy("eventAt").get()).docs.map((d) => d.data()) : [];
  const rows = (q.items ?? []).map((it) => `<tr><td>${esc(it.productName)}${it.variantLabel ? ` <small>(${esc(it.variantLabel)})</small>` : ""}</td><td class="n">${it.quantity}</td><td class="n">${money(it.unitPriceCents)}</td><td class="n">${money(it.unitPriceCents * it.quantity)}</td></tr>`).join("");
  const timeline = events.map((e) => `<li>${esc(STATUS_LABEL[e.status] ?? e.status)} — ${esc(when(e.eventAt))}</li>`).join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Solicitud ${esc(q.publicRef)} — ENTORNO DE PRUEBA</title>
<style>body{font:16px/1.45 system-ui,sans-serif;margin:0;background:#f6f6f8;color:#1b1b1f}main{max-width:640px;margin:0 auto;padding:16px}
.banner{background:#7a1f3d;color:#fff;padding:10px 16px;font-weight:600;text-align:center}.card{background:#fff;border-radius:12px;padding:16px;margin:12px 0;box-shadow:0 1px 3px #0002}
h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:0 0 8px;color:#555}table{width:100%;border-collapse:collapse}td,th{padding:6px 4px;border-bottom:1px solid #eee;text-align:left}.n{text-align:right;white-space:nowrap}
small{color:#666}ul{margin:4px 0 0 18px;padding:0}</style></head><body>
<div class="banner">ENTORNO DE PRUEBA AISLADO — datos ficticios, no es una solicitud real</div><main>
<div class="card"><h1>Solicitud ${esc(q.publicRef)}</h1><small>Estado: ${esc(q.status)} · Recibida: ${esc(when(q.createdAt))}</small></div>
<div class="card"><h2>Cliente (ficticio)</h2>${esc(q.customerName)}<br><small>${esc(q.customerPhone)}</small><br>
${q.deliveryMethod === "retiro" ? "Retiro" : `Entrega · ${esc(q.zone ?? "")}`}<br><small>${esc(q.leadTimeNote ?? "")}</small></div>
<div class="card"><h2>Pedido</h2><table><tr><th>Producto</th><th class="n">Cant.</th><th class="n">Precio</th><th class="n">Subtotal</th></tr>${rows}</table>
<p class="n"><b>Total productos: ${money(q.productsTotalCents ?? q.subtotalCents ?? 0)}</b></p>${q.requiresAdvance ? `<p class="n"><small>Anticipo ${esc(q.advancePct)}%: ${money(q.advanceAmountCents ?? 0)}</small></p>` : ""}</div>
<div class="card"><h2>Aviso de WhatsApp</h2>Estado: <b>${esc(STATUS_LABEL[job?.status] ?? job?.status ?? "sin aviso")}</b>${timeline ? `<ul>${timeline}</ul>` : ""}</div>
</main></body></html>`;
}

const SECURITY_HEADERS = {
  "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
};
const send = (res, status, body, extra = {}) => { res.writeHead(status, { "content-type": "text/html; charset=utf-8", ...SECURITY_HEADERS, ...extra }); res.end(body); };

async function handleReview(req, res, url) {
  const auth = authorize(req);
  if (auth.blocked) return send(res, 429, "Demasiados intentos. Espera 15 minutos.");
  if (!auth.ok) return send(res, 401, "Autenticación requerida.", { "WWW-Authenticate": 'Basic realm="Revision sandbox WhatsApp", charset="UTF-8"' });
  const ref = url.searchParams.get("ref") ?? "";
  if (!QUOTE_ID_RE.test(ref)) return send(res, 400, "Falta la solicitud.");
  try {
    const html = await renderQuote(ref);
    console.log(`${new Date().toISOString()} GET /solicitudes -> ${html ? 200 : 404} (autenticado)`);
    return html ? send(res, 200, html) : send(res, 404, "Solicitud no encontrada en el entorno de prueba.");
  } catch {
    console.log(`${new Date().toISOString()} GET /solicitudes -> 502 (emulador no responde)`);
    return send(res, 502, "El entorno de prueba no está disponible.");
  }
}

// ── Servidor ────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://proxy.local");

  if (url.pathname === "/solicitudes" && req.method === "GET") { handleReview(req, res, url); return; }

  if (url.pathname !== WEBHOOK_PATH || !["GET", "POST"].includes(req.method ?? "")) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }
  let received = 0;
  const upstream = http.request(
    { host: "127.0.0.1", port: NEXT_PORT, method: req.method, path: url.pathname + url.search, headers: { ...req.headers, host: `127.0.0.1:${NEXT_PORT}` } },
    (up) => {
      console.log(`${new Date().toISOString()} ${req.method} ${url.pathname} -> ${up.statusCode}`);
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    }
  );
  upstream.on("error", () => {
    console.log(`${new Date().toISOString()} ${req.method} ${url.pathname} -> 502 (servidor del sandbox no responde)`);
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
    res.end("sandbox server unavailable");
  });
  req.on("data", (chunk) => {
    received += chunk.length;
    if (received > MAX_BODY) { upstream.destroy(); req.destroy(); if (!res.headersSent) { res.writeHead(413); res.end(); } }
  });
  req.pipe(upstream);
});

if (!REVIEW_PASSWORD) console.warn("Aviso: no hay SANDBOX_REVIEW_PASSWORD; la página de revisión rechazará todo acceso (corre npm run sandbox:secrets -- --init).");
server.listen(PROXY_PORT, "127.0.0.1", () => console.log(`Proxy del sandbox en 127.0.0.1:${PROXY_PORT} (solo ${WEBHOOK_PATH} y /solicitudes autenticada) → Next en :${NEXT_PORT}`));
