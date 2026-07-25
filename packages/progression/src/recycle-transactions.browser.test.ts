import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { progressionRecycleParityEvidence } from "./recycle-transactions.fixture.js";

const checksum =
  "fde8ef18f09d63c95e111cf6b6e92d59b5b84724e8e64813ae4f01edac87a0fe";

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
