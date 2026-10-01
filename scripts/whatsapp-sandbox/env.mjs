// Configuración compartida del sandbox aislado de WhatsApp.
//
// AISLAMIENTO: todo corre contra los EMULADORES de Firebase (proyecto demo, sin
// credenciales reales) y un servidor Next local. Nunca toca el Firestore de
// producción, ni el worker/env de Vercel de producción. Los secretos de Meta
// viven SOLO en .env.sandbox.local (ignorado por git) y se cargan con
// `npm run sandbox:secrets` (entrada oculta en tu terminal, no por chat).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// WHATSAPP_META_ENV_FILE permite reutilizar template.mjs / meta-check.mjs con otro archivo (p. ej. .env.production-meta.local, ver scripts/whatsapp-prod).
export const ENV_FILE = process.env.WHATSAPP_META_ENV_FILE ? path.resolve(ROOT, process.env.WHATSAPP_META_ENV_FILE) : path.join(ROOT, ".env.sandbox.local");

export const PROJECT_ID = "demo-logianalytics-sandbox";
export const WORKSPACE_ID = "sandbox-ws";
export const SLUG = "prueba-aislada";
// Emulador PROPIO del sandbox (firebase.sandbox.json): otros puertos y proyecto por defecto = PROJECT_ID, aislado de las pruebas.
export const FIRESTORE_HOST = "127.0.0.1:8090";
export const AUTH_HOST = "127.0.0.1:9199";
export const NEXT_PORT = 3100;
export const PROXY_PORT = 3101;
export const WEBHOOK_PATH = "/api/webhooks/whatsapp";

export function readEnvFile() {
  const out = {};
  if (!fs.existsSync(ENV_FILE)) return out;
  for (const raw of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

export function writeEnvFile(values) {
  const lines = [
    "# Sandbox aislado de WhatsApp — SECRETOS LOCALES, ignorado por git. No compartir.",
    ...Object.entries(values).map(([k, v]) => `${k}=${v}`),
    "",
  ];
  fs.writeFileSync(ENV_FILE, lines.join("\n"), { mode: 0o600 });
}

/** Entorno del proceso Next del sandbox: emuladores + credenciales de Meta de PRUEBA. */
export function sandboxProcessEnv(fileEnv) {
  const env = { ...process.env, ...fileEnv };
  // Anula cualquier credencial real que hubiera en el entorno del shell o en .env.local.
  delete env.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete env.VERCEL_OIDC_TOKEN;
  delete env.RESEND_API_KEY;
  return {
    ...env,
    FIRESTORE_EMULATOR_HOST: FIRESTORE_HOST,
    FIREBASE_AUTH_EMULATOR_HOST: AUTH_HOST,
    NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: FIRESTORE_HOST,
    NEXT_PUBLIC_AUTH_EMULATOR_HOST: AUTH_HOST,
    NEXT_PUBLIC_USE_FIREBASE_EMULATOR: "1",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_API_KEY: "fake-api-key-for-emulator",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost",
    NEXT_DIST_DIR: ".next-sandbox",
    APP_BASE_URL: `http://127.0.0.1:${NEXT_PORT}`,
    // Sandbox: el aviso preparado para revisión puede esperar horas hasta que se acuerde la prueba; en producción el default es 360.
    WHATSAPP_JOB_MAX_AGE_MINUTES: "1440",
    WHATSAPP_SENDING_ENABLED: fileEnv.SANDBOX_SENDING_ENABLED === "true" ? "true" : "false",
  };
}

export function requireEmulators() {
  // Comprobación mínima y explícita: si los emuladores no están, se aborta antes de arrancar nada.
  return Promise.all(["http://" + FIRESTORE_HOST + "/", "http://" + AUTH_HOST + "/"].map(async (u) => {
    try { const r = await fetch(u); return r.ok; } catch { return false; }
  })).then(([f, a]) => {
    if (!f || !a) throw new Error("Los emuladores de Firestore/Auth no están en 127.0.0.1:8090/9199 — arrancalos primero (npm run sandbox:emulators).");
  });
}

/** El App Secret de Meta son exactamente 32 caracteres hexadecimales (no confundir con el token de acceso, que empieza por "EAA" y es larguísimo). */
export const appSecretLooksValid = (v) => /^[0-9a-f]{32}$/i.test(v ?? "");
/** Un token de acceso de Meta empieza por "EAA" y solo usa [A-Za-z0-9_-]. */
export const accessTokenLooksValid = (v) => /^EAA[A-Za-z0-9_-]{20,}$/.test(v ?? "");

/** "cargado" / "PLACEHOLDER (falta el real)" / "vacío" — nunca imprime el valor. `kind`: "secret" | "token" valida el formato. */
export function secretState(v, kind) {
  if (!v) return "vacío";
  if (v.startsWith("placeholder-")) return "PLACEHOLDER (falta el real)";
  if (kind === "secret" && !appSecretLooksValid(v)) return "cargado pero con FORMATO INVÁLIDO (un App Secret son 32 caracteres hexadecimales)";
  if (kind === "token" && !accessTokenLooksValid(v)) return "cargado pero con FORMATO INVÁLIDO (un token de acceso empieza por EAA)";
  return "cargado";
}

/**
 * Limpia lo que se pega en una entrada oculta: secuencias de escape (pegado con corchetes), caracteres de control y espacios,
 * y si el valor es N copias EXACTAS idénticas de un bloque (pegado repetido), se queda con un bloque.
 */
export function cleanPastedSecret(raw) {
  const ESC = String.fromCharCode(27);
  const noEscapes = String(raw ?? "").replace(new RegExp(ESC + "[[][0-9;?]*[~A-Za-z]", "g"), "");
  // Fuera controles y espacios (códigos <= 32 y 127).
  const v = Array.from(noEscapes).filter((c) => c.charCodeAt(0) > 32 && c.charCodeAt(0) !== 127).join("");
  for (let n = 2; n <= 8; n++) {
    if (v.length % n === 0) {
      const block = v.slice(0, v.length / n);
      if (block.repeat(n) === v) return block;
    }
  }
  return v;
}
