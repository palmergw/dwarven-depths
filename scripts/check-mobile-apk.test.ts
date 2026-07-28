import { describe, expect, it } from "vitest";
import {
  validateMobileArtifactMetadata,
  validatePackagedWebAssets
} from "./check-mobile-apk.mjs";

const appPermission =
  "com.dwarvendepths.game.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION";
const badging = `package: name='com.dwarvendepths.game' versionCode='1' versionName='1.0' platformBuildVersionName='16' platformBuildVersionCode='36' compileSdkVersion='36' compileSdkVersionCodename='16'
targetSdkVersion:'36'
application-debuggable
launchable-activity: name='com.dwarvendepths.game.MainActivity' label='Dwarven Depths' icon=''
`;
const permissions = `package: com.dwarvendepths.game
permission: ${appPermission}
uses-permission: name='${appPermission}'
`;
const manifestTree = `  E: manifest (line=2)
      E: application (line=17)
          E: activity (line=28)
            A: http://schemas.android.com/apk/res/android:name(0x01010003)="com.dwarvendepths.game.MainActivity" (Raw: "com.dwarvendepths.game.MainActivity")
            A: http://schemas.android.com/apk/res/android:exported(0x01010010)=true
          E: provider (line=42)
            A: http://schemas.android.com/apk/res/android:name(0x01010003)="androidx.startup.InitializationProvider" (Raw: "androidx.startup.InitializationProvider")
            A: http://schemas.android.com/apk/res/android:exported(0x01010010)=false
            A: http://schemas.android.com/apk/res/android:authorities(0x01010018)="com.dwarvendepths.game.androidx-startup" (Raw: "com.dwarvendepths.game.androidx-startup")
`;

describe("built mobile artifact contract", () => {
  it("accepts only the expected debug APK identity and app-scoped guard", () => {
    expect(() =>
      validateMobileArtifactMetadata(badging, permissions, manifestTree)
    ).not.toThrow();
  });

  it("rejects system or plugin permissions", () => {
    expect(() =>
      validateMobileArtifactMetadata(
        badging,
        `${permissions}uses-permission: name='android.permission.INTERNET'\n`,
        manifestTree
      )
    ).toThrow(/only the app-scoped signature guard/);
  });

  it("rejects release-channel or identity drift", () => {
    expect(() =>
      validateMobileArtifactMetadata(
        badging.replace("application-debuggable\n", ""),
        permissions,
        manifestTree
      )
    ).toThrow(/debug-only/);
    expect(() =>
      validateMobileArtifactMetadata(
        badging.replace("com.dwarvendepths.game", "com.example.game"),
        permissions,
        manifestTree
      )
    ).toThrow(/application ID/);
  });

  it("rejects merged providers, receivers, services, and URI grants", () => {
    expect(() =>
      validateMobileArtifactMetadata(
        badging,
        permissions,
        `${manifestTree}          E: service (line=50)
            A: http://schemas.android.com/apk/res/android:name(0x01010003)="com.example.AuthorityService"
            A: http://schemas.android.com/apk/res/android:exported(0x01010010)=true
`
      )
    ).toThrow(/authority-free shell/);
    expect(() =>
      validateMobileArtifactMetadata(
        badging,
        permissions,
        manifestTree.replace(
          "exported(0x01010010)=false",
          "exported(0x01010010)=false\n            A: http://schemas.android.com/apk/res/android:grantUriPermissions(0x0101001b)=true"
        )
      )
    ).toThrow(/content URI permissions/);
    expect(() =>
      validateMobileArtifactMetadata(
        badging,
        permissions,
        manifestTree.replace(
          "com.dwarvendepths.game.androidx-startup",
          "attacker.authority"
        )
      )
    ).toThrow(/authority-free shell/);
  });

  it("rejects signing and packaged production-asset drift", () => {
    expect(() =>
      validateMobileArtifactMetadata(
        badging,
        permissions,
        manifestTree,
        "different signer"
      )
    ).toThrow(/signing identity/);
    expect(() =>
      validateMobileArtifactMetadata(
        badging,
        permissions,
        manifestTree,
        "Signer #1 certificate SHA-256 digest: 3fe8701446bc27a303d3a8caa19737cc231860698dbc83eb87ad9da26f6b2031\nSigner #2 certificate SHA-256 digest: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      )
    ).toThrow(/signing identity/);
    expect(() =>
      validatePackagedWebAssets(
        new Map([
          ["index.html", "hash-a"],
          ["assets/worker.js", "tampered"]
        ]),
        new Map([
          ["assets/worker.js", "hash-b"],
          ["index.html", "hash-a"]
        ])
      )
    ).toThrow(/production web output/);
    expect(() =>
      validatePackagedWebAssets(
        new Map([
          ["assets/worker.js", "hash-b"],
          ["index.html", "hash-a"]
        ]),
        new Map([
          ["index.html", "hash-a"],
          ["assets/worker.js", "hash-b"]
        ])
      )
    ).not.toThrow();
  });
});
