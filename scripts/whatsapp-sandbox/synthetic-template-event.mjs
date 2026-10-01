// Evento SINTÉTICO de estado de plantilla, firmado por nosotros con el App Secret, para comprobar que el webhook lo recibe y lo etiqueta.
// NO viene de Meta: no demuestra aprobación de ninguna plantilla, no debe despertar al vigilante (lleva la cabecera x-sandbox-synthetic) y
// usa un nombre de plantilla inventado ("canary_plantilla_prueba") para que jamás se confunda con la plantilla real.
import crypto from "node:crypto";
import { readEnvFile, appSecretLooksValid } from "./env.mjs";
import { syntheticInit } from "./meta-origin.mjs";

const env = readEnvFile();
if (!appSecretLooksValid(env.WHATSAPP_APP_SECRET)) { console.error("App Secret inválido o ausente."); process.exit(2); }
const base = (await (await fetch("http://127.0.0.1:4040/api/tunnels")).json()).tunnels.find((x) => x.public_url.startsWith("https://")).public_url;
const body = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{ id: env.WHATSAPP_BUSINESS_ACCOUNT_ID, time: Math.floor(Date.now() / 1000), changes: [{ field: "message_template_status_update", value: {
    event: "APPROVED", message_template_id: 0, message_template_name: "canary_plantilla_prueba", message_template_language: "es", reason: "NONE" } }] }],
});
const sig = "sha256=" + crypto.createHmac("sha256", env.WHATSAPP_APP_SECRET).update(body, "utf8").digest("hex");
const r = await fetch(`${base}/api/webhooks/whatsapp`, syntheticInit({ method: "POST", headers: { "x-hub-signature-256": sig, "content-type": "application/json" }, body }));
console.log(`Evento SINTÉTICO enviado: HTTP ${r.status} ${JSON.stringify(await r.json().catch(() => ({})))}`);
