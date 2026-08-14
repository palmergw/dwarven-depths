import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { purchasedUpgradeParityEvidence } from "./purchased-upgrades.fixture.js";

const checksum =
  "0ea66fd38bd25a329715e3039d3ea48f2a77e2937c4de6ca69fcb5c39498a7b0";

describe("Forge Ore purchase browser parity", () => {
  it("matches the literal Node evidence checksum", async () => {
    const evidence = purchasedUpgradeParityEvidence();
    expect(evidence.shieldRankOne.decision.purchasedRank).toBe(1);
    expect(evidence.powderCask.decision.kind).toBe("item_rank");
    expect(evidence.shieldRankTwo.profile.forgeOre).toBe(10);
    expect(evidence.modifiers[0]).toMatchObject({
      maximumHealthAdd: 630,
      attackDamageAdd: 2,
      attackRangeAdd: 4
    });
    expect(await canonicalHash(evidence)).toBe(checksum);
  });
});
