// Registra tu número DEDICADO en la Cloud API (POST /{phone-number-id}/register). Meta lo exige y solo se hace por API.
//   npm.cmd run prod:register
//
// Lo ejecutas TÚ en PowerShell: te pide un PIN de 6 dígitos con ENTRADA OCULTA. Si el número no tenía verificación en dos pasos, ese PIN
// pasa a ser su PIN (guárdalo en un lugar seguro; Meta no lo muestra después). Meta está retirando el PIN en números elegibles, pero
// la llamada sigue pidiendo uno de 6 dígitos válido. Límite de Meta: 10 intentos por número en 72 h (error 133016).
// Antes de registrar, comprueba que el número NO es el de prueba y que ya está verificado por SMS/llamada. Nunca imprime el token ni el PIN.
import { readProdEnv, accessTokenLooksValid, numericIdLooksValid } from "./env.mjs";

const env = readProdEnv();
const version = process.env.WHATSAPP_API_VERSION || "v23.0";

function askPin() {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) return reject(new Error("Esta consola no es interactiva: ejecútalo en PowerShell."));
    process.stdout.write("PIN de 6 dígitos para el número (entrada OCULTA): ");
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

async function graph(method, path, body) {
  const r = await fetch(`https://graph.facebook.com/${version}/${path}`, {
    method, headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { s: r.status, j: await r.json().catch(() => ({})) };
}
const err = (j) => (j?.error ? `code ${j.error.code}: ${j.error.error_user_msg || j.error.message}` : "");

async function main() {
  if (!accessTokenLooksValid(env.WHATSAPP_ACCESS_TOKEN) || !numericIdLooksValid(env.WHATSAPP_PHONE_NUMBER_ID)) {
    console.error("Faltan el token o el ID del número de producción: npm.cmd run prod:secrets"); return 2;
  }
  const id = env.WHATSAPP_PHONE_NUMBER_ID;
  const info = await graph("GET", `${id}?fields=display_phone_number,verified_name,code_verification_status,status,platform_type`);
  if (info.s !== 200) { console.error(`No se pudo consultar el número: HTTP ${info.s} ${err(info.j)}`); return 1; }
  const n = info.j;
  console.log(`Número ${n.display_phone_number} · nombre: ${n.verified_name} · verificación: ${n.code_verification_status} · estado: ${n.status} · plataforma: ${n.platform_type ?? "—"}`);
  if (n.verified_name === "Test Number" || /^\+?1[ -]?555/.test(n.display_phone_number ?? "")) { console.error("Este es el número de PRUEBA de Meta, no un número de producción: no se registra."); return 1; }
  if (n.code_verification_status !== "VERIFIED") { console.error("El número aún no está verificado por SMS/llamada: complétalo en el Administrador de WhatsApp (Números de teléfono → Agregar número) y vuelve a intentar."); return 1; }
  if (n.platform_type === "CLOUD_API" && n.status === "CONNECTED") { console.log("El número ya está registrado y CONECTADO en la Cloud API. No hay nada que hacer."); return 0; }

  const pin = (await askPin()).trim();
  if (!/^[0-9]{6}$/.test(pin)) { console.error("El PIN son exactamente 6 dígitos. No se envió nada."); return 1; }
  const r = await graph("POST", `${id}/register`, { messaging_product: "whatsapp", pin });
  console.log(`POST /register → HTTP ${r.s} ${r.j?.success === true ? "success" : err(r.j) || JSON.stringify(r.j).slice(0, 200)}`);
  const after = await graph("GET", `${id}?fields=status,platform_type,name_status`);
  console.log(`Estado después: ${after.j.status ?? "?"} · plataforma: ${after.j.platform_type ?? "?"} · nombre: ${after.j.name_status ?? "?"}  (debe quedar CONNECTED)`);
  return r.s === 200 && r.j?.success === true ? 0 : 1;
}
// Sin process.exit() tras usar fetch: en Windows puede abortar con un fallo de libuv.
process.exitCode = await main();
