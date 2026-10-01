// Carga los secretos de Meta en .env.sandbox.local con ENTRADA OCULTA.
// Ejecutar en TU terminal (no por chat):   npm run sandbox:secrets
//
//  - WHATSAPP_ACCESS_TOKEN: el token (temporal) de "Configuración de la API" en Meta. Sirve para ENVIAR.
//  - WHATSAPP_APP_SECRET:   "Configuración → Básica" de la app en Meta → Clave secreta de la app. Sirve para
//                           VALIDAR la firma de los webhooks. NO es el token de acceso.
// El token de verificación del webhook NO se pide: lo genera este sandbox (aleatorio) y se copia con
//   npm run sandbox:copy-verify-token
// Enter vacío = conservar el valor actual.
import crypto from "node:crypto";
import { readEnvFile, writeEnvFile, secretState, appSecretLooksValid, accessTokenLooksValid, cleanPastedSecret } from "./env.mjs";

function askHidden(prompt) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) return reject(new Error("Esta consola no es interactiva. Ejecutalo en una terminal normal (PowerShell/Terminal), o edita .env.sandbox.local a mano en tu editor."));
    process.stdout.write(prompt);
    let value = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(value);
        }
        if (ch === "\u0003") { process.stdin.setRawMode(false); process.exit(130); } // Ctrl+C
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    process.stdin.on("data", onData);
  });
}

const env = readEnvFile();
const defaults = {
    WHATSAPP_TEMPLATE_NAME: "nueva_solicitud_cotizacion",
  WHATSAPP_TEMPLATE_LANG: "es",
  SANDBOX_SENDING_ENABLED: "false",
};
for (const [k, v] of Object.entries(defaults)) env[k] ??= v;
// Estos valores NO viajan en el repositorio (es público): se escriben a mano en .env.sandbox.local la primera vez.
for (const k of ["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_BUSINESS_ACCOUNT_ID", "WHATSAPP_APP_ID", "SANDBOX_RECIPIENT_E164"]) env[k] ??= "";
env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ??= crypto.randomBytes(24).toString("hex");
env.CRON_SECRET ??= crypto.randomBytes(24).toString("hex");
// Contraseña de la página de revisión (usuario "revision"): 12 caracteres sin ambiguos, fácil de teclear en un teléfono.
if (!env.SANDBOX_REVIEW_PASSWORD) {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const chars = Array.from(crypto.randomBytes(12), (b) => alphabet[b % alphabet.length]).join("");
  env.SANDBOX_REVIEW_PASSWORD = `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}
// Mientras no haya un App Secret real, se usa un marcador aleatorio: sirve para probar la cañería (firma → túnel → servidor → emulador)
// pero NO es el secreto de Meta — los eventos reales de Meta fallarán la firma hasta que cargues el real.
if (!env.WHATSAPP_APP_SECRET) env.WHATSAPP_APP_SECRET = "placeholder-" + crypto.randomBytes(16).toString("hex");
env.WHATSAPP_ACCESS_TOKEN ??= "";

if (process.argv.includes("--init")) {
  // Solo crea el archivo con los valores NO secretos y los tokens generados al azar; no pide nada.
  writeEnvFile(env);
  console.log("Inicializado .env.sandbox.local (sin credenciales de Meta todavía).");
  process.exit(0);
}

const tokenRaw = await askHidden("WHATSAPP_ACCESS_TOKEN (token de acceso, entrada oculta; Enter = conservar): ");
const token = cleanPastedSecret(tokenRaw);
if (token !== tokenRaw.trim()) console.log("(El token pegado traía repeticiones o caracteres de control; se limpió.)");
if (token) {
  if (!accessTokenLooksValid(token)) {
    console.error("Eso no parece un token de acceso de Meta (debe empezar por EAA y no tener espacios). No se guardó nada.");
    process.exit(1);
  }
  env.WHATSAPP_ACCESS_TOKEN = token;
}
const secretRaw = await askHidden("WHATSAPP_APP_SECRET (clave secreta de la app; entrada oculta; Enter = conservar): ");
const secret = cleanPastedSecret(secretRaw);
if (secret !== secretRaw.trim()) console.log("(El App Secret pegado traía repeticiones o caracteres de control; se limpió.)");
if (secret) {
  if (!appSecretLooksValid(secret)) {
    console.error("Eso no parece un App Secret: son exactamente 32 caracteres hexadecimales (0-9, a-f). Un valor largo que empieza por EAA es un TOKEN de acceso, no el App Secret. No se guardó nada.");
    process.exit(1);
  }
  env.WHATSAPP_APP_SECRET = secret;
}
if (env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_APP_SECRET === env.WHATSAPP_ACCESS_TOKEN) {
  console.error("El App Secret y el token de acceso son iguales: no pueden serlo. Revisá que copiaste cada uno de su lugar. No se guardó nada.");
  process.exit(1);
}
writeEnvFile(env);
console.log(`Guardado en .env.sandbox.local. Token de acceso: ${secretState(env.WHATSAPP_ACCESS_TOKEN, "token")} · App Secret: ${secretState(env.WHATSAPP_APP_SECRET, "secret")}.`);
