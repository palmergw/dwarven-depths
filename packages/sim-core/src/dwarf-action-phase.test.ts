import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { battlefieldAttackImpactParityEvidence } from "./battlefield-attack-impact.fixture.js";
import { propagateBattlefieldRoundLineage } from "./battlefield-round-lineage.js";
import {
  dwarfActionPhaseFixture,
  dwarfActionPhaseParityEvidence
} from "./dwarf-action-phase.fixture.js";
import { resolveDwarfActionPhase } from "./index.js";

const checksum =
  "acb9b6c9bd0a43adbf589bebcd84f17328bbccc24899e495862c69556578018d";

describe("dwarf action phase", () => {
  it("starts, retains, commits, and cools down an authored basic attack", async () => {
    const evidence = await dwarfActionPhaseParityEvidence();
    expect(evidence.started.decisions[0]).toMatchObject({
      status: "winding_up",
      reason: "basic_attack_started",
      attackId: "attack.iron_warden_basic.dwarf.warden.tick_6",
      targetLock: {
        status: "reacquired",
        targetEntityId: "entity.enemy.cutter"
      }
    });
    expect(
      evidence.started.dwarfCombatants[0]?.actionState.activeBasicAttack
    ).toMatchObject({
      startedAtTick: 6,
      commitAtTick: 14,
      impactAtTick: 16,
      damage: 18,
      range: 2
    });
    expect(evidence.winding.decisions[0]?.reason).toBe(
      "basic_attack_winding_up"
    );
    expect(evidence.committed.committedAttacks).toContainEqual(
      expect.objectContaining({
        attackId: "attack.iron_warden_basic.dwarf.warden.tick_6",
        committedAtTick: 14,
        impactAtTick: 16,
        cooldownCompleteAtTick: 38
      })
    );
    expect(evidence.coolingDown.decisions[0]?.reason).toBe(
      "cooldown_in_progress"
    );
    expect(evidence.sourceDowned).toEqual([
      expect.objectContaining({
        attackId: "attack.iron_warden_basic.dwarf.warden.tick_6",
        impactAtTick: 16
      })
    ]);
  });

  it("rejects caller-substituted action state before transition", async () => {
    const evidence = await dwarfActionPhaseFixture();
    const forged = {
      ...evidence.coolingDown.battlefield,
      dwarfCombatants: evidence.coolingDown.battlefield.dwarfCombatants.map(
        (dwarf) => ({
          ...dwarf,
          actionState: { ...dwarf.actionState, currentTargetEntityId: null }
        })
      )
    };
    propagateBattlefieldRoundLineage(evidence.coolingDown.battlefield, forged);
    expect(() =>
      resolveDwarfActionPhase(
        {
          schemaVersion: 1,
          currentTick: 15,
          levelId: "level.conformance_map" as never,
          battlefield: forged,
          entries: [
            {
              schemaVersion: 1,
              dwarfEntityId: "entity.dwarf.warden" as never,
              requestedPolicy: "nearest"
            }
          ]
        },
        evidence.base.content,
        evidence.base.deploymentAuthority
      )
    ).toThrow("does not match accepted action evidence");
  });

  it("returns deeply frozen detached evidence and validates entries", async () => {
    const evidence = await dwarfActionPhaseParityEvidence();
    expect(Object.isFrozen(evidence.started)).toBe(true);
    expect(Object.isFrozen(evidence.started.battlefield)).toBe(true);
    expect(
      Object.isFrozen(evidence.started.dwarfCombatants[0]?.actionState)
    ).toBe(true);
    expect(Object.isFrozen(evidence.started.decisions[0]?.targetLock)).toBe(
      true
    );
  });

  it("requires exactly one policy entry for each active dwarf", async () => {
    const base = await battlefieldAttackImpactParityEvidence();
    const entry = {
      schemaVersion: 1 as const,
      dwarfEntityId: "entity.dwarf.warden" as never,
      requestedPolicy: "nearest" as const
    };
    for (const entries of [[], [entry, entry]])
      expect(() =>
        resolveDwarfActionPhase(
          {
            schemaVersion: 1,
            currentTick: 6,
            levelId: "level.conformance_map" as never,
            battlefield: base.committed,
            entries
          },
          base.content,
          base.deploymentAuthority
        )
      ).toThrow();
  });

  it("pins action evidence for browser parity", async () => {
    expect(await canonicalHash(await dwarfActionPhaseParityEvidence())).toBe(
      checksum
    );
  });
});
