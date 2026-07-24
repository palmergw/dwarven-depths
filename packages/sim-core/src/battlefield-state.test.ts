import { compileContent } from "@dwarven-depths/content-runtime";
import {
  canonicalHash,
  type MovementProposal,
  type PendingSpawn,
  type SimulationEvent,
  type SimulationState
} from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import mapContentInput from "../../../content/fixtures/conformance-map.json" with {
  type: "json"
};
import referenceCombatantsInput from "../../../content/fixtures/phase-3-reference-combatants.json" with {
  type: "json"
};
import { createInitialState, resolveBattlefieldPhase } from "./index.js";

const battlefieldContentInput = {
  ...mapContentInput,
  definitions: [
    ...mapContentInput.definitions,
    ...referenceCombatantsInput.definitions.filter(
      (definition) => definition.kind === "enemy"
    )
  ]
};

function spawn(
  id: string,
  authoredOrder: number,
  entityId: string
): PendingSpawn {
  return {
    id,
    authoredOrder,
    entityId,
    enemyDefinitionId: "enemy.goblin_cutter",
    entranceId: "entrance.west"
  } as PendingSpawn;
}

function movement(
  id: string,
  entityId: string,
  fromNodeId: string,
  toNodeId: string
): MovementProposal {
  return { id, entityId, fromNodeId, toNodeId } as MovementProposal;
}

function cutterCombatant(entityId: string) {
  return {
    schemaVersion: 1,
    entityId,
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
  };
}

function decisionEvidence(event: SimulationEvent): readonly [string, string] {
  if (!("reasonCode" in event)) throw new Error("expected decision event");
  return [event.type, event.reasonCode];
}

describe("authoritative battlefield state", () => {
  it("initializes map-backed levels with canonical immutable battlefield state", async () => {
    const content = await compileContent(battlefieldContentInput);
    const state = createInitialState(
      content,
      "level.conformance_map" as never,
      "1"
    );

    expect(state.battlefield).toEqual({
      schemaVersion: 1,
      mapId: "map.conformance_diamond",
      startedWaveIds: [],
      firedSpawnIds: [],
      occupancy: [],
      pendingSpawns: [],
      enemyCombatants: []
    });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.battlefield)).toBe(true);
    expect(Object.isFrozen(state.battlefield?.occupancy)).toBe(true);
    expect(Object.isFrozen(state.battlefield?.pendingSpawns)).toBe(true);
  });

  it("admits, moves, queues, and resumes enemies in fixed same-step order", async () => {
    const content = await compileContent(battlefieldContentInput);
    const initial = createInitialState(
      content,
      "level.conformance_map" as never,
      "1"
    );
    const first = resolveBattlefieldPhase(
      initial,
      content,
      [
        spawn("spawn.first", 0, "entity.enemy.first"),
        spawn("spawn.second", 1, "entity.enemy.second")
      ],
      [
        movement(
          "movement.first",
          "entity.enemy.first",
          "node.entry",
          "node.south"
        )
      ]
    );

    expect(first.state.battlefield).toEqual({
      schemaVersion: 1,
      mapId: "map.conformance_diamond",
      startedWaveIds: [],
      firedSpawnIds: [],
      occupancy: [{ entityId: "entity.enemy.first", nodeId: "node.south" }],
      pendingSpawns: [
        {
          id: "spawn.second",
          authoredOrder: 1,
          entityId: "entity.enemy.second",
          enemyDefinitionId: "enemy.goblin_cutter",
          entranceId: "entrance.west"
        }
      ],
      enemyCombatants: [cutterCombatant("entity.enemy.first")]
    });
    expect(first.events.map(decisionEvidence)).toEqual([
      ["spawn.admitted", "admitted"],
      ["spawn.queued", "earlier_spawn_pending"],
      ["movement.moved", "moved"]
    ]);
    expect(first.events.map((event) => event.sequence)).toEqual([0, 1, 2]);
    expect(first.state.eventSequence).toBe(3);

    const resumed = resolveBattlefieldPhase(first.state, content, [], []);
    expect(await canonicalHash({ first, resumed })).toBe(
      "186ccc3230fc465211b58ecb827fd1d8b6ae39b7c635a73bf6bc5648cb94c5b1"
    );
    expect(resumed.state.battlefield).toEqual({
      schemaVersion: 1,
      mapId: "map.conformance_diamond",
      startedWaveIds: [],
      firedSpawnIds: [],
      occupancy: [
        { entityId: "entity.enemy.first", nodeId: "node.south" },
        { entityId: "entity.enemy.second", nodeId: "node.entry" }
      ],
      pendingSpawns: [],
      enemyCombatants: [
        cutterCombatant("entity.enemy.first"),
        cutterCombatant("entity.enemy.second")
      ]
    });
    expect(resumed.events.map(decisionEvidence)).toEqual([
      ["spawn.admitted", "admitted"]
    ]);
    expect(resumed.events[0]?.sequence).toBe(3);
    expect(Object.isFrozen(resumed.state)).toBe(true);
    expect(Object.isFrozen(resumed.events)).toBe(true);
    expect(Object.isFrozen(resumed.events[0])).toBe(true);
  });

  it("retries an entrance-blocked spawn after the blocker moves away", async () => {
    const content = await compileContent(battlefieldContentInput);
    const initial = createInitialState(
      content,
      "level.conformance_map" as never,
      "1"
    );
    if (initial.battlefield === undefined)
      throw new Error("expected battlefield state");
    const blocked: SimulationState = {
      ...initial,
      battlefield: {
        ...initial.battlefield,
        occupancy: [
          { entityId: "entity.enemy.blocker", nodeId: "node.entry" }
        ] as never
      }
    };

    const waited = resolveBattlefieldPhase(
      blocked,
      content,
      [spawn("spawn.waiting", 0, "entity.enemy.waiting")],
      [
        movement(
          "movement.blocker",
          "entity.enemy.blocker",
          "node.entry",
          "node.south"
        )
      ]
    );
    expect(waited.events.map(decisionEvidence)).toEqual([
      ["spawn.queued", "entrance_occupied"],
      ["movement.moved", "moved"]
    ]);

    const resumed = resolveBattlefieldPhase(waited.state, content, [], []);
    expect(resumed.events.map(decisionEvidence)).toEqual([
      ["spawn.admitted", "admitted"]
    ]);
    expect(resumed.state.battlefield?.occupancy).toEqual([
      { entityId: "entity.enemy.blocker", nodeId: "node.south" },
      { entityId: "entity.enemy.waiting", nodeId: "node.entry" }
    ]);
    expect(resumed.state.battlefield?.pendingSpawns).toEqual([]);
  });

  it("records deterministic movement contention against post-spawn occupancy", async () => {
    const content = await compileContent(battlefieldContentInput);
    const initial = createInitialState(
      content,
      "level.conformance_map" as never,
      "1"
    );
    if (initial.battlefield === undefined)
      throw new Error("expected battlefield state");
    const withSecondOccupant: SimulationState = {
      ...initial,
      battlefield: {
        ...initial.battlefield,
        occupancy: [
          { entityId: "entity.enemy.alpha", nodeId: "node.entry" },
          { entityId: "entity.enemy.beta", nodeId: "node.goal" }
        ] as never
      }
    };

    const result = resolveBattlefieldPhase(
      withSecondOccupant,
      content,
      [],
      [
        movement(
          "movement.beta",
          "entity.enemy.beta",
          "node.goal",
          "node.east"
        ),
        movement(
          "movement.alpha",
          "entity.enemy.alpha",
          "node.entry",
          "node.east"
        ),
        movement(
          "movement.ghost",
          "entity.enemy.ghost",
          "node.entry",
          "node.south"
        )
      ]
    );

    expect(result.events.map(decisionEvidence)).toEqual([
      ["movement.moved", "moved"],
      ["movement.waited", "destination_reserved"],
      ["movement.rejected", "entity_not_occupied"]
    ]);
    expect(result.state.battlefield?.occupancy).toEqual([
      { entityId: "entity.enemy.alpha", nodeId: "node.east" },
      { entityId: "entity.enemy.beta", nodeId: "node.goal" }
    ]);
  });

  it("rejects invalid phase input without mutating the original state", async () => {
    const content = await compileContent(battlefieldContentInput);
    const initial = createInitialState(
      content,
      "level.conformance_map" as never,
      "1"
    );
    const snapshot = structuredClone(initial);

    expect(() =>
      resolveBattlefieldPhase(
        initial,
        content,
        [
          spawn("spawn.duplicate", 0, "entity.enemy.same"),
          spawn("spawn.duplicate", 1, "entity.enemy.other")
        ],
        []
      )
    ).toThrow(/duplicate pending spawn ID/);
    expect(initial).toEqual(snapshot);
  });

  it("preserves mutable health and rejects definition-inconsistent combatants", async () => {
    const content = await compileContent(battlefieldContentInput);
    const initial = createInitialState(
      content,
      "level.conformance_map" as never,
      "1"
    );
    const admitted = resolveBattlefieldPhase(
      initial,
      content,
      [spawn("spawn.persisted", 0, "entity.enemy.persisted")],
      []
    );
    if (admitted.state.battlefield === undefined)
      throw new Error("expected battlefield state");
    const damaged: SimulationState = {
      ...admitted.state,
      battlefield: {
        ...admitted.state.battlefield,
        enemyCombatants: admitted.state.battlefield.enemyCombatants.map(
          (combatant) => ({ ...combatant, currentHealth: 25 })
        )
      }
    };

    expect(
      resolveBattlefieldPhase(damaged, content, [], []).state.battlefield
        ?.enemyCombatants[0]?.currentHealth
    ).toBe(25);
    const damagedBattlefield = damaged.battlefield;
    if (damagedBattlefield === undefined)
      throw new Error("expected damaged battlefield state");

    const mismatched: SimulationState = {
      ...damaged,
      battlefield: {
        ...damagedBattlefield,
        enemyCombatants: damagedBattlefield.enemyCombatants.map(
          (combatant) => ({ ...combatant, armor: 99 })
        ) as never
      }
    };
    const before = structuredClone(mismatched);
    expect(() => resolveBattlefieldPhase(mismatched, content, [], [])).toThrow(
      "does not match compiled enemy definition"
    );
    expect(mismatched).toEqual(before);
  });

  it("rejects extended records and custom combatant arrays", async () => {
    const content = await compileContent(battlefieldContentInput);
    const initial = createInitialState(
      content,
      "level.conformance_map" as never,
      "1"
    );
    const admitted = resolveBattlefieldPhase(
      initial,
      content,
      [spawn("spawn.strict", 0, "entity.enemy.strict")],
      []
    );
    if (admitted.state.battlefield === undefined)
      throw new Error("expected battlefield state");
    const combatant = admitted.state.battlefield.enemyCombatants[0];
    if (combatant === undefined) throw new Error("expected enemy combatant");
    const extended: SimulationState = {
      ...admitted.state,
      battlefield: {
        ...admitted.state.battlefield,
        enemyCombatants: [
          { ...combatant, extension: { mutable: true } }
        ] as never
      }
    };
    expect(() => resolveBattlefieldPhase(extended, content, [], [])).toThrow(
      "must contain exactly the expected keys"
    );

    const customArray = [combatant];
    Object.defineProperty(customArray, Symbol.iterator, {
      value: () => [][Symbol.iterator](),
      enumerable: false
    });
    const custom: SimulationState = {
      ...admitted.state,
      battlefield: {
        ...admitted.state.battlefield,
        enemyCombatants: customArray
      }
    };
    expect(() => resolveBattlefieldPhase(custom, content, [], [])).toThrow(
      "contains unsupported array properties"
    );
  });

  it("rejects custom pending queues before definition and identity checks", async () => {
    const content = await compileContent(battlefieldContentInput);
    const initial = createInitialState(
      content,
      "level.conformance_map" as never,
      "1"
    );
    if (initial.battlefield === undefined)
      throw new Error("expected battlefield state");
    const pending = [spawn("spawn.custom_queue", 0, "entity.enemy.queued")];
    Object.defineProperty(pending, Symbol.iterator, {
      value: () => [][Symbol.iterator](),
      enumerable: false
    });
    const custom: SimulationState = {
      ...initial,
      battlefield: { ...initial.battlefield, pendingSpawns: pending }
    };

    expect(() => resolveBattlefieldPhase(custom, content, [], [])).toThrow(
      "persisted pending spawns contains unsupported array properties"
    );
  });

  it("rejects live-enemy limits inconsistent with authoritative combatants", async () => {
    const content = await compileContent(battlefieldContentInput);
    const initial = createInitialState(
      content,
      "level.conformance_map" as never,
      "1"
    );
    const admitted = resolveBattlefieldPhase(
      initial,
      content,
      [spawn("spawn.counted", 0, "entity.enemy.counted")],
      []
    );

    expect(() =>
      resolveBattlefieldPhase(admitted.state, content, [], [], {
        liveEnemyCap: 2,
        currentLiveEnemies: 0
      })
    ).toThrow("does not match authoritative active combatants 1");

    const getterLimits = Object.defineProperties(
      {},
      {
        liveEnemyCap: { enumerable: true, get: () => 1 },
        currentLiveEnemies: { enumerable: true, get: () => 0 }
      }
    ) as never;
    expect(() =>
      resolveBattlefieldPhase(initial, content, [], [], getterLimits)
    ).toThrow(
      "spawn admission limits.currentLiveEnemies must be own enumerable data"
    );
  });

  it("rejects enemy lifecycle and occupancy mismatches", async () => {
    const content = await compileContent(battlefieldContentInput);
    const initial = createInitialState(
      content,
      "level.conformance_map" as never,
      "1"
    );
    const admitted = resolveBattlefieldPhase(
      initial,
      content,
      [spawn("spawn.occupancy", 0, "entity.enemy.occupancy")],
      []
    );
    if (admitted.state.battlefield === undefined)
      throw new Error("expected battlefield state");
    const combatant = admitted.state.battlefield.enemyCombatants[0];
    if (combatant === undefined) throw new Error("expected enemy combatant");

    const activeMissing: SimulationState = {
      ...admitted.state,
      battlefield: { ...admitted.state.battlefield, occupancy: [] }
    };
    expect(() =>
      resolveBattlefieldPhase(activeMissing, content, [], [])
    ).toThrow("active battlefield enemy combatant is not occupied");

    const destroyedOccupied: SimulationState = {
      ...admitted.state,
      battlefield: {
        ...admitted.state.battlefield,
        enemyCombatants: [
          { ...combatant, currentHealth: 0, lifecycleState: "destroyed" }
        ] as never
      }
    };
    expect(() =>
      resolveBattlefieldPhase(destroyedOccupied, content, [], [])
    ).toThrow("destroyed battlefield enemy combatant remains occupied");
  });

  it("rejects queued spawns whose enemy definition is unavailable", async () => {
    const content = await compileContent(battlefieldContentInput);
    const initial = createInitialState(
      content,
      "level.conformance_map" as never,
      "1"
    );
    const unknown = {
      ...spawn("spawn.unknown", 0, "entity.enemy.unknown"),
      enemyDefinitionId: "enemy.unknown" as never
    };
    if (initial.battlefield === undefined)
      throw new Error("expected battlefield state");
    const entranceBlocked: SimulationState = {
      ...initial,
      battlefield: {
        ...initial.battlefield,
        occupancy: [
          { entityId: "entity.blocker", nodeId: "node.entry" }
        ] as never
      }
    };
    const before = structuredClone(entranceBlocked);

    expect(() =>
      resolveBattlefieldPhase(entranceBlocked, content, [unknown], [])
    ).toThrow("references unknown enemy definition");
    expect(entranceBlocked).toEqual(before);
  });

  it("rejects queued reuse of an existing destroyed enemy identity", async () => {
    const content = await compileContent(battlefieldContentInput);
    const initial = createInitialState(
      content,
      "level.conformance_map" as never,
      "1"
    );
    const admitted = resolveBattlefieldPhase(
      initial,
      content,
      [spawn("spawn.original", 0, "entity.enemy.reused")],
      []
    );
    if (admitted.state.battlefield === undefined)
      throw new Error("expected battlefield state");
    const destroyed: SimulationState = {
      ...admitted.state,
      battlefield: {
        ...admitted.state.battlefield,
        occupancy: [
          { entityId: "entity.blocker", nodeId: "node.entry" }
        ] as never,
        enemyCombatants: admitted.state.battlefield.enemyCombatants.map(
          (combatant) => ({
            ...combatant,
            currentHealth: 0,
            lifecycleState: "destroyed" as const
          })
        )
      }
    };
    const before = structuredClone(destroyed);

    expect(() =>
      resolveBattlefieldPhase(
        destroyed,
        content,
        [spawn("spawn.reused", 1, "entity.enemy.reused")],
        []
      )
    ).toThrow("already has battlefield enemy combatant state");
    expect(destroyed).toEqual(before);
  });

  it("rejects admission when the first movement boundary overflows", async () => {
    const content = await compileContent(battlefieldContentInput);
    const initial = createInitialState(
      content,
      "level.conformance_map" as never,
      "1"
    );
    const atMaximumTick = {
      ...initial,
      tick: Number.MAX_SAFE_INTEGER
    } as SimulationState;

    expect(() =>
      resolveBattlefieldPhase(
        atMaximumTick,
        content,
        [spawn("spawn.overflow", 0, "entity.enemy.overflow")],
        []
      )
    ).toThrow("movement schedule exceeds safe integer bounds");
  });

  it("rejects battlefield phases for mapless or mismatched state", async () => {
    const mapContent = await compileContent(battlefieldContentInput);
    const mapState = createInitialState(
      mapContent,
      "level.conformance_map" as never,
      "1"
    );
    const maplessContent = await compileContent({
      schemaVersion: 1,
      contentVersion: "mapless",
      definitions: [{ kind: "level", id: "level.empty", waveIds: [] }]
    });
    const maplessState = createInitialState(
      maplessContent,
      "level.empty" as never,
      "1"
    );
    if (mapState.battlefield === undefined)
      throw new Error("expected battlefield state");
    const battlefield = mapState.battlefield;

    expect(() =>
      resolveBattlefieldPhase(maplessState, maplessContent, [], [])
    ).toThrow(/does not have battlefield state/);
    expect(() =>
      resolveBattlefieldPhase(
        {
          ...mapState,
          battlefield: {
            ...battlefield,
            mapId: "map.missing" as never
          }
        },
        mapContent,
        [],
        []
      )
    ).toThrow(/does not match level map/);
  });
});
