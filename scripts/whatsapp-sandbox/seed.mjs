// Siembra el emulador con un workspace FICTICIO para la prueba aislada.
// No copia datos comerciales ni de clientes reales: todo lo que se crea acá es inventado
// y vive solo en la memoria del emulador. El único dato real es el RECEPTOR autorizado de la
// prueba (configuración protegida), que se lee de .env.sandbox.local.
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { PROJECT_ID, WORKSPACE_ID, SLUG, FIRESTORE_HOST, AUTH_HOST, readEnvFile, requireEmulators } from "./env.mjs";

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
await requireEmulators();
const fileEnv = readEnvFile();
const recipient = fileEnv.SANDBOX_RECIPIENT_E164;
if (!recipient) throw new Error("Falta SANDBOX_RECIPIENT_E164 en .env.sandbox.local (corré npm run sandbox:secrets primero).");

initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();
const now = Timestamp.now();

// Cuenta de prueba SOLO del emulador (no existe en ningún otro lado) para comprobar el enlace autenticado de la app real en local.
export const SANDBOX_LOGIN = { email: "revisor@sandbox.invalid", password: "sandbox-solo-emulador-1" };
await getAuth().createUser({ uid: WORKSPACE_ID, email: SANDBOX_LOGIN.email, password: SANDBOX_LOGIN.password, displayName: "Revisor sandbox" }).catch(() => {});
await db.collection("users").doc(WORKSPACE_ID).set({
  email: SANDBOX_LOGIN.email, fullName: "Revisor sandbox", role: "admin", workspaceId: WORKSPACE_ID, enabledModules: ["catalogo"],
  onboardingCompleted: true, createdAt: now,
});
await db.collection("catalogSettings").doc(WORKSPACE_ID).set({
  businessName: "PRUEBA AISLADA LogiAnalytics",
  colors: { primary: "#EC4899", accent: "#C084FC" },
  whatsappNumber: recipient,                 // receptor protegido = el WhatsApp autorizado para la prueba
  whatsappNotificationsConsent: true,
  pickup: { enabled: true, address: "Dirección ficticia 1" },
  delivery: { enabled: false, zones: [] },
  publicSlug: SLUG,
  enabled: true,
  discountRule: { minQty: 4, pct: 20, appliesToShipping: false },
  advanceRule: { pct: 50, largeOrderThresholdCents: 200000, thresholdAfterDiscountExcludingShipping: true },
  pricesAreFinal: true,
  commercialRulesConfirmed: true,
  leadTimeNote: "Prueba aislada — no es una solicitud real",
  createdAt: now, updatedAt: now,
});
await db.collection("inventory").doc(WORKSPACE_ID).collection("items").doc("prod-ficticio").set({
  name: "Producto ficticio de prueba", sku: "FICT-001", category: "Prueba", color: "", supplier: "",
  currentStock: 50, minStock: 1, maxStock: 100, unitCost: 10, salePrice: 100, leadTimeDays: 3,
  catalog: { published: true, variants: [], quantityPricing: [], allowBackorder: false },
  createdAt: now, updatedAt: now,
});
console.log(`Sembrado en el emulador (${PROJECT_ID}): workspace ${WORKSPACE_ID}, catálogo /${SLUG}, 1 producto ficticio.`);
