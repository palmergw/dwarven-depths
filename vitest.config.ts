import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    exclude: ["packages/*/src/**/*.browser.test.ts", "**/node_modules/**"],
    coverage: {
      reporter: ["text", "json-summary"]
    }
  }
});
