import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["tests/live/**/*.live.ts"],
    testTimeout: 300000,
    hookTimeout: 30000,
  },
});
