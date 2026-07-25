import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { progressionRecycleParityEvidence } from "./recycle-transactions.fixture.js";

const checksum =
  "c3d521b2c7937db45f38bb9540127140d4551f22fe816ad8b8f163aa6c4cbd57";

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
