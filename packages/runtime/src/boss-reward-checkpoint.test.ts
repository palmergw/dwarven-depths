import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { bossRewardCheckpointParityEvidence } from "./boss-reward-checkpoint.fixture.js";
import { resolveBossRewardCheckpoint } from "./boss-reward-checkpoint.js";

const checksum =
  "651af89baf6ebefdb0f41ef08054d354b4b43255cfd97c59cc4129280a7f9b3f";

describe("boss reward and terminal checkpoint", () => {
  it("commits the boss unlock before evaluating same-step defeat", async () => {
    const result = bossRewardCheckpointParityEvidence();
    expect(result).toMatchObject({
      schemaVersion: 1,
      livingDwarves: 0,
      terminalResult: "defeat",
      reason: "all_dwarves_downed",
      bossRewards: {
        profile: {
          forgeOre: 20,
          unlockedCharacterIds: [
            "character.deep_ranger",
            "character.iron_warden"
          ],
          claimedRewardIds: ["reward.boss.gatebreaker_captain"]
        },
        decisions: [{ status: "claimed" }]
      }
    });
    expect(await canonicalHash(result)).toBe(checksum);
  });

  it("leaves terminal result unset while a dwarf remains alive", () => {
    const defeated = bossRewardCheckpointParityEvidence();
    const result = resolveBossRewardCheckpoint({
      schemaVersion: 1,
      livingDwarves: 1,
      bossRewards: {
        schemaVersion: 1,
        profile: defeated.bossRewards.profile,
        bossDeaths: [],
        rewards: []
      }
    });
    expect(result).toMatchObject({
      livingDwarves: 1,
      reason: "living_dwarves_remain"
    });
    expect(result).not.toHaveProperty("terminalResult");
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("strictly rejects malformed checkpoint requests", () => {
    expect(() =>
      resolveBossRewardCheckpoint({
        schemaVersion: 1,
        livingDwarves: -1,
        bossRewards: {} as never
      })
    ).toThrow("livingDwarves must be a non-negative safe integer");
  });
});
