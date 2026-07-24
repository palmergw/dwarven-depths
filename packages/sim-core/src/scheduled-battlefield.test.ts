import { compileContent } from "@dwarven-depths/content-runtime";
import { canonicalHash, type SimulationEvent } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  resolveBattlefieldPhase,
  resolveScheduledBattlefieldPhase
} from "./index.js";
import {
  scheduledBattlefieldContent,
  scheduledBattlefieldParityEvidence
} from "./scheduled-battlefield.fixture.js";

function eventEvidence(event: SimulationEvent): readonly [string, string] {
  if (!("reasonCode" in event)) throw new Error("expected reason-coded event");
  return [event.type, event.reasonCode];
}

describe("authored wave battlefield composition", () => {
  it("persists schedule progress before authoritative queue admission", async () => {
    const [due] = await scheduledBattlefieldParityEvidence();
    expect(due?.state.battlefield).toEqual({
      schemaVersion: 1,
      mapId: "map.conformance_diamond",
      startedWaveIds: ["wave.opening", "wave.overlap"],
      firedSpawnIds: ["spawn.first", "spawn.second"],
      occupancy: [{ entityId: "entity.enemy.first", nodeId: "node.entry" }],
      pendingSpawns: [
        {
          id: "spawn.second",
          authoredOrder: 1,
          entityId: "entity.enemy.second",
          enemyDefinitionId: "enemy.goblin_slinger",
          entranceId: "entrance.west"
        }
      ],
      enemyAdmissions: [
        {
          schemaVersion: 1,
          spawnId: "spawn.first",
          entityId: "entity.enemy.first",
          admittedAtTick: 0
        }
      ],
      enemyCombatants: [
        {
          schemaVersion: 1,
          entityId: "entity.enemy.first",
          enemyDefinitionId: "enemy.goblin_cutter",
          classification: "basic",
          currentHealth: 50,
          maximumHealth: 50,
          armor: 0,
          movementIntervalTicks: 6,
          admittedAtTick: 0,
          lifecycleState: "active",
          basicAttack: {
            id: "attack.goblin_cutter_basic",
            windupTicks: 6,
            impactDelayTicks: 1,
            cooldownTicks: 20,
            damage: 10,
            range: 1,
            requiresLineOfSight: false
          },
          actionState: {
            schemaVersion: 1,
            nextMovementAtTick: 6,
            currentTargetEntityId: null,
            activeBasicAttack: null,
            cooldownCompleteAtTick: null
          }
        }
      ]
    });
    expect(due?.events.map(eventEvidence)).toEqual([
      ["wave.started", "authored_wave_start_reached"],
      ["wave.started", "authored_wave_start_reached"],
      ["spawn.enqueued", "authored_spawn_tick_reached"],
      ["spawn.enqueued", "authored_spawn_tick_reached"],
      ["spawn.admitted", "admitted"],
      ["spawn.queued", "earlier_spawn_pending"]
    ]);
    expect(due?.events.map((event) => event.sequence)).toEqual([
      0, 1, 2, 3, 4, 5
    ]);
    expect(
      due?.events
        .filter((event) => event.type.startsWith("spawn."))
        .map((event) =>
          "enemyDefinitionId" in event ? event.enemyDefinitionId : undefined
        )
    ).toEqual([
      "enemy.goblin_cutter",
      "enemy.goblin_slinger",
      "enemy.goblin_cutter",
      "enemy.goblin_slinger"
    ]);
  });

  it("retries queued enemies without replaying authored schedule events", async () => {
    const [, moved, admitted] = await scheduledBattlefieldParityEvidence();
    expect(moved?.events.map(eventEvidence)).toEqual([
      ["spawn.queued", "entrance_occupied"],
      ["movement.moved", "moved"]
    ]);
    expect(admitted?.events.map(eventEvidence)).toEqual([
      ["spawn.admitted", "admitted"]
    ]);
    expect(admitted?.state.battlefield?.pendingSpawns).toEqual([]);
    expect(admitted?.state.battlefield?.enemyCombatants).toEqual([
      expect.objectContaining({
        entityId: "entity.enemy.first",
        enemyDefinitionId: "enemy.goblin_cutter",
        currentHealth: 50,
        movementIntervalTicks: 6,
        admittedAtTick: 0,
        basicAttack: expect.objectContaining({ damage: 10, range: 1 }),
        actionState: {
          schemaVersion: 1,
          nextMovementAtTick: 6,
          currentTargetEntityId: null,
          activeBasicAttack: null,
          cooldownCompleteAtTick: null
        }
      }),
      expect.objectContaining({
        entityId: "entity.enemy.second",
        enemyDefinitionId: "enemy.goblin_slinger",
        currentHealth: 38,
        movementIntervalTicks: 7,
        admittedAtTick: 0,
        basicAttack: expect.objectContaining({
          damage: 9,
          range: 6,
          requiresLineOfSight: true
        }),
        actionState: {
          schemaVersion: 1,
          nextMovementAtTick: 7,
          currentTargetEntityId: null,
          activeBasicAttack: null,
          cooldownCompleteAtTick: null
        }
      })
    ]);
    expect(admitted?.state.battlefield?.occupancy).toEqual([
      { entityId: "entity.enemy.first", nodeId: "node.south" },
      { entityId: "entity.enemy.second", nodeId: "node.entry" }
    ]);
  });

  it("returns detached deeply immutable state and evidence", async () => {
    const content = await compileContent(scheduledBattlefieldContent);
    const initial = createInitialState(
      content,
      "level.scheduled_battlefield" as never,
      "1"
    );
    const before = structuredClone(initial);
    const result = resolveScheduledBattlefieldPhase(initial, content, []);

    expect(initial).toEqual(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.state)).toBe(true);
    expect(Object.isFrozen(result.state.battlefield)).toBe(true);
    expect(Object.isFrozen(result.state.battlefield?.startedWaveIds)).toBe(
      true
    );
    expect(Object.isFrozen(result.state.battlefield?.firedSpawnIds)).toBe(true);
    expect(Object.isFrozen(result.state.battlefield?.enemyCombatants)).toBe(
      true
    );
    expect(Object.isFrozen(result.state.battlefield?.enemyCombatants[0])).toBe(
      true
    );
    expect(
      Object.isFrozen(result.state.battlefield?.enemyCombatants[0]?.basicAttack)
    ).toBe(true);
    expect(
      Object.isFrozen(result.state.battlefield?.enemyCombatants[0]?.actionState)
    ).toBe(true);
    expect(Object.isFrozen(result.events)).toBe(true);
    expect(Object.isFrozen(result.events[0])).toBe(true);
  });

  it("uses level wave order instead of compiled definition order", async () => {
    const forwardContent = await compileContent(scheduledBattlefieldContent);
    const reverseContent = await compileContent({
      ...scheduledBattlefieldContent,
      definitions: [...scheduledBattlefieldContent.definitions].reverse()
    });
    const forwardState = createInitialState(
      forwardContent,
      "level.scheduled_battlefield" as never,
      "1"
    );
    const reverseState = createInitialState(
      reverseContent,
      "level.scheduled_battlefield" as never,
      "1"
    );

    expect(
      resolveScheduledBattlefieldPhase(reverseState, reverseContent, [])
    ).toEqual(
      resolveScheduledBattlefieldPhase(forwardState, forwardContent, [])
    );
  });

  it("rejects inconsistent persisted schedule progress without mutation", async () => {
    const content = await compileContent(scheduledBattlefieldContent);
    const initial = createInitialState(
      content,
      "level.scheduled_battlefield" as never,
      "1"
    );
    if (initial.battlefield === undefined)
      throw new Error("expected battlefield");
    const malformed = {
      ...initial,
      battlefield: {
        ...initial.battlefield,
        firedSpawnIds: ["spawn.first" as never]
      }
    };
    const before = structuredClone(malformed);

    expect(() =>
      resolveScheduledBattlefieldPhase(malformed, content, [])
    ).toThrow("does not match authoritative admission evidence");
    expect(malformed).toEqual(before);
  });

  it("rejects authored definition tampering at direct battlefield admission", async () => {
    const content = await compileContent(scheduledBattlefieldContent);
    const initial = createInitialState(
      content,
      "level.scheduled_battlefield" as never,
      "1"
    );

    expect(() =>
      resolveBattlefieldPhase(
        initial,
        content,
        [
          {
            id: "spawn.first" as never,
            authoredOrder: 0,
            entityId: "entity.enemy.first" as never,
            enemyDefinitionId: "enemy.goblin_slinger" as never,
            entranceId: "entrance.west" as never
          }
        ],
        []
      )
    ).toThrow("does not match authored schedule");
  });

  it("validates persisted combatants before intermediate scheduled-state freezing", async () => {
    const content = await compileContent(scheduledBattlefieldContent);
    const initial = createInitialState(
      content,
      "level.scheduled_battlefield" as never,
      "1"
    );
    const due = resolveScheduledBattlefieldPhase(initial, content, []);
    if (due.state.battlefield === undefined)
      throw new Error("expected battlefield state");
    const combatants = [...due.state.battlefield.enemyCombatants];
    Object.defineProperty(combatants, "map", {
      value: () => [],
      enumerable: false
    });
    const custom = {
      ...due.state,
      battlefield: { ...due.state.battlefield, enemyCombatants: combatants }
    };

    expect(() => resolveScheduledBattlefieldPhase(custom, content, [])).toThrow(
      "battlefield enemy combatants contains unsupported array properties"
    );
  });

  it("binds persisted combatants to fired authored spawn identities", async () => {
    const content = await compileContent(scheduledBattlefieldContent);
    const initial = createInitialState(
      content,
      "level.scheduled_battlefield" as never,
      "1"
    );
    if (initial.battlefield === undefined)
      throw new Error("expected initial battlefield state");
    const due = resolveScheduledBattlefieldPhase(initial, content, []);
    if (due.state.battlefield === undefined)
      throw new Error("expected battlefield state");
    const slinger = content.enemies.get("enemy.goblin_slinger" as never);
    if (slinger === undefined) throw new Error("expected slinger definition");
    const swapped = {
      ...due.state,
      battlefield: {
        ...due.state.battlefield,
        enemyCombatants: due.state.battlefield.enemyCombatants.map(
          (combatant) => ({
            ...combatant,
            enemyDefinitionId: slinger.id,
            classification: slinger.classification,
            currentHealth: slinger.maximumHealth,
            maximumHealth: slinger.maximumHealth,
            armor: slinger.armor,
            movementIntervalTicks: slinger.movementIntervalTicks,
            basicAttack: { ...slinger.basicAttack }
          })
        )
      }
    };
    const missing = {
      ...due.state,
      battlefield: { ...due.state.battlefield, enemyCombatants: [] }
    };
    const unfiredPending = {
      ...due.state,
      battlefield: {
        ...due.state.battlefield,
        firedSpawnIds: due.state.battlefield.firedSpawnIds.filter(
          (spawnId) => spawnId !== "spawn.second"
        )
      }
    };
    const unstartedFiredSpawn = {
      ...due.state,
      battlefield: {
        ...due.state.battlefield,
        startedWaveIds: ["wave.opening"] as never
      }
    };
    const duplicateFiredSpawn = {
      ...due.state,
      battlefield: {
        ...due.state.battlefield,
        firedSpawnIds: [
          ...due.state.battlefield.firedSpawnIds,
          "spawn.first"
        ] as never
      }
    };
    const unknownStartedWave = {
      ...due.state,
      battlefield: {
        ...due.state.battlefield,
        startedWaveIds: [
          ...due.state.battlefield.startedWaveIds,
          "wave.unknown"
        ] as never
      }
    };
    const hiddenFiredSpawnIds = [...due.state.battlefield.firedSpawnIds];
    Object.defineProperty(hiddenFiredSpawnIds, Symbol.iterator, {
      value: () => [][Symbol.iterator](),
      enumerable: false
    });
    const hiddenProgress = {
      ...due.state,
      battlefield: {
        ...due.state.battlefield,
        occupancy: [],
        enemyCombatants: [],
        firedSpawnIds: hiddenFiredSpawnIds
      }
    };
    const future = {
      ...initial,
      battlefield: {
        ...initial.battlefield,
        occupancy: [
          { entityId: "entity.enemy.second", nodeId: "node.entrance_west" }
        ] as never,
        enemyCombatants: [
          {
            schemaVersion: 1,
            entityId: "entity.enemy.second",
            enemyDefinitionId: slinger.id,
            classification: slinger.classification,
            currentHealth: slinger.maximumHealth,
            maximumHealth: slinger.maximumHealth,
            armor: slinger.armor,
            movementIntervalTicks: slinger.movementIntervalTicks,
            admittedAtTick: 0,
            lifecycleState: "active",
            basicAttack: { ...slinger.basicAttack },
            actionState: {
              schemaVersion: 1,
              nextMovementAtTick: slinger.movementIntervalTicks,
              currentTargetEntityId: null,
              activeBasicAttack: null,
              cooldownCompleteAtTick: null
            }
          }
        ] as never
      }
    };

    expect(() =>
      resolveScheduledBattlefieldPhase(swapped, content, [])
    ).toThrow("does not match authored spawn identity");
    expect(() =>
      resolveScheduledBattlefieldPhase(missing, content, [])
    ).toThrow("is missing battlefield enemy combatant state");
    expect(() =>
      resolveBattlefieldPhase(unfiredPending, content, [], [])
    ).toThrow("pending spawn spawn.second is not marked fired");
    expect(() =>
      resolveBattlefieldPhase(unstartedFiredSpawn, content, [], [])
    ).toThrow("belongs to a wave that is not marked started");
    expect(() =>
      resolveBattlefieldPhase(duplicateFiredSpawn, content, [], [])
    ).toThrow("fired spawn IDs contains duplicate ID (spawn.first)");
    expect(() =>
      resolveBattlefieldPhase(unknownStartedWave, content, [], [])
    ).toThrow("unknown started wave ID (wave.unknown)");
    expect(() =>
      resolveScheduledBattlefieldPhase(hiddenProgress, content, [])
    ).toThrow("fired spawn IDs contains unsupported array properties");
    expect(() => resolveScheduledBattlefieldPhase(future, content, [])).toThrow(
      "does not match authored spawn identity"
    );
  });

  it("rejects malformed or incoherent persisted enemy action state", async () => {
    const content = await compileContent(scheduledBattlefieldContent);
    const initial = createInitialState(
      content,
      "level.scheduled_battlefield" as never,
      "1"
    );
    const due = resolveScheduledBattlefieldPhase(initial, content, []);
    if (due.state.battlefield === undefined)
      throw new Error("expected battlefield state");
    const original = due.state.battlefield.enemyCombatants[0];
    if (original === undefined) throw new Error("expected admitted enemy");
    const withActionState = (actionState: unknown) => ({
      ...due.state,
      battlefield: {
        ...due.state.battlefield,
        enemyCombatants: [{ ...original, actionState }]
      }
    });
    const accessorState = { ...original.actionState };
    Object.defineProperty(accessorState, "nextMovementAtTick", {
      get: () => 6,
      enumerable: true
    });

    expect(() =>
      resolveScheduledBattlefieldPhase(
        {
          ...due.state,
          battlefield: {
            ...due.state.battlefield,
            enemyCombatants: [{ ...original, admittedAtTick: 1 }]
          }
        } as never,
        content,
        []
      )
    ).toThrow("does not match authoritative admission timing");
    expect(() =>
      resolveScheduledBattlefieldPhase(
        {
          ...due.state,
          battlefield: {
            ...due.state.battlefield,
            enemyAdmissions:
              due.state.battlefield?.enemyAdmissions.map((admission) => ({
                ...admission,
                spawnId: "spawn.second"
              })) ?? []
          }
        } as never,
        content,
        []
      )
    ).toThrow("does not match authoritative admission evidence");
    expect(() =>
      resolveScheduledBattlefieldPhase(
        withActionState({
          ...original.actionState,
          cooldownCompleteAtTick: 20
        }) as never,
        content,
        []
      )
    ).not.toThrow();
    expect(() =>
      resolveScheduledBattlefieldPhase(
        withActionState(accessorState) as never,
        content,
        []
      )
    ).toThrow("nextMovementAtTick must be own enumerable data");
    expect(() =>
      resolveScheduledBattlefieldPhase(
        withActionState({
          ...original.actionState,
          currentTargetEntityId: "entity.dwarf.warden",
          activeBasicAttack: {
            schemaVersion: 1,
            attackId: original.basicAttack.id,
            sourceEntityId: original.entityId,
            targetEntityId: "entity.dwarf.warden",
            startedAtTick: 0,
            commitAtTick: Number.MAX_SAFE_INTEGER,
            impactAtTick: Number.MAX_SAFE_INTEGER,
            cooldownDurationTicks: 1,
            damage: 10,
            range: 1,
            targetIsValid: true
          }
        }) as never,
        content,
        []
      )
    ).toThrow("invalid active basic attack");
    expect(() =>
      resolveScheduledBattlefieldPhase(
        {
          ...withActionState({
            ...original.actionState,
            currentTargetEntityId: "entity.dwarf.warden",
            cooldownCompleteAtTick: 5
          }),
          tick: 10
        } as never,
        content,
        []
      )
    ).toThrow("invalid action state");
    expect(() =>
      resolveScheduledBattlefieldPhase(
        withActionState({
          ...original.actionState,
          currentTargetEntityId: "entity.dwarf.warden",
          activeBasicAttack: {
            schemaVersion: 1,
            attackId: "attack.unrelated",
            sourceEntityId: original.entityId,
            targetEntityId: "entity.dwarf.warden",
            startedAtTick: 0,
            commitAtTick: 1,
            impactAtTick: 2,
            cooldownDurationTicks: 20,
            damage: 10,
            range: 1,
            targetIsValid: true
          }
        }) as never,
        content,
        []
      )
    ).toThrow("invalid active basic attack");
  });

  it("pins the composed Node evidence checksum", async () => {
    expect(
      await canonicalHash(await scheduledBattlefieldParityEvidence())
    ).toBe("3d519cac0f9133b4ccf18f24677cc215a045ef149538ffd068b26251571380a0");
  });
});
