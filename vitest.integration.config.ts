import { defineConfig } from "vitest/config";
import path from "path";

// Recorrido integrado end-to-end contra los emuladores de Firestore + Auth,
// usando las funciones REALES de la app (no reimplementaciones) — ver
// tests/integration/. Requiere:
//   firebase emulators:start --only firestore,auth --project demo-logianalytics-test
// corriendo en paralelo. `npm run test:integration`.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    env: {
      NEXT_PUBLIC_USE_FIREBASE_EMULATOR: "1",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-logianalytics-test",
      NEXT_PUBLIC_FIREBASE_API_KEY: "fake-api-key-for-emulator",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    },
  },
});
