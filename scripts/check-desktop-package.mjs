import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const EXPECTED_RUST_SOURCE = `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to run Dwarven Depths desktop shell");
}
`;
const EXPECTED_CARGO_SOURCE = `[package]
name = "dwarven-depths-desktop"
version = "0.0.0"
description = "Dwarven Depths desktop packaging evaluation"
authors = ["Dwarven Depths contributors"]
edition = "2021"
rust-version = "1.77.2"
license = "UNLICENSED"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }

[profile.release]
strip = true
lto = true
codegen-units = 1
panic = "abort"
`;
const EXPECTED_BUILD_SOURCE = `fn main() {
    tauri_build::build();
}
`;

function plainObject(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(plainObject(value, label)).sort();
  const canonical = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(canonical)) {
    throw new Error(
      `${label} keys must be exactly ${canonical.join(", ")}; received ${actual.join(", ")}`
    );
  }
}

function equal(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} must be ${JSON.stringify(expected)}`);
  }
}

export function validateCapabilityFiles(files) {
  const actual = [...files].sort();
  if (JSON.stringify(actual) !== JSON.stringify(["main.json"])) {
    throw new Error(
      `desktop capabilities must contain only main.json; received ${actual.join(", ")}`
    );
  }
}

export function validateDesktopBuildInputs(cargoSource, buildSource) {
  equal(cargoSource, EXPECTED_CARGO_SOURCE, "desktop Cargo manifest");
  equal(buildSource, EXPECTED_BUILD_SOURCE, "desktop Rust build script");
}

export function validateDesktopPackage(config, capability, rustSource) {
  exactKeys(
    config,
    [
      "$schema",
      "productName",
      "version",
      "identifier",
      "build",
      "app",
      "bundle"
    ],
    "Tauri config"
  );
  equal(config.$schema, "https://schema.tauri.app/config/2", "Tauri schema");
  equal(config.productName, "Dwarven Depths", "product name");
  equal(config.version, "0.0.0", "desktop version");
  equal(config.identifier, "com.dwarvendepths.game", "package identifier");

  exactKeys(
    config.build,
    ["beforeBuildCommand", "beforeDevCommand", "devUrl", "frontendDist"],
    "build config"
  );
  equal(
    config.build.beforeBuildCommand,
    "pnpm --filter @dwarven-depths/web build",
    "web build command"
  );
  equal(config.build.frontendDist, "../../web/dist", "packaged web source");
  if (!/^http:\/\/localhost:\d+$/.test(config.build.devUrl)) {
    throw new Error("development URL must remain loopback-only");
  }

  exactKeys(config.app, ["windows", "security"], "app config");
  if (!Array.isArray(config.app.windows) || config.app.windows.length !== 1) {
    throw new Error("app config must declare exactly one window");
  }
  const [window] = config.app.windows;
  exactKeys(
    window,
    ["label", "title", "width", "height", "minWidth", "minHeight", "resizable"],
    "main window"
  );
  equal(window.label, "main", "window label");
  equal(window.minWidth, 320, "minimum window width");
  if ("url" in window)
    throw new Error("desktop window may not override packaged assets");

  exactKeys(config.app.security, ["csp"], "security config");
  const csp = config.app.security.csp;
  equal(
    csp,
    "default-src 'self'; connect-src ipc: http://ipc.localhost; img-src 'self' asset: http://asset.localhost blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; worker-src 'self' blob:",
    "desktop CSP"
  );

  exactKeys(config.bundle, ["active", "targets", "icon"], "bundle config");
  equal(config.bundle.active, true, "bundle activation");
  if (JSON.stringify(config.bundle.targets) !== JSON.stringify(["deb"])) {
    throw new Error(
      "desktop evaluation must produce only the Linux deb target"
    );
  }

  exactKeys(
    capability,
    ["$schema", "identifier", "description", "windows", "permissions"],
    "desktop capability"
  );
  if (JSON.stringify(capability.windows) !== JSON.stringify(["main"])) {
    throw new Error("desktop capability must bind only the main window");
  }
  if (
    JSON.stringify(capability.permissions) !== JSON.stringify(["core:default"])
  ) {
    throw new Error("desktop capability may grant only core:default");
  }
  equal(rustSource, EXPECTED_RUST_SOURCE, "desktop Rust shell");
}

export function validateDesktopPackageAt(root = ROOT) {
  const capabilitiesDirectory = resolve(
    root,
    "apps/desktop/src-tauri/capabilities"
  );
  validateCapabilityFiles(readdirSync(capabilitiesDirectory));
  const config = JSON.parse(
    readFileSync(
      resolve(root, "apps/desktop/src-tauri/tauri.conf.json"),
      "utf8"
    )
  );
  const capability = JSON.parse(
    readFileSync(resolve(capabilitiesDirectory, "main.json"), "utf8")
  );
  const rustSource = readFileSync(
    resolve(root, "apps/desktop/src-tauri/src/main.rs"),
    "utf8"
  );
  const cargoSource = readFileSync(
    resolve(root, "apps/desktop/src-tauri/Cargo.toml"),
    "utf8"
  );
  const buildSource = readFileSync(
    resolve(root, "apps/desktop/src-tauri/build.rs"),
    "utf8"
  );
  validateDesktopPackage(config, capability, rustSource);
  validateDesktopBuildInputs(cargoSource, buildSource);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    validateDesktopPackageAt();
    process.stdout.write(
      `${JSON.stringify({ ok: true, target: "deb", authority: "web-worker" })}\n`
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        ok: false,
        error: "desktop_package_contract_failed",
        message: error instanceof Error ? error.message : String(error)
      })}\n`
    );
    process.exitCode = 1;
  }
}
