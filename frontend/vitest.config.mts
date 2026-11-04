import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Prove frontend (o3): file *.test.ts(x) / *.spec.ts(x) dentro qualunque cartella src/**/__tests__/.
// Prove lato server (o2): tests/server/**, con `// @vitest-environment node` in testa al file.
// Ambiente predefinito jsdom.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/__tests__/**/*.{test,spec}.{ts,tsx}", "tests/server/**/*.{test,spec}.ts"],
    setupFiles: ["./vitest.setup.ts"],
    css: false,
    // Le prove d'integrazione sul replica set usa-e-getta girano in parallelo: 5 s non bastano sotto carico.
    testTimeout: 30_000,
    // Il bootstrap di un database nuovo (indici, snapshot, liste) costa ~9 s sul replica set in Docker e i file
    // d'integrazione partono insieme: il server serializza le creazioni, quindi serve margine.
    hookTimeout: 180_000,
    // next-auth (ESM) importa "next/server" senza estensione: elaborato da vite si risolve come nell'app (D-143,
    // prova della rotta di Auth.js).
    server: { deps: { inline: ["next-auth"] } },
  },
});
