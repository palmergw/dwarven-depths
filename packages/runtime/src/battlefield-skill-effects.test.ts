import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import {
  battlefieldSkillEffectParityEvidence,
  battlefieldSkillEffectValidationEvidence
} from "./battlefield-skill-effects.fixture.js";

const checksum =
  "cbeb101b84a97c5c02a32cb76ed399ee1799294a8ccd5e93c0bd6f76be2623dd";

describe("live battlefield skill effects", () => {
  it("preserves missing health and committed work while updating future attacks", async () => {
    const evidence = await battlefieldSkillEffectParityEvidence();
    expect(evidence.upgradedDeployment).toMatchObject({
      currentHealth: 265,
      maximumHealth: 265,
      basicAttack: { damage: 21, range: 3, cooldownTicks: 22 }
    });
    const before = evidence.damagedBefore;
    const afterRoot = evidence.afterRoot.battlefield.dwarfCombatants[0];
    const afterSecond = evidence.afterSecond.battlefield.dwarfCombatants[0];
    if (
      before === undefined ||
      afterRoot === undefined ||
      afterSecond === undefined
    )
      throw new Error("expected Warden battlefield evidence");

    expect(before.maximumHealth - before.currentHealth).toBe(9);
    expect(afterRoot.maximumHealth - afterRoot.currentHealth).toBe(9);
    expect(afterRoot.basicAttack).toMatchObject({
      damage: 21,
      range: 2,
      cooldownTicks: 24
    });
    expect(afterSecond.basicAttack).toMatchObject({
      damage: 21,
      range: 3,
      cooldownTicks: 22
    });
    expect(afterSecond.actionState.cooldownCompleteAtTick).toBe(32);
    expect(evidence.committedAfter).toEqual(evidence.committedBefore);
    expect(evidence.committedAfter).toMatchObject({
      damage: 18,
      range: 2,
      cooldownCompleteAtTick: 32
    });
    expect(evidence.upgradedCommittedDwarf?.basicAttack).toMatchObject({
      damage: 21,
      range: 3,
      cooldownTicks: 22
    });
    expect(evidence.windupAfterUpgrade?.actionState.activeBasicAttack).toEqual(
      evidence.windupBefore?.actionState.activeBasicAttack
    );
    expect(evidence.windupCommitment).toMatchObject({
      committedAtTick: 8,
      cooldownCompleteAtTick: 32,
      damage: 18,
      range: 2
    });
    expect(evidence.nextWindup?.actionState.activeBasicAttack).toMatchObject({
      startedAtTick: 32,
      cooldownDurationTicks: 22,
      damage: 21,
      range: 3
    });
    expect(evidence.repeatedIsEquivalent).toBe(true);
    expect(Object.isFrozen(evidence.afterSecond.battlefield)).toBe(true);
    expect(Object.isFrozen(afterSecond.basicAttack)).toBe(true);
    expect(await canonicalHash(evidence)).toBe(checksum);
  });

  it("rejects incomplete, duplicate, overflowing, decreasing, and forged input atomically", async () => {
    const evidence = await battlefieldSkillEffectValidationEvidence();
    expect(evidence).toMatchObject({
      accessorTreeError:
        "battlefield skill-effect request skillTrees item 0 must be own enumerable data",
      accessorReads: 0,
      missingTreeError:
        "battlefield character modifiers must cover every deployed character",
      duplicateTreeError: "battlefield skill trees duplicate a character",
      overflowError:
        "modified character maximumHealth exceeds safe integer range",
      deploymentOverflowError:
        "modified character maximumHealth exceeds safe integer range",
      decreaseError: "live battlefield character modifiers cannot decrease",
      forgedError:
        "battlefield does not belong to the accepted preparation round",
      recoveredDwarf: {
        currentHealth: 265,
        maximumHealth: 265,
        basicAttack: { damage: 21, range: 3, cooldownTicks: 22 }
      },
      recoveredDeploymentDwarf: {
        currentHealth: 265,
        maximumHealth: 265,
        basicAttack: { damage: 21, range: 3, cooldownTicks: 22 }
      }
    });
  });
});
