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
  "6c6bbe2fc79b809a88dc32dd2bd166e52e39c96c633c3e0a24bc8dd286c40832";

describe("dwarf action phase", () => {
  it("starts, retains, commits, and cools down an authored basic attack", async () => {
    const evidence = await dwarfActionPhaseParityEvidence();
    expect(evidence.started.decisions[0]).toMatchObject({
      status: "winding_up",
      reason: "basic_attack_started",
      attackId: "attack.iron_warden_basic.dwarf.warden.source_length_12.tick_6",
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
        attackId:
          "attack.iron_warden_basic.dwarf.warden.source_length_12.tick_6",
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
        attackId:
          "attack.iron_warden_basic.dwarf.warden.source_length_12.tick_6",
        impactAtTick: 16
      })
    ]);
    expect(
      evidence.enemyPhase.battlefield.pendingCommittedAttacks
    ).toContainEqual(
      expect.objectContaining({
        attackId:
          "attack.iron_warden_basic.dwarf.warden.source_length_12.tick_6"
      })
    );
    expect(
      evidence.battlefieldPhase.state.battlefield?.pendingCommittedAttacks
    ).toEqual(evidence.enemyPhase.battlefield.pendingCommittedAttacks);
    expect(
      evidence.scheduledPhase.state.battlefield?.pendingCommittedAttacks
    ).toEqual(evidence.enemyPhase.battlefield.pendingCommittedAttacks);
    expect(evidence.substitutionError).toContain(
      "do not match authoritative pending attacks"
    );
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

  it("rejects deleting an authoritative pending attack", async () => {
    const evidence = await dwarfActionPhaseFixture();
    const deleted = {
      ...evidence.coolingDown.battlefield,
      pendingCommittedAttacks: []
    };
    propagateBattlefieldRoundLineage(evidence.coolingDown.battlefield, deleted);
    expect(() =>
      resolveDwarfActionPhase(
        {
          schemaVersion: 1,
          currentTick: 15,
          levelId: "level.conformance_map" as never,
          battlefield: deleted,
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
    ).toThrow("do not match authoritative pending attacks");
  });

  it("rejects caller-authored dwarf health and lifecycle transitions", async () => {
    const evidence = await dwarfActionPhaseFixture();
    for (const [source, currentTick] of [
      [evidence.base.readyToCommit, 6],
      [evidence.started.battlefield, 10]
    ] as const) {
      const substituted = {
        ...source,
        occupancy: source.occupancy.filter(
          (occupant) => occupant.entityId !== "entity.dwarf.warden"
        ),
        dwarfCombatants: source.dwarfCombatants.map((dwarf) => ({
          ...dwarf,
          currentHealth: 0,
          lifecycleState: "downed" as const
        }))
      };
      propagateBattlefieldRoundLineage(source, substituted);
      expect(() =>
        resolveDwarfActionPhase(
          {
            schemaVersion: 1,
            currentTick,
            levelId: "level.conformance_map" as never,
            battlefield: substituted,
            entries: []
          },
          evidence.base.content,
          evidence.base.deploymentAuthority
        )
      ).toThrow(
        "health/lifecycle does not match authoritative battlefield evidence"
      );
    }
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
            battlefield: base.readyToCommit,
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
