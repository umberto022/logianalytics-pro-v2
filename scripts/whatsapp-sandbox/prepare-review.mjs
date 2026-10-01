// Prepara la solicitud FICTICIA que se usará en la prueba y muestra el mensaje EXACTO con su referencia y enlace reales.
//  - La solicitud pasa por la ruta pública real del sandbox (mismo código que producción) y se guarda en el EMULADOR.
//  - El envío está APAGADO: el aviso queda "pending" con 0 intentos; NO se llama a Meta ni se envía nada.
//  - El enlace del botón abre la página de revisión autenticada del sandbox (ver proxy.mjs), con esta misma solicitud.
// Es idempotente: si ya hay una solicitud preparada la reutiliza (usar --new para crear otra).
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { PROJECT_ID, WORKSPACE_ID, SLUG, FIRESTORE_HOST, NEXT_PORT, readEnvFile, writeEnvFile, requireEmulators } from "./env.mjs";
import { renderMessage, templateValuesFromQuote } from "./template-def.mjs";

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
await requireEmulators();
const env = readEnvFile();
if (env.SANDBOX_SENDING_ENABLED === "true") { console.error("SANDBOX_SENDING_ENABLED=true: preparar la solicitud con el envío activo podría enviarla. Ponlo en false primero."); process.exit(2); }

let tunnel;
try { tunnel = (await (await fetch("http://127.0.0.1:4040/api/tunnels")).json()).tunnels.find((x) => x.public_url.startsWith("https://")).public_url; }
catch { console.error("No hay túnel de ngrok activo."); process.exit(2); }

initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();
const records = db.collection("catalogQuotes").doc(WORKSPACE_ID).collection("records");

let quoteId = env.SANDBOX_QUOTE_ID;
if (!process.argv.includes("--new") && quoteId && (await records.doc(quoteId).get()).exists) {
  console.log(`Reutilizando la solicitud preparada ${quoteId}`);
} else {
  const res = await fetch(`http://127.0.0.1:${NEXT_PORT}/api/catalogo/${SLUG}/solicitud`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ items: [{ inventoryId: "prod-ficticio", quantity: 2 }], customerName: "Cliente Ficticio (prueba)", customerPhone: "+18095550100", deliveryMethod: "retiro" }),
  });
  const saved = await res.json();
  if (!res.ok) { console.error(`El sandbox rechazó la solicitud: HTTP ${res.status} ${JSON.stringify(saved)}`); process.exit(1); }
  const found = await records.where("publicRef", "==", saved.publicRef).get();
  quoteId = found.docs[0].id;
  writeEnvFile({ ...env, SANDBOX_QUOTE_ID: quoteId, SANDBOX_QUOTE_REF: saved.publicRef });
}

const quote = (await records.doc(quoteId).get()).data();
const job = (await db.collection("whatsappNotifications").doc(WORKSPACE_ID).collection("jobs").doc(quoteId).get()).data();
const settings = (await db.collection("catalogSettings").doc(WORKSPACE_ID).get()).data();
console.log(`Job: status=${job?.status} intentos=${job?.attempts} (sin envío: ${job?.status === "pending" && job?.attempts === 0 ? "confirmado" : "REVISAR"})`);

const values = templateValuesFromQuote({ businessName: settings.businessName, customerName: quote.customerName, customerPhone: quote.customerPhone, publicRef: quote.publicRef, items: quote.items });
const link = `${tunnel}/solicitudes?ref=${quoteId}`;
console.log("\n══ MENSAJE EXACTO (nada enviado) ═══════════════════════════════");
console.log(renderMessage(values, quoteId, `${tunnel}/solicitudes?ref={{1}}`));
console.log("═════════════════════════════════════════════════════════════════");
console.log(`\nReferencia: ${quote.publicRef}\nEnlace de revisión (usuario "revision", contraseña con: npm run sandbox:copy-review-password):\n${link}`);
