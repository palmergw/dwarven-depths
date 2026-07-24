import { describe, expect, it } from "vitest";
import mapContentInput from "../../../content/fixtures/conformance-map.json" with {
  type: "json"
};
import {
  ContentValidationError,
  validateContentBundle,
  validateReplay,
  validateScenario
} from "./index.js";

const validBundle = {
  schemaVersion: 1,
  contentVersion: "milestone-0",
  definitions: [{ kind: "level", id: "level.empty", waveIds: [] }]
};

interface MutableSchemaMap {
  nodes: Array<{
    id: string;
    x: number;
    y: number;
    aimPointId: string;
    neighborNodeIds: string[];
  }>;
  connections: Array<{ id: string; nodeIds: [string, string]; cost: number }>;
  placementPoints: Array<{
    id: string;
    nodeId: string;
    capacity: number;
    adjacentPlacementPointIds: string[];
  }>;
  enemyEntrances: Array<{ id: string; nodeId: string }>;
  aimPoints: Array<{ id: string; x: number; y: number }>;
  opaqueRegions: Array<{
    id: string;
    minimumX: number;
    minimumY: number;
    maximumX: number;
    maximumY: number;
  }>;
}

function mapFromFixture(bundle: typeof mapContentInput): MutableSchemaMap {
  const map = bundle.definitions.find(
    (definition) => definition.kind === "map"
  );
  if (map === undefined) throw new Error("missing map fixture");
  return map as unknown as MutableSchemaMap;
}

describe("content validation", () => {
  it("accepts a minimal level bundle", () => {
    expect(validateContentBundle(validBundle).definitions).toHaveLength(1);
  });

  it("reports the exact duplicate stable ID path", () => {
    expect(() =>
      validateContentBundle({
        ...validBundle,
        definitions: [...validBundle.definitions, validBundle.definitions[0]]
      })
    ).toThrow(ContentValidationError);

    try {
      validateContentBundle({
        ...validBundle,
        definitions: [...validBundle.definitions, validBundle.definitions[0]]
      });
    } catch (error) {
      const issue = (error as ContentValidationError).issues[0];
      expect(issue).toMatchObject({
        path: "$/definitions/1/id",
        relatedPaths: ["$/definitions/0/id"]
      });
      expect(Object.isFrozen(issue?.relatedPaths)).toBe(true);
    }
  });

  it("rejects unknown fields", () => {
    expect(() =>
      validateContentBundle({ ...validBundle, unexpected: true })
    ).toThrow(/Unrecognized key/);
  });

  it("rejects missing and wrong-kind wave references with exact paths", () => {
    for (const definitions of [
      [{ kind: "level", id: "level.test", waveIds: ["wave.missing"] }],
      [
        { kind: "level", id: "level.test", waveIds: ["level.other"] },
        { kind: "level", id: "level.other", waveIds: [] }
      ]
    ]) {
      try {
        validateContentBundle({
          schemaVersion: 1,
          contentVersion: "milestone-0",
          definitions
        });
        throw new Error("expected validation to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(ContentValidationError);
        expect((error as ContentValidationError).issues[0]?.path).toBe(
          "$/definitions/0/waveIds/0"
        );
      }
    }
  });

  it("accepts a level that references an authored wave", () => {
    const result = validateContentBundle({
      schemaVersion: 1,
      contentVersion: "milestone-0",
      definitions: [
        { kind: "level", id: "level.test", waveIds: ["wave.first"] },
        { kind: "wave", id: "wave.first", durationTicks: 30 }
      ]
    });
    expect(result.definitions).toHaveLength(2);
  });

  it("accepts the authored orthogonal conformance map", () => {
    const result = validateContentBundle(mapContentInput);
    expect(
      result.definitions.find((definition) => definition.kind === "map")
    ).toMatchObject({ id: "map.conformance_diamond" });
  });

  it("rejects malformed map IDs and references at stable paths", () => {
    const invalid = structuredClone(mapContentInput);
    const map = mapFromFixture(invalid);
    const firstNode = map.nodes[0];
    const duplicateNode = map.nodes[1];
    const placement = map.placementPoints[0];
    const entrance = map.enemyEntrances[0];
    if (
      firstNode === undefined ||
      duplicateNode === undefined ||
      placement === undefined ||
      entrance === undefined
    )
      throw new Error("incomplete map fixture");
    duplicateNode.id = firstNode.id;
    placement.nodeId = "node.missing";
    entrance.nodeId = "node.missing";

    try {
      validateContentBundle(invalid);
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ContentValidationError);
      expect((error as ContentValidationError).issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "$/definitions/1/nodes/1/id",
            code: "duplicate_stable_id"
          }),
          expect.objectContaining({
            path: "$/definitions/1/placementPoints/0/nodeId",
            code: "unknown_reference"
          }),
          expect.objectContaining({
            path: "$/definitions/1/enemyEntrances/0/nodeId",
            code: "unknown_reference"
          })
        ])
      );
    }
  });

  it("enforces battlefield ID domains, global uniqueness, and single occupancy", () => {
    const wrongDomains = structuredClone(mapContentInput);
    const wrongDomainMap = mapFromFixture(wrongDomains);
    const node = wrongDomainMap.nodes[0];
    const placement = wrongDomainMap.placementPoints[0];
    if (node === undefined || placement === undefined)
      throw new Error("incomplete map fixture");
    node.id = "placement.entry";
    placement.capacity = 2;
    expect(() => validateContentBundle(wrongDomains)).toThrow(
      /must be a node\.\* stable ID.*Invalid input: expected 1/s
    );

    const duplicateAcrossMaps = structuredClone(mapContentInput);
    const sourceMap = duplicateAcrossMaps.definitions.find(
      (definition) => definition.kind === "map"
    );
    if (sourceMap === undefined || sourceMap.kind !== "map")
      throw new Error("missing map fixture");
    duplicateAcrossMaps.definitions.push({
      ...structuredClone(sourceMap),
      id: "map.second"
    });

    try {
      validateContentBundle(duplicateAcrossMaps);
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ContentValidationError);
      expect((error as ContentValidationError).issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "$/definitions/2/nodes/0/id",
            code: "duplicate_stable_id",
            relatedPaths: ["$/definitions/1/nodes/0/id"]
          }),
          expect.objectContaining({
            path: "$/definitions/2/placementPoints/0/id",
            code: "duplicate_stable_id"
          })
        ])
      );
    }
  });

  it("rejects non-orthogonal edges and missing authored neighbor order", () => {
    const invalid = structuredClone(mapContentInput);
    const map = mapFromFixture(invalid);
    const east = map.nodes.find((node) => node.id === "node.east");
    const entry = map.nodes.find((node) => node.id === "node.entry");
    if (east === undefined || entry === undefined)
      throw new Error("incomplete map fixture");
    east.y = 2;
    entry.neighborNodeIds = ["node.south"];

    try {
      validateContentBundle(invalid);
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ContentValidationError);
      expect((error as ContentValidationError).issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "$/definitions/1/connections/0/nodeIds",
            code: "non_orthogonal_connection"
          }),
          expect.objectContaining({
            path: "$/definitions/1/connections/0/nodeIds",
            code: "missing_neighbor_order"
          })
        ])
      );
    }
  });

  it("validates aim-point references, coordinate bounds, and opaque geometry", () => {
    const invalid = structuredClone(mapContentInput);
    const map = mapFromFixture(invalid);
    const node = map.nodes[0];
    if (node === undefined) throw new Error("incomplete map fixture");
    node.aimPointId = "aim.missing";
    map.aimPoints.push({ id: "aim.goal", x: 0, y: 0 });
    map.opaqueRegions.push({
      id: "opaque.invalid",
      minimumX: 4,
      minimumY: 2,
      maximumX: 4,
      maximumY: 1
    });

    try {
      validateContentBundle(invalid);
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ContentValidationError);
      expect((error as ContentValidationError).issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "$/definitions/1/nodes/0/aimPointId",
            code: "unknown_reference"
          }),
          expect.objectContaining({
            path: "$/definitions/1/aimPoints/4/id",
            code: "duplicate_stable_id"
          }),
          expect.objectContaining({
            path: "$/definitions/1/opaqueRegions/1/maximumX",
            code: "invalid_geometry"
          }),
          expect.objectContaining({
            path: "$/definitions/1/opaqueRegions/1/maximumY",
            code: "invalid_geometry"
          })
        ])
      );
    }

    const outOfBounds = structuredClone(mapContentInput);
    const firstAimPoint = mapFromFixture(outOfBounds).aimPoints[0];
    if (firstAimPoint === undefined) throw new Error("missing aim point");
    firstAimPoint.x = 1_000_001;
    expect(() => validateContentBundle(outOfBounds)).toThrow(/<=1000000/);

    const negativeZero = structuredClone(mapContentInput);
    const negativeZeroPoint = mapFromFixture(negativeZero).aimPoints[0];
    if (negativeZeroPoint === undefined) throw new Error("missing aim point");
    negativeZeroPoint.x = -0;
    expect(() => validateContentBundle(negativeZero)).toThrow(
      "$/definitions/1/aimPoints/0/x: must not be negative zero"
    );
  });
});

describe("scenario validation", () => {
  it("accepts the empty conformance scenario", () => {
    expect(
      validateScenario({
        schemaVersion: 1,
        id: "scenario.conformance.empty",
        levelId: "level.empty",
        seed: "1",
        maximumTicks: 1,
        commands: [{ atTick: 0, type: "confirmPreparation" }],
        expectedTerminalResult: "victory"
      }).id
    ).toBe("scenario.conformance.empty");
  });

  it.each(["0", "01", "4294967296", "999999999999999999999"])(
    "rejects seed %s outside the PRNG domain",
    (seed) => {
      expect(() =>
        validateScenario({
          schemaVersion: 1,
          id: "scenario.conformance.seed",
          levelId: "level.empty",
          seed,
          maximumTicks: 1,
          commands: []
        })
      ).toThrow(/between 1 and 4294967295/);
    }
  );

  it("rejects preparation commands after gameplay tick zero", () => {
    expect(() =>
      validateScenario({
        schemaVersion: 1,
        id: "scenario.conformance.late_preparation",
        levelId: "level.empty",
        seed: "1",
        maximumTicks: 2,
        commands: [{ atTick: 1, type: "confirmPreparation" }]
      })
    ).toThrow(/must be scheduled at gameplay tick 0/);
  });

  it("rejects commands outside the tick budget and duplicate commands", () => {
    expect(() =>
      validateScenario({
        schemaVersion: 1,
        id: "scenario.conformance.commands",
        levelId: "level.empty",
        seed: "1",
        maximumTicks: 1,
        commands: [
          { atTick: 1, type: "confirmPreparation" },
          { atTick: 1, type: "confirmPreparation" }
        ]
      })
    ).toThrow(/less than maximumTicks.*duplicates an earlier/s);
  });
});

const checksum = "0".repeat(64);
const validReplay = {
  schemaVersion: 1,
  simulationSchemaVersion: 1,
  contentVersion: "milestone-0",
  contentManifestHash: checksum,
  scenarioId: "scenario.conformance.empty",
  scenarioHash: checksum,
  levelId: "level.empty",
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
};

describe("replay validation", () => {
  it("accepts the minimal versioned replay contract", () => {
    const replay = validateReplay(validReplay);
    expect(replay).toMatchObject({
      schemaVersion: 1,
      rngAlgorithm: "xorshift32-v1",
      expectedTerminalResult: "victory"
    });
  });

  it("rejects malformed checksums and unknown fields", () => {
    expect(() =>
      validateReplay({
        ...validReplay,
        contentManifestHash: "ABC",
        unexpected: true
      })
    ).toThrow(/SHA-256.*Unrecognized key/s);
  });

  it("rejects command-envelope mismatches with exact paths", () => {
    try {
      validateReplay({
        ...validReplay,
        commands: [
          {
            tick: 1,
            sequence: 4,
            command: { atTick: 0, type: "confirmPreparation" }
          }
        ]
      });
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ContentValidationError);
      expect((error as ContentValidationError).issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "$/commands/0/sequence",
            code: "invalid_command_sequence"
          }),
          expect.objectContaining({
            path: "$/commands/0/tick",
            code: "command_tick_mismatch"
          }),
          expect.objectContaining({
            path: "$/commands/0/tick",
            code: "command_after_terminal"
          })
        ])
      );
    }
  });

  it("requires exactly one checkpoint ending at the terminal tick", () => {
    expect(() =>
      validateReplay({
        ...validReplay,
        checkpoints: [
          { tick: 0, stateChecksum: checksum, eventStreamChecksum: checksum },
          { tick: 1, stateChecksum: checksum, eventStreamChecksum: checksum }
        ]
      })
    ).toThrow(/exactly one terminal checkpoint/);

    expect(() =>
      validateReplay({
        ...validReplay,
        checkpoints: [
          { tick: 1, stateChecksum: checksum, eventStreamChecksum: checksum }
        ],
        expectedTerminalTick: 2
      })
    ).toThrow(/final checkpoint tick/);
  });
});
