import type {
  CombatantLifecycle,
  NavigationOccupant
} from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { resolveZeroHealthLifecycles } from "./index.js";

function combatant(
  overrides: Partial<CombatantLifecycle> = {}
): CombatantLifecycle {
  return {
    schemaVersion: 1,
    entityId: "entity.dwarf.warden" as never,
    kind: "dwarf",
    currentHealth: 10,
    lifecycleState: "active",
    ...overrides
  };
}

const occupancy = [
  { entityId: "entity.enemy.cutter", nodeId: "node.entry" },
  { entityId: "entity.dwarf.warden", nodeId: "node.placement" },
  { entityId: "entity.deployable.turret", nodeId: "node.attachment" },
  { entityId: "entity.enemy.slinger", nodeId: "node.south" }
] as NavigationOccupant[];

describe("zero-health lifecycle resolution", () => {
  it("simultaneously downs dwarves, destroys hostiles, and vacates occupancy", () => {
    const combatants = [
      combatant({ currentHealth: 0 }),
      combatant({
        entityId: "entity.enemy.cutter" as never,
        kind: "enemy",
        currentHealth: 0
      }),
      combatant({
        entityId: "entity.deployable.turret" as never,
        kind: "deployable",
        currentHealth: 0
      }),
      combatant({
        entityId: "entity.enemy.slinger" as never,
        kind: "enemy",
        currentHealth: 3
      })
    ];
    const request = { combatants, occupancy };
    const before = structuredClone(request);

    expect(resolveZeroHealthLifecycles(request)).toEqual({
      combatants: [
        combatant({
          entityId: "entity.deployable.turret" as never,
          kind: "deployable",
          currentHealth: 0,
          lifecycleState: "destroyed"
        }),
        combatant({ currentHealth: 0, lifecycleState: "downed" }),
        combatant({
          entityId: "entity.enemy.cutter" as never,
          kind: "enemy",
          currentHealth: 0,
          lifecycleState: "destroyed"
        }),
        combatant({
          entityId: "entity.enemy.slinger" as never,
          kind: "enemy",
          currentHealth: 3
        })
      ],
      occupancy: [{ entityId: "entity.enemy.slinger", nodeId: "node.south" }],
      decisions: [
        {
          schemaVersion: 1,
          entityId: "entity.deployable.turret",
          kind: "deployable",
          lifecycleBefore: "active",
          lifecycleAfter: "destroyed",
          status: "transitioned",
          reason: "deployable_destroyed"
        },
        {
          schemaVersion: 1,
          entityId: "entity.dwarf.warden",
          kind: "dwarf",
          lifecycleBefore: "active",
          lifecycleAfter: "downed",
          status: "transitioned",
          reason: "dwarf_downed"
        },
        {
          schemaVersion: 1,
          entityId: "entity.enemy.cutter",
          kind: "enemy",
          lifecycleBefore: "active",
          lifecycleAfter: "destroyed",
          status: "transitioned",
          reason: "enemy_destroyed"
        },
        {
          schemaVersion: 1,
          entityId: "entity.enemy.slinger",
          kind: "enemy",
          lifecycleBefore: "active",
          lifecycleAfter: "active",
          status: "unchanged",
          reason: "living"
        }
      ]
    });
    expect(request).toEqual(before);
  });

  it("keeps prior terminal states resolved and removes stale occupancy", () => {
    const result = resolveZeroHealthLifecycles({
      combatants: [
        combatant({ currentHealth: 0, lifecycleState: "downed" }),
        combatant({
          entityId: "entity.enemy.cutter" as never,
          kind: "enemy",
          currentHealth: 0,
          lifecycleState: "destroyed"
        })
      ],
      occupancy: occupancy.slice(0, 2)
    });

    expect(result.occupancy).toEqual([]);
    expect(
      result.decisions.map(({ status, reason }) => ({ status, reason }))
    ).toEqual([
      { status: "unchanged", reason: "already_resolved" },
      { status: "unchanged", reason: "already_resolved" }
    ]);
  });

  it("is input-order independent, deeply frozen, and detached", () => {
    const combatants = [
      combatant({ entityId: "entity.zulu" as never }),
      combatant({ entityId: "entity.alpha" as never })
    ];
    const forward = resolveZeroHealthLifecycles({
      combatants,
      occupancy: [
        { entityId: "entity.zulu" as never, nodeId: "node.zulu" as never },
        { entityId: "entity.alpha" as never, nodeId: "node.alpha" as never }
      ]
    });
    const reverse = resolveZeroHealthLifecycles({
      combatants: [...combatants].reverse(),
      occupancy: [...forward.occupancy].reverse()
    });

    expect(forward).toEqual(reverse);
    expect(forward.combatants.map((item) => item.entityId)).toEqual([
      "entity.alpha",
      "entity.zulu"
    ]);
    expect(Object.isFrozen(forward)).toBe(true);
    expect(Object.isFrozen(forward.combatants)).toBe(true);
    expect(Object.isFrozen(forward.combatants[0])).toBe(true);
    expect(Object.isFrozen(forward.occupancy)).toBe(true);
    expect(Object.isFrozen(forward.occupancy[0])).toBe(true);
    expect(Object.isFrozen(forward.decisions)).toBe(true);
    expect(Object.isFrozen(forward.decisions[0])).toBe(true);
  });

  it("rejects malformed and inconsistent lifecycle inputs", () => {
    for (const invalid of [
      combatant({ entityId: "dwarf.invalid" as never }),
      combatant({ currentHealth: -1 }),
      combatant({ currentHealth: -0 }),
      combatant({ kind: "enemy", lifecycleState: "downed" }),
      combatant({ kind: "dwarf", lifecycleState: "destroyed" }),
      combatant({ currentHealth: 1, lifecycleState: "downed" }),
      combatant({
        kind: "enemy",
        currentHealth: 1,
        lifecycleState: "destroyed"
      })
    ]) {
      expect(() =>
        resolveZeroHealthLifecycles({ combatants: [invalid], occupancy: [] })
      ).toThrow();
    }
    expect(() =>
      resolveZeroHealthLifecycles({
        combatants: [combatant(), combatant()],
        occupancy: []
      })
    ).toThrow("duplicate combatant entity ID");
    expect(() =>
      resolveZeroHealthLifecycles({
        combatants: [combatant()],
        occupancy: [
          { entityId: "entity.unknown" as never, nodeId: "node.entry" as never }
        ]
      })
    ).toThrow("unknown combatant");
    expect(() =>
      resolveZeroHealthLifecycles({
        combatants: [combatant()],
        occupancy: [
          occupancy[1] as NavigationOccupant,
          { ...occupancy[1] } as NavigationOccupant
        ]
      })
    ).toThrow("duplicate occupied entity ID");
  });

  it("rejects sparse arrays and accessors without invoking caller code", () => {
    expect(() =>
      resolveZeroHealthLifecycles({
        combatants: new Array(1) as CombatantLifecycle[],
        occupancy: []
      })
    ).toThrow("dense data array");

    let getterCalls = 0;
    const accessor = combatant();
    Object.defineProperty(accessor, "entityId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "entity.dwarf.accessor";
      }
    });
    expect(() =>
      resolveZeroHealthLifecycles({ combatants: [accessor], occupancy: [] })
    ).toThrow("entityId must be an enumerable data property");
    expect(getterCalls).toBe(0);
  });
});
