import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { progressionRecycleParityEvidence } from "./recycle-transactions.fixture.js";

const checksum =
  "9da0970183c122f663fec57deab382185e8d1452a7493dcfe589704f90dd6c31";

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
