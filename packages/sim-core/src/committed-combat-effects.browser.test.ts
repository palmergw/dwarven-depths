import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import {
  committedCombatEffectParityEvidence,
  committedHealingEffect,
  committedStatusEffect
} from "./committed-combat-effects.fixture.js";
import { resolveCommittedCombatEffects } from "./index.js";

describe("committed combat effect browser parity", () => {
  it("pins capped healing, status refresh, and zero-health discard evidence", async () => {
    const evidence = committedCombatEffectParityEvidence();
    expect(evidence.healingResolutions[0]?.appliedHealing).toBe(3);
    expect(evidence.statuses[0]?.magnitude).toBe(8);
    expect(
      evidence.decisions.some((decision) => decision.status === "discarded")
    ).toBe(true);
    expect(await canonicalHash(evidence)).toBe(
      "d7c56f09047cd6d1abf972424f5ea78cbe4b181c778b3496e2c9fd86cfd8194c"
    );
  });

  it("is independent of effect-family input order", () => {
    const request = {
      currentTick: 12,
      healingEffects: [
        { ...committedHealingEffect, effectId: "effect.heal.zulu" as never },
        { ...committedHealingEffect, effectId: "effect.heal.alpha" as never }
      ],
      statusEffects: [
        { ...committedStatusEffect, effectId: "effect.status.zulu" as never },
        { ...committedStatusEffect, effectId: "effect.status.alpha" as never }
      ],
      combatants: [
        {
          schemaVersion: 1 as const,
          entityId: "entity.dwarf.warden" as never,
          currentHealth: 17,
          maximumHealth: 20
        }
      ],
      statuses: []
    };
    expect(resolveCommittedCombatEffects(request)).toEqual(
      resolveCommittedCombatEffects({
        ...request,
        healingEffects: [...request.healingEffects].reverse(),
        statusEffects: [...request.statusEffects].reverse()
      })
    );
  });
});
