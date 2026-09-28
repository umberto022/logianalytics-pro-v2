/**
 * Activa (o revierte) el módulo opt-in "catalogo" para UNA empresa puntual,
 * agregándolo a UserProfile.enabledModules SIN pisar otros valores que ya
 * tenga ese arreglo (usa arrayUnion/arrayRemove, nunca sobrescribe el campo
 * entero).
 *
 * Verifica identidad antes de escribir — nunca activa por coincidencia de
 * nombre:
 *   1. Resuelve el usuario en Firebase Auth por --uid o --email.
 *   2. Lee su doc users/{uid} en Firestore.
 *   3. Exige que el email de Auth y el de Firestore COINCIDAN.
 *   4. Exige que sea el ADMIN DUEÑO de su propio workspace (role === "admin"
 *      && workspaceId === uid) — enabledModules solo tiene efecto ahí; activarlo
 *      en el doc de un empleado no haría nada.
 *   5. Sin --confirm, es un dry-run: imprime todo lo anterior y no escribe nada.
 *
 * Requiere una Service Account Key real (FIREBASE_SERVICE_ACCOUNT_JSON) —
 * este script NO corre contra el emulador, es para producción. Ejecutarlo
 * fuera de esta sesión, con las credenciales del proyecto real.
 *
 * Uso:
 *   node scripts/activate-catalog-module.mjs --email=rojastefany88@gmail.com
 *   node scripts/activate-catalog-module.mjs --email=rojastefany88@gmail.com --confirm
 *   node scripts/activate-catalog-module.mjs --email=rojastefany88@gmail.com --confirm --rollback
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);

const MODULE_KEY = "catalogo";

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

if (!args.uid && !args.email) fail("Pasá --uid=<uid> o --email=<email>.");

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) fail("FIREBASE_SERVICE_ACCOUNT_JSON no está seteada — este script necesita la Service Account real del proyecto.");
initializeApp({ credential: cert(JSON.parse(raw)) });

const auth = getAuth();
const db = getFirestore();

async function resolveAuthUser() {
  if (args.uid) return auth.getUser(args.uid);
  return auth.getUserByEmail(args.email);
}

const authUser = await resolveAuthUser().catch((e) => fail(`No se encontró el usuario en Firebase Auth: ${e.message}`));

const profileSnap = await db.collection("users").doc(authUser.uid).get();
if (!profileSnap.exists) fail(`No existe users/${authUser.uid} en Firestore.`);
const profile = profileSnap.data();

// ── Verificaciones de identidad — cortan ANTES de escribir nada ──────────────
if ((profile.email || "").toLowerCase() !== (authUser.email || "").toLowerCase()) {
  fail(`El email de Firestore ("${profile.email}") no coincide con el de Auth ("${authUser.email}") — no se activa nada. Revisá manualmente cuál doc es el correcto.`);
}
if (profile.role !== "admin" || profile.workspaceId !== authUser.uid) {
  fail(
    `users/${authUser.uid} no es el ADMIN DUEÑO de su propio workspace ` +
    `(role="${profile.role}", workspaceId="${profile.workspaceId}") — ` +
    `enabledModules solo tiene efecto en el doc del dueño del workspace. ` +
    `Si esta persona es empleada, activá el módulo en el doc de SU admin, no en el suyo.`
  );
}

const current = profile.enabledModules ?? [];
const alreadyEnabled = current.includes(MODULE_KEY);
const rollback = !!args.rollback;

console.log("── Identidad verificada ──────────────────────────────");
console.log(`uid:              ${authUser.uid}`);
console.log(`email (Auth):     ${authUser.email}`);
console.log(`email (Firestore):${profile.email}`);
console.log(`fullName:         ${profile.fullName ?? "—"}`);
console.log(`companyName:      ${profile.companyName ?? "—"}`);
console.log(`role:             ${profile.role}`);
console.log(`workspaceId:      ${profile.workspaceId}`);
console.log(`workspaceStatus:  ${profile.workspaceStatus ?? "active (ausente)"}`);
console.log(`enabledModules actuales: [${current.join(", ")}]`);
console.log(`Acción: ${rollback ? "QUITAR" : "AGREGAR"} "${MODULE_KEY}"`);

if (!rollback && alreadyEnabled) {
  console.log(`\n"${MODULE_KEY}" ya está en enabledModules — nada que hacer.`);
  process.exit(0);
}
if (rollback && !alreadyEnabled) {
  console.log(`\n"${MODULE_KEY}" ya NO está en enabledModules — nada que hacer.`);
  process.exit(0);
}

if (!args.confirm) {
  console.log("\n(dry-run — no se escribió nada. Repetí el comando con --confirm para aplicar.)");
  process.exit(0);
}

await db.collection("users").doc(authUser.uid).update({
  enabledModules: rollback
    ? FieldValue.arrayRemove(MODULE_KEY)
    : FieldValue.arrayUnion(MODULE_KEY),
});

console.log(`\n✔ "${MODULE_KEY}" ${rollback ? "quitado de" : "agregado a"} enabledModules de ${authUser.uid}.`);
