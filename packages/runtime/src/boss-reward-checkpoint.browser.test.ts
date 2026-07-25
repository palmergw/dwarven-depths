import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { bossRewardCheckpointParityEvidence } from "./boss-reward-checkpoint.fixture.js";

const checksum =
  "8550eba62969273be5c0746ad00ef01ffaf7c617e7fc343c2379b57b0697dc9c";

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
