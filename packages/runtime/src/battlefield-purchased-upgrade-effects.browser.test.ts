import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { battlefieldPurchasedUpgradeEffectParityEvidence } from "./battlefield-skill-effects.fixture.js";

const checksum =
  "f905d044118c2ff965dfbf020d1fa28844a8c630296899dbf4fc03129f8f5fcb";

describe("purchased passive battlefield-effect browser parity", () => {
  it("matches literal Node deployment evidence", async () => {
    const evidence = await battlefieldPurchasedUpgradeEffectParityEvidence();
    expect(evidence.dwarf).toMatchObject({
      currentHealth: 290,
      maximumHealth: 290,
      basicAttack: { damage: 20 }
    });
    expect(evidence.repeatedIsEquivalent).toBe(true);
    expect(await canonicalHash(evidence)).toBe(checksum);
  });
});
