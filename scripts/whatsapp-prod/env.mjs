// Configuración compartida de los scripts de PRODUCCIÓN del aviso por WhatsApp.
//
// Las credenciales NUNCA van por chat ni al repositorio. `npm.cmd run prod:secrets` las pide con entrada OCULTA, las guarda en
// .env.production-meta.local (ignorado por git, solo en esta máquina) y las envía directo a Vercel (Production, tipo Sensitive).
// Ningún script de esta carpeta activa el envío: WHATSAPP_SENDING_ENABLED se decide aparte, después de verificar el flujo.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, appSecretLooksValid, accessTokenLooksValid, cleanPastedSecret } from "../whatsapp-sandbox/env.mjs";

export { ROOT, appSecretLooksValid, accessTokenLooksValid, cleanPastedSecret };
// WHATSAPP_PROD_ENV_FILE solo existe para pruebas de los propios scripts (apuntarlos a otro archivo); en uso normal no se define.
export const PROD_ENV_FILE = process.env.WHATSAPP_PROD_ENV_FILE ? path.resolve(ROOT, process.env.WHATSAPP_PROD_ENV_FILE) : path.join(ROOT, ".env.production-meta.local");
export const PROD_URL = "https://logianalytics-pro-v2.vercel.app";
export const WEBHOOK_URL = `${PROD_URL}/api/webhooks/whatsapp`;
export const WORKER_URL = `${PROD_URL}/api/cron/process-whatsapp-notifications`;
export const SCHEDULE_ID = "wa-avisos-barrido";
export const TEMPLATE = { name: "nueva_solicitud_cotizacion", lang: "es" };

export const numericIdLooksValid = (v) => /^[0-9]{10,20}$/.test(v ?? "");
export const qstashTokenLooksValid = (v) => /^[A-Za-z0-9+/=_-]{20,}$/.test(v ?? "");
export const qstashKeyLooksValid = (v) => /^[A-Za-z0-9_-]{16,}$/.test(v ?? "");

export function readProdEnv() {
  const out = {};
  if (!fs.existsSync(PROD_ENV_FILE)) return out;
  for (const raw of fs.readFileSync(PROD_ENV_FILE, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

export function writeProdEnv(values) {
  const lines = ["# Credenciales de PRODUCCIÓN (Meta / QStash) en esta máquina — SECRETAS, ignorado por git. No compartir.", ...Object.entries(values).map(([k, v]) => `${k}=${v}`), ""];
  fs.writeFileSync(PROD_ENV_FILE, lines.join("\n"), { mode: 0o600 });
}

/** Nombres (nunca valores) de las variables de Production en Vercel; null si no se pudo consultar. */
export function vercelProductionNames() {
  const r = spawnSync("vercel env ls production", { encoding: "utf8", shell: true, timeout: 90_000 });
  if (r.status !== 0) return null;
  return new Set(r.stdout.split(/\r?\n/).map((l) => l.trim().split(/\s+/)[0]).filter((n) => /^[A-Z][A-Z0-9_]+$/.test(n)));
}
