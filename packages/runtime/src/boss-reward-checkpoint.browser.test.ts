import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { bossRewardCheckpointParityEvidence } from "./boss-reward-checkpoint.fixture.js";

const checksum =
  "67138e5e71564a3481cb916d3457fa8a035c0550d4ccf6aed0b465cd94df9674";

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
