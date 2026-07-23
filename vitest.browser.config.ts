import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.browser.test.ts"],
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
