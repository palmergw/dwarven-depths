import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { battlefieldAttackImpactParityEvidence } from "./battlefield-attack-impact.fixture.js";
import {
  normalizeBattlefieldDwarves,
  resolveBattlefieldAttackImpacts
} from "./index.js";

const parityChecksum =
  "1928e21b3748bd7bc2381bcc1bf6d35fd55a61e2441bd241eb44048b26f5b78e";

describe("battlefield committed-attack impacts", () => {
  it("persists before impact then consumes lethal damage into downed state", async () => {
    const { pending, resolved } = await battlefieldAttackImpactParityEvidence();
    expect(pending.impactDecisions).toEqual([
      expect.objectContaining({
        status: "pending",
        reason: "waiting_for_impact"
      })
    ]);
    expect(pending.battlefield.pendingCommittedAttacks).toHaveLength(1);
    expect(pending.battlefield.dwarfCombatants[0]).toEqual(
      expect.objectContaining({ currentHealth: 10, lifecycleState: "active" })
    );

    expect(resolved.impactDecisions).toEqual([
      expect.objectContaining({
        status: "resolved",
        reason: "damage_applied",
        damage: 10
      })
    ]);
    expect(resolved.healthResolutions).toEqual([
      expect.objectContaining({
        entityId: "entity.dwarf.warden",
        healthBefore: 10,
        healthAfter: 0,
        becameZeroHealth: true
      })
    ]);
    expect(resolved.lifecycleDecisions).toEqual([
      expect.objectContaining({
        entityId: "entity.dwarf.warden",
        status: "transitioned",
        reason: "dwarf_downed"
      })
    ]);
    expect(resolved.battlefield.pendingCommittedAttacks).toEqual([]);
    expect(resolved.battlefield.dwarfCombatants[0]).toEqual(
      expect.objectContaining({ currentHealth: 0, lifecycleState: "downed" })
    );
    expect(
      resolved.battlefield.occupancy.some(
        (occupant) => occupant.entityId === "entity.dwarf.warden"
      )
    ).toBe(false);
  });

  it("rejects authored identity substitution and inconsistent lifecycle state", async () => {
    const { content, deploymentAuthority, committed } =
      await battlefieldAttackImpactParityEvidence();
    for (const dwarfCombatants of [
      committed.dwarfCombatants.map((dwarf) => ({
        ...dwarf,
        characterDefinitionId: "character.substitute",
        currentHealth: 999,
        maximumHealth: 999
      })),
      committed.dwarfCombatants.map((dwarf) => ({
        ...dwarf,
        lifecycleState: "downed"
      }))
    ]) {
      expect(() =>
        normalizeBattlefieldDwarves(
          dwarfCombatants,
          deploymentAuthority,
          content,
          committed.mapId,
          committed.occupancy
        )
      ).toThrow();
    }
  });

  it("discards a due impact when the target is already absent", async () => {
    const { content, deploymentAuthority, committed } =
      await battlefieldAttackImpactParityEvidence();
    const result = resolveBattlefieldAttackImpacts(
      {
        schemaVersion: 1,
        currentTick: 7,
        levelId: "level.conformance_map" as never,
        battlefield: {
          ...committed,
          pendingCommittedAttacks: committed.pendingCommittedAttacks.map(
            (attack) => ({
              ...attack,
              targetEntityId: "entity.dwarf.absent" as never
            })
          )
        }
      },
      content,
      deploymentAuthority
    );
    expect(result.impactDecisions[0]).toEqual(
      expect.objectContaining({
        status: "discarded",
        reason: "target_not_living_at_impact"
      })
    );
    expect(result.battlefield.pendingCommittedAttacks).toEqual([]);
    expect(result.battlefield.enemyCombatants).toEqual(
      committed.enemyCombatants
    );
  });

  it("rejects malformed unrelated occupancy instead of preserving it", async () => {
    const { content, deploymentAuthority, committed } =
      await battlefieldAttackImpactParityEvidence();
    expect(() =>
      resolveBattlefieldAttackImpacts(
        {
          schemaVersion: 1,
          currentTick: 7,
          levelId: "level.conformance_map" as never,
          battlefield: {
            ...committed,
            occupancy: [
              ...committed.occupancy,
              { entityId: "not-an-entity", nodeId: "not-a-node" }
            ] as never
          }
        },
        content,
        deploymentAuthority
      )
    ).toThrow("entity.* stable ID");
  });

  it("rejects paired enemy basic-attack and pending-damage substitution", async () => {
    const { content, deploymentAuthority, committed } =
      await battlefieldAttackImpactParityEvidence();
    expect(() =>
      resolveBattlefieldAttackImpacts(
        {
          schemaVersion: 1,
          currentTick: 7,
          levelId: "level.conformance_map" as never,
          battlefield: {
            ...committed,
            enemyCombatants: committed.enemyCombatants.map((enemy) => ({
              ...enemy,
              basicAttack: { ...enemy.basicAttack, damage: 999 }
            })),
            pendingCommittedAttacks: committed.pendingCommittedAttacks.map(
              (attack) => ({ ...attack, damage: 999 })
            )
          }
        },
        content,
        deploymentAuthority
      )
    ).toThrow("compiled enemy definition");
  });

  it("rejects admissions without exact fired authored-spawn evidence", async () => {
    const { content, deploymentAuthority, committed } =
      await battlefieldAttackImpactParityEvidence();
    for (const battlefield of [
      { ...committed, startedWaveIds: [] },
      {
        ...committed,
        enemyAdmissions: committed.enemyAdmissions.map((admission) => ({
          ...admission,
          spawnId: "spawn.forged" as never
        }))
      }
    ]) {
      expect(() =>
        resolveBattlefieldAttackImpacts(
          {
            schemaVersion: 1,
            currentTick: 7,
            levelId: "level.conformance_map" as never,
            battlefield
          },
          content,
          deploymentAuthority
        )
      ).toThrow();
    }
  });

  it("rejects structurally forged preparation authority", async () => {
    const { content, deploymentAuthority, committed } =
      await battlefieldAttackImpactParityEvidence();
    expect(() =>
      resolveBattlefieldAttackImpacts(
        {
          schemaVersion: 1,
          currentTick: 7,
          levelId: "level.conformance_map" as never,
          battlefield: committed
        },
        content,
        structuredClone(deploymentAuthority)
      )
    ).toThrow("was not accepted");
  });

  it("rejects malformed pending-spawn payload through the shared normalizer", async () => {
    const { content, deploymentAuthority, committed } =
      await battlefieldAttackImpactParityEvidence();
    expect(() =>
      resolveBattlefieldAttackImpacts(
        {
          schemaVersion: 1,
          currentTick: 7,
          levelId: "level.conformance_map" as never,
          battlefield: {
            ...committed,
            pendingSpawns: [
              {
                id: "spawn.attack_impact.cutter",
                authoredOrder: "bad",
                entityId: "entity.forged",
                enemyDefinitionId: "enemy.forged",
                entranceId: "entrance.forged"
              }
            ] as never
          }
        },
        content,
        deploymentAuthority
      )
    ).toThrow("pending spawn does not match authored evidence");
  });

  it("accepts a valid composite active windup from the shared normalizer", async () => {
    const { content, deploymentAuthority, committed } =
      await battlefieldAttackImpactParityEvidence();
    const enemy = committed.enemyCombatants[0];
    if (enemy === undefined) throw new Error("missing enemy fixture");
    expect(() =>
      resolveBattlefieldAttackImpacts(
        {
          schemaVersion: 1,
          currentTick: 6,
          levelId: "level.conformance_map" as never,
          battlefield: {
            ...committed,
            pendingCommittedAttacks: [],
            enemyCombatants: [
              {
                ...enemy,
                actionState: {
                  ...enemy.actionState,
                  activeBasicAttack: {
                    schemaVersion: 1,
                    attackId:
                      "attack.goblin_cutter_basic.enemy.cutter.tick_6" as never,
                    sourceEntityId: enemy.entityId,
                    targetEntityId: "entity.dwarf.warden" as never,
                    startedAtTick: 6,
                    commitAtTick: 12,
                    impactAtTick: 13,
                    cooldownDurationTicks: 20,
                    damage: 10,
                    range: 1,
                    targetIsValid: true
                  },
                  cooldownCompleteAtTick: null
                }
              }
            ]
          }
        },
        content,
        deploymentAuthority
      )
    ).not.toThrow();
  });

  it("binds pending attacks to cooldown evidence and rejects overlap", async () => {
    const { content, deploymentAuthority, committed } =
      await battlefieldAttackImpactParityEvidence();
    const enemy = committed.enemyCombatants[0];
    const first = committed.pendingCommittedAttacks[0];
    if (enemy === undefined || first === undefined)
      throw new Error("missing committed attack fixture");
    expect(() =>
      resolveBattlefieldAttackImpacts(
        {
          schemaVersion: 1,
          currentTick: 7,
          levelId: "level.conformance_map" as never,
          battlefield: {
            ...committed,
            enemyCombatants: [
              {
                ...enemy,
                actionState: {
                  ...enemy.actionState,
                  cooldownCompleteAtTick: null
                }
              }
            ]
          }
        },
        content,
        deploymentAuthority
      )
    ).toThrow("lacks source cooldown evidence");

    const overlapping = {
      ...first,
      attackId: "attack.goblin_cutter_basic.enemy.cutter.tick_1" as never,
      committedAtTick: 7,
      impactAtTick: 8,
      cooldownCompleteAtTick: 27
    };
    expect(() =>
      resolveBattlefieldAttackImpacts(
        {
          schemaVersion: 1,
          currentTick: 7,
          levelId: "level.conformance_map" as never,
          battlefield: {
            ...committed,
            enemyCombatants: [
              {
                ...enemy,
                actionState: {
                  ...enemy.actionState,
                  cooldownCompleteAtTick: 27
                }
              }
            ],
            pendingCommittedAttacks: [first, overlapping]
          }
        },
        content,
        deploymentAuthority
      )
    ).toThrow("overlap one source cooldown");
  });

  it("rejects malformed enemy action state before resolving impacts", async () => {
    const { content, deploymentAuthority, committed } =
      await battlefieldAttackImpactParityEvidence();
    expect(() =>
      resolveBattlefieldAttackImpacts(
        {
          schemaVersion: 1,
          currentTick: 7,
          levelId: "level.conformance_map" as never,
          battlefield: {
            ...committed,
            enemyCombatants: committed.enemyCombatants.map((enemy) => ({
              ...enemy,
              actionState: { ...enemy.actionState, nextMovementAtTick: "bad" }
            })) as never
          }
        },
        content,
        deploymentAuthority
      )
    ).toThrow("nextMovementAtTick");
  });

  it("returns detached immutable parity evidence with one literal checksum", async () => {
    const evidence = await battlefieldAttackImpactParityEvidence();
    const payload = {
      pending: evidence.pending,
      resolved: evidence.resolved
    };
    expect(await canonicalHash(payload)).toBe(parityChecksum);
    expect(Object.isFrozen(evidence.resolved)).toBe(true);
    expect(Object.isFrozen(evidence.resolved.battlefield)).toBe(true);
    expect(Object.isFrozen(evidence.resolved.battlefield.dwarfCombatants)).toBe(
      true
    );
    expect(
      Object.isFrozen(evidence.resolved.battlefield.dwarfCombatants[0])
    ).toBe(true);
  });
});
