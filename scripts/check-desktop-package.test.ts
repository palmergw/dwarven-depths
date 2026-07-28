import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateDesktopPackage } from "./check-desktop-package.mjs";

const config = JSON.parse(
  readFileSync(resolve("apps/desktop/src-tauri/tauri.conf.json"), "utf8")
);
const capability = JSON.parse(
  readFileSync(resolve("apps/desktop/src-tauri/capabilities/main.json"), "utf8")
);
const rustSource = readFileSync(
  resolve("apps/desktop/src-tauri/src/main.rs"),
  "utf8"
);

function clone(value) {
  return structuredClone(value);
}

describe("desktop package contract", () => {
  it("accepts the minimal production-web Tauri shell", () => {
    expect(() =>
      validateDesktopPackage(clone(config), clone(capability), rustSource)
    ).not.toThrow();
  });

  it.each([
    [
      "remote window",
      (candidate) => (candidate.app.windows[0].url = "https://example.com")
    ],
    [
      "wrong assets",
      (candidate) => (candidate.build.frontendDist = "../desktop-ui")
    ],
    [
      "remote CSP",
      (candidate) =>
        (candidate.app.security.csp += " connect-src https://example.com")
    ],
    [
      "wildcard CSP",
      (candidate) =>
        (candidate.app.security.csp = candidate.app.security.csp.replace(
          "connect-src ipc:",
          "connect-src * ipc:"
        ))
    ],
    [
      "websocket CSP",
      (candidate) =>
        (candidate.app.security.csp = candidate.app.security.csp.replace(
          "connect-src ipc:",
          "connect-src ws: wss: ipc:"
        ))
    ],
    ["extra config", (candidate) => (candidate.plugins = {})]
  ])("rejects authority expansion: %s", (_label, mutate) => {
    const candidate = clone(config);
    mutate(candidate);
    expect(() =>
      validateDesktopPackage(candidate, clone(capability), rustSource)
    ).toThrow();
  });

  it.each(["shell:allow-execute", "fs:allow-write", "http:default"])(
    "rejects unnecessary permission %s",
    (permission) => {
      const candidate = clone(capability);
      candidate.permissions.push(permission);
      expect(() =>
        validateDesktopPackage(clone(config), candidate, rustSource)
      ).toThrow("only core:default");
    }
  );

  it("rejects platform-owned commands and plugins", () => {
    expect(() =>
      validateDesktopPackage(
        clone(config),
        clone(capability),
        `${rustSource}\n.invoke_handler(tauri::generate_handler![run_simulation])`
      )
    ).toThrow("may not add plugins or command handlers");
  });
});
