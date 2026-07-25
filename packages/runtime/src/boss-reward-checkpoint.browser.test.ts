import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { bossRewardCheckpointParityEvidence } from "./boss-reward-checkpoint.fixture.js";

const checksum =
  "f4507f8138d4ac612804c7a3918bbc3811ae2a8ce0373aca9e495a536912d49b";

describe("boss reward checkpoint browser parity", () => {
  it("matches literal simultaneous-death Node evidence", async () => {
    const evidence = bossRewardCheckpointParityEvidence();
    expect(evidence.terminalEvaluation.terminalResult).toBe("defeat");
    expect(evidence.bossRewards.profile.unlockedCharacterIds).toContain(
      "character.deep_ranger"
    );
    expect(await canonicalHash(evidence)).toBe(checksum);
  });
});
