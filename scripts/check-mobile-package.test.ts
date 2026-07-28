import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateMobilePackage } from "./check-mobile-package.mjs";

const root = resolve(import.meta.dirname, "..");
const mobileRoot = resolve(root, "apps/mobile");
const config = JSON.parse(
  readFileSync(resolve(mobileRoot, "capacitor.config.json"), "utf8")
);
const manifest = readFileSync(
  resolve(mobileRoot, "android/app/src/main/AndroidManifest.xml"),
  "utf8"
);
const activity = readFileSync(
  resolve(
    mobileRoot,
    "android/app/src/main/java/com/dwarvendepths/game/MainActivity.java"
  ),
  "utf8"
);
const gradle = readFileSync(
  resolve(mobileRoot, "android/app/build.gradle"),
  "utf8"
);
const packageManifest = JSON.parse(
  readFileSync(resolve(mobileRoot, "package.json"), "utf8")
);
const webIndex = readFileSync(resolve(root, "apps/web/index.html"), "utf8");
const webStyles = readFileSync(
  resolve(root, "apps/web/src/styles.css"),
  "utf8"
);

function validate(overrides = {}) {
  validateMobilePackage(
    overrides.config ?? structuredClone(config),
    overrides.manifest ?? manifest,
    overrides.activity ?? activity,
    overrides.gradle ?? gradle,
    overrides.packageManifest ?? structuredClone(packageManifest),
    overrides.webIndex ?? webIndex,
    overrides.webStyles ?? webStyles
  );
}

describe("Capacitor mobile package contract", () => {
  it("accepts the frozen authority-free Android shell", () => {
    expect(() => validate()).not.toThrow();
  });

  it("rejects extra config authority and remote web sources", () => {
    expect(() =>
      validate({ config: { ...structuredClone(config), plugins: {} } })
    ).toThrow(/Capacitor config keys must be exactly/);
    expect(() =>
      validate({
        config: { ...structuredClone(config), webDir: "https://example.com" }
      })
    ).toThrow(/packaged web source/);
  });

  it("rejects native permissions, cleartext traffic, and exported components", () => {
    expect(() =>
      validate({
        manifest: manifest.replace(
          "</manifest>",
          '<uses-permission android:name="android.permission.INTERNET" /></manifest>'
        )
      })
    ).toThrow(/may not request Android permissions/);
    expect(() =>
      validate({
        manifest: manifest.replace(
          'android:usesCleartextTraffic="false"',
          'android:usesCleartextTraffic="true"'
        )
      })
    ).toThrow(/usesCleartextTraffic/);
    expect(() =>
      validate({
        manifest: manifest.replace(
          'android:exported="false"',
          'android:exported="true"'
        )
      })
    ).toThrow(/only the launcher activity/);
  });

  it("rejects a native gameplay bridge or dependency", () => {
    expect(() =>
      validate({
        activity: activity.replace(
          "BridgeActivity {}",
          "BridgeActivity { void simulate() {} }"
        )
      })
    ).toThrow(/Android activity source/);
    expect(() => {
      const candidate = structuredClone(packageManifest);
      candidate.dependencies["@capacitor/filesystem"] = "8.0.0";
      validate({ packageManifest: candidate });
    }).toThrow(/mobile runtime dependencies/);
  });

  it("requires safe-area metadata and accessible touch targets", () => {
    expect(() =>
      validate({ webIndex: webIndex.replace(", viewport-fit=cover", "") })
    ).toThrow(/viewport-fit/);
    expect(() =>
      validate({
        webStyles: webStyles.replace("env(safe-area-inset-top)", "0px")
      })
    ).toThrow(/safe-area/);
    expect(() =>
      validate({
        webStyles: webStyles.replace("min-height: 2.75rem", "min-height: 2rem")
      })
    ).toThrow(/touch target/);
  });
});
