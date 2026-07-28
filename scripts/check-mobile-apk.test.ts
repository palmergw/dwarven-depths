import { describe, expect, it } from "vitest";
import { validateMobileArtifactMetadata } from "./check-mobile-apk.mjs";

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

describe("built mobile artifact contract", () => {
  it("accepts only the expected debug APK identity and app-scoped guard", () => {
    expect(() =>
      validateMobileArtifactMetadata(badging, permissions)
    ).not.toThrow();
  });

  it("rejects system or plugin permissions", () => {
    expect(() =>
      validateMobileArtifactMetadata(
        badging,
        `${permissions}uses-permission: name='android.permission.INTERNET'\n`
      )
    ).toThrow(/only the app-scoped signature guard/);
  });

  it("rejects release-channel or identity drift", () => {
    expect(() =>
      validateMobileArtifactMetadata(
        badging.replace("application-debuggable\n", ""),
        permissions
      )
    ).toThrow(/debug-only/);
    expect(() =>
      validateMobileArtifactMetadata(
        badging.replace("com.dwarvendepths.game", "com.example.game"),
        permissions
      )
    ).toThrow(/application ID/);
  });
});
