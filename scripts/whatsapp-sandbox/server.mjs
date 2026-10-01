// Arranca el servidor Next del sandbox: mismo código de la app, pero conectado a los EMULADORES y con
// credenciales de Meta de PRUEBA. `WHATSAPP_SENDING_ENABLED` queda en false salvo que SANDBOX_SENDING_ENABLED=true
// en .env.sandbox.local (se activa solo para la prueba autorizada de extremo a extremo).
import { spawn } from "node:child_process";
import { NEXT_PORT, PROJECT_ID, ROOT, readEnvFile, requireEmulators, sandboxProcessEnv, secretState } from "./env.mjs";

await requireEmulators();
const fileEnv = readEnvFile();
const env = sandboxProcessEnv(fileEnv);
console.log(`Sandbox Next :${NEXT_PORT} — proyecto ${PROJECT_ID} (emuladores) — envío externo: ${env.WHATSAPP_SENDING_ENABLED}` +
  ` — token de acceso: ${secretState(env.WHATSAPP_ACCESS_TOKEN, "token")} — App Secret: ${secretState(env.WHATSAPP_APP_SECRET, "secret")}`);

const child = spawn(process.execPath, [`${ROOT}/node_modules/next/dist/bin/next`, "dev", "-p", String(NEXT_PORT), "-H", "127.0.0.1"], {
  cwd: ROOT, env, stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 0));
