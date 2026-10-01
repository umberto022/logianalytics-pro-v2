// Comprobación de la cañería completa ANTES de configurar nada en Meta:
//   Internet (HTTPS) → túnel → proxy restrictivo → servidor del sandbox → emulador de Firestore.
// Usa la URL PÚBLICA real (la del túnel). TODAS sus peticiones y eventos son SINTÉTICOS (cabecera x-sandbox-synthetic): no vienen de Meta ni demuestran nada sobre Meta. Imprime PASA/FALLA por cada comprobación; sale con código 1 si algo falla.
// No envía nada a Meta. Crea y borra un documento "canario" en el emulador.
import crypto from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { PROJECT_ID, WORKSPACE_ID, FIRESTORE_HOST, WEBHOOK_PATH, readEnvFile, requireEmulators, secretState } from "./env.mjs";
import { syntheticInit } from "./meta-origin.mjs";

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
await requireEmulators();
const env = readEnvFile();
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASA " : "FALLA"}  ${name}${detail ? " — " + detail : ""}`); };

// 1. URL pública del túnel (API local del agente de ngrok).
let base;
try {
  const t = await (await fetch("http://127.0.0.1:4040/api/tunnels")).json();
  base = t.tunnels.find((x) => x.public_url.startsWith("https://"))?.public_url;
} catch { /* sin túnel */ }
check("Túnel HTTPS activo", !!base, base ? base : "no hay túnel de ngrok en 127.0.0.1:4040");
if (!base) process.exit(1);
const url = base + WEBHOOK_PATH;

// 2. Handshake GET de Meta con el token correcto.
const challenge = String(Math.floor(Math.random() * 1e9));
const ok = await fetch(`${url}?hub.mode=subscribe&hub.verify_token=${env.WHATSAPP_WEBHOOK_VERIFY_TOKEN}&hub.challenge=${challenge}`, syntheticInit());
check("GET verificación con token correcto devuelve el challenge", ok.status === 200 && (await ok.text()) === challenge, `HTTP ${ok.status}`);
const bad = await fetch(`${url}?hub.mode=subscribe&hub.verify_token=incorrecto&hub.challenge=${challenge}`, syntheticInit());
check("GET verificación con token incorrecto → 403", bad.status === 403, `HTTP ${bad.status}`);

// 3. Solo el webhook está expuesto.
const other = await fetch(base + "/api/catalogo/prueba-aislada/solicitud", syntheticInit({ method: "POST", body: "{}" }));
check("Otras rutas de la app NO se alcanzan desde Internet (404 del proxy)", other.status === 404, `HTTP ${other.status}`);

// 4. POST con firma inválida llega a NUESTRA ruta y es rechazado.
const badPost = await fetch(url, syntheticInit({ method: "POST", headers: { "x-hub-signature-256": "sha256=falsa" }, body: "{}" }));
const badJson = await badPost.json().catch(() => ({}));
check("POST con firma inválida → 401 de nuestra ruta", badPost.status === 401 && badJson.error === "Firma inválida", `HTTP ${badPost.status}`);

// 5. Canario firmado: recorre toda la cañería y escribe en el emulador.
initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();
const canaryId = "preflight-" + crypto.randomBytes(4).toString("hex");
const ref = db.collection("whatsappNotifications").doc(WORKSPACE_ID).collection("jobs").doc(canaryId);
const wamid = "wamid.PREFLIGHT" + crypto.randomBytes(4).toString("hex");
await ref.set({ quoteId: canaryId, status: "accepted", attempts: 1, maxAttempts: 5, nextAttemptAt: Timestamp.now(), recipientPhone: "+10000000000", providerMessageId: wamid, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
const body = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{ id: env.WHATSAPP_BUSINESS_ACCOUNT_ID, changes: [{ field: "messages", value: {
    messaging_product: "whatsapp", metadata: { phone_number_id: env.WHATSAPP_PHONE_NUMBER_ID },
    statuses: [{ id: wamid, status: "delivered", timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: "10000000000" }],
  } }] }],
});
const sig = "sha256=" + crypto.createHmac("sha256", env.WHATSAPP_APP_SECRET).update(body, "utf8").digest("hex");
const good = await fetch(url, syntheticInit({ method: "POST", headers: { "x-hub-signature-256": sig, "content-type": "application/json" }, body }));
const goodJson = await good.json().catch(() => ({}));
check("POST firmado válido: aceptado y aplicado", good.status === 200 && goodJson.applied === 1, `HTTP ${good.status} ${JSON.stringify(goodJson)}`);
const after = (await ref.get()).data();
check("El estado se escribió en el EMULADOR (delivered)", after?.status === "delivered", `status=${after?.status}`);
const events = await ref.collection("events").get();
check("Quedó registrado el evento (idempotencia)", events.size === 1, `${events.size} evento(s)`);
await ref.collection("events").get().then((s) => Promise.all(s.docs.map((d) => d.ref.delete())));
await ref.delete();

console.log(`\nApp Secret en uso: ${secretState(env.WHATSAPP_APP_SECRET)} · Token de acceso: ${secretState(env.WHATSAPP_ACCESS_TOKEN)}`);
console.log(`URL de callback (para Meta): ${url}`);
process.exit(results.every(Boolean) ? 0 : 1);
