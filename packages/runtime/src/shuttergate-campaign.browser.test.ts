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

describe("authoritative Shuttergate campaign browser parity", () => {
  it("matches four literal campaign transitions through victory", async () => {
    const content = await compileContent(shuttergateInput);
    const first = await runShuttergateCampaignTransition(
      content,
      createShuttergateCampaignAuthority()
    );
    const second = await runShuttergateCampaignTransition(
      content,
      first.authority
    );
    const third = await runShuttergateCampaignTransition(
      content,
      second.authority
    );
    const fourth = await runShuttergateCampaignTransition(
      content,
      third.authority
    );

    expect(
      await canonicalHash({
        first: first.transition,
        second: second.transition,
        third: third.transition,
        fourth: fourth.transition
      })
    ).toBe("991b5b3ed50311a68904bad712bb43d64afd189d08491e8d71b62138b05ba4cc");
    expect(fourth.transition.encounter.calibration).toMatchObject({
      terminalResult: "victory",
      bossRewardClaimed: true,
      deepRangerUnlocked: true
    });
    expect(
      await canonicalHash(
        createShuttergateCampaignCalibrationReport(fourth.authority)
      )
    ).toBe("8566b76f2c82066b9faa423aad25134e1fe8b689ec3379d594d7b3fbc32ad320");
  }, 360_000);
});
