import { compileContent } from "@dwarven-depths/content-runtime";
import { canonicalHash } from "@dwarven-depths/contracts";
import * as progressionPublicApi from "@dwarven-depths/progression";
import { describe, expect, it } from "vitest";
import shuttergateInput from "../../../content/fixtures/phase-3-shuttergate.json" with {
  type: "json"
};
import {
  createShuttergateCampaignAuthority,
  runShuttergateCampaignTransition
} from "./shuttergate-campaign.js";

async function transitionPair() {
  const content = await compileContent(shuttergateInput);
  const initial = createShuttergateCampaignAuthority();
  const first = await runShuttergateCampaignTransition(content, initial);
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
  return { content, initial, first, second, third, fourth };
}

describe("authoritative Shuttergate campaign transitions", () => {
  it("derives productive attempts and the first purchase from accepted authority", async () => {
    const { content, first, second, third, fourth } = await transitionPair();

    expect(first.transition).toMatchObject({
      schemaVersion: 1,
      attemptNumber: 1,
      attemptId: "attempt.shuttergate.campaign_000001",
      seed: "1",
      buildId: "build.profile.new_campaign.v1",
      rewardDecision: {
        status: "claimed",
        reason: "attempt_progress_reward_committed"
      },
      purchaseDecision: null
    });
    expect(first.transition.rewardDecision.forgeOre).toBeGreaterThan(0);
    expect(first.authority.profile.forgeOre).toBe(
      first.transition.rewardDecision.forgeOre
    );
    expect(second.transition).toMatchObject({
      attemptNumber: 2,
      attemptId: "attempt.shuttergate.campaign_000002",
      seed: "2",
      buildId: "build.profile.new_campaign.v1",
      purchaseDecision: {
        upgradeId: "upgrade.ability.shield_slam",
        purchasedRank: 1,
        status: "purchased"
      }
    });
    expect(third.transition).toMatchObject({
      attemptNumber: 3,
      attemptId: "attempt.shuttergate.campaign_000003",
      seed: "3",
      buildId: "build.warden.shield_slam_rank_1.v1"
    });
    expect(third.transition.encounter.calibration).toMatchObject({
      placementPointId: "placement.shuttergate_north_guard",
      terminalResult: "defeat",
      deepestStartedWaveId: "wave.shuttergate_5"
    });
    expect(third.authority.profile).toMatchObject({
      forgeOre: 48,
      claimedRewardIds: expect.arrayContaining([
        "reward.boss.gatebreaker_captain"
      ]),
      unlockedCharacterIds: expect.arrayContaining(["character.deep_ranger"])
    });
    expect(fourth.transition).toMatchObject({
      attemptNumber: 4,
      attemptId: "attempt.shuttergate.campaign_000004",
      seed: "4",
      placementPointId: "placement.shuttergate_keep_guard",
      buildId: "build.warden.shield_slam_rank_1.v1"
    });
    expect(fourth.transition.encounter.calibration).toMatchObject({
      terminalResult: "victory",
      bossRewardClaimed: true,
      deepRangerUnlocked: true
    });
    expect(fourth.authority.profile).toMatchObject({
      forgeOre: 71,
      claimedRewardIds: expect.arrayContaining([
        "reward.boss.gatebreaker_captain"
      ]),
      unlockedCharacterIds: expect.arrayContaining(["character.deep_ranger"])
    });
    expect(fourth.authority.attempts).toHaveLength(4);
    expect(Object.isFrozen(fourth.authority)).toBe(true);
    expect(Object.isFrozen(fourth.authority.attempts)).toBe(true);
    await expect(
      runShuttergateCampaignTransition(content, fourth.authority)
    ).rejects.toThrow("campaign already ended in victory");
    expect("resolveAttemptProgressRewards" in progressionPublicApi).toBe(false);
    expect(
      await canonicalHash({
        first: first.transition,
        second: second.transition,
        third: third.transition,
        fourth: fourth.transition
      })
    ).toBe("991b5b3ed50311a68904bad712bb43d64afd189d08491e8d71b62138b05ba4cc");
  }, 45_000);

  it("consumes accepted authority exactly once and rejects clones", async () => {
    const content = await compileContent(shuttergateInput);
    const initial = createShuttergateCampaignAuthority();
    const pending = runShuttergateCampaignTransition(content, initial);

    await expect(
      runShuttergateCampaignTransition(content, initial)
    ).rejects.toThrow("already consumed or in progress");
    const committed = await pending;
    await expect(
      runShuttergateCampaignTransition(content, initial)
    ).rejects.toThrow("already consumed or in progress");
    await expect(
      runShuttergateCampaignTransition(content, {
        ...committed.authority,
        profile: { ...committed.authority.profile, forgeOre: 999 }
      } as never)
    ).rejects.toThrow("not accepted campaign authority");
  }, 15_000);

  it("does not consume authority when encounter validation fails", async () => {
    const content = await compileContent(shuttergateInput);
    const initial = createShuttergateCampaignAuthority();
    const forged = {
      ...content,
      manifestHash: "0".repeat(64),
      bundle: { ...content.bundle, schemaVersion: 999 }
    } as never;

    await expect(
      runShuttergateCampaignTransition(forged, initial)
    ).rejects.toThrow();
    const recovered = await runShuttergateCampaignTransition(content, initial);
    expect(recovered.transition.attemptNumber).toBe(1);
  }, 15_000);
});
