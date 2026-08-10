import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { purchasedUpgradeParityEvidence } from "./purchased-upgrades.fixture.js";

const checksum =
  "fd7baf9c5c223913fdb4e8808e382f05dea27e8d09072ebf1d2c775c9d893697";

describe("Forge Ore purchase browser parity", () => {
  it("matches the literal Node evidence checksum", async () => {
    const evidence = purchasedUpgradeParityEvidence();
    expect(evidence.shieldRankOne.decision.purchasedRank).toBe(1);
    expect(evidence.powderCask.decision.kind).toBe("item_rank");
    expect(evidence.shieldRankTwo.profile.forgeOre).toBe(10);
    expect(evidence.modifiers[0]).toMatchObject({
      maximumHealthAdd: 790,
      attackDamageAdd: 2,
      attackRangeAdd: 4
    });
    expect(await canonicalHash(evidence)).toBe(checksum);
  });
});
