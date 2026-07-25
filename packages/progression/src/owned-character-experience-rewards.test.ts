import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { characterLevelThresholds } from "./character-experience.fixture.js";
import {
  createInitialProfile,
  resolveBossDeathRewards,
  resolveOwnedCharacterExperienceRewards
} from "./index.js";
import {
  ownedCharacterExperienceRewardParityEvidence,
  ownedExperienceEvents,
  ownedExperienceThresholdSets
} from "./owned-character-experience-rewards.fixture.js";

const checksum =
  "f543d8d6bddc3b7e5b5d5d837267cad8565fcd85804743b5242590eff6361e89";

describe("owned character experience rewards", () => {
  it("commits ordered event ownership into persistent character state", async () => {
    const evidence = ownedCharacterExperienceRewardParityEvidence();
    expect(evidence.committed.profile).toMatchObject({
      revision: 1,
      characterExperienceStates: [
        {
          characterId: "character.iron_warden",
          experience: 260,
          level: 3,
          pendingSkillPointLevels: [2, 3]
        }
      ],
      claimedExperienceRewardEvents: [
        {
          schemaVersion: 1,
          eventId: "event.reward.xp.wave_1",
          characterId: "character.iron_warden",
          experience: 90
        },
        {
          schemaVersion: 1,
          eventId: "event.reward.xp.wave_2",
          characterId: "character.iron_warden",
          experience: 170
        }
      ]
    });
    expect(
      evidence.committed.decisions.map((decision) => decision.eventId)
    ).toEqual(["event.reward.xp.wave_1", "event.reward.xp.wave_2"]);
    expect(evidence.replayed.decisions).toEqual([
      {
        schemaVersion: 1,
        eventId: "event.reward.xp.wave_2",
        characterId: "character.iron_warden",
        experience: 0,
        status: "already_claimed",
        reason: "experience_reward_previously_claimed",
        experienceDecision: null
      }
    ]);
    expect(evidence.replayed.profile).toEqual(evidence.committed.profile);
    expect(evidence.conflictingReplayError).toBe(
      "experience reward event conflicts with claimed ownership (event.reward.xp.wave_2)"
    );
    expect(await canonicalHash(evidence)).toBe(checksum);
  });

  it("is input-order independent, detached, immutable, and non-mutating", () => {
    const profile = createInitialProfile("character.iron_warden" as never);
    const request = {
      schemaVersion: 1 as const,
      profile,
      events: [...ownedExperienceEvents].reverse(),
      thresholdSets: [...ownedExperienceThresholdSets]
    };
    const before = structuredClone(request);
    const result = resolveOwnedCharacterExperienceRewards(request);
    const forward = resolveOwnedCharacterExperienceRewards({
      ...request,
      events: ownedExperienceEvents
    });
    expect(result).toEqual(forward);
    expect(request).toEqual(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.profile)).toBe(true);
    expect(Object.isFrozen(result.profile.characterExperienceStates)).toBe(
      true
    );
    expect(Object.isFrozen(result.profile.characterExperienceStates[0])).toBe(
      true
    );
    expect(Object.isFrozen(result.decisions)).toBe(true);
    expect(Object.isFrozen(result.decisions[0]?.experienceDecision)).toBe(true);
  });

  it("rejects duplicate, unknown-owner, missing-threshold, and overflow input atomically", () => {
    const profile = createInitialProfile("character.iron_warden" as never);
    const initialExperienceState = profile.characterExperienceStates[0];
    if (initialExperienceState === undefined)
      throw new Error(
        "initial profile must contain character experience state"
      );
    const before = structuredClone(profile);
    expect(() =>
      resolveOwnedCharacterExperienceRewards({
        schemaVersion: 1,
        profile,
        events: [ownedExperienceEvents[0], ownedExperienceEvents[0]],
        thresholdSets: ownedExperienceThresholdSets
      })
    ).toThrow("duplicate experience reward event ID");
    expect(() =>
      resolveOwnedCharacterExperienceRewards({
        schemaVersion: 1,
        profile,
        events: [
          {
            ...ownedExperienceEvents[0],
            characterId: "character.deep_ranger" as never
          }
        ],
        thresholdSets: ownedExperienceThresholdSets
      })
    ).toThrow("has no persistent state");
    expect(() =>
      resolveOwnedCharacterExperienceRewards({
        schemaVersion: 1,
        profile,
        events: [],
        thresholdSets: []
      })
    ).toThrow("has no authored thresholds");
    expect(() =>
      resolveOwnedCharacterExperienceRewards({
        schemaVersion: 1,
        profile: {
          ...profile,
          characterExperienceStates: [
            {
              ...initialExperienceState,
              experience: Number.MAX_SAFE_INTEGER,
              level: 4,
              pendingSkillPointLevels: [2, 3, 4]
            }
          ]
        },
        events: [
          {
            ...ownedExperienceEvents[0],
            experience: 1
          }
        ],
        thresholdSets: ownedExperienceThresholdSets
      })
    ).toThrow("experience total exceeds safe integer range");
    expect(profile).toEqual(before);
  });

  it("rejects conflicting threshold owners and malformed profile progression", () => {
    const profile = createInitialProfile("character.iron_warden" as never);
    const initialExperienceState = profile.characterExperienceStates[0];
    if (initialExperienceState === undefined)
      throw new Error(
        "initial profile must contain character experience state"
      );
    expect(() =>
      resolveOwnedCharacterExperienceRewards({
        schemaVersion: 1,
        profile,
        events: [],
        thresholdSets: [
          ...ownedExperienceThresholdSets,
          ...ownedExperienceThresholdSets
        ]
      })
    ).toThrow("duplicate character threshold owner");
    expect(() =>
      resolveOwnedCharacterExperienceRewards({
        schemaVersion: 1,
        profile,
        events: [],
        thresholdSets: [
          ...ownedExperienceThresholdSets,
          {
            schemaVersion: 1,
            characterId: "character.deep_ranger" as never,
            thresholds: [
              { schemaVersion: 1, level: 2, cumulativeExperience: 5 }
            ]
          }
        ]
      })
    ).toThrow("contiguous levels beginning at 1");
    expect(() =>
      resolveOwnedCharacterExperienceRewards({
        schemaVersion: 1,
        profile: {
          ...profile,
          characterExperienceStates: [
            { ...initialExperienceState, experience: 100 }
          ]
        },
        events: [],
        thresholdSets: ownedExperienceThresholdSets
      })
    ).toThrow("level does not match authored thresholds");
  });

  it("rejects a claimed event replayed for a different character", () => {
    const committed = ownedCharacterExperienceRewardParityEvidence().committed;
    const profile = {
      ...committed.profile,
      unlockedCharacterIds: [
        ...committed.profile.unlockedCharacterIds,
        "character.deep_ranger" as never
      ],
      characterExperienceStates: [
        ...committed.profile.characterExperienceStates,
        {
          schemaVersion: 1 as const,
          characterId: "character.deep_ranger" as never,
          experience: 0,
          level: 1,
          pendingSkillPointLevels: []
        }
      ]
    };
    const before = structuredClone(profile);
    expect(() =>
      resolveOwnedCharacterExperienceRewards({
        schemaVersion: 1,
        profile,
        events: [
          {
            ...ownedExperienceEvents[0],
            characterId: "character.deep_ranger" as never
          }
        ],
        thresholdSets: [
          ...ownedExperienceThresholdSets,
          {
            schemaVersion: 1,
            characterId: "character.deep_ranger" as never,
            thresholds: characterLevelThresholds
          }
        ]
      })
    ).toThrow("conflicts with claimed ownership");
    expect(profile).toEqual(before);
  });

  it("preserves owned XP and replay claims through boss profile transitions", () => {
    const owned = resolveOwnedCharacterExperienceRewards({
      schemaVersion: 1,
      profile: createInitialProfile("character.iron_warden" as never),
      events: ownedExperienceEvents,
      thresholdSets: ownedExperienceThresholdSets
    });
    const boss = resolveBossDeathRewards({
      schemaVersion: 1,
      profile: owned.profile,
      bossDeaths: [
        {
          schemaVersion: 1,
          eventId: "death.gatebreaker_captain" as never,
          bossEntityId: "entity.enemy.boss.gatebreaker_captain" as never
        }
      ],
      rewards: [
        {
          schemaVersion: 1,
          rewardId: "reward.boss.gatebreaker_captain" as never,
          bossEntityId: "entity.enemy.boss.gatebreaker_captain" as never,
          characterUnlockId: "character.deep_ranger" as never,
          forgeOre: 20
        }
      ]
    });
    expect(boss.profile.characterExperienceStates).toEqual(
      owned.profile.characterExperienceStates
    );
    expect(boss.profile.claimedExperienceRewardEvents).toEqual(
      owned.profile.claimedExperienceRewardEvents
    );
  });

  it("requires a strict versioned event shape", () => {
    expect(() =>
      resolveOwnedCharacterExperienceRewards({
        schemaVersion: 1,
        profile: createInitialProfile("character.iron_warden" as never),
        events: [{ ...ownedExperienceEvents[0], unexpected: true } as never],
        thresholdSets: [
          {
            schemaVersion: 1,
            characterId: "character.iron_warden" as never,
            thresholds: characterLevelThresholds
          }
        ]
      })
    ).toThrow("must contain exactly");
  });
});
