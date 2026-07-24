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
  admitQueuedSpawns,
  createInitialState,
  nextUint32,
  resolveBattlefieldPhase,
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
import phase2SystemContentInput from "../../../content/fixtures/phase-2-system.json" with {
  type: "json"
};
import referenceCombatantsInput from "../../../content/fixtures/phase-3-reference-combatants.json" with {
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
  createPhase2SystemScenarioEvidence,
  createReplayDefinition,
  createTimelineRecords,
  renderBattlefieldSvg,
  renderBattlefieldText,
  runScenario,
  verifyReplay
} from "./index.js";

const battlefieldContentInput = {
  ...mapContentInput,
  definitions: [
    ...mapContentInput.definitions,
    ...referenceCombatantsInput.definitions.filter(
      (definition) => definition.kind === "enemy"
    )
  ]
};

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
      "acbbfb991269de9e2c6a5377951d8f40a1a142c74f8d94e3d9030d0c9f9d85c6"
    );
    expect(
      map?.nodes.find((node) => node.id === "node.entry")?.neighborNodeIds
    ).toEqual(["node.south", "node.east"]);
    expect(map?.placementPoints.map((point) => point.id)).toEqual([
      "placement.east",
      "placement.goal"
    ]);
    expect(map?.aimPoints.map((point) => point.id)).toEqual([
      "aim.east",
      "aim.entry",
      "aim.goal",
      "aim.south"
    ]);
    expect(map?.opaqueRegions).toEqual([
      {
        id: "opaque.conformance_wall",
        minimumX: 4,
        minimumY: 4,
        maximumX: 6,
        maximumY: 6
      }
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

  it("matches golden text and SVG battlefield diagnostics", async () => {
    const content = await compileContent(mapContentInput);
    const map = content.maps.get("map.conformance_diamond" as never);
    if (map === undefined) throw new Error("missing conformance map");
    const request = {
      map,
      state: {
        schemaVersion: 1 as const,
        mapId: map.id,
        startedWaveIds: [],
        firedSpawnIds: [],
        enemyAdmissions: [],
        enemyCombatants: [],
        occupancy: [
          {
            entityId: "entity.enemy.alpha" as never,
            nodeId: "node.east" as never
          }
        ],
        pendingSpawns: [
          {
            id: "spawn.second" as never,
            authoredOrder: 1,
            entityId: "entity.enemy.second" as never,
            enemyDefinitionId: "enemy.goblin_cutter" as never,
            entranceId: "entrance.west" as never
          }
        ]
      },
      layers: ["map", "occupancy", "path"] as const,
      route: {
        fromNodeId: "node.entry" as never,
        toNodeId: "node.goal" as never
      }
    };

    await expect(canonicalHash(renderBattlefieldText(request))).resolves.toBe(
      "f27934cd6e8955eeaad9defc735cdc3a72fc0ded16b2f03965153fc2ef853884"
    );
    await expect(canonicalHash(renderBattlefieldSvg(request))).resolves.toBe(
      "24d168444e7ee0f741162c1a328cd57fc81bb6cbfa9a5319be55194e7c4c215b"
    );
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

  it("matches deterministic spawn admission and live-enemy caps", async () => {
    const content = await compileContent(mapContentInput);
    const map = content.maps.get("map.conformance_diamond" as never);
    if (map === undefined) throw new Error("missing conformance map");

    expect(
      admitQueuedSpawns(
        map,
        [],
        [
          {
            id: "spawn.second",
            authoredOrder: 1,
            entityId: "entity.enemy.second",
            enemyDefinitionId: "enemy.goblin_cutter",
            entranceId: "entrance.west"
          },
          {
            id: "spawn.first",
            authoredOrder: 0,
            entityId: "entity.enemy.first",
            enemyDefinitionId: "enemy.goblin_cutter",
            entranceId: "entrance.west"
          }
        ] as never,
        { liveEnemyCap: 1, currentLiveEnemies: 0 }
      )
    ).toEqual({
      occupancy: [{ entityId: "entity.enemy.first", nodeId: "node.entry" }],
      pendingSpawns: [
        {
          id: "spawn.second",
          authoredOrder: 1,
          entityId: "entity.enemy.second",
          enemyDefinitionId: "enemy.goblin_cutter",
          entranceId: "entrance.west"
        }
      ],
      decisions: [
        {
          spawnId: "spawn.first",
          entityId: "entity.enemy.first",
          enemyDefinitionId: "enemy.goblin_cutter",
          entranceId: "entrance.west",
          status: "admitted",
          reason: "admitted"
        },
        {
          spawnId: "spawn.second",
          entityId: "entity.enemy.second",
          enemyDefinitionId: "enemy.goblin_cutter",
          entranceId: "entrance.west",
          status: "queued",
          reason: "live_enemy_cap_reached"
        }
      ]
    });
  });

  it("matches authoritative battlefield state and reason-coded events", async () => {
    const content = await compileContent(battlefieldContentInput);
    const initial = createInitialState(
      content,
      "level.conformance_map" as never,
      "1"
    );
    const admitted = resolveBattlefieldPhase(
      initial,
      content,
      [
        {
          id: "spawn.first",
          authoredOrder: 0,
          entityId: "entity.enemy.first",
          enemyDefinitionId: "enemy.goblin_cutter",
          entranceId: "entrance.west"
        },
        {
          id: "spawn.second",
          authoredOrder: 1,
          entityId: "entity.enemy.second",
          enemyDefinitionId: "enemy.goblin_cutter",
          entranceId: "entrance.west"
        }
      ] as never,
      []
    );
    const admittedBattlefield = admitted.state.battlefield;
    if (admittedBattlefield === undefined)
      throw new Error("expected battlefield state");
    const slinger = content.enemies.get("enemy.goblin_slinger" as never);
    if (slinger === undefined) throw new Error("expected slinger definition");
    expect(() =>
      resolveBattlefieldPhase(
        {
          ...admitted.state,
          tick: 7,
          battlefield: {
            ...admittedBattlefield,
            enemyCombatants: admittedBattlefield.enemyCombatants.map(
              (combatant) => ({
                ...combatant,
                enemyDefinitionId: slinger.id,
                classification: slinger.classification,
                maximumHealth: slinger.maximumHealth,
                currentHealth: slinger.maximumHealth,
                armor: slinger.armor,
                movementIntervalTicks: slinger.movementIntervalTicks,
                basicAttack: { ...slinger.basicAttack },
                actionState: {
                  ...combatant.actionState,
                  nextMovementAtTick: 7
                }
              })
            )
          }
        } as never,
        content,
        [],
        []
      )
    ).toThrow("does not match authoritative admission timing");
    expect(() =>
      resolveBattlefieldPhase(
        {
          ...admitted.state,
          tick: 6,
          battlefield: {
            ...admittedBattlefield,
            enemyCombatants: []
          } as never
        },
        content,
        [],
        [
          {
            id: "movement.missing_combatant",
            entityId: "entity.enemy.first",
            fromNodeId: "node.entry",
            toNodeId: "node.south"
          }
        ] as never
      )
    ).toThrow("admitted battlefield enemy is missing combatant state");
    const first = resolveBattlefieldPhase(
      { ...admitted.state, tick: 6 },
      content,
      [],
      [
        {
          id: "movement.first",
          entityId: "entity.enemy.first",
          fromNodeId: "node.entry",
          toNodeId: "node.south"
        }
      ] as never
    );
    const resumed = resolveBattlefieldPhase(
      { ...first.state, tick: 7 },
      content,
      [],
      []
    );

    expect(await canonicalHash({ first, resumed })).toBe(
      "16942e4a0ec81fa8d3e4dad7fbaa3a38e4e4a8eca3f27d1d0c28ce3aafe0f308"
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
      enemyAdmissions: [
        {
          schemaVersion: 1,
          spawnId: "spawn.first",
          entityId: "entity.enemy.first",
          enemyDefinitionId: "enemy.goblin_cutter",
          admittedAtTick: 0
        },
        {
          schemaVersion: 1,
          spawnId: "spawn.second",
          entityId: "entity.enemy.second",
          enemyDefinitionId: "enemy.goblin_cutter",
          admittedAtTick: 7
        }
      ],
      enemyCombatants: [
        expect.objectContaining({
          entityId: "entity.enemy.first",
          enemyDefinitionId: "enemy.goblin_cutter",
          currentHealth: 50
        }),
        expect.objectContaining({
          entityId: "entity.enemy.second",
          enemyDefinitionId: "enemy.goblin_cutter",
          currentHealth: 50
        })
      ]
    });
  });

  it("matches the golden Phase 2 system scenario evidence", async () => {
    const content = await compileContent(phase2SystemContentInput);
    const evidence = createPhase2SystemScenarioEvidence(content);

    expect(await canonicalHash(evidence)).toBe(
      "e65284a844e2c4c0c73b0d8699db3cffb59000853f64d6d382664d4eace6edba"
    );
    expect(evidence.placementRoutes.eastAttackRoute?.route.nodeIds).toEqual([
      "node.entry",
      "node.east",
      "node.east_approach"
    ]);
    expect(evidence.placementRoutes.southAttackRoute?.route.nodeIds).toEqual([
      "node.entry",
      "node.south",
      "node.south_approach"
    ]);
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
