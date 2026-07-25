import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { progressionRecycleParityEvidence } from "./recycle-transactions.fixture.js";

const checksum =
  "b9d540f8a0ec849e533d590c20f2c5e1359e2e7e78054e4221243dc0df4d176b";

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
