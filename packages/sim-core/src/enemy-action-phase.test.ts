import { compileContent } from "@dwarven-depths/content-runtime";
import {
  type BattlefieldState,
  type ContentBundle,
  canonicalHash
} from "@dwarven-depths/contracts";
import { beforeAll, describe, expect, it } from "vitest";
import { enemyActionPhaseParityEvidence } from "./enemy-action-phase.fixture.js";
import { resolveEnemyActionPhase } from "./enemy-action-phase.js";
import {
  battlefield,
  combatant,
  enemyMovementPlanningContent,
  entry
} from "./enemy-movement-planning.fixture.js";

let content: Awaited<ReturnType<typeof compileContent>>;

beforeAll(async () => {
  content = await compileContent(
    enemyMovementPlanningContent as unknown as ContentBundle
  );
});

describe("enemy action phase", () => {
  it("persists targets independently of movement cadence and starts only in attack geometry", () => {
    const movingEnemy = combatant("entity.enemy.waiting", 6, null);
    const moving = resolveEnemyActionPhase(
      {
        schemaVersion: 1,
        currentTick: 1,
        levelId: "level.conformance_map" as never,
        battlefield: battlefield(movingEnemy, "node.entry" as never),
        entries: [entry(movingEnemy.entityId)]
      },
      content
    );
    expect(moving.decisions[0]).toMatchObject({
      status: "tracking",
      reason: "target_acquired_for_movement",
      targetLock: { status: "reacquired" }
    });
    expect(moving.enemyCombatants[0]?.actionState.currentTargetEntityId).toBe(
      "entity.dwarf.warden"
    );
    expect(moving.enemyCombatants[0]?.actionState.activeBasicAttack).toBeNull();

    const readyEnemy = combatant("entity.enemy.already", 6, null);
    const ready = resolveEnemyActionPhase(
      {
        schemaVersion: 1,
        currentTick: 6,
        levelId: "level.conformance_map" as never,
        battlefield: battlefield(readyEnemy, "node.south" as never),
        entries: [entry(readyEnemy.entityId)]
      },
      content
    );
    expect(ready.decisions[0]).toMatchObject({
      status: "winding_up",
      reason: "basic_attack_started",
      attackId: "attack.goblin_cutter_basic.enemy.already.tick_6"
    });
    expect(
      ready.enemyCombatants[0]?.actionState.activeBasicAttack
    ).toMatchObject({
      startedAtTick: 6,
      commitAtTick: 12,
      impactAtTick: 13,
      cooldownDurationTicks: 20,
      targetIsValid: true
    });
  });

  it("waits, cancels, commits, blocks on cooldown, and creates a repeated instance", async () => {
    const evidence = await enemyActionPhaseParityEvidence();
    expect(evidence.winding.decisions[0]?.reason).toBe(
      "basic_attack_winding_up"
    );
    expect(evidence.cancelled.decisions[0]).toMatchObject({
      status: "cancelled",
      reason: "basic_attack_cancelled",
      targetLock: { status: "unlocked" }
    });
    expect(evidence.committed.committedAttacks[0]).toMatchObject({
      attackId: "attack.goblin_cutter_basic.enemy.already.tick_6",
      committedAtTick: 12,
      impactAtTick: 13,
      cooldownCompleteAtTick: 32
    });
    expect(
      evidence.committed.enemyCombatants[0]?.actionState.activeBasicAttack
    ).toBeNull();
    expect(
      evidence.committed.enemyCombatants[0]?.actionState.cooldownCompleteAtTick
    ).toBe(32);
    expect(evidence.coolingDown.decisions[0]?.reason).toBe(
      "cooldown_in_progress"
    );
    expect(evidence.restarted.decisions[0]).toMatchObject({
      reason: "basic_attack_started",
      attackId: "attack.goblin_cutter_basic.enemy.already.tick_32"
    });
    expect(evidence.restarted.decisions[0]?.attackId).not.toBe(
      evidence.started.decisions[0]?.attackId
    );
  });

  it("returns detached deeply frozen stable evidence without mutating input", () => {
    const enemy = combatant("entity.enemy.already", 6, null);
    const request = {
      schemaVersion: 1 as const,
      currentTick: 6,
      levelId: "level.conformance_map" as never,
      battlefield: battlefield(enemy, "node.south" as never),
      entries: [entry(enemy.entityId)]
    };
    const before = structuredClone(request);
    const result = resolveEnemyActionPhase(request, content);
    expect(request).toEqual(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.enemyCombatants)).toBe(true);
    expect(Object.isFrozen(result.enemyCombatants[0])).toBe(true);
    expect(Object.isFrozen(result.enemyCombatants[0]?.actionState)).toBe(true);
    expect(
      Object.isFrozen(
        result.enemyCombatants[0]?.actionState.activeBasicAttack as object
      )
    ).toBe(true);
    expect(Object.isFrozen(result.decisions[0]?.targetLock)).toBe(true);
  });

  it("keeps same-definition attack instances unique and permutation invariant", () => {
    const first = combatant("entity.enemy.already", 6, null);
    const second = combatant("entity.enemy.second", 6, null);
    const firstState = battlefield(first, "node.south" as never);
    const secondState = battlefield(second, "node.east" as never);
    const combined: BattlefieldState = {
      ...firstState,
      occupancy: [
        { entityId: first.entityId, nodeId: "node.south" as never },
        { entityId: second.entityId, nodeId: "node.east" as never },
        {
          entityId: "entity.dwarf.warden" as never,
          nodeId: "node.goal" as never
        }
      ],
      pendingSpawns: firstState.pendingSpawns.filter(
        (spawn) => spawn.entityId !== second.entityId
      ),
      enemyAdmissions: [
        ...firstState.enemyAdmissions,
        ...secondState.enemyAdmissions
      ],
      enemyCombatants: [second, first]
    };
    const entries = [entry(second.entityId), entry(first.entityId)];
    const result = resolveEnemyActionPhase(
      {
        schemaVersion: 1,
        currentTick: 6,
        levelId: "level.conformance_map" as never,
        battlefield: combined,
        entries
      },
      content
    );
    expect(result.decisions.map((item) => item.enemyEntityId)).toEqual([
      "entity.enemy.already",
      "entity.enemy.second"
    ]);
    expect(new Set(result.decisions.map((item) => item.attackId)).size).toBe(2);

    const permuted = resolveEnemyActionPhase(
      {
        schemaVersion: 1,
        currentTick: 6,
        levelId: "level.conformance_map" as never,
        battlefield: {
          ...combined,
          occupancy: [...combined.occupancy].reverse(),
          pendingSpawns: [...combined.pendingSpawns].reverse(),
          enemyAdmissions: [...combined.enemyAdmissions].reverse(),
          enemyCombatants: [...combined.enemyCombatants].reverse()
        },
        entries: [...entries].reverse()
      },
      content
    );
    expect(permuted).toEqual(result);
  });

  it("inherits strict authoritative request validation", () => {
    const enemy = combatant("entity.enemy.already", 6, null);
    const sparse = new Array(1) as ReturnType<typeof entry>[];
    expect(() =>
      resolveEnemyActionPhase(
        {
          schemaVersion: 1,
          currentTick: 6,
          levelId: "level.conformance_map" as never,
          battlefield: battlefield(enemy, "node.south" as never),
          entries: sparse
        },
        content
      )
    ).toThrow("dense data array");

    let getterCalls = 0;
    const unsafe = entry(enemy.entityId);
    Object.defineProperty(unsafe, "candidates", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return [];
      }
    });
    expect(() =>
      resolveEnemyActionPhase(
        {
          schemaVersion: 1,
          currentTick: 6,
          levelId: "level.conformance_map" as never,
          battlefield: battlefield(enemy, "node.south" as never),
          entries: [unsafe]
        },
        content
      )
    ).toThrow("must be own enumerable data");
    expect(getterCalls).toBe(0);
  });

  it("pins action evidence for browser parity", async () => {
    expect(await canonicalHash(await enemyActionPhaseParityEvidence())).toBe(
      "3375f6faa4c212ee26bcaed8f9a8f856eee3a9ca1d87b1ab252a7bf375fb2fa7"
    );
  });
});
