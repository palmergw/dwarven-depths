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
      claimedRewardIds: []
    });
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.unlockedCharacterIds)).toBe(true);
    expect(Object.isFrozen(profile.claimedRewardIds)).toBe(true);
  });
});
