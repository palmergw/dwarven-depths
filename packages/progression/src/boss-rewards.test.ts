import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import {
  bossDeaths,
  bossRewardParityEvidence,
  bossRewards
} from "./boss-rewards.fixture.js";
import { createInitialProfile, resolveBossDeathRewards } from "./index.js";

const checksum =
  "c9fc9b96c08093059ab54dc529d4a38aae744aac461b7ed818c2b6689e53bcac";

describe("boss death rewards", () => {
  it("atomically commits rewards in stable boss order before same-step defeat", async () => {
    const evidence = bossRewardParityEvidence();
    expect(
      evidence.committed.decisions.map((decision) => decision.bossEntityId)
    ).toEqual([
      "entity.enemy.boss.ancient",
      "entity.enemy.boss.gatebreaker_captain"
    ]);
    expect(evidence.committed.profile).toEqual({
      schemaVersion: 1,
      revision: 1,
      forgeOre: 50,
      unlockedCharacterIds: [
        "character.deep_ranger",
        "character.iron_warden",
        "character.rune_smith"
      ],
      claimedRewardIds: [
        "reward.boss.ancient",
        "reward.boss.gatebreaker_captain"
      ]
    });
    expect(evidence.simultaneousTerminalOutcome).toMatchObject({
      livingDwarves: 0,
      terminalResult: "defeat",
      profile: {
        unlockedCharacterIds: expect.arrayContaining(["character.deep_ranger"])
      }
    });
    expect(await canonicalHash(evidence)).toBe(checksum);
  });

  it("makes a replayed authoritative boss death an explicit idempotent no-op", () => {
    const evidence = bossRewardParityEvidence();
    expect(evidence.replayed.decisions).toEqual([
      {
        schemaVersion: 1,
        eventId: "death.gatebreaker_captain",
        bossEntityId: "entity.enemy.boss.gatebreaker_captain",
        rewardId: "reward.boss.gatebreaker_captain",
        characterUnlockId: "character.deep_ranger",
        forgeOre: 0,
        status: "already_claimed",
        reason: "reward_previously_claimed"
      }
    ]);
    expect(evidence.replayed.profile).toEqual(evidence.committed.profile);
  });

  it("is input-order independent, detached, deeply immutable, and non-mutating", () => {
    const profile = createInitialProfile("character.iron_warden" as never);
    const request = {
      schemaVersion: 1 as const,
      profile,
      bossDeaths: [...bossDeaths].reverse(),
      rewards: [...bossRewards].reverse()
    };
    const before = structuredClone(request);
    const result = resolveBossDeathRewards(request);
    const forward = resolveBossDeathRewards({
      schemaVersion: 1,
      profile,
      bossDeaths,
      rewards: bossRewards
    });

    expect(result).toEqual(forward);
    expect(request).toEqual(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.profile)).toBe(true);
    expect(Object.isFrozen(result.profile.unlockedCharacterIds)).toBe(true);
    expect(Object.isFrozen(result.profile.claimedRewardIds)).toBe(true);
    expect(Object.isFrozen(result.decisions)).toBe(true);
    expect(Object.isFrozen(result.decisions[0])).toBe(true);
  });

  it("rejects duplicate death evidence and integer overflow atomically", () => {
    const profile = createInitialProfile("character.iron_warden" as never);
    expect(() =>
      resolveBossDeathRewards({
        schemaVersion: 1,
        profile,
        bossDeaths: [bossDeaths[0], bossDeaths[0]],
        rewards: bossRewards
      })
    ).toThrow("duplicate boss death event ID");

    const nearLimit = {
      ...profile,
      forgeOre: Number.MAX_SAFE_INTEGER - 10
    };
    const before = structuredClone(nearLimit);
    expect(() =>
      resolveBossDeathRewards({
        schemaVersion: 1,
        profile: nearLimit,
        bossDeaths: [bossDeaths[0]],
        rewards: bossRewards
      })
    ).toThrow("Forge Ore total exceeds safe integer range");
    expect(nearLimit).toEqual(before);
  });

  it("strictly rejects unknown boss rewards and malformed records", () => {
    const profile = createInitialProfile("character.iron_warden" as never);
    expect(() =>
      resolveBossDeathRewards({
        schemaVersion: 1,
        profile,
        bossDeaths: [bossDeaths[0]],
        rewards: [bossRewards[0]]
      })
    ).toThrow("boss death has no configured reward");
    expect(() =>
      resolveBossDeathRewards({
        schemaVersion: 1,
        profile,
        bossDeaths: [{ ...bossDeaths[0], unexpected: true } as never],
        rewards: bossRewards
      })
    ).toThrow("must contain exactly");
  });
});
