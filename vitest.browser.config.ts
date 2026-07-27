import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    include: [
      "packages/*/src/**/*.browser.test.ts",
      "apps/*/src/**/*.browser.test.ts",
      "apps/*/src/**/*.browser.test.tsx"
    ],
    exclude: ["**/node_modules/**"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [
        { browser: "chromium" },
        { browser: "firefox" },
        { browser: "webkit" }
      ]
    }
  }
});
