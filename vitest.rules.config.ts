import { defineConfig } from "vitest/config";
import path from "path";

// Config separado para las pruebas de firestore.rules contra el emulador
// (`npm run test:rules`) — no corre con `npm test` porque necesita el
// emulador de Firestore levantado en 127.0.0.1:8080.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["tests/security-rules/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
