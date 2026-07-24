import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import {
  characterExperienceParityEvidence,
  characterLevelThresholds
} from "./character-experience.fixture.js";
import { applyCharacterExperienceAward } from "./character-experience.js";

const checksum =
  "d00672f67090794f4b6b32058b3c1130daa9e8e8ba4ad1dec8298a20ae62ba40";

function initialState() {
  return {
    schemaVersion: 1 as const,
    characterId: "character.iron_warden" as never,
    experience: 0,
    level: 1,
    pendingSkillPointLevels: []
  };
}

describe("character experience awards", () => {
  it("crosses every due threshold and retains deferred pending points", async () => {
    const evidence = characterExperienceParityEvidence();

    expect(evidence.first.state).toEqual({
      schemaVersion: 1,
      characterId: "character.iron_warden",
      experience: 260,
      level: 3,
      pendingSkillPointLevels: [2, 3]
    });
    expect(evidence.first.decision.reason).toBe("level_thresholds_crossed");
    expect(evidence.deferred.state).toEqual({
      schemaVersion: 1,
      characterId: "character.iron_warden",
      experience: 600,
      level: 4,
      pendingSkillPointLevels: [2, 3, 4]
    });
    expect(evidence.zero.decision.reason).toBe("no_experience_awarded");
    expect(await canonicalHash(evidence)).toBe(checksum);
  });

  it("is threshold-order independent, detached, immutable, and non-mutating", () => {
    const request = {
      schemaVersion: 1 as const,
      state: initialState(),
      experienceAward: 250,
      thresholds: characterLevelThresholds
    };
    const before = structuredClone(request);
    const result = applyCharacterExperienceAward(request);
    const ordered = applyCharacterExperienceAward({
      ...request,
      thresholds: [...characterLevelThresholds].sort(
        (left, right) => left.level - right.level
      )
    });

    expect(result).toEqual(ordered);
    expect(request).toEqual(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.state)).toBe(true);
    expect(Object.isFrozen(result.state.pendingSkillPointLevels)).toBe(true);
    expect(Object.isFrozen(result.decision)).toBe(true);
    expect(Object.isFrozen(result.decision.gainedSkillPointLevels)).toBe(true);
  });

  it("continues accumulating experience at the maximum authored level", () => {
    const result = applyCharacterExperienceAward({
      schemaVersion: 1,
      state: {
        schemaVersion: 1,
        characterId: "character.iron_warden" as never,
        experience: 600,
        level: 4,
        pendingSkillPointLevels: [4]
      },
      experienceAward: 25,
      thresholds: characterLevelThresholds
    });

    expect(result.state).toMatchObject({ experience: 625, level: 4 });
    expect(result.decision).toMatchObject({
      gainedSkillPointLevels: [],
      reason: "experience_awarded"
    });
  });

  it("rejects incoherent state, malformed thresholds, and unearned points", () => {
    expect(() =>
      applyCharacterExperienceAward({
        schemaVersion: 1,
        state: { ...initialState(), experience: 100 },
        experienceAward: 0,
        thresholds: characterLevelThresholds
      })
    ).toThrow("level does not match authored thresholds");
    expect(() =>
      applyCharacterExperienceAward({
        schemaVersion: 1,
        state: initialState(),
        experienceAward: 0,
        thresholds: characterLevelThresholds.filter(
          (threshold) => threshold.level !== 2
        )
      })
    ).toThrow("contiguous levels beginning at 1");
    expect(() =>
      applyCharacterExperienceAward({
        schemaVersion: 1,
        state: { ...initialState(), pendingSkillPointLevels: [2] },
        experienceAward: 0,
        thresholds: characterLevelThresholds
      })
    ).toThrow("pending skill point level is not earned");
  });

  it("rejects sparse arrays, unknown fields, duplicates, and overflow atomically", () => {
    const sparse = [...characterLevelThresholds] as Array<
      (typeof characterLevelThresholds)[number]
    >;
    delete sparse[1];
    expect(() =>
      applyCharacterExperienceAward({
        schemaVersion: 1,
        state: initialState(),
        experienceAward: 0,
        thresholds: sparse
      })
    ).toThrow("dense data array");
    expect(() =>
      applyCharacterExperienceAward({
        schemaVersion: 1,
        state: { ...initialState(), unexpected: true } as never,
        experienceAward: 0,
        thresholds: characterLevelThresholds
      })
    ).toThrow("must contain exactly");
    expect(() =>
      applyCharacterExperienceAward({
        schemaVersion: 1,
        state: {
          ...initialState(),
          experience: 250,
          level: 3,
          pendingSkillPointLevels: [2, 2]
        },
        experienceAward: 0,
        thresholds: characterLevelThresholds
      })
    ).toThrow("duplicate pending skill point levels");
    const nearLimit = {
      ...initialState(),
      experience: Number.MAX_SAFE_INTEGER,
      level: 4
    };
    const before = structuredClone(nearLimit);
    expect(() =>
      applyCharacterExperienceAward({
        schemaVersion: 1,
        state: nearLimit,
        experienceAward: 1,
        thresholds: characterLevelThresholds
      })
    ).toThrow("experience total exceeds safe integer range");
    expect(nearLimit).toEqual(before);
  });
});
