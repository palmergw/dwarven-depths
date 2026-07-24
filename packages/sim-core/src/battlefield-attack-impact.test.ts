import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { battlefieldAttackImpactParityEvidence } from "./battlefield-attack-impact.fixture.js";
import {
  normalizeBattlefieldDwarves,
  resolveBattlefieldAttackImpacts
} from "./index.js";

const parityChecksum =
  "82a80d8276389748345755011c945e09e9f8bbae2243d11a0b59ae8c7ea94854";

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
    const { content, deployments, committed } =
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
          deployments,
          content,
          committed.mapId,
          committed.occupancy
        )
      ).toThrow();
    }
  });

  it("discards a due impact when the target is already absent", async () => {
    const { content, deployments, committed } =
      await battlefieldAttackImpactParityEvidence();
    const result = resolveBattlefieldAttackImpacts(
      {
        schemaVersion: 1,
        currentTick: 7,
        levelId: "level.conformance_map" as never,
        deployments,
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
      content
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
    const { content, deployments, committed } =
      await battlefieldAttackImpactParityEvidence();
    expect(() =>
      resolveBattlefieldAttackImpacts(
        {
          schemaVersion: 1,
          currentTick: 7,
          levelId: "level.conformance_map" as never,
          deployments,
          battlefield: {
            ...committed,
            occupancy: [
              ...committed.occupancy,
              { entityId: "not-an-entity", nodeId: "not-a-node" }
            ] as never
          }
        },
        content
      )
    ).toThrow("entity.* stable ID");
  });

  it("rejects paired enemy basic-attack and pending-damage substitution", async () => {
    const { content, deployments, committed } =
      await battlefieldAttackImpactParityEvidence();
    expect(() =>
      resolveBattlefieldAttackImpacts(
        {
          schemaVersion: 1,
          currentTick: 7,
          levelId: "level.conformance_map" as never,
          deployments,
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
        content
      )
    ).toThrow("basicAttack is not authored");
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
