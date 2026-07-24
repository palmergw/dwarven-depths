import {
  compileContent,
  compileReplay,
  compileScenario,
  findShortestRoute,
  validateStaticPlacement
} from "@dwarven-depths/content-runtime";
import { canonicalHash } from "@dwarven-depths/contracts";
import {
  AuthoritativeTables,
  nextUint32,
  resolveMovementReservations,
  seedToUint32
} from "@dwarven-depths/sim-core";
import { describe, expect, it } from "vitest";
import mapContentInput from "../../../content/fixtures/conformance-map.json" with {
  type: "json"
};
import contentInput from "../../../content/fixtures/empty-content.json" with {
  type: "json"
};
import scenarioInput from "../../../scenarios/conformance/empty-level.json" with {
  type: "json"
};
import replayInput from "../../../scenarios/conformance/empty-level.replay.json" with {
  type: "json"
};
import stableTablesInput from "../../../scenarios/conformance/stable-tables.json" with {
  type: "json"
};
import {
  compareRunEvidence,
  createLifecycleDiagnostics,
  createReplayDefinition,
  createTimelineRecords,
  runScenario,
  verifyReplay
} from "./index.js";

const expected = {
  contentManifestHash:
    "3166e781fc4cce29240c01099919f4475ebe03294a76987706214eb24e398abe",
  scenarioHash:
    "7b51d2008c37b6ee79d4b41b17767e41441f8f86cbeddfe761db399fe45c1139",
  finalStateChecksum:
    "3273b044b92e0941e35341de5aaef023db045af7c97983a7bd947c040e60fb33",
  eventStreamChecksum:
    "d081b5fbde5b7d474a38545e401939cbd0b63ecc6ad2558aedeaea0be4fb0d59",
  timelineChecksum:
    "04e1044de1adf6ba571172f83dddeffc05e5fc2a0c015f05f4ec35d522b6d2c3",
  diagnosticChecksum:
    "b1a1f8638a600cce2b880d3071f7608864dc018d18c6480a5f1191fd2db1e247"
};

describe("cross-runtime deterministic conformance", () => {
  it("matches canonical first-divergence evidence", async () => {
    const content = await compileContent(contentInput);
    const scenario = compileScenario(scenarioInput, content);
    const result = await runScenario(scenario, content);
    const replay = createReplayDefinition(result, scenario, content);
    const baseline = {
      content: content.bundle,
      scenario,
      commands: result.commands,
      checkpoints: replay.checkpoints,
      events: result.events,
      finalState: result.finalState
    };
    expect(
      compareRunEvidence(baseline, {
        ...baseline,
        events: result.events.map((event, index) =>
          index === 0 ? { ...event, ruleId: "SIM-CHANGED" } : event
        )
      })
    ).toEqual({
      schemaVersion: 1,
      equivalent: false,
      firstDivergence: {
        category: "event",
        tick: 0,
        path: "$/0/ruleId"
      }
    });
  });

  it.each([
    ["1", [270369, 67634689, 2647435461, 307599695]],
    ["4294967295", [253983, 4228382207, 1958451267, 4056713434]]
  ] as const)(
    "matches the golden PRNG sequence for seed %s",
    (seed, expectedSequence) => {
      let state = seedToUint32(seed);
      const sequence: number[] = [];
      for (let index = 0; index < expectedSequence.length; index += 1) {
        state = nextUint32(state);
        sequence.push(state);
      }
      expect(sequence).toEqual(expectedSequence);
    }
  );

  it("matches the golden nonempty authored battlefield map", async () => {
    const content = await compileContent(mapContentInput);
    const map = content.maps.get("map.conformance_diamond" as never);

    expect(content.manifestHash).toBe(
      "38b3ddd8c676f1c05e3fb0de8d1f08f74712d14a4523b0801b28110540fedca1"
    );
    expect(
      map?.nodes.find((node) => node.id === "node.entry")?.neighborNodeIds
    ).toEqual(["node.south", "node.east"]);
    expect(map?.placementPoints.map((point) => point.id)).toEqual([
      "placement.east",
      "placement.goal"
    ]);
    expect(
      map === undefined
        ? undefined
        : findShortestRoute(map, "node.entry" as never, "node.goal" as never)
    ).toEqual({
      nodeIds: ["node.entry", "node.south", "node.goal"],
      totalCost: 20
    });
    expect(
      map === undefined
        ? undefined
        : validateStaticPlacement(map, [
            {
              entityId: "entity.dwarf_goal" as never,
              placementPointId: "placement.goal" as never
            }
          ])
    ).toEqual({ valid: true, issues: [] });
  });

  it("matches deterministic movement reservation contention", async () => {
    const content = await compileContent(mapContentInput);
    const map = content.maps.get("map.conformance_diamond" as never);
    if (map === undefined) throw new Error("missing conformance map");

    expect(
      resolveMovementReservations(
        map,
        [
          { entityId: "entity.enemy.beta", nodeId: "node.goal" },
          { entityId: "entity.enemy.alpha", nodeId: "node.entry" }
        ] as never,
        [
          {
            id: "movement.beta",
            entityId: "entity.enemy.beta",
            fromNodeId: "node.goal",
            toNodeId: "node.south"
          },
          {
            id: "movement.alpha",
            entityId: "entity.enemy.alpha",
            fromNodeId: "node.entry",
            toNodeId: "node.south"
          }
        ] as never
      )
    ).toEqual({
      occupancy: [
        { entityId: "entity.enemy.alpha", nodeId: "node.south" },
        { entityId: "entity.enemy.beta", nodeId: "node.goal" }
      ],
      decisions: [
        {
          proposalId: "movement.alpha",
          entityId: "entity.enemy.alpha",
          fromNodeId: "node.entry",
          toNodeId: "node.south",
          status: "moved",
          reason: "moved"
        },
        {
          proposalId: "movement.beta",
          entityId: "entity.enemy.beta",
          fromNodeId: "node.goal",
          toNodeId: "node.south",
          status: "waited",
          reason: "destination_reserved"
        }
      ]
    });
  });

  it("matches the golden nonempty entity/effect table", async () => {
    const tables = AuthoritativeTables.fromSnapshot(stableTablesInput);

    expect(await tables.checksum()).toBe(
      "6ea32a50c655cfe02f6c08ef08c3a742b65f6be310d35b41069ea61595e580ba"
    );
    expect(tables.entities().map((record) => record.id)).toEqual([
      "entity.dwarf.alpha",
      "entity.enemy.beta",
      "entity.tower.gamma"
    ]);
    expect(tables.effects().map((record) => record.id)).toEqual([
      "effect.guard.alpha",
      "effect.mark.beta"
    ]);
  });

  it("matches the canonical Node hashes and ordered event stream", async () => {
    const content = await compileContent(contentInput);
    const scenario = compileScenario(scenarioInput, content);
    const result = await runScenario(scenario, content);
    const generatedReplay = createReplayDefinition(result, scenario, content);
    const timeline = createTimelineRecords(result.events, generatedReplay);
    const diagnostics = createLifecycleDiagnostics(
      result.events,
      result.commands
    );
    const recordedReplay = compileReplay(replayInput);
    const verified = await verifyReplay(recordedReplay, scenario, content);

    expect(generatedReplay).toEqual(recordedReplay);
    expect(content.manifestHash).toBe(expected.contentManifestHash);
    expect(result.scenarioHash).toBe(expected.scenarioHash);
    expect(result.finalStateChecksum).toBe(expected.finalStateChecksum);
    expect(result.eventStreamChecksum).toBe(expected.eventStreamChecksum);
    expect(await canonicalHash(timeline)).toBe(expected.timelineChecksum);
    expect(await canonicalHash(diagnostics)).toBe(expected.diagnosticChecksum);
    expect(verified.finalStateChecksum).toBe(result.finalStateChecksum);
    expect(verified.eventStreamChecksum).toBe(result.eventStreamChecksum);
    expect(result.events.map((event) => event.type)).toEqual([
      "round.started",
      "final_cleanup.entered",
      "round.victory"
    ]);
  });
});
