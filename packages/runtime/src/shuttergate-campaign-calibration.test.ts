import { compileContent } from "@dwarven-depths/content-runtime";
import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import shuttergateInput from "../../../content/fixtures/phase-3-shuttergate.json" with {
  type: "json"
};
import {
  createShuttergateCampaignAuthority,
  runShuttergateCampaignTransition
} from "./shuttergate-campaign.js";
import { createShuttergateCampaignCalibrationReport } from "./shuttergate-campaign-calibration.js";

async function threeAttemptReport() {
  const content = await compileContent(shuttergateInput);
  let authority = createShuttergateCampaignAuthority();
  for (let index = 0; index < 3; index += 1) {
    authority = (await runShuttergateCampaignTransition(content, authority))
      .authority;
  }
  return createShuttergateCampaignCalibrationReport(authority);
}

describe("Shuttergate campaign calibration report", () => {
  it("records ordered attempts and an observed purchased-build delta", async () => {
    const report = await threeAttemptReport();

    expect(report).toMatchObject({
      schemaVersion: 1,
      campaignId: "campaign.shuttergate.v1",
      attemptCount: 3,
      comparison: {
        baselineAttemptNumber: 1,
        upgradedAttemptNumber: 3,
        terminalTickDelta: 40,
        defeatedEnemyDelta: 0,
        observation: "survived_longer"
      }
    });
    expect(report.attempts).toEqual([
      expect.objectContaining({
        attemptNumber: 1,
        buildId: "build.profile.new_campaign.v1",
        terminalTick: 1833,
        forgeOreAwarded: 8,
        purchasedUpgradeId: null
      }),
      expect.objectContaining({
        attemptNumber: 2,
        buildId: "build.profile.new_campaign.v1",
        purchasedUpgradeId: "upgrade.ability.shield_slam",
        purchasedUpgradeRank: 1
      }),
      expect.objectContaining({
        attemptNumber: 3,
        buildId: "build.warden.shield_slam_rank_1.v1",
        terminalTick: 1873
      })
    ]);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.attempts)).toBe(true);
    expect(Object.isFrozen(report.attempts[0])).toBe(true);
    expect(await canonicalHash(report)).toBe(
      "f797acbc3a071e569a9ddbc3ee8e88808ef5889db13afa807e94e199deb27ced"
    );
  }, 45_000);

  it("does not invent a comparison before a purchased build is attempted", async () => {
    const content = await compileContent(shuttergateInput);
    const first = await runShuttergateCampaignTransition(
      content,
      createShuttergateCampaignAuthority()
    );
    const report = createShuttergateCampaignCalibrationReport(first.authority);

    expect(report.attemptCount).toBe(1);
    expect(report.comparison).toBeNull();
  }, 15_000);
});
