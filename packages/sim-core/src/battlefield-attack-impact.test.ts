import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { battlefieldAttackImpactParityEvidence } from "./battlefield-attack-impact.fixture.js";
import {
  normalizeBattlefieldDwarves,
  resolveBattlefieldAttackImpacts
} from "./index.js";

const parityChecksum =
  "0167bc16246d6fa4a2f6bad8ed6daad9e794bb756ee99a1802d5e97e64c2e0d5";

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
    const { content, committed } =
      await battlefieldAttackImpactParityEvidence();
    for (const dwarfCombatants of [
      committed.dwarfCombatants.map((dwarf) => ({
        ...dwarf,
        characterDefinitionId: "character.missing"
      })),
      committed.dwarfCombatants.map((dwarf) => ({
        ...dwarf,
        lifecycleState: "downed"
      }))
    ]) {
      expect(() =>
        normalizeBattlefieldDwarves(
          dwarfCombatants,
          content,
          committed.mapId,
          committed.occupancy
        )
      ).toThrow();
    }
  });

  it("discards a due impact when the target is already absent", async () => {
    const { content, committed } =
      await battlefieldAttackImpactParityEvidence();
    const result = resolveBattlefieldAttackImpacts(
      {
        schemaVersion: 1,
        currentTick: 7,
        levelId: "level.conformance_map" as never,
        battlefield: {
          ...committed,
          occupancy: committed.occupancy.filter(
            (occupant) => occupant.entityId !== "entity.dwarf.warden"
          ),
          dwarfCombatants: []
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
