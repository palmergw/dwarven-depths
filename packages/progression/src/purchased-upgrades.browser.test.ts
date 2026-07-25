import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { purchasedUpgradeParityEvidence } from "./purchased-upgrades.fixture.js";

const checksum =
  "b5fe422ab5ab0465f94d8c3dcc3a2cc332b17fb967870f9af7e6889774c602ee";

describe("Forge Ore purchase browser parity", () => {
  it("matches the literal Node evidence checksum", async () => {
    const evidence = purchasedUpgradeParityEvidence();
    expect(evidence.shieldRankOne.decision.purchasedRank).toBe(1);
    expect(evidence.powderCask.decision.kind).toBe("item_rank");
    expect(evidence.shieldRankTwo.profile.forgeOre).toBe(10);
    expect(await canonicalHash(evidence)).toBe(checksum);
  });
});
