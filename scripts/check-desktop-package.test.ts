import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateCapabilityFiles,
  validateDesktopBuildInputs,
  validateDesktopPackage
} from "./check-desktop-package.mjs";

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
const cargoSource = readFileSync(
  resolve("apps/desktop/src-tauri/Cargo.toml"),
  "utf8"
);
const buildSource = readFileSync(
  resolve("apps/desktop/src-tauri/build.rs"),
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
      ).toThrow("may not grant native API permissions");
    }
  );

  it.each([
    ".plugin (native_plugin)",
    "tauri::Manager::plugin(&app, native_plugin)",
    'std::process::Command::new("sh")'
  ])("rejects platform-owned Rust authority: %s", (authority) => {
    expect(() =>
      validateDesktopPackage(
        clone(config),
        clone(capability),
        `${rustSource}\n${authority}`
      )
    ).toThrow("desktop Rust shell");
  });

  it("rejects Cargo dependency and build-script drift", () => {
    expect(() =>
      validateDesktopBuildInputs(
        `${cargoSource}\ntauri-plugin-shell = "2"\n`,
        buildSource
      )
    ).toThrow("desktop Cargo manifest");
    expect(() =>
      validateDesktopBuildInputs(
        cargoSource,
        `${buildSource}\nfn expanded() {}`
      )
    ).toThrow("desktop Rust build script");
  });

  it("rejects additional capability documents", () => {
    expect(() =>
      validateCapabilityFiles(["main.json", "expanded.json"])
    ).toThrow("must contain only main.json");
  });
});
