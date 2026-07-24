import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { characterExperienceParityEvidence } from "./character-experience.fixture.js";

const checksum =
  "d00672f67090794f4b6b32058b3c1130daa9e8e8ba4ad1dec8298a20ae62ba40";

describe("character experience browser parity", () => {
  it("matches the literal Node evidence checksum", async () => {
    const evidence = characterExperienceParityEvidence();
    expect(evidence.first.decision.gainedSkillPointLevels).toEqual([2, 3]);
    expect(evidence.deferred.state.pendingSkillPointLevels).toEqual([2, 3, 4]);
    expect(evidence.zero.state).toEqual(evidence.deferred.state);
    expect(await canonicalHash(evidence)).toBe(checksum);
  });
});
