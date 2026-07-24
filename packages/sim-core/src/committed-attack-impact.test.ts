import {
  type CombatantHealth,
  type CommittedAttack,
  canonicalHash
} from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { committedAttackImpactParityEvidence } from "./committed-attack-impact.fixture.js";
import { resolveCommittedAttackImpacts } from "./index.js";

function attack(overrides: Partial<CommittedAttack> = {}): CommittedAttack {
  return {
    schemaVersion: 1,
    attackId: "attack.warden.basic" as never,
    sourceEntityId: "entity.dwarf.warden" as never,
    targetEntityId: "entity.enemy.cutter" as never,
    committedAtTick: 12,
    impactAtTick: 15,
    cooldownCompleteAtTick: 42,
    damage: 12,
    range: 1_000,
    ...overrides
  };
}

function combatant(overrides: Partial<CombatantHealth> = {}): CombatantHealth {
  return {
    schemaVersion: 1,
    entityId: "entity.enemy.cutter" as never,
    currentHealth: 20,
    maximumHealth: 20,
    ...overrides
  };
}

describe("committed attack impact and health resolution", () => {
  it("keeps a committed attack pending before its exact impact tick", () => {
    expect(
      resolveCommittedAttackImpacts({
        currentTick: 14,
        attacks: [attack()],
        combatants: [combatant()]
      })
    ).toEqual({
      decisions: [
        {
          schemaVersion: 1,
          attackId: "attack.warden.basic",
          sourceEntityId: "entity.dwarf.warden",
          targetEntityId: "entity.enemy.cutter",
          status: "pending",
          reason: "waiting_for_impact"
        }
      ],
      health: [combatant()],
      healthResolutions: []
    });
  });

  it("applies snapshotted direct damage at the exact impact tick", () => {
    expect(
      resolveCommittedAttackImpacts({
        currentTick: 15,
        attacks: [attack()],
        combatants: [combatant()]
      })
    ).toEqual({
      decisions: [
        {
          schemaVersion: 1,
          attackId: "attack.warden.basic",
          sourceEntityId: "entity.dwarf.warden",
          targetEntityId: "entity.enemy.cutter",
          status: "resolved",
          reason: "damage_applied",
          damage: 12
        }
      ],
      health: [combatant({ currentHealth: 8 })],
      healthResolutions: [
        {
          schemaVersion: 1,
          entityId: "entity.enemy.cutter",
          healthBefore: 20,
          incomingDamage: 12,
          appliedDamage: 12,
          healthAfter: 8,
          becameZeroHealth: false
        }
      ]
    });
  });

  it("aggregates simultaneous lethal impacts independent of input order", () => {
    const attacks = [
      attack({ attackId: "attack.zulu" as never, damage: 13 }),
      attack({ attackId: "attack.alpha" as never, damage: 11 })
    ];
    const request = {
      currentTick: 15,
      attacks,
      combatants: [combatant()]
    };
    const before = structuredClone(request);
    const forward = resolveCommittedAttackImpacts(request);
    const reverse = resolveCommittedAttackImpacts({
      ...request,
      attacks: [...attacks].reverse()
    });

    expect(forward).toEqual(reverse);
    expect(forward.decisions.map((item) => item.attackId)).toEqual([
      "attack.alpha",
      "attack.zulu"
    ]);
    expect(forward.health[0]?.currentHealth).toBe(0);
    expect(forward.healthResolutions).toEqual([
      {
        schemaVersion: 1,
        entityId: "entity.enemy.cutter",
        healthBefore: 20,
        incomingDamage: 24,
        appliedDamage: 20,
        healthAfter: 0,
        becameZeroHealth: true
      }
    ]);
    expect(request).toEqual(before);
  });

  it("does not cancel committed work when its source is dead or absent", () => {
    const result = resolveCommittedAttackImpacts({
      currentTick: 15,
      attacks: [attack()],
      combatants: [combatant()]
    });
    expect(result.decisions[0]?.reason).toBe("damage_applied");
    expect(result.health[0]?.currentHealth).toBe(8);
  });

  it.each(["absent", "zero health"])(
    "discards an impact when its target is %s",
    (condition) => {
      const combatants =
        condition === "absent" ? [] : [combatant({ currentHealth: 0 })];
      expect(
        resolveCommittedAttackImpacts({
          currentTick: 15,
          attacks: [attack()],
          combatants
        })
      ).toEqual({
        decisions: [
          {
            schemaVersion: 1,
            attackId: "attack.warden.basic",
            sourceEntityId: "entity.dwarf.warden",
            targetEntityId: "entity.enemy.cutter",
            status: "discarded",
            reason: "target_not_living_at_impact"
          }
        ],
        health: combatants,
        healthResolutions: []
      });
    }
  );

  it("sorts detached immutable health output by stable entity ID", () => {
    const result = resolveCommittedAttackImpacts({
      currentTick: 14,
      attacks: [],
      combatants: [
        combatant({ entityId: "entity.zulu" as never }),
        combatant({ entityId: "entity.alpha" as never })
      ]
    });
    expect(result.health.map((item) => item.entityId)).toEqual([
      "entity.alpha",
      "entity.zulu"
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.decisions)).toBe(true);
    expect(Object.isFrozen(result.health)).toBe(true);
    expect(Object.isFrozen(result.health[0])).toBe(true);
    expect(Object.isFrozen(result.healthResolutions)).toBe(true);
  });

  it("rejects invalid timing, health, IDs, duplicates, and aggregate overflow", () => {
    for (const invalid of [
      combatant({ entityId: "enemy.invalid" as never }),
      combatant({ currentHealth: -1 }),
      combatant({ maximumHealth: 0 }),
      combatant({ currentHealth: 21 }),
      combatant({ currentHealth: -0 })
    ]) {
      expect(() =>
        resolveCommittedAttackImpacts({
          currentTick: 15,
          attacks: [],
          combatants: [invalid]
        })
      ).toThrow();
    }
    expect(() =>
      resolveCommittedAttackImpacts({
        currentTick: 16,
        attacks: [attack()],
        combatants: [combatant()]
      })
    ).toThrow("passed its impact tick");
    expect(() =>
      resolveCommittedAttackImpacts({
        currentTick: 15,
        attacks: [attack(), attack()],
        combatants: [combatant()]
      })
    ).toThrow("duplicate committed attack ID");
    expect(() =>
      resolveCommittedAttackImpacts({
        currentTick: 15,
        attacks: [],
        combatants: [combatant(), combatant()]
      })
    ).toThrow("duplicate combatant entity ID");
    expect(() =>
      resolveCommittedAttackImpacts({
        currentTick: 15,
        attacks: [
          attack({
            attackId: "attack.alpha" as never,
            damage: Number.MAX_SAFE_INTEGER
          }),
          attack({ attackId: "attack.zulu" as never, damage: 1 })
        ],
        combatants: [combatant()]
      })
    ).toThrow("aggregate incoming damage exceeds");
  });

  it("rejects sparse arrays and accessors without invoking caller code", () => {
    const sparse = new Array(1) as CommittedAttack[];
    expect(() =>
      resolveCommittedAttackImpacts({
        currentTick: 15,
        attacks: sparse,
        combatants: []
      })
    ).toThrow("dense data array");

    let getterCalls = 0;
    const accessor = attack();
    Object.defineProperty(accessor, "attackId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "attack.accessor";
      }
    });
    expect(() =>
      resolveCommittedAttackImpacts({
        currentTick: 15,
        attacks: [accessor],
        combatants: []
      })
    ).toThrow("attackId must be an enumerable data property");
    expect(getterCalls).toBe(0);
  });

  it("pins the shared Node and browser parity evidence", async () => {
    expect(await canonicalHash(committedAttackImpactParityEvidence())).toBe(
      "78d625835d6ad538cd3339ee44676a971e66e7afc19631f8f05a5bd2faf5e52d"
    );
  });
});
