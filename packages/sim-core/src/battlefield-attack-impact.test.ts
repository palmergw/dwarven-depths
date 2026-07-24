import {
  type BattlefieldState,
  canonicalHash
} from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { battlefieldAttackImpactParityEvidence } from "./battlefield-attack-impact.fixture.js";
import { propagateBattlefieldRoundLineage } from "./battlefield-round-lineage.js";
import {
  createBattlefieldDwarfDeploymentAuthority,
  createInitialState,
  deployBattlefieldDwarves,
  normalizeBattlefieldDwarves,
  resolveBattlefieldAttackImpacts,
  resolveBattlefieldPhase,
  resolveScheduledBattlefieldPhase
} from "./index.js";

const parityChecksum =
  "96e740814d345ca8430e9bd99151b17bdd59413282531c978c9ade570a7de0b2";

function descendant<T extends BattlefieldState>(
  source: BattlefieldState,
  target: T
): T {
  propagateBattlefieldRoundLineage(source, target);
  return target;
}

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
      expect.objectContaining({
        currentHealth: 10,
        lifecycleState: "active",
        basicAttack: expect.objectContaining({
          id: "attack.iron_warden_basic"
        }),
        actionState: {
          schemaVersion: 1,
          currentTargetEntityId: null,
          activeBasicAttack: null,
          cooldownCompleteAtTick: null
        }
      })
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
    expect(resolved.lifecycleDecisions).toContainEqual(
      expect.objectContaining({
        entityId: "entity.dwarf.warden",
        status: "transitioned",
        reason: "dwarf_downed"
      })
    );
    expect(resolved.battlefield.pendingCommittedAttacks).toEqual([]);
    expect(resolved.battlefield.dwarfCombatants[0]).toEqual(
      expect.objectContaining({
        currentHealth: 0,
        lifecycleState: "downed",
        actionState: {
          schemaVersion: 1,
          currentTargetEntityId: null,
          activeBasicAttack: null,
          cooldownCompleteAtTick: null
        }
      })
    );
    expect(
      resolved.battlefield.occupancy.some(
        (occupant) => occupant.entityId === "entity.dwarf.warden"
      )
    ).toBe(false);
  });

  it("rejects redeploying dwarves after the round deployment was consumed", async () => {
    const { content, deploymentAuthority, preparation, resolved } =
      await battlefieldAttackImpactParityEvidence();
    expect(resolved.battlefield.dwarfCombatants[0]?.lifecycleState).toBe(
      "downed"
    );
    expect(() =>
      deployBattlefieldDwarves(preparation, deploymentAuthority, content)
    ).toThrow("already initialized");
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
      const candidate = {
        ...committed,
        dwarfCombatants
      } as unknown as typeof committed;
      propagateBattlefieldRoundLineage(committed, candidate);
      expect(() =>
        normalizeBattlefieldDwarves(candidate, deploymentAuthority, content)
      ).toThrow();
    }
  });

  it("rejects substituted dwarf attacks and malformed action state", async () => {
    const { content, deploymentAuthority, committed } =
      await battlefieldAttackImpactParityEvidence();
    const dwarf = committed.dwarfCombatants[0];
    if (dwarf === undefined) throw new Error("missing dwarf fixture");
    for (const changed of [
      { ...dwarf, basicAttack: { ...dwarf.basicAttack, damage: 999 } },
      {
        ...dwarf,
        actionState: { ...dwarf.actionState, cooldownCompleteAtTick: 5 }
      },
      {
        ...dwarf,
        actionState: {
          ...dwarf.actionState,
          currentTargetEntityId: "entity.enemy.cutter"
        }
      },
      {
        ...dwarf,
        actionState: {
          schemaVersion: 1,
          currentTargetEntityId: null,
          activeBasicAttack: {
            schemaVersion: 1,
            attackId:
              "attack.iron_warden_basic.dwarf.warden.source_length_12.tick_0",
            sourceEntityId: dwarf.entityId,
            targetEntityId: "entity.enemy.cutter",
            startedAtTick: 0,
            commitAtTick: 8,
            impactAtTick: 10,
            cooldownDurationTicks: 24,
            damage: 18,
            range: 2,
            targetIsValid: true
          },
          cooldownCompleteAtTick: null
        }
      }
    ]) {
      const candidate = {
        ...committed,
        dwarfCombatants: [changed]
      } as unknown as typeof committed;
      propagateBattlefieldRoundLineage(committed, candidate);
      expect(() =>
        normalizeBattlefieldDwarves(candidate, deploymentAuthority, content)
      ).toThrow();
    }
  });

  it("rejects forged dwarf state across admission and scheduling phases", async () => {
    const { content, deploymentAuthority, committed } =
      await battlefieldAttackImpactParityEvidence();
    const forgedBattlefield = descendant(committed, {
      ...committed,
      dwarfCombatants: committed.dwarfCombatants.map((dwarf) => ({
        ...dwarf,
        basicAttack: { ...dwarf.basicAttack, damage: 999 },
        actionState: { ...dwarf.actionState, cooldownCompleteAtTick: 999 }
      }))
    });
    const state = {
      schemaVersion: 1,
      contentVersion: content.bundle.contentVersion,
      tick: 6,
      seed: "1",
      rngState: 1,
      levelId: "level.conformance_map",
      phase: "COMBAT",
      eventSequence: 0,
      battlefield: forgedBattlefield
    } as never;

    expect(() =>
      resolveBattlefieldPhase(
        state,
        content,
        [],
        [],
        undefined,
        deploymentAuthority
      )
    ).toThrow("basicAttack is not authored");
    expect(() =>
      resolveScheduledBattlefieldPhase(
        state,
        content,
        [],
        undefined,
        deploymentAuthority
      )
    ).toThrow("basicAttack is not authored");
    expect(() => resolveBattlefieldPhase(state, content, [], [])).toThrow(
      "require deployment authority"
    );
  });

  it("rejects redirecting a committed attack to an absent target", async () => {
    const { content, deploymentAuthority, committed } =
      await battlefieldAttackImpactParityEvidence();
    expect(() =>
      resolveBattlefieldAttackImpacts(
        {
          schemaVersion: 1,
          currentTick: 7,
          levelId: "level.conformance_map" as never,
          battlefield: descendant(committed, {
            ...committed,
            pendingCommittedAttacks: committed.pendingCommittedAttacks.map(
              (attack) => ({
                ...attack,
                targetEntityId: "entity.dwarf.absent" as never
              })
            )
          })
        },
        content,
        deploymentAuthority
      )
    ).toThrow("do not match authoritative pending attacks");
  });

  it("rejects caller-substituted enemy health after authoritative impact", async () => {
    const { content, deploymentAuthority, resolved } =
      await battlefieldAttackImpactParityEvidence();
    const forged = {
      ...resolved.battlefield,
      enemyCombatants: resolved.battlefield.enemyCombatants.map((enemy) => ({
        ...enemy,
        currentHealth: enemy.currentHealth - 1
      }))
    };
    propagateBattlefieldRoundLineage(resolved.battlefield, forged);
    expect(() =>
      resolveBattlefieldAttackImpacts(
        {
          schemaVersion: 1,
          currentTick: 8,
          levelId: "level.conformance_map" as never,
          battlefield: forged
        },
        content,
        deploymentAuthority
      )
    ).toThrow("enemy health/lifecycle does not match authoritative evidence");
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
          battlefield: descendant(committed, {
            ...committed,
            occupancy: [
              ...committed.occupancy,
              { entityId: "not-an-entity", nodeId: "not-a-node" }
            ] as never
          })
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
          battlefield: descendant(committed, {
            ...committed,
            enemyCombatants: committed.enemyCombatants.map((enemy) => ({
              ...enemy,
              basicAttack: { ...enemy.basicAttack, damage: 999 }
            })),
            pendingCommittedAttacks: committed.pendingCommittedAttacks.map(
              (attack) => ({ ...attack, damage: 999 })
            )
          })
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
      propagateBattlefieldRoundLineage(committed, battlefield);
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

  it("rejects alternate-round authority and a second preparation claim", async () => {
    const { content, committed } =
      await battlefieldAttackImpactParityEvidence();
    const otherPreparation = createInitialState(
      content,
      "level.conformance_map" as never,
      "2"
    ).battlefield;
    if (otherPreparation === undefined) throw new Error("missing other round");
    const deployments = [
      {
        entityId: "entity.dwarf.warden" as never,
        characterDefinitionId: "character.substitute" as never,
        placementPointId: "placement.goal" as never
      }
    ];
    const deployment = deployments[0];
    if (deployment === undefined) throw new Error("missing deployment fixture");
    expect(() =>
      createBattlefieldDwarfDeploymentAuthority(
        [
          {
            entityId: deployment.entityId,
            characterDefinitionId: "character.missing" as never,
            placementPointId: deployment.placementPointId
          }
        ],
        otherPreparation,
        content
      )
    ).toThrow("unknown character");
    const otherAuthority = createBattlefieldDwarfDeploymentAuthority(
      deployments,
      otherPreparation,
      content
    );
    expect(() =>
      createBattlefieldDwarfDeploymentAuthority(
        deployments,
        otherPreparation,
        content
      )
    ).toThrow("already accepted");
    const otherDeployed = deployBattlefieldDwarves(
      otherPreparation,
      otherAuthority,
      content
    );
    const redirected = {
      ...committed,
      dwarfCombatants: otherDeployed.dwarfCombatants
    };
    propagateBattlefieldRoundLineage(committed, redirected);
    expect(() =>
      resolveBattlefieldAttackImpacts(
        {
          schemaVersion: 1,
          currentTick: 7,
          levelId: "level.conformance_map" as never,
          battlefield: redirected
        },
        content,
        otherAuthority
      )
    ).toThrow("accepted preparation round");
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
          battlefield: descendant(committed, {
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
          })
        },
        content,
        deploymentAuthority
      )
    ).toThrow("pending spawn does not match authored evidence");
  });

  it("accepts a valid composite active windup from the shared normalizer", async () => {
    const { content, deploymentAuthority, readyToCommit } =
      await battlefieldAttackImpactParityEvidence();
    const enemy = readyToCommit.enemyCombatants[0];
    if (enemy === undefined) throw new Error("missing enemy fixture");
    const candidate = {
      ...readyToCommit,
      enemyCombatants: [
        {
          ...enemy,
          actionState: {
            ...enemy.actionState,
            activeBasicAttack: {
              schemaVersion: 1,
              attackId:
                "attack.goblin_cutter_basic.enemy.cutter.source_length_12.tick_6" as never,
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
    } as unknown as typeof readyToCommit;
    propagateBattlefieldRoundLineage(readyToCommit, candidate);
    expect(() =>
      resolveBattlefieldAttackImpacts(
        {
          schemaVersion: 1,
          currentTick: 6,
          levelId: "level.conformance_map" as never,
          battlefield: candidate
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
          battlefield: descendant(committed, {
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
          })
        },
        content,
        deploymentAuthority
      )
    ).toThrow("lacks source cooldown evidence");

    const overlapping = {
      ...first,
      attackId:
        "attack.goblin_cutter_basic.enemy.cutter.source_length_12.tick_1" as never,
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
          battlefield: descendant(committed, {
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
          })
        },
        content,
        deploymentAuthority
      )
    ).toThrow("do not match authoritative pending attacks");
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
          battlefield: descendant(committed, {
            ...committed,
            enemyCombatants: committed.enemyCombatants.map((enemy) => ({
              ...enemy,
              actionState: { ...enemy.actionState, nextMovementAtTick: "bad" }
            })) as never
          })
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
    expect(
      Object.isFrozen(
        evidence.resolved.battlefield.dwarfCombatants[0]?.basicAttack
      )
    ).toBe(true);
    expect(
      Object.isFrozen(
        evidence.resolved.battlefield.dwarfCombatants[0]?.actionState
      )
    ).toBe(true);
  });
});
