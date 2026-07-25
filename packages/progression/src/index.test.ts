import { describe, expect, it } from "vitest";
import { createInitialProfile } from "./index.js";

describe("progression profile", () => {
  it("creates an immutable initial profile", () => {
    const profile = createInitialProfile("character.iron_warden" as never);

    expect(profile).toEqual({
      schemaVersion: 1,
      revision: 0,
      forgeOre: 0,
      unlockedCharacterIds: ["character.iron_warden"],
      claimedRewardIds: [],
      characterExperienceStates: [
        {
          schemaVersion: 1,
          characterId: "character.iron_warden",
          experience: 0,
          level: 1,
          pendingSkillPointLevels: []
        }
      ],
      claimedExperienceRewardEvents: []
    });
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.unlockedCharacterIds)).toBe(true);
    expect(Object.isFrozen(profile.claimedRewardIds)).toBe(true);
    expect(Object.isFrozen(profile.characterExperienceStates)).toBe(true);
    expect(Object.isFrozen(profile.characterExperienceStates[0])).toBe(true);
    expect(Object.isFrozen(profile.claimedExperienceRewardEvents)).toBe(true);
  });
});
