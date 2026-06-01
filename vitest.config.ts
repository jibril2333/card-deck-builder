import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // The app code that tests import doesn't need DOM. If a test ever does
    // require it, flip this to "jsdom" per-file with @vitest/environment.
    environment: "node",
  },
});
