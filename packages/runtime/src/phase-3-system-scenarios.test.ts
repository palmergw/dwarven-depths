import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { createPhase3SystemScenarioEvidence } from "./phase-3-system-scenarios.js";

export const phase3SystemEvidenceChecksum =
  "41d406a0b441a55c09a221ebc39d6c4c53465b5ea436d8bff60457e69df3e507";

describe("Phase 3 combat system scenarios", () => {
  it("composes targeting, combat, lifecycle, rewards, and terminal evidence", async () => {
    const evidence = createPhase3SystemScenarioEvidence();

    expect(evidence.bossPath.targeting.decisions[0]).toMatchObject({
      targetLock: {
        status: "retained",
        targetEntityId: "entity.enemy.boss.gatebreaker_captain",
        previousTargetReason: "target_remains_valid"
      },
      commitment: { status: "committed", reason: "committed" }
    });
    expect(evidence.bossPath.impact.healthResolutions).toEqual([
      {
        schemaVersion: 1,
        entityId: "entity.enemy.boss.gatebreaker_captain",
        healthBefore: 20,
        incomingDamage: 20,
        appliedDamage: 20,
        healthAfter: 0,
        becameZeroHealth: true
      }
    ]);
    expect(evidence.bossPath.lifecycle.decisions).toEqual([
      expect.objectContaining({
        entityId: "entity.deployable.boss_totem",
        reason: "living"
      }),
      expect.objectContaining({
        entityId: "entity.dwarf.warden",
        reason: "living"
      }),
      expect.objectContaining({
        entityId: "entity.enemy.boss.gatebreaker_captain",
        reason: "enemy_destroyed"
      })
    ]);
    expect(evidence.bossPath.deathTriggers).toMatchObject({
      status: "complete",
      completedRounds: 2,
      pendingDeathEvents: [],
      lifecycleTransitions: [
        {
          entityId: "entity.deployable.boss_totem",
          lifecycleAfter: "destroyed"
        }
      ]
    });
    expect(evidence.bossPath.deathTriggers.combatants).toEqual([
      expect.objectContaining({
        entityId: "entity.deployable.boss_totem",
        lifecycleState: "destroyed"
      }),
      expect.objectContaining({
        entityId: "entity.dwarf.warden",
        lifecycleState: "active",
        currentHealth: 20
      }),
      expect.objectContaining({
        entityId: "entity.enemy.boss.gatebreaker_captain",
        lifecycleState: "destroyed"
      })
    ]);
    expect(evidence.bossPath.rewardAndVictory).toMatchObject({
      bossRewards: {
        profile: {
          forgeOre: 20,
          unlockedCharacterIds: [
            "character.deep_ranger",
            "character.iron_warden"
          ],
          claimedRewardIds: ["reward.boss.gatebreaker_captain"]
        }
      },
      terminalEvaluation: {
        state: "terminal",
        terminalResult: "victory",
        reason: "victory_conditions_met",
        livingDwarves: 1,
        livingHostileEnemies: 0,
        livingHostileDeployables: 0
      }
    });

    expect(evidence.invalidatedWindup.decisions[0]).toMatchObject({
      targetLock: {
        status: "reacquired",
        targetEntityId: "entity.enemy.goblin_cutter",
        previousTargetReason: "target_not_living"
      },
      commitment: {
        status: "cancelled",
        reason: "target_invalid_before_commit"
      }
    });
    expect(evidence.simultaneousDeath.lifecycles.decisions).toEqual([
      expect.objectContaining({
        entityId: "entity.dwarf.warden",
        reason: "dwarf_downed"
      }),
      expect.objectContaining({
        entityId: "entity.enemy.goblin_cutter",
        reason: "enemy_destroyed"
      })
    ]);
    expect(evidence.simultaneousDeath.lifecycles.occupancy).toEqual([]);
    expect(evidence.supportEffects).toMatchObject({
      decisions: [
        { effectKind: "status", reason: "status_applied" },
        { effectKind: "healing", reason: "healing_applied" }
      ],
      health: [{ entityId: "entity.dwarf.warden", currentHealth: 20 }],
      statuses: [
        {
          ownerEntityId: "entity.dwarf.warden",
          statusId: "status.guard",
          expiresAtTick: 25,
          magnitude: 3
        }
      ]
    });
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.bossPath.rewardAndVictory)).toBe(true);
    expect(await canonicalHash(evidence)).toBe(phase3SystemEvidenceChecksum);
  });
});
