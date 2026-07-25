import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { bossRewardCheckpointParityEvidence } from "./boss-reward-checkpoint.fixture.js";
import { resolveBossRewardCheckpoint } from "./boss-reward-checkpoint.js";
import { terminalEvaluationRequest } from "./terminal-evaluation.fixture.js";

const checksum =
  "93a14497e18a90a06b102c6562da918c19df202980d9ebc1f8143c1a79638452";

describe("boss reward and terminal checkpoint", () => {
  it("commits the boss unlock before evaluating same-step defeat", async () => {
    const result = bossRewardCheckpointParityEvidence();
    expect(result).toMatchObject({
      schemaVersion: 1,
      terminalEvaluation: {
        livingDwarves: 0,
        terminalResult: "defeat",
        reason: "all_dwarves_downed"
      },
      bossRewards: {
        profile: {
          forgeOre: 20,
          unlockedCharacterIds: [
            "character.deep_ranger",
            "character.iron_warden"
          ],
          unlockedItemIds: [],
          claimedRewardIds: ["reward.boss.gatebreaker_captain"]
        },
        decisions: [{ status: "claimed" }]
      }
    });
    expect(await canonicalHash(result)).toBe(checksum);
  });

  it("evaluates victory after rewards when no hostiles remain", () => {
    const defeated = bossRewardCheckpointParityEvidence();
    const result = resolveBossRewardCheckpoint({
      schemaVersion: 1,
      terminalEvaluation: terminalEvaluationRequest(),
      bossRewards: {
        schemaVersion: 1,
        profile: defeated.bossRewards.profile,
        bossDeaths: [],
        rewards: []
      }
    });
    expect(result).toMatchObject({
      terminalEvaluation: {
        livingDwarves: 1,
        terminalResult: "victory",
        reason: "victory_conditions_met"
      }
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("strictly rejects malformed checkpoint requests", () => {
    const current = bossRewardCheckpointParityEvidence();
    expect(() =>
      resolveBossRewardCheckpoint({
        schemaVersion: 1,
        terminalEvaluation: {} as never,
        bossRewards: {
          schemaVersion: 1,
          profile: current.bossRewards.profile,
          bossDeaths: [],
          rewards: []
        }
      })
    ).toThrow("terminal evaluation request must contain exactly");
  });
});
