import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];

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
