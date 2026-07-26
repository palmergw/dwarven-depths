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
  return { content, initial, first, second, third };
}

describe("authoritative Shuttergate campaign transitions", () => {
  it("derives productive attempts and the first purchase from accepted authority", async () => {
    const { first, second, third } = await transitionPair();

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
    expect(third.authority.attempts).toHaveLength(3);
    expect(Object.isFrozen(third.authority)).toBe(true);
    expect(Object.isFrozen(third.authority.attempts)).toBe(true);
    expect("resolveAttemptProgressRewards" in progressionPublicApi).toBe(false);
    expect(
      await canonicalHash({
        first: first.transition,
        second: second.transition,
        third: third.transition
      })
    ).toBe("59e18f5342df481a4c64db3f98ef7e764fe878f903afb7dafea180995832d14e");
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
