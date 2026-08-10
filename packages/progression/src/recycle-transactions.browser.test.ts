import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { progressionRecycleParityEvidence } from "./recycle-transactions.fixture.js";

const checksum =
  "5239eb2233653c3ec3c36cc563d42f282afbff19a37637e673c82adbc2701c10";

describe("progression recycle browser parity", () => {
  it("matches the literal Node evidence checksum", async () => {
    const evidence = progressionRecycleParityEvidence();
    expect(evidence.character.decision.refundedSkillPointLevels).toEqual([
      2, 3
    ]);
    expect(evidence.shared.decision.refundedForgeOre).toBe(25);
    expect(evidence.shared.campaignAccess.unlockedLevelIds).toEqual([
      "level.shuttergate"
    ]);
    expect(await canonicalHash(evidence)).toBe(checksum);
  });
});
