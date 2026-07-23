import { describe, expect, it } from "vitest";
import mapContentInput from "../../../content/fixtures/conformance-map.json" with {
  type: "json"
};
import {
  ContentValidationError,
  calculateRouteCost,
  compileContent,
  compileReplay,
  compileScenario,
  findShortestRoute
} from "./index.js";

interface MutableMapFixture {
  readonly kind: "map";
  nodes: Array<{ neighborNodeIds: string[] }>;
  connections: Array<{ id: string; nodeIds: string[]; cost: number }>;
  placementPoints: unknown[];
  enemyEntrances: unknown[];
}

describe("content compilation", () => {
  it("sorts definitions and builds kind-specific indexes", async () => {
    const content = await compileContent({
      schemaVersion: 1,
      contentVersion: "test",
      definitions: [
        { kind: "wave", id: "wave.first", durationTicks: 30 },
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
      "38b3ddd8c676f1c05e3fb0de8d1f08f74712d14a4523b0801b28110540fedca1"
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
      neighborNodeIds: []
    } as never);

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
