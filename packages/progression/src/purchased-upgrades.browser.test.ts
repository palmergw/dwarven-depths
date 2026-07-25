import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { purchasedUpgradeParityEvidence } from "./purchased-upgrades.fixture.js";

const checksum =
  "5e84ccbbdae87f2bf498e917c111e9030c0d84c49290ea4406d80273c1c1db85";

describe("Forge Ore purchase browser parity", () => {
  it("matches the literal Node evidence checksum", async () => {
    const evidence = purchasedUpgradeParityEvidence();
    expect(evidence.shieldRankOne.decision.purchasedRank).toBe(1);
    expect(evidence.powderCask.decision.kind).toBe("item_rank");
    expect(evidence.shieldRankTwo.profile.forgeOre).toBe(10);
    expect(evidence.modifiers[0]).toMatchObject({
      maximumHealthAdd: 50,
      attackDamageAdd: 2
    });
    expect(await canonicalHash(evidence)).toBe(checksum);
  });
});
