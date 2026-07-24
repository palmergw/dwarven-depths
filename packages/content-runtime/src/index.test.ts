import { describe, expect, it } from "vitest";
import mapContentInput from "../../../content/fixtures/conformance-map.json" with {
  type: "json"
};
import phase2SystemContentInput from "../../../content/fixtures/phase-2-system.json" with {
  type: "json"
};
import referenceCombatantsInput from "../../../content/fixtures/phase-3-reference-combatants.json" with {
  type: "json"
};
import shuttergateInput from "../../../content/fixtures/phase-3-shuttergate.json" with {
  type: "json"
};
import {
  ContentValidationError,
  calculateRouteCost,
  compileContent,
  compileReplay,
  compileScenario,
  findShortestAttackRoute,
  findShortestRoute,
  validateStaticPlacement
} from "./index.js";

interface MutableMapFixture {
  readonly kind: "map";
  nodes: Array<{
    id: string;
    x: number;
    y: number;
    aimPointId: string;
    neighborNodeIds: string[];
  }>;
  connections: Array<{ id: string; nodeIds: string[]; cost: number }>;
  placementPoints: unknown[];
  enemyEntrances: unknown[];
  aimPoints: unknown[];
  opaqueRegions: unknown[];
}

function permutations<Value>(values: readonly Value[]): Value[][] {
  if (values.length < 2) return [[...values]];
  return values.flatMap((value, index) =>
    permutations(
      values.filter((_, candidateIndex) => candidateIndex !== index)
    ).map((remainder) => [value, ...remainder])
  );
}

describe("content compilation", () => {
  it("canonically indexes and deeply freezes reference combatants", async () => {
    const input = structuredClone(referenceCombatantsInput);
    const before = structuredClone(input);
    const content = await compileContent(input);
    expect(input).toEqual(before);
    expect(content.manifestHash).toBe(
      "99db3dd6f233616e3393adba378daf098d1b17c26312f9a9c288df65e21a7aa4"
    );
    expect([...content.characters.keys()]).toEqual(["character.iron_warden"]);
    expect([...content.enemies.keys()]).toEqual([
      "enemy.gatebreaker_captain",
      "enemy.goblin_bulwark",
      "enemy.goblin_cutter",
      "enemy.goblin_slinger"
    ]);
    const warden = content.characters.get("character.iron_warden" as never);
    expect(Object.isFrozen(warden)).toBe(true);
    expect(Object.isFrozen(warden?.supportedTargetPolicies)).toBe(true);
    expect(Object.isFrozen(warden?.basicAttack)).toBe(true);
    expect("set" in content.characters).toBe(false);
    expect("set" in content.enemies).toBe(false);
  });

  it("compiles the immutable Shuttergate map and five-wave schedule", async () => {
    const input = structuredClone(shuttergateInput);
    const before = structuredClone(input);
    const content = await compileContent(input);
    expect(input).toEqual(before);
    expect(content.manifestHash).toBe(
      "a857f29758e18f0496bc24512dc57b3f1c89ae1bfdcb97ffd2054660457e8705"
    );

    const level = content.levels.get("level.shuttergate_hall" as never);
    const map = content.maps.get("map.shuttergate_hall" as never);
    if (level === undefined || map === undefined)
      throw new Error("missing Shuttergate reference content");
    expect(level.waveIds).toEqual([
      "wave.shuttergate_1",
      "wave.shuttergate_2",
      "wave.shuttergate_3",
      "wave.shuttergate_4",
      "wave.shuttergate_5"
    ]);
    expect(level.mapId).toBe("map.shuttergate_hall");
    expect(Object.isFrozen(level.waveIds)).toBe(true);
    expect(Object.isFrozen(map.nodes)).toBe(true);

    const waves = level.waveIds.map((waveId) => content.waves.get(waveId));
    expect(waves.every((wave) => wave?.durationTicks === 900)).toBe(true);
    expect(
      waves.map((wave) =>
        wave?.spawnEvents.map((spawn) => spawn.enemyDefinitionId)
      )
    ).toEqual([
      ["enemy.goblin_cutter", "enemy.goblin_cutter", "enemy.goblin_cutter"],
      ["enemy.goblin_cutter", "enemy.goblin_cutter", "enemy.goblin_slinger"],
      ["enemy.goblin_bulwark", "enemy.goblin_cutter", "enemy.goblin_slinger"],
      [
        "enemy.gatebreaker_captain",
        "enemy.goblin_cutter",
        "enemy.goblin_slinger",
        "enemy.goblin_bulwark"
      ],
      [
        "enemy.goblin_cutter",
        "enemy.goblin_cutter",
        "enemy.goblin_slinger",
        "enemy.goblin_cutter",
        "enemy.goblin_bulwark"
      ]
    ]);
    expect(waves[1]?.spawnEvents.map((spawn) => spawn.entranceId)).toContain(
      "entrance.shuttergate_east"
    );

    for (const placementPointId of [
      "placement.shuttergate_north_guard",
      "placement.shuttergate_keep_guard"
    ]) {
      expect(
        validateStaticPlacement(map, [
          {
            entityId: "entity.dwarf.iron_warden" as never,
            placementPointId: placementPointId as never
          }
        ])
      ).toEqual({ valid: true, issues: [] });
    }
  });

  it("canonicalizes non-authored Shuttergate source ordering", async () => {
    const reordered = structuredClone(shuttergateInput);
    reordered.definitions.reverse();
    const map = reordered.definitions.find(
      (definition) => definition.kind === "map"
    ) as MutableMapFixture | undefined;
    if (map === undefined) throw new Error("missing Shuttergate map");
    map.nodes.reverse();
    map.connections.reverse();
    map.placementPoints.reverse();
    map.enemyEntrances.reverse();
    map.aimPoints.reverse();
    map.opaqueRegions.reverse();
    for (const connection of map.connections) connection.nodeIds.reverse();
    for (const definition of reordered.definitions) {
      const spawnEvents = definition.spawnEvents;
      if (definition.kind === "wave" && spawnEvents !== undefined)
        spawnEvents.reverse();
    }

    const [canonical, permuted] = await Promise.all([
      compileContent(shuttergateInput),
      compileContent(reordered)
    ]);
    expect(permuted.bundle).toEqual(canonical.bundle);
    expect(permuted.manifestHash).toBe(canonical.manifestHash);
  });

  it("sorts definitions and builds kind-specific indexes", async () => {
    const content = await compileContent({
      schemaVersion: 1,
      contentVersion: "test",
      definitions: [
        {
          kind: "wave",
          id: "wave.first",
          startAtTick: 0,
          durationTicks: 30,
          spawnEvents: []
        },
        { kind: "level", id: "level.first", waveIds: ["wave.first"] }
      ]
    });

    expect(
      content.bundle.definitions.map((definition) => definition.id)
    ).toEqual(["level.first", "wave.first"]);
    expect(content.levels.has("level.first" as never)).toBe(true);
    expect(content.waves.has("wave.first" as never)).toBe(true);
    expect(Object.isFrozen(content.bundle)).toBe(true);
    expect(Object.isFrozen(content.bundle.definitions)).toBe(true);
    expect(Object.isFrozen(content.bundle.definitions[0])).toBe(true);
    expect("set" in content.levels).toBe(false);

    const scenario = compileScenario(
      {
        schemaVersion: 1,
        id: "scenario.test.first",
        levelId: "level.first",
        seed: "1",
        maximumTicks: 1,
        commands: [{ atTick: 0, type: "confirmPreparation" }]
      },
      content
    );
    expect(Object.isFrozen(scenario)).toBe(true);
    expect(Object.isFrozen(scenario.commands)).toBe(true);
    expect(Object.isFrozen(scenario.commands[0])).toBe(true);
  });

  it("sorts and deeply freezes authored spawn events", async () => {
    const map = structuredClone(mapContentInput.definitions[1]);
    const input = {
      schemaVersion: 1 as const,
      contentVersion: "wave-freeze",
      definitions: [
        {
          kind: "level",
          id: "level.wave_freeze",
          waveIds: ["wave.freeze"],
          mapId: "map.conformance_diamond"
        },
        {
          kind: "wave",
          id: "wave.freeze",
          startAtTick: 0,
          durationTicks: 10,
          spawnEvents: [
            {
              id: "spawn.second",
              authoredOrder: 1,
              atTick: 1,
              entityId: "entity.enemy.second",
              enemyDefinitionId: "enemy.goblin_slinger",
              entranceId: "entrance.west"
            },
            {
              id: "spawn.first",
              authoredOrder: 0,
              atTick: 0,
              entityId: "entity.enemy.first",
              enemyDefinitionId: "enemy.goblin_cutter",
              entranceId: "entrance.west"
            }
          ]
        },
        map,
        ...referenceCombatantsInput.definitions.filter(
          (definition) =>
            definition.id === "enemy.goblin_cutter" ||
            definition.id === "enemy.goblin_slinger"
        )
      ]
    };
    const before = structuredClone(input);
    const content = await compileContent(input);
    const wave = content.waves.get("wave.freeze" as never);
    expect(input).toEqual(before);
    expect(wave?.spawnEvents.map((event) => event.id)).toEqual([
      "spawn.first",
      "spawn.second"
    ]);
    expect(Object.isFrozen(wave)).toBe(true);
    expect(Object.isFrozen(wave?.spawnEvents)).toBe(true);
    expect(Object.isFrozen(wave?.spawnEvents[0])).toBe(true);
  });

  it("canonicalizes map source ordering while preserving authored neighbor order", async () => {
    const reordered = structuredClone(mapContentInput);
    reordered.definitions.reverse();
    const map = reordered.definitions.find(
      (definition) => definition.kind === "map"
    ) as MutableMapFixture | undefined;
    if (map === undefined) throw new Error("missing map fixture");
    map.nodes.reverse();
    map.connections.reverse();
    map.placementPoints.reverse();
    map.enemyEntrances.reverse();
    map.aimPoints.reverse();
    map.opaqueRegions.reverse();
    for (const connection of map.connections) connection.nodeIds.reverse();

    const [canonical, permuted] = await Promise.all([
      compileContent(mapContentInput),
      compileContent(reordered)
    ]);
    const compiledMap = canonical.maps.get("map.conformance_diamond" as never);

    expect(permuted.bundle).toEqual(canonical.bundle);
    expect(permuted.manifestHash).toBe(canonical.manifestHash);
    expect(compiledMap?.nodes.map((node) => node.id)).toEqual([
      "node.east",
      "node.entry",
      "node.goal",
      "node.south"
    ]);
    expect(
      compiledMap?.nodes.find((node) => node.id === "node.entry")
        ?.neighborNodeIds
    ).toEqual(["node.south", "node.east"]);
  });

  it("keeps canonical maps and routes stable across exhaustive record permutations", async () => {
    const canonical = await compileContent(mapContentInput);
    const canonicalMap = canonical.maps.get("map.conformance_diamond" as never);
    if (canonicalMap === undefined) throw new Error("missing map fixture");
    const expectedRoute = findShortestRoute(
      canonicalMap,
      "node.entry" as never,
      "node.goal" as never
    );
    const source = structuredClone(mapContentInput);
    const sourceMap = source.definitions.find(
      (definition) => definition.kind === "map"
    ) as MutableMapFixture | undefined;
    if (sourceMap === undefined) throw new Error("missing source map fixture");

    const candidates: (typeof source)[] = [];
    for (const nodes of permutations(sourceMap.nodes)) {
      const candidate = structuredClone(source);
      const map = candidate.definitions.find(
        (definition) => definition.kind === "map"
      ) as MutableMapFixture;
      map.nodes = nodes;
      candidates.push(candidate);
    }
    for (const connections of permutations(sourceMap.connections)) {
      const candidate = structuredClone(source);
      const map = candidate.definitions.find(
        (definition) => definition.kind === "map"
      ) as MutableMapFixture;
      map.connections = connections;
      candidates.push(candidate);
    }
    for (const placementPoints of permutations(sourceMap.placementPoints)) {
      const candidate = structuredClone(source);
      const map = candidate.definitions.find(
        (definition) => definition.kind === "map"
      ) as MutableMapFixture;
      map.placementPoints = placementPoints;
      candidates.push(candidate);
    }
    sourceMap.connections.forEach((_, connectionIndex) => {
      const candidate = structuredClone(source);
      const map = candidate.definitions.find(
        (definition) => definition.kind === "map"
      ) as MutableMapFixture;
      map.connections[connectionIndex]?.nodeIds.reverse();
      candidates.push(candidate);
    });

    for (const candidate of candidates) {
      const compiled = await compileContent(candidate);
      const map = compiled.maps.get("map.conformance_diamond" as never);
      if (map === undefined) throw new Error("missing permuted map fixture");
      expect(compiled.bundle).toEqual(canonical.bundle);
      expect(compiled.manifestHash).toBe(canonical.manifestHash);
      expect(
        findShortestRoute(map, "node.entry" as never, "node.goal" as never)
      ).toEqual(expectedRoute);
    }
  });

  it("returns deeply immutable map records detached from caller input", async () => {
    const source = structuredClone(mapContentInput);
    const content = await compileContent(source);
    const map = content.maps.get("map.conformance_diamond" as never);
    const sourceMap = source.definitions.find(
      (definition) => definition.kind === "map"
    ) as MutableMapFixture | undefined;
    if (sourceMap === undefined) throw new Error("missing map fixture");
    sourceMap.nodes[0]?.neighborNodeIds.reverse();
    const sourceConnection = sourceMap.connections[0];
    if (sourceConnection === undefined)
      throw new Error("missing connection fixture");
    sourceConnection.cost = 999;

    expect(content.manifestHash).toBe(
      "acbbfb991269de9e2c6a5377951d8f40a1a142c74f8d94e3d9030d0c9f9d85c6"
    );
    expect(map?.connections[0]?.cost).toBe(10);
    expect(Object.isFrozen(content)).toBe(true);
    expect(Object.isFrozen(map)).toBe(true);
    expect(Object.isFrozen(map?.nodes)).toBe(true);
    expect(Object.isFrozen(map?.nodes[0]?.neighborNodeIds)).toBe(true);
    expect(Object.isFrozen(map?.connections[0]?.nodeIds)).toBe(true);
    expect(
      Object.isFrozen(map?.placementPoints[0]?.adjacentPlacementPointIds)
    ).toBe(true);
    expect(Object.isFrozen(map?.aimPoints)).toBe(true);
    expect(Object.isFrozen(map?.aimPoints[0])).toBe(true);
    expect(Object.isFrozen(map?.opaqueRegions)).toBe(true);
  });

  it("uses authored neighbor order to resolve equal-cost shortest routes", async () => {
    const content = await compileContent(mapContentInput);
    const map = content.maps.get("map.conformance_diamond" as never);
    if (map === undefined) throw new Error("missing map fixture");

    const route = findShortestRoute(
      map,
      "node.entry" as never,
      "node.goal" as never
    );

    expect(route).toEqual({
      nodeIds: ["node.entry", "node.south", "node.goal"],
      totalCost: 20
    });
    expect(Object.isFrozen(route)).toBe(true);
    expect(Object.isFrozen(route?.nodeIds)).toBe(true);
    expect(calculateRouteCost(map, route?.nodeIds ?? [])).toBe(20);
  });

  it("preserves authored route priority when equal-cost branches have uneven edge costs", async () => {
    const source = structuredClone(mapContentInput);
    const mapInput = source.definitions.find(
      (definition) => definition.kind === "map"
    ) as MutableMapFixture | undefined;
    if (mapInput === undefined) throw new Error("missing map fixture");
    for (const connection of mapInput.connections) {
      if (connection.id === "connection.entry_south") connection.cost = 15;
      if (connection.id === "connection.south_goal") connection.cost = 5;
      if (connection.id === "connection.entry_east") connection.cost = 5;
      if (connection.id === "connection.east_goal") connection.cost = 15;
    }

    const content = await compileContent(source);
    const map = content.maps.get("map.conformance_diamond" as never);
    if (map === undefined) throw new Error("missing compiled map fixture");

    expect(
      findShortestRoute(map, "node.entry" as never, "node.goal" as never)
    ).toEqual({
      nodeIds: ["node.entry", "node.south", "node.goal"],
      totalCost: 20
    });
  });

  it("chooses lower cost before authored equal-cost order", async () => {
    const source = structuredClone(mapContentInput);
    const mapInput = source.definitions.find(
      (definition) => definition.kind === "map"
    ) as MutableMapFixture | undefined;
    if (mapInput === undefined) throw new Error("missing map fixture");
    for (const connection of mapInput.connections) {
      if (connection.id.includes("south")) connection.cost = 11;
    }

    const content = await compileContent(source);
    const map = content.maps.get("map.conformance_diamond" as never);
    if (map === undefined) throw new Error("missing compiled map fixture");

    expect(
      findShortestRoute(map, "node.entry" as never, "node.goal" as never)
    ).toEqual({
      nodeIds: ["node.entry", "node.east", "node.goal"],
      totalCost: 20
    });
  });

  it("routes around immutable blocked nodes and rejects unknown blockers", async () => {
    const content = await compileContent(mapContentInput);
    const map = content.maps.get("map.conformance_diamond" as never);
    if (map === undefined) throw new Error("missing compiled map fixture");
    const snapshot = structuredClone(map);

    expect(
      findShortestRoute(map, "node.entry" as never, "node.goal" as never, {
        blockedNodeIds: ["node.south" as never]
      })
    ).toEqual({
      nodeIds: ["node.entry", "node.east", "node.goal"],
      totalCost: 20
    });
    expect(
      findShortestRoute(map, "node.entry" as never, "node.goal" as never, {
        blockedNodeIds: ["node.goal" as never]
      })
    ).toBeUndefined();
    expect(() =>
      findShortestRoute(map, "node.entry" as never, "node.goal" as never, {
        blockedNodeIds: ["node.missing" as never]
      })
    ).toThrowError(
      "blocked route references unknown navigation node ID (node.missing)"
    );
    expect(map).toEqual(snapshot);
  });

  it("routes to attack-valid approaches derived from legal placements", async () => {
    const content = await compileContent(phase2SystemContentInput);
    const map = content.maps.get("map.phase_2_system" as never);
    if (map === undefined) throw new Error("missing Phase 2 system map");

    expect(
      findShortestAttackRoute(map, "entrance.west" as never, [
        {
          entityId: "entity.dwarf.warden" as never,
          placementPointId: "placement.east" as never
        }
      ])
    ).toEqual({
      entityId: "entity.dwarf.warden",
      placementPointId: "placement.east",
      approachNodeId: "node.east_approach",
      route: {
        nodeIds: ["node.entry", "node.east", "node.east_approach"],
        totalCost: 20
      }
    });
    expect(() =>
      findShortestAttackRoute(map, "entrance.missing" as never, [
        {
          entityId: "entity.dwarf.warden" as never,
          placementPointId: "placement.east" as never
        }
      ])
    ).toThrowError("unknown enemy entrance ID (entrance.missing)");
  });

  it("keeps routing independent of canonical record insertion order", async () => {
    const reordered = structuredClone(mapContentInput);
    const mapInput = reordered.definitions.find(
      (definition) => definition.kind === "map"
    ) as MutableMapFixture | undefined;
    if (mapInput === undefined) throw new Error("missing map fixture");
    mapInput.nodes.reverse();
    mapInput.connections.reverse();
    for (const connection of mapInput.connections) connection.nodeIds.reverse();

    const [canonical, permuted] = await Promise.all([
      compileContent(mapContentInput),
      compileContent(reordered)
    ]);
    const canonicalMap = canonical.maps.get("map.conformance_diamond" as never);
    const permutedMap = permuted.maps.get("map.conformance_diamond" as never);
    if (canonicalMap === undefined || permutedMap === undefined)
      throw new Error("missing compiled map fixture");

    expect(
      findShortestRoute(
        permutedMap,
        "node.entry" as never,
        "node.goal" as never
      )
    ).toEqual(
      findShortestRoute(
        canonicalMap,
        "node.entry" as never,
        "node.goal" as never
      )
    );
  });

  it("returns no route for disconnected nodes and rejects invalid route steps", async () => {
    const source = structuredClone(mapContentInput);
    const mapInput = source.definitions.find(
      (definition) => definition.kind === "map"
    ) as MutableMapFixture | undefined;
    if (mapInput === undefined) throw new Error("missing map fixture");
    mapInput.nodes.push({
      id: "node.isolated",
      x: 10,
      y: 10,
      aimPointId: "aim.isolated",
      neighborNodeIds: []
    });
    mapInput.aimPoints.push({ id: "aim.isolated", x: 10, y: 10 });

    const content = await compileContent(source);
    const map = content.maps.get("map.conformance_diamond" as never);
    if (map === undefined) throw new Error("missing compiled map fixture");

    expect(
      findShortestRoute(map, "node.entry" as never, "node.isolated" as never)
    ).toBeUndefined();
    expect(() =>
      calculateRouteCost(map, ["node.entry", "node.goal"] as never)
    ).toThrowError(
      "route step node.entry -> node.goal has no authored connection"
    );
    expect(() =>
      findShortestRoute(map, "node.missing" as never, "node.goal" as never)
    ).toThrowError("unknown start navigation node ID (node.missing)");
  });

  it("ignores overflowing dead branches when a safe route exists", async () => {
    const source = structuredClone(mapContentInput);
    const mapInput = source.definitions.find(
      (definition) => definition.kind === "map"
    ) as MutableMapFixture | undefined;
    if (mapInput === undefined) throw new Error("missing map fixture");
    mapInput.nodes.push({
      id: "node.dead_end",
      x: -1,
      y: 0,
      aimPointId: "aim.dead_end",
      neighborNodeIds: ["node.entry", "node.overflow"]
    });
    mapInput.nodes.push({
      id: "node.overflow",
      x: -2,
      y: 0,
      aimPointId: "aim.overflow",
      neighborNodeIds: ["node.dead_end"]
    });
    mapInput.aimPoints.push(
      { id: "aim.dead_end", x: -1, y: 0 },
      { id: "aim.overflow", x: -2, y: 0 }
    );
    const entry = mapInput.nodes.find((node) => node.id === "node.entry");
    if (entry === undefined) throw new Error("missing entry node");
    entry.neighborNodeIds.push("node.dead_end");
    mapInput.connections.push(
      {
        id: "connection.entry_dead_end",
        nodeIds: ["node.entry", "node.dead_end"],
        cost: Number.MAX_SAFE_INTEGER - 1
      },
      {
        id: "connection.dead_end_overflow",
        nodeIds: ["node.dead_end", "node.overflow"],
        cost: 2
      }
    );

    const content = await compileContent(source);
    const map = content.maps.get("map.conformance_diamond" as never);
    if (map === undefined) throw new Error("missing compiled map fixture");
    expect(
      findShortestRoute(map, "node.entry" as never, "node.goal" as never)
    ).toEqual({
      nodeIds: ["node.entry", "node.south", "node.goal"],
      totalCost: 20
    });
  });

  it("accepts placements when every entrance can approach a placed dwarf", async () => {
    const content = await compileContent(mapContentInput);
    const map = content.maps.get("map.conformance_diamond" as never);
    if (map === undefined) throw new Error("missing compiled map fixture");

    const result = validateStaticPlacement(map, [
      {
        entityId: "entity.dwarf_a" as never,
        placementPointId: "placement.goal" as never
      },
      {
        entityId: "entity.dwarf_b" as never,
        placementPointId: "placement.east" as never
      }
    ]);

    expect(result).toEqual({ valid: true, issues: [] });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.issues)).toBe(true);
  });

  it("reports duplicate dwarves, unknown points, and capacity violations", async () => {
    const content = await compileContent(mapContentInput);
    const map = content.maps.get("map.conformance_diamond" as never);
    if (map === undefined) throw new Error("missing compiled map fixture");

    const result = validateStaticPlacement(map, [
      {
        entityId: "entity.dwarf_a" as never,
        placementPointId: "placement.goal" as never
      },
      {
        entityId: "entity.dwarf_a" as never,
        placementPointId: "placement.goal" as never
      },
      {
        entityId: "entity.dwarf_c" as never,
        placementPointId: "placement.missing" as never
      }
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues.slice(0, 3)).toEqual([
      {
        path: "$/placements/1/entityId",
        code: "duplicate_dwarf",
        message: "dwarf entity entity.dwarf_a is placed more than once",
        relatedPaths: ["$/placements/0/entityId"]
      },
      {
        path: "$/placements/1/placementPointId",
        code: "placement_capacity_exceeded",
        message: "placement point placement.goal exceeds capacity 1",
        relatedPaths: ["$/placements/0/placementPointId"]
      },
      {
        path: "$/placements/2/placementPointId",
        code: "unknown_placement_point",
        message: "references unknown placement point ID (placement.missing)"
      }
    ]);
  });

  it("rejects entrances disconnected from every attack-valid approach", async () => {
    const source = structuredClone(mapContentInput);
    const mapInput = source.definitions.find(
      (definition) => definition.kind === "map"
    ) as MutableMapFixture | undefined;
    if (mapInput === undefined) throw new Error("missing map fixture");
    mapInput.nodes.push({
      id: "node.isolated",
      x: 10,
      y: 10,
      aimPointId: "aim.isolated",
      neighborNodeIds: []
    });
    mapInput.aimPoints.push({ id: "aim.isolated", x: 10, y: 10 });
    mapInput.placementPoints.push({
      id: "placement.isolated",
      nodeId: "node.isolated",
      capacity: 1,
      adjacentPlacementPointIds: []
    });

    const content = await compileContent(source);
    const map = content.maps.get("map.conformance_diamond" as never);
    if (map === undefined) throw new Error("missing compiled map fixture");
    const result = validateStaticPlacement(map, [
      {
        entityId: "entity.dwarf_isolated" as never,
        placementPointId: "placement.isolated" as never
      }
    ]);

    expect(result).toEqual({
      valid: false,
      issues: [
        {
          path: "$/enemyEntrances/0",
          code: "entrance_has_no_attack_route",
          message:
            "entrance entrance.west has no static attack route to a placed dwarf"
        }
      ]
    });
  });

  it("permits an intentional wall with a reachable attack approach", async () => {
    const content = await compileContent(mapContentInput);
    const map = content.maps.get("map.conformance_diamond" as never);
    if (map === undefined) throw new Error("missing compiled map fixture");

    expect(
      validateStaticPlacement(map, [
        {
          entityId: "entity.dwarf_east" as never,
          placementPointId: "placement.east" as never
        }
      ])
    ).toEqual({ valid: true, issues: [] });
  });

  it("validates multiple entrances and placements independently of source order", async () => {
    const source = structuredClone(mapContentInput);
    const mapInput = source.definitions.find(
      (definition) => definition.kind === "map"
    ) as MutableMapFixture | undefined;
    if (mapInput === undefined) throw new Error("missing map fixture");
    mapInput.nodes.push({
      id: "node.north",
      x: 1,
      y: -1,
      aimPointId: "aim.north",
      neighborNodeIds: ["node.east"]
    });
    mapInput.aimPoints.push({ id: "aim.north", x: 1, y: -1 });
    const east = mapInput.nodes.find((node) => node.id === "node.east");
    if (east === undefined) throw new Error("missing east node");
    east.neighborNodeIds.push("node.north");
    mapInput.connections.push({
      id: "connection.north_east",
      nodeIds: ["node.north", "node.east"],
      cost: 10
    });
    mapInput.enemyEntrances.push({
      id: "entrance.north",
      nodeId: "node.north"
    });

    const reordered = structuredClone(source);
    const reorderedMap = reordered.definitions.find(
      (definition) => definition.kind === "map"
    ) as MutableMapFixture;
    reorderedMap.nodes.reverse();
    reorderedMap.connections.reverse();
    reorderedMap.placementPoints.reverse();
    reorderedMap.enemyEntrances.reverse();
    const [canonical, permuted] = await Promise.all([
      compileContent(source),
      compileContent(reordered)
    ]);
    expect(permuted.manifestHash).toBe(canonical.manifestHash);

    const placements = [
      {
        entityId: "entity.dwarf_goal" as never,
        placementPointId: "placement.goal" as never
      },
      {
        entityId: "entity.dwarf_east" as never,
        placementPointId: "placement.east" as never
      }
    ] as const;
    for (const content of [canonical, permuted]) {
      const map = content.maps.get("map.conformance_diamond" as never);
      if (map === undefined) throw new Error("missing compiled map fixture");
      expect(validateStaticPlacement(map, placements)).toEqual({
        valid: true,
        issues: []
      });
      expect(validateStaticPlacement(map, [...placements].reverse())).toEqual({
        valid: true,
        issues: []
      });
    }
  });

  it("freezes replay commands and checkpoints", () => {
    const checksum = "0".repeat(64);
    const replay = compileReplay({
      schemaVersion: 1,
      simulationSchemaVersion: 1,
      contentVersion: "test",
      contentManifestHash: checksum,
      scenarioId: "scenario.test.replay",
      scenarioHash: checksum,
      levelId: "level.test",
      seed: "1",
      rngAlgorithm: "xorshift32-v1",
      commands: [
        {
          tick: 0,
          sequence: 0,
          command: { atTick: 0, type: "confirmPreparation" }
        }
      ],
      checkpoints: [
        {
          tick: 0,
          stateChecksum: checksum,
          eventStreamChecksum: checksum
        }
      ],
      expectedTerminalResult: "victory",
      expectedTerminalTick: 0
    });

    expect(Object.isFrozen(replay)).toBe(true);
    expect(Object.isFrozen(replay.commands)).toBe(true);
    expect(Object.isFrozen(replay.commands[0])).toBe(true);
    expect(Object.isFrozen(replay.commands[0]?.command)).toBe(true);
    expect(Object.isFrozen(replay.checkpoints)).toBe(true);
    expect(Object.isFrozen(replay.checkpoints[0])).toBe(true);
  });

  it("reports unknown scenario levels as validation issues", async () => {
    const content = await compileContent({
      schemaVersion: 1,
      contentVersion: "test",
      definitions: []
    });

    expect(() =>
      compileScenario(
        {
          schemaVersion: 1,
          id: "scenario.test.missing_level",
          levelId: "level.missing",
          seed: "1",
          maximumTicks: 1,
          commands: []
        },
        content
      )
    ).toThrowError(ContentValidationError);

    try {
      compileScenario(
        {
          schemaVersion: 1,
          id: "scenario.test.missing_level",
          levelId: "level.missing",
          seed: "1",
          maximumTicks: 1,
          commands: []
        },
        content
      );
    } catch (error) {
      expect((error as ContentValidationError).issues).toEqual([
        {
          path: "$/levelId",
          code: "unknown_reference",
          message: "references unknown level ID (level.missing)"
        }
      ]);
    }
  });
});
