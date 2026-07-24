import { compileContent } from "@dwarven-depths/content-runtime";
import type {
  MovementProposal,
  PendingSpawn,
  SimulationEvent,
  SimulationState
} from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import mapContentInput from "../../../content/fixtures/conformance-map.json" with {
  type: "json"
};
import { createInitialState, resolveBattlefieldPhase } from "./index.js";

function spawn(
  id: string,
  authoredOrder: number,
  entityId: string
): PendingSpawn {
  return {
    id,
    authoredOrder,
    entityId,
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

function decisionEvidence(event: SimulationEvent): readonly [string, string] {
  if (!("reasonCode" in event)) throw new Error("expected decision event");
  return [event.type, event.reasonCode];
}

describe("authoritative battlefield state", () => {
  it("initializes map-backed levels with canonical immutable battlefield state", async () => {
    const content = await compileContent(mapContentInput);
    const state = createInitialState(
      content,
      "level.conformance_map" as never,
      "1"
    );

    expect(state.battlefield).toEqual({
      schemaVersion: 1,
      mapId: "map.conformance_diamond",
      occupancy: [],
      pendingSpawns: []
    });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.battlefield)).toBe(true);
    expect(Object.isFrozen(state.battlefield?.occupancy)).toBe(true);
    expect(Object.isFrozen(state.battlefield?.pendingSpawns)).toBe(true);
  });

  it("admits, moves, queues, and resumes enemies in fixed same-step order", async () => {
    const content = await compileContent(mapContentInput);
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
      occupancy: [{ entityId: "entity.enemy.first", nodeId: "node.south" }],
      pendingSpawns: [
        {
          id: "spawn.second",
          authoredOrder: 1,
          entityId: "entity.enemy.second",
          entranceId: "entrance.west"
        }
      ]
    });
    expect(first.events.map(decisionEvidence)).toEqual([
      ["spawn.admitted", "admitted"],
      ["spawn.queued", "earlier_spawn_pending"],
      ["movement.moved", "moved"]
    ]);
    expect(first.events.map((event) => event.sequence)).toEqual([0, 1, 2]);
    expect(first.state.eventSequence).toBe(3);

    const second = resolveBattlefieldPhase(first.state, content, [], []);
    expect(second.state.battlefield).toEqual({
      schemaVersion: 1,
      mapId: "map.conformance_diamond",
      occupancy: [
        { entityId: "entity.enemy.first", nodeId: "node.south" },
        { entityId: "entity.enemy.second", nodeId: "node.entry" }
      ],
      pendingSpawns: []
    });
    expect(second.events.map(decisionEvidence)).toEqual([
      ["spawn.admitted", "admitted"]
    ]);
    expect(second.events[0]?.sequence).toBe(3);
    expect(Object.isFrozen(second.state)).toBe(true);
    expect(Object.isFrozen(second.events)).toBe(true);
    expect(Object.isFrozen(second.events[0])).toBe(true);
  });

  it("retries an entrance-blocked spawn after the blocker moves away", async () => {
    const content = await compileContent(mapContentInput);
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
    const content = await compileContent(mapContentInput);
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
    const content = await compileContent(mapContentInput);
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

  it("rejects battlefield phases for mapless or mismatched state", async () => {
    const mapContent = await compileContent(mapContentInput);
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
