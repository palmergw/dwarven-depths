import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { battlefieldPurchasedUpgradeEffectParityEvidence } from "./battlefield-skill-effects.fixture.js";

const checksum =
  "f905d044118c2ff965dfbf020d1fa28844a8c630296899dbf4fc03129f8f5fcb";

describe("purchased passive battlefield effects", () => {
  it("deploys absolute purchased modifiers and reapplies idempotently", async () => {
    const evidence = await battlefieldPurchasedUpgradeEffectParityEvidence();
    expect(evidence.modifiers).toEqual([
      {
        schemaVersion: 1,
        characterId: "character.iron_warden",
        maximumHealthAdd: 50,
        attackDamageAdd: 2,
        attackRangeAdd: 0,
        futureCooldownReductionTicks: 0,
        sourceUpgradeIds: ["upgrade.ability.shield_slam"]
      }
    ]);
    expect(evidence.dwarf).toMatchObject({
      currentHealth: 290,
      maximumHealth: 290,
      basicAttack: { damage: 20, range: 2, cooldownTicks: 24 }
    });
    expect(evidence.repeatedIsEquivalent).toBe(true);
    expect(Object.isFrozen(evidence.dwarf)).toBe(true);
    expect(await canonicalHash(evidence)).toBe(checksum);
  });
});
