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
          lifecycleState: "active",
          basicAttack: {
            id: "attack.goblin_cutter_basic",
            windupTicks: 6,
            impactDelayTicks: 1,
            cooldownTicks: 20,
            damage: 10,
            range: 1,
            requiresLineOfSight: false
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
        basicAttack: expect.objectContaining({ damage: 10, range: 1 })
      }),
      expect.objectContaining({
        entityId: "entity.enemy.second",
        enemyDefinitionId: "enemy.goblin_slinger",
        currentHealth: 38,
        movementIntervalTicks: 7,
        basicAttack: expect.objectContaining({
          damage: 9,
          range: 6,
          requiresLineOfSight: true
        })
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
    ).toThrow("wave that is not marked started");
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

  it("pins the composed Node evidence checksum", async () => {
    expect(
      await canonicalHash(await scheduledBattlefieldParityEvidence())
    ).toBe("99c041bd09947025a43ee9523a11dafd6d5d1f396ba825bd97aa023b4c72f2a1");
  });
});
