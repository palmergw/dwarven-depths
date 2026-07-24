import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { characterExperienceParityEvidence } from "./character-experience.fixture.js";

const checksum =
  "001659a332f5547ff95ccb99b22e7266e9ea24179a1fae955ba36a36b068e0fd";

describe("character experience browser parity", () => {
  it("matches the literal Node evidence checksum", async () => {
    const evidence = characterExperienceParityEvidence();
    expect(evidence.first.decision.gainedSkillPointLevels).toEqual([2, 3]);
    expect(evidence.deferred.state.pendingSkillPointLevels).toEqual([2, 3, 4]);
    expect(evidence.zero.state).toEqual(evidence.deferred.state);
    expect(evidence.maximum.decision.reason).toBe(
      "experience_awarded_at_maximum_level"
    );
    expect(await canonicalHash(evidence)).toBe(checksum);
  });
});
