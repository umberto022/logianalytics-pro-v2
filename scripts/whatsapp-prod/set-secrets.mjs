// Carga las credenciales y la configuración de PRODUCCIÓN con ENTRADA OCULTA y las envía directo a Vercel (Production, Sensitive).
//   npm.cmd run prod:secrets              → te pide cada valor (Enter = no tocar lo que ya esté cargado)
//   npm.cmd run prod:secrets -- --dry-run → solo muestra qué hay y qué falta (no pide ni cambia nada)
//
// Qué hace y qué NO hace:
//  - Los valores no se imprimen nunca. Se guardan en .env.production-meta.local (ignorado por git) y se envían a Vercel por stdin.
//  - Los valores GENERADOS (token de verificación del webhook, CRON_SECRET) los crea este script al azar; no los inventas tú.
//  - NO crea ni toca WHATSAPP_SENDING_ENABLED ni WHATSAPP_SEND_NOT_BEFORE: el envío queda APAGADO hasta verificar el flujo completo.
//  - Para que Vercel use las variables nuevas hace falta un redeploy (lo hace Claude después, sin tocar credenciales).
import crypto from "node:crypto";
import readline from "node:readline";
import { spawnSync } from "node:child_process";
import {
  readProdEnv, writeProdEnv, vercelProductionNames, TEMPLATE, appSecretLooksValid, accessTokenLooksValid, cleanPastedSecret,
  numericIdLooksValid, qstashTokenLooksValid, qstashKeyLooksValid,
} from "./env.mjs";

const dryRun = process.argv.includes("--dry-run");
const VARS = [
  { name: "WHATSAPP_ACCESS_TOKEN", kind: "secret", validate: accessTokenLooksValid, bad: "debe empezar por EAA (token del USUARIO DEL SISTEMA, que no expira; no el temporal de 'Configuración de la API')", help: "Meta → Configuración del negocio → Usuarios del sistema → tu usuario → Generar token (app LogiAnalytics Avisos, sin vencimiento, permisos whatsapp_business_messaging y whatsapp_business_management)" },
  { name: "WHATSAPP_APP_SECRET", kind: "secret", validate: appSecretLooksValid, bad: "son 32 caracteres hexadecimales (0-9, a-f)", help: "Panel de la app → Configuración de la app → Básica → Clave secreta de la app → Mostrar" },
  { name: "WHATSAPP_PHONE_NUMBER_ID", kind: "id", validate: numericIdLooksValid, bad: "es numérico (10-20 dígitos); NO es el número de teléfono", help: "Administrador de WhatsApp → Números de teléfono → tu número → ID del número de teléfono" },
  { name: "WHATSAPP_BUSINESS_ACCOUNT_ID", kind: "id", validate: numericIdLooksValid, bad: "es numérico (10-20 dígitos)", help: "Administrador de WhatsApp → Información general → ID de la cuenta de WhatsApp Business" },
  { name: "WHATSAPP_APP_ID", kind: "id", localOnly: true, validate: numericIdLooksValid, bad: "es numérico (10-20 dígitos)", help: "Panel de la app → ID de la app (solo se guarda en esta máquina, para las comprobaciones)" },
  { name: "WHATSAPP_WEBHOOK_VERIFY_TOKEN", kind: "generated", help: "Lo genera este script; se copia a tu portapapeles con npm.cmd run prod:copy-verify-token (para pegarlo en Meta)" },
  { name: "CRON_SECRET", kind: "generated", help: "Lo genera este script (autoriza al cron diario de Vercel)" },
  { name: "QSTASH_TOKEN", kind: "secret", validate: qstashTokenLooksValid, bad: "parece vacío o con caracteres no válidos", help: "Consola de Upstash → QStash → QSTASH_TOKEN" },
  { name: "QSTASH_CURRENT_SIGNING_KEY", kind: "secret", validate: qstashKeyLooksValid, bad: "parece vacío o con caracteres no válidos", help: "Consola de Upstash → QStash → QSTASH_CURRENT_SIGNING_KEY" },
  { name: "QSTASH_NEXT_SIGNING_KEY", kind: "secret", validate: qstashKeyLooksValid, bad: "parece vacío o con caracteres no válidos", help: "Consola de Upstash → QStash → QSTASH_NEXT_SIGNING_KEY" },
];
const PLAIN = { WHATSAPP_TEMPLATE_NAME: TEMPLATE.name, WHATSAPP_TEMPLATE_LANG: TEMPLATE.lang };

function ask(prompt, hidden) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) return reject(new Error("Esta consola no es interactiva: ejecútalo en PowerShell."));
    if (!hidden) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(prompt, (a) => { rl.close(); resolve(a); });
      return;
    }
    process.stdout.write(prompt);
    let value = "";
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding("utf8");
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off("data", onData); process.stdout.write("\n"); return resolve(value); }
        if (ch === "\u0003") { process.stdin.setRawMode(false); process.exit(130); }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1); else value += ch;
      }
    };
    process.stdin.on("data", onData);
  });
}

function vercelAdd(name, value, sensitive) {
  // El valor viaja por stdin (nunca como argumento: no queda en la lista de procesos). El nombre sale de la lista fija de arriba.
  if (!/^[A-Z][A-Z0-9_]+$/.test(name)) throw new Error("nombre de variable inválido");
  const r = spawnSync(`vercel env add ${name} production ${sensitive ? "--sensitive" : "--no-sensitive"} --force --yes`, { input: value, encoding: "utf8", shell: true, timeout: 120_000 });
  return r.status === 0;
}

const local = readProdEnv();
const inVercel = vercelProductionNames();
if (!inVercel) console.log("Aviso: no pude leer las variables de Vercel (¿sesión de vercel iniciada?). Se guardará solo en local.");
const has = (n) => (local[n] ? "local" : "") + (inVercel?.has(n) ? (local[n] ? "+Vercel" : "Vercel") : "");

console.log("Estado de la configuración de PRODUCCIÓN (sin mostrar valores):");
for (const v of VARS) console.log(`  ${v.name.padEnd(32)} ${has(v.name) || "— falta —"}`);
for (const n of Object.keys(PLAIN)) console.log(`  ${n.padEnd(32)} ${inVercel?.has(n) ? "Vercel" : "— se pondrá —"}`);
console.log(`  ${"WHATSAPP_SENDING_ENABLED".padEnd(32)} ${inVercel?.has("WHATSAPP_SENDING_ENABLED") ? "PRESENTE (el envío puede estar encendido)" : "ausente → envío APAGADO (correcto hasta verificar)"}`);
if (dryRun) { console.log("\n(--dry-run: no se pidió ni se cambió nada)"); process.exit(0); }

const next = { ...local };
const changed = [];
for (const v of VARS) {
  if (v.kind === "generated") {
    if (!next[v.name]) { next[v.name] = crypto.randomBytes(24).toString("hex"); changed.push(v.name); console.log(`\n${v.name}: generado al azar.`); }
    continue;
  }
  console.log(`\n${v.name}\n  Dónde está: ${v.help}`);
  const raw = await ask(`  Valor (${v.kind === "secret" ? "entrada OCULTA" : "visible"}; Enter = no cambiar): `, v.kind === "secret");
  const value = cleanPastedSecret(raw);
  if (!value) continue;
  if (value !== raw.trim()) console.log("  (El valor pegado traía repeticiones o caracteres de control; se limpió.)");
  if (!v.validate(value)) { console.error(`  ✗ Formato incorrecto: ${v.bad}. No se guardó.`); continue; }
  next[v.name] = value; changed.push(v.name);
}
if (next.WHATSAPP_ACCESS_TOKEN && next.WHATSAPP_APP_SECRET && next.WHATSAPP_ACCESS_TOKEN === next.WHATSAPP_APP_SECRET) { console.error("\nEl token de acceso y el App Secret no pueden ser iguales. No se guardó nada."); process.exit(1); }

writeProdEnv(next);
console.log("\nGuardado en .env.production-meta.local (solo esta máquina).");

if (inVercel) {
  console.log("Enviando a Vercel (Production)…");
  const generatedMissing = VARS.filter((v) => v.kind === "generated" && !inVercel.has(v.name) && next[v.name]).map((v) => v.name);
  const toPush = [...new Set([...changed.filter((n) => !VARS.find((v) => v.name === n)?.localOnly), ...generatedMissing])];
  for (const n of toPush) {
    const v = VARS.find((x) => x.name === n);
    console.log(`  ${n}: ${vercelAdd(n, next[n], v.kind !== "id") ? "OK" : "ERROR (vuelve a intentarlo)"}`);
  }
  for (const [n, val] of Object.entries(PLAIN)) if (!inVercel.has(n)) console.log(`  ${n}: ${vercelAdd(n, val, false) ? "OK" : "ERROR"}`);
}
console.log("\nListo. El envío sigue APAGADO. Avisa a Claude para hacer el redeploy y correr: npm.cmd run prod:check");
