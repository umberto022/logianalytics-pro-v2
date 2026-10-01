// Vigilante de eventos REALES de Meta en el túnel (solo lectura local del inspector de ngrok; no llama a la API de Meta).
//   node watch-meta.mjs --once [--all]   → una pasada: imprime lo de origen META (con --all también SINTETICO y OTRO)
//   node watch-meta.mjs --loop 90        → cada 90 s imprime SOLO los POST NUEVOS al webhook de origen META.
// Lo sintético (cabecera x-sandbox-synthetic / User-Agent sandbox-synthetic) y lo desconocido NUNCA se imprimen en modo --loop,
// así no despiertan a quien vigila. Aun un aviso REAL es solo INFORMATIVO: no autoriza ningún envío; la aprobación de la plantilla se
// confirma únicamente con la API de Meta antes de enviar (e2e.mjs).
import { decodeInspectorEntry, describeWebhookBody, shouldAlertWatcher } from "./meta-origin.mjs";

const args = process.argv.slice(2);
const all = args.includes("--all");
const loopIdx = args.indexOf("--loop");
const intervalSec = loopIdx >= 0 ? Number(args[loopIdx + 1] ?? 90) : 0;
const WEBHOOK = "/api/webhooks/whatsapp";
const seen = new Set();

async function pass(memorizeOnly) {
  let entries;
  try { entries = (await (await fetch("http://127.0.0.1:4040/api/requests/http?limit=100")).json()).requests; }
  catch { if (!intervalSec) console.log("No se pudo leer el inspector del túnel (¿ngrok activo?)."); return; }
  for (const r of entries.map(decodeInspectorEntry).reverse()) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    if (memorizeOnly) continue; // primera pasada del modo --loop: el historial ya existente no se re-avisa
    const isWebhookPost = r.method === "POST" && r.path === WEBHOOK;
    if (intervalSec) { if (!shouldAlertWatcher(r, WEBHOOK)) continue; }
    else if (!all && r.origin !== "META") continue;
    const what = isWebhookPost ? describeWebhookBody(r.body).join("; ") : `${r.method} ${r.path}`;
    const answer = r.status === 200 ? "aceptado por nuestro webhook (200)" : `RESPUESTA ${r.status} de nuestro servidor (¿firma?)`;
    const tag = r.origin === "META" ? "REAL de Meta" : r.origin === "SINTETICO" ? "SINTÉTICO (nuestro)" : "OTRO origen";
    console.log(`${r.at.slice(11, 19)} [${tag}] ${what} — ${answer}${r.signed ? " · firmado" : ""}${r.origin === "META" && isWebhookPost ? " · SOLO INFORMATIVO: no autoriza el envío" : ""}`);
  }
}

if (intervalSec) {
  await pass(true);
  for (;;) { await new Promise((r) => setTimeout(r, intervalSec * 1000)); await pass(false); }
} else {
  await pass(false);
}
