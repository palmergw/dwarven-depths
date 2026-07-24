import {
  type CompiledContent,
  compileContent
} from "@dwarven-depths/content-runtime";
import {
  type ContentBundle,
  canonicalHash,
  type EnemyMovementPlanningRequest,
  type NavigationNodeId
} from "@dwarven-depths/contracts";
import { beforeAll, describe, expect, it } from "vitest";
import conformanceContent from "../../../content/fixtures/conformance-map.json" with {
  type: "json"
};
import referenceCombatants from "../../../content/fixtures/phase-3-reference-combatants.json" with {
  type: "json"
};
import {
  battlefield,
  combatant,
  enemyMovementPlanningParityEvidence,
  entry
} from "./enemy-movement-planning.fixture.js";
import { planEnemyMovement as executeEnemyMovementPlanning } from "./enemy-movement-planning.js";

let content: CompiledContent;

beforeAll(async () => {
  content = await compileContent({
    ...conformanceContent,
    definitions: [
      ...conformanceContent.definitions,
      ...referenceCombatants.definitions.filter(
        (definition) => definition.id === "enemy.goblin_cutter"
      )
    ]
  } as unknown as ContentBundle);
});

function planEnemyMovement(request: EnemyMovementPlanningRequest) {
  return executeEnemyMovementPlanning(request, content);
}

function request(): EnemyMovementPlanningRequest {
  const enemy = combatant("entity.enemy.test", 6, null);
  return {
    schemaVersion: 1,
    currentTick: 6,
    battlefield: battlefield(enemy, "node.entry" as NavigationNodeId),
    entries: [entry(enemy.entityId)]
  };
}

describe("deterministic enemy movement proposal planning", () => {
  it("retains or reacquires targets and produces stable next-node proposals", async () => {
    const evidence = await enemyMovementPlanningParityEvidence();
    expect(evidence.proposed.proposals).toEqual([
      {
        id: "movement.auto.enemy.proposed",
        entityId: "entity.enemy.proposed",
        fromNodeId: "node.entry",
        toNodeId: "node.south"
      }
    ]);
    expect(evidence.proposed.decisions[0]?.targetLock).toMatchObject({
      status: "retained",
      targetEntityId: "entity.dwarf.warden"
    });
    expect(evidence.alreadyValid.decisions[0]?.reason).toBe(
      "already_attack_valid"
    );
    expect(evidence.unreachable.decisions[0]?.reason).toBe(
      "no_attack_position_reachable"
    );
    expect(evidence.notDue.decisions[0]?.reason).toBe("movement_not_due");
    expect(evidence.unlocked.decisions[0]?.reason).toBe("no_eligible_target");
  });

  it("derives solid blocker nodes while leaving moving enemies to reservations", () => {
    const base = request();
    const planningEntry = base.entries[0];
    if (planningEntry === undefined) throw new Error("missing planning entry");
    const blocker = {
      entityId: "entity.blocker.wall",
      nodeId: "node.south"
    } as const;
    const blocked = planEnemyMovement({
      ...base,
      battlefield: {
        ...base.battlefield,
        occupancy: [...base.battlefield.occupancy, blocker]
      },
      entries: [
        {
          ...base.entries[0],
          solidBlockerEntityIds: [blocker.entityId]
        }
      ]
    } as unknown as EnemyMovementPlanningRequest);
    expect(blocked.proposals[0]?.toNodeId).toBe("node.east");
    expect(() =>
      planEnemyMovement({
        ...base,
        entries: [
          {
            ...planningEntry,
            solidBlockerEntityIds: ["entity.enemy.test" as never]
          }
        ]
      })
    ).toThrow("moving enemy cannot be a solid route blocker");
  });

  it("rejects occupancy, active-enemy, target-placement, and entry mismatches", () => {
    const base = request();
    expect(() =>
      planEnemyMovement({
        ...base,
        battlefield: { ...base.battlefield, occupancy: [] }
      })
    ).toThrow("active enemy is not occupied");
    expect(() => planEnemyMovement({ ...base, entries: [] })).toThrow(
      "active enemy is missing movement planning entry"
    );
    expect(() =>
      planEnemyMovement({
        ...base,
        battlefield: {
          ...base.battlefield,
          occupancy: base.battlefield.occupancy.map((occupant) =>
            occupant.entityId === "entity.dwarf.warden"
              ? { ...occupant, nodeId: "node.east" as NavigationNodeId }
              : occupant
          )
        }
      })
    ).toThrow("target candidate occupancy does not match placement");
    expect(() =>
      planEnemyMovement({
        ...base,
        entries: [base.entries[0] as never, base.entries[0] as never]
      })
    ).toThrow("duplicate movement planning enemy");
  });

  it("binds enemy state to admissions, definitions, cadence, and occupancy", () => {
    const base = request();
    expect(() =>
      planEnemyMovement({
        ...base,
        battlefield: { ...base.battlefield, enemyAdmissions: [] }
      })
    ).toThrow("does not match authoritative admission evidence");
    expect(() =>
      planEnemyMovement({
        ...base,
        battlefield: {
          ...base.battlefield,
          enemyCombatants: base.battlefield.enemyCombatants.map(
            (combatant) => ({
              ...combatant,
              actionState: {
                ...combatant.actionState,
                nextMovementAtTick: combatant.admittedAtTick
              }
            })
          )
        }
      })
    ).toThrow("invalid health or movement cadence");
    const omittedEnemy = {
      entityId: "entity.enemy.omitted" as never,
      nodeId: "node.south" as NavigationNodeId
    };
    expect(() =>
      planEnemyMovement({
        ...base,
        battlefield: {
          ...base.battlefield,
          occupancy: [...base.battlefield.occupancy, omittedEnemy]
        }
      })
    ).toThrow("occupied enemy is missing authoritative combatant state");
  });

  it("rejects extended/accessor records and custom arrays", () => {
    const base = request();
    expect(() => planEnemyMovement({ ...base, extra: true } as never)).toThrow(
      "exactly the expected keys"
    );
    const accessor = Object.defineProperty({ ...base }, "currentTick", {
      enumerable: true,
      get: () => 6
    });
    expect(() => planEnemyMovement(accessor as never)).toThrow(
      "currentTick must be own enumerable data"
    );
    const customEntries = [...base.entries];
    Object.defineProperty(customEntries, Symbol.iterator, {
      value: () => [][Symbol.iterator](),
      enumerable: false
    });
    expect(() =>
      planEnemyMovement({ ...base, entries: customEntries })
    ).toThrow("movement planning entries must be a dense data array");
  });

  it("is permutation invariant, detached, deeply frozen, and checksum pinned", async () => {
    const base = request();
    const before = structuredClone(base);
    const result = planEnemyMovement(base);
    expect(base).toEqual(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.proposals)).toBe(true);
    expect(Object.isFrozen(result.decisions)).toBe(true);
    expect(Object.isFrozen(result.decisions[0])).toBe(true);
    const second = combatant("entity.enemy.second", 6, null);
    const batch = {
      ...base,
      battlefield: {
        ...base.battlefield,
        occupancy: [
          ...base.battlefield.occupancy,
          { entityId: second.entityId, nodeId: "node.east" as NavigationNodeId }
        ],
        enemyCombatants: [...base.battlefield.enemyCombatants, second],
        enemyAdmissions: [
          ...base.battlefield.enemyAdmissions,
          ...battlefield(second, "node.east" as NavigationNodeId)
            .enemyAdmissions
        ]
      },
      entries: [...base.entries, entry(second.entityId)]
    };
    const forward = planEnemyMovement(batch);
    const reversed = planEnemyMovement({
      ...batch,
      battlefield: {
        ...batch.battlefield,
        occupancy: [...batch.battlefield.occupancy].reverse(),
        enemyCombatants: [...batch.battlefield.enemyCombatants].reverse()
      },
      entries: [...batch.entries].reverse()
    });
    expect(reversed).toEqual(forward);
    const evidence = await enemyMovementPlanningParityEvidence();
    expect(await canonicalHash(evidence)).toBe(
      "e4a188281420c86eac8d0b2b4309236bd317cab8eb5160e76153066d12136055"
    );
  });
});
