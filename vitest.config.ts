import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // Las pruebas de reglas de seguridad (tests/security-rules) necesitan el
    // emulador de Firestore corriendo — viven en su propio config
    // (vitest.rules.config.ts / `npm run test:rules`) para que `npm test` no
    // falle cuando no hay emulador levantado.
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
