// Schedule de QStash que despierta al worker de avisos cada pocos minutos (red de seguridad de los reintentos; Firestore es la fuente de verdad).
//   npm.cmd run prod:qstash                → NO cambia nada: muestra el estado actual y qué haría
//   npm.cmd run prod:qstash -- --apply     → crea/actualiza el schedule (idempotente por id)
//   npm.cmd run prod:qstash -- --delete    → borra el schedule
// Cron por defecto: cada 10 min (144 mensajes/día; el plan gratuito permite 1.000/día y cada reintento cuenta como un mensaje).
// El worker autentica la llamada por la firma de QStash (QSTASH_CURRENT/NEXT_SIGNING_KEY en Vercel). Nunca imprime credenciales.
import { readProdEnv, WORKER_URL, SCHEDULE_ID, qstashTokenLooksValid } from "./env.mjs";

const env = readProdEnv();
const args = process.argv.slice(2);
const cronArg = args.find((a) => a.startsWith("--cron="));
const CRON = cronArg ? cronArg.slice(7) : "*/10 * * * *";

async function main() {
  if (!qstashTokenLooksValid(env.QSTASH_TOKEN)) { console.error("Falta QSTASH_TOKEN en .env.production-meta.local: npm.cmd run prod:secrets"); return 2; }
  const api = (path, init = {}) => fetch(`https://qstash.upstash.io${path}`, { ...init, headers: { Authorization: `Bearer ${env.QSTASH_TOKEN}`, ...(init.headers ?? {}) } });

  const lr = await api("/v2/schedules");
  if (lr.status !== 200) { console.error(`No se pudo consultar QStash: HTTP ${lr.status} (¿token correcto?)`); return 1; }
  const existing = ((await lr.json()) ?? []).find((s) => s.scheduleId === SCHEDULE_ID);
  console.log(existing ? `Schedule existente: cron=${existing.cron} destino=${existing.destination} pausado=${!!existing.isPaused}` : "No existe todavía el schedule de barrido.");

  if (args.includes("--delete")) {
    if (!existing) { console.log("Nada que borrar."); return 0; }
    const r = await api(`/v2/schedules/${SCHEDULE_ID}`, { method: "DELETE" });
    console.log(`DELETE → HTTP ${r.status}`);
    return r.ok ? 0 : 1;
  }
  if (!args.includes("--apply")) {
    console.log(`\nNo se cambió nada. Con --apply: POST /v2/schedules/${WORKER_URL}  Upstash-Cron: ${CRON}  Upstash-Schedule-Id: ${SCHEDULE_ID}  Upstash-Retries: 3  (cuerpo vacío = modo barrido del worker)`);
    return 0;
  }
  const r = await api(`/v2/schedules/${WORKER_URL}`, {
    method: "POST",
    headers: { "Upstash-Cron": CRON, "Upstash-Schedule-Id": SCHEDULE_ID, "Upstash-Retries": "3", "Upstash-Method": "POST", "Content-Type": "application/json" },
    body: "{}",
  });
  const body = await r.json().catch(() => ({}));
  console.log(`POST schedule → HTTP ${r.status} ${r.ok ? `scheduleId=${body.scheduleId}` : JSON.stringify(body).slice(0, 200)}`);
  return r.ok ? 0 : 1;
}

// Sin process.exit() tras usar fetch: en Windows puede abortar con un fallo de libuv.
process.exitCode = await main();
