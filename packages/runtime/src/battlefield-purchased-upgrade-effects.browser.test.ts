import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { battlefieldPurchasedUpgradeEffectParityEvidence } from "./battlefield-skill-effects.fixture.js";

const checksum =
  "ef44ba8d2ee98f3c8bec5d84647a731930afd3181d3c9159c5b6e3452a7da12b";

describe("purchased passive battlefield-effect browser parity", () => {
  it("matches literal Node deployment evidence", async () => {
    const evidence = await battlefieldPurchasedUpgradeEffectParityEvidence();
    expect(evidence.dwarf).toMatchObject({
      currentHealth: 315,
      maximumHealth: 315,
      basicAttack: { damage: 23 }
    });
    expect(evidence.repeatedIsEquivalent).toBe(true);
    expect(await canonicalHash(evidence)).toBe(checksum);
  });
});
