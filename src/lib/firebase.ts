import { initializeApp, getApps } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = getStorage(app);

// Solo para pruebas de integración locales contra el emulador (npm run
// test:integration) — jamás se activa en producción/desarrollo normal, hace
// falta poner esta variable explícitamente al levantar el proceso.
if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "1") {
  // Puertos por defecto de `npm run test:integration`; el sandbox de WhatsApp usa un emulador PROPIO (otros puertos)
  // para no compartir datos ni proyecto de Auth con las pruebas.
  const authHost = process.env.NEXT_PUBLIC_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
  const [fsHost, fsPort] = (process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
  connectFirestoreEmulator(db, fsHost, Number(fsPort));
}

export default app;
