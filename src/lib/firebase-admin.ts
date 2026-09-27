import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  // Solo para pruebas de integración locales contra el emulador (ver
  // src/lib/firebase.ts) — el Admin SDK no necesita credenciales reales para
  // hablar con el emulador, así que evitamos exigir
  // FIREBASE_SERVICE_ACCOUNT_JSON en ese caso puntual.
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON env var is not set");

  return initializeApp({ credential: cert(JSON.parse(raw)) });
}

export function getAdminDb() {
  getAdminApp();
  return getFirestore();
}

export function getAdminAuth() {
  getAdminApp();
  return getAuth();
}

export function getAdminMessaging() {
  getAdminApp();
  return getMessaging();
}
