import { compileContent } from "@dwarven-depths/content-runtime";
import type {
  BattlefieldMapDefinition,
  NavigationOccupant,
  PendingSpawn
} from "@dwarven-depths/contracts";
import { beforeAll, describe, expect, it } from "vitest";
import mapContentInput from "../../../content/fixtures/conformance-map.json" with {
  type: "json"
};
import { admitQueuedSpawns } from "./index.js";

let map: BattlefieldMapDefinition;

beforeAll(async () => {
  const content = await compileContent(mapContentInput);
  const compiledMap = content.maps.get("map.conformance_diamond" as never);
  if (compiledMap === undefined) throw new Error("missing conformance map");
  map = {
    ...compiledMap,
    enemyEntrances: [
      ...compiledMap.enemyEntrances,
      { id: "entrance.flank", nodeId: "node.east" }
    ]
  } as BattlefieldMapDefinition;
});

function pendingSpawn(
  id: string,
  authoredOrder: number,
  entityId: string,
  entranceId = "entrance.west"
): PendingSpawn {
  return { id, authoredOrder, entityId, entranceId } as PendingSpawn;
}

describe("deterministic spawn admission", () => {
  it("queues at occupied entrances without blocking an independent entrance", () => {
    const occupied = [
      { entityId: "entity.enemy.live", nodeId: "node.entry" }
    ] as NavigationOccupant[];
    const result = admitQueuedSpawns(
      map,
      occupied,
      [
        pendingSpawn("spawn.blocked", 0, "entity.enemy.blocked"),
        pendingSpawn(
          "spawn.independent",
          1,
          "entity.enemy.independent",
          "entrance.flank"
        )
      ],
      { liveEnemyCap: 1, currentLiveEnemies: 0 }
    );

    expect(result.occupancy).toEqual([
      { entityId: "entity.enemy.independent", nodeId: "node.east" },
      { entityId: "entity.enemy.live", nodeId: "node.entry" }
    ]);
    expect(result.pendingSpawns).toEqual([
      pendingSpawn("spawn.blocked", 0, "entity.enemy.blocked")
    ]);
    expect(result.decisions).toEqual([
      {
        spawnId: "spawn.blocked",
        entityId: "entity.enemy.blocked",
        entranceId: "entrance.west",
        status: "queued",
        reason: "entrance_occupied"
      },
      {
        spawnId: "spawn.independent",
        entityId: "entity.enemy.independent",
        entranceId: "entrance.flank",
        status: "admitted",
        reason: "admitted"
      }
    ]);
  });

  it("admits only the oldest pending enemy at each entrance", () => {
    const result = admitQueuedSpawns(
      map,
      [],
      [
        pendingSpawn("spawn.second", 1, "entity.enemy.second"),
        pendingSpawn("spawn.first", 0, "entity.enemy.first")
      ]
    );

    expect(result.occupancy).toEqual([
      { entityId: "entity.enemy.first", nodeId: "node.entry" }
    ]);
    expect(result.pendingSpawns).toEqual([
      pendingSpawn("spawn.second", 1, "entity.enemy.second")
    ]);
    expect(
      result.decisions.map(({ status, reason }) => ({ status, reason }))
    ).toEqual([
      { status: "admitted", reason: "admitted" },
      { status: "queued", reason: "earlier_spawn_pending" }
    ]);
  });

  it("preserves the canonical queue when the live-enemy cap is full", () => {
    const occupied = [
      { entityId: "entity.enemy.live", nodeId: "node.goal" }
    ] as NavigationOccupant[];
    const pending = [
      pendingSpawn("spawn.main", 0, "entity.enemy.main"),
      pendingSpawn("spawn.flank", 1, "entity.enemy.flank", "entrance.flank")
    ];
    const result = admitQueuedSpawns(map, occupied, pending, {
      liveEnemyCap: 1,
      currentLiveEnemies: 1
    });

    expect(result.occupancy).toEqual(occupied);
    expect(result.pendingSpawns).toEqual(pending);
    expect(result.decisions.map((decision) => decision.reason)).toEqual([
      "live_enemy_cap_reached",
      "live_enemy_cap_reached"
    ]);
  });

  it("applies the cap while admitting simultaneous free entrances", () => {
    const result = admitQueuedSpawns(
      map,
      [],
      [
        pendingSpawn("spawn.flank", 1, "entity.enemy.flank", "entrance.flank"),
        pendingSpawn("spawn.main", 0, "entity.enemy.main")
      ],
      { liveEnemyCap: 1, currentLiveEnemies: 0 }
    );

    expect(result.occupancy).toEqual([
      { entityId: "entity.enemy.main", nodeId: "node.entry" }
    ]);
    expect(result.pendingSpawns).toEqual([
      pendingSpawn("spawn.flank", 1, "entity.enemy.flank", "entrance.flank")
    ]);
    expect(result.decisions.map((decision) => decision.reason)).toEqual([
      "admitted",
      "live_enemy_cap_reached"
    ]);
  });

  it("rejects malformed occupancy, queues, entrances, and caps", () => {
    expect(() =>
      admitQueuedSpawns(
        map,
        [{ entityId: "", nodeId: "node.goal" }] as NavigationOccupant[],
        []
      )
    ).toThrow("entity.* stable ID");
    expect(() =>
      admitQueuedSpawns(map, [], [pendingSpawn("", 0, "entity.enemy.invalid")])
    ).toThrow("id must be a stable ID");
    expect(() =>
      admitQueuedSpawns(map, [], [pendingSpawn("spawn.invalid", 0, "")])
    ).toThrow("entity.* stable ID");
    expect(() =>
      admitQueuedSpawns(
        map,
        [],
        [
          pendingSpawn(
            "spawn.unknown",
            0,
            "entity.enemy.unknown",
            "entrance.unknown"
          )
        ]
      )
    ).toThrow("unknown enemy entrance ID");
    expect(() =>
      admitQueuedSpawns(
        map,
        [],
        [
          pendingSpawn("spawn.same", 0, "entity.enemy.first"),
          pendingSpawn("spawn.same", 1, "entity.enemy.second", "entrance.flank")
        ]
      )
    ).toThrow("duplicate pending spawn ID");
    expect(() =>
      admitQueuedSpawns(
        map,
        [],
        [
          pendingSpawn("spawn.first", 0, "entity.enemy.same"),
          pendingSpawn("spawn.second", 1, "entity.enemy.same", "entrance.flank")
        ]
      )
    ).toThrow("duplicate pending spawn entity ID");
    expect(() =>
      admitQueuedSpawns(
        map,
        [],
        [pendingSpawn("spawn.invalid", -1, "entity.enemy.invalid")]
      )
    ).toThrow("authoredOrder");
    expect(() =>
      admitQueuedSpawns(map, [], [], {
        liveEnemyCap: 0,
        currentLiveEnemies: 0
      })
    ).toThrow("positive safe integer");
    expect(() =>
      admitQueuedSpawns(
        map,
        [
          { entityId: "entity.enemy.live", nodeId: "node.goal" }
        ] as NavigationOccupant[],
        [],
        { liveEnemyCap: 0.5, currentLiveEnemies: 0 }
      )
    ).toThrow("positive safe integer");
    expect(() =>
      admitQueuedSpawns(
        map,
        [
          { entityId: "entity.enemy.live", nodeId: "node.goal" }
        ] as NavigationOccupant[],
        [],
        { liveEnemyCap: 1, currentLiveEnemies: -1 }
      )
    ).toThrow("non-negative safe integer");
    expect(() =>
      admitQueuedSpawns(
        map,
        [
          { entityId: "entity.enemy.first", nodeId: "node.goal" },
          { entityId: "entity.enemy.second", nodeId: "node.goal" }
        ] as NavigationOccupant[],
        []
      )
    ).toThrow("duplicate occupied navigation node ID");
    expect(() =>
      admitQueuedSpawns(
        map,
        [
          { entityId: "entity.enemy.same", nodeId: "node.goal" }
        ] as NavigationOccupant[],
        [pendingSpawn("spawn.same", 0, "entity.enemy.same")]
      )
    ).toThrow("already occupied");
    expect(() =>
      admitQueuedSpawns(map, [], [], { liveEnemyCap: 2, currentLiveEnemies: 1 })
    ).toThrow("cannot exceed occupied entity count");
    expect(() =>
      admitQueuedSpawns(
        map,
        [
          { entityId: "entity.enemy.first", nodeId: "node.goal" },
          { entityId: "entity.enemy.second", nodeId: "node.south" }
        ] as NavigationOccupant[],
        [],
        { liveEnemyCap: 1, currentLiveEnemies: 2 }
      )
    ).toThrow("exceeds live-enemy cap");
  });

  it("is permutation-invariant, detached, and deeply immutable", () => {
    const occupied = [
      { entityId: "entity.enemy.live", nodeId: "node.goal" }
    ] as NavigationOccupant[];
    const pending = [
      pendingSpawn("spawn.flank", 1, "entity.enemy.flank", "entrance.flank"),
      pendingSpawn("spawn.main", 0, "entity.enemy.main")
    ];
    const occupiedBefore = structuredClone(occupied);
    const pendingBefore = structuredClone(pending);
    const forward = admitQueuedSpawns(map, occupied, pending);
    const reversed = admitQueuedSpawns(
      map,
      [...occupied].reverse(),
      [...pending].reverse()
    );

    expect(reversed).toEqual(forward);
    expect(occupied).toEqual(occupiedBefore);
    expect(pending).toEqual(pendingBefore);
    expect(Object.isFrozen(forward)).toBe(true);
    expect(Object.isFrozen(forward.occupancy)).toBe(true);
    expect(Object.isFrozen(forward.occupancy[0])).toBe(true);
    expect(Object.isFrozen(forward.pendingSpawns)).toBe(true);
    expect(Object.isFrozen(forward.pendingSpawns[0])).toBe(true);
    expect(Object.isFrozen(forward.decisions)).toBe(true);
    expect(Object.isFrozen(forward.decisions[0])).toBe(true);
  });
});
