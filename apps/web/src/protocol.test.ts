import { describe, expect, it } from "vitest";
import {
  type ClientMessage,
  EMPTY_CONTENT_MANIFEST_HASH,
  parseClientMessage,
  parseWorkerMessage,
  type WorkerMessage
} from "./protocol.js";

describe("web worker protocol", () => {
  it("accepts only the versioned preparation command shape", () => {
    expect(
      parseClientMessage({ protocolVersion: 1, type: "initialize" })
    ).toEqual({ protocolVersion: 1, type: "initialize" });
    expect(
      parseClientMessage({
        protocolVersion: 1,
        type: "command",
        requestId: "request-1",
        command: { type: "confirmPreparation" }
      })
    ).toBeDefined();
    expect(
      parseClientMessage({
        protocolVersion: 2,
        type: "command",
        requestId: "pause-1",
        command: { type: "setManualPause", paused: true }
      })
    ).toEqual({
      protocolVersion: 2,
      type: "command",
      requestId: "pause-1",
      command: { type: "setManualPause", paused: true }
    });
    expect(
      parseClientMessage({
        protocolVersion: 2,
        type: "command",
        requestId: "commit-1",
        command: {
          type: "commitManualResume",
          resumeRequestId: "resume-1"
        }
      })
    ).toBeDefined();
    expect(
      parseClientMessage({
        protocolVersion: 1,
        type: "command",
        requestId: "pause-legacy",
        command: { type: "setManualPause", paused: true }
      })
    ).toBeUndefined();
    expect(
      parseClientMessage({
        protocolVersion: 2,
        type: "command",
        requestId: "pause-malformed",
        command: { type: "setManualPause", paused: "yes" }
      })
    ).toBeUndefined();
    expect(
      parseClientMessage({ protocolVersion: 5, type: "initialize" })
    ).toBeUndefined();
    expect(
      parseClientMessage({
        protocolVersion: 1,
        type: "initialize",
        extra: true
      })
    ).toBeUndefined();
    expect(
      parseClientMessage({
        protocolVersion: 1,
        type: "command",
        requestId: "",
        command: { type: "confirmPreparation" }
      })
    ).toBeUndefined();
    expect(
      parseClientMessage({
        protocolVersion: 2,
        type: "command",
        requestId: "x".repeat(129),
        command: { type: "confirmPreparation" }
      })
    ).toBeUndefined();
  });

  it("strictly validates version 4 target-policy commands", () => {
    const command = {
      protocolVersion: 4,
      type: "command",
      requestId: "policy-1",
      command: {
        type: "setTargetPolicy",
        dwarfEntityId: "entity.dwarf.warden",
        requestedPolicy: "highest_armor"
      }
    };
    expect(parseClientMessage(command)).toEqual(command);
    expect(
      parseClientMessage({ ...command, protocolVersion: 3 })
    ).toBeUndefined();
    expect(
      parseClientMessage({
        ...command,
        command: { ...command.command, requestedPolicy: "foreign" }
      })
    ).toBeUndefined();
    expect(
      parseClientMessage({
        ...command,
        command: { ...command.command, dwarfEntityId: "../foreign" }
      })
    ).toBeUndefined();
  });

  it("keeps legacy static protocol meanings frozen", () => {
    type LegacyTargetCommand = Extract<
      Extract<
        ClientMessage,
        { protocolVersion: 3; type: "command" }
      >["command"],
      { type: "setTargetPolicy" }
    >;
    type LegacyTargetResultCommand = Extract<
      Extract<
        WorkerMessage,
        { protocolVersion: 3; type: "result" }
      >["commands"][number]["command"],
      { type: "setTargetPolicy" }
    >;
    // @ts-expect-error target-policy input was not part of protocol version 3
    const legacyCommand: LegacyTargetCommand = { type: "setTargetPolicy" };
    // @ts-expect-error target-policy evidence was not part of protocol version 3
    const legacyResultCommand: LegacyTargetResultCommand = {
      type: "setTargetPolicy"
    };
    expect(legacyCommand).toBeDefined();
    expect(legacyResultCommand).toBeDefined();
  });

  it("rejects malformed or extended authoritative results", () => {
    const result = {
      protocolVersion: 1,
      type: "result",
      terminalResult: "victory",
      terminalTick: 0,
      finalStateChecksum: "a".repeat(64),
      eventStreamChecksum: "b".repeat(64),
      commands: [
        {
          tick: 0,
          sequence: 0,
          command: { atTick: 0, type: "confirmPreparation" }
        }
      ]
    };
    expect(parseWorkerMessage(result)).toEqual(result);
    expect(
      parseWorkerMessage({ ...result, finalStateChecksum: "short" })
    ).toBeUndefined();
    expect(parseWorkerMessage({ ...result, terminalTick: -1 })).toBeUndefined();
    expect(
      parseWorkerMessage({
        ...result,
        commands: [
          {
            tick: -1,
            sequence: -1,
            command: { atTick: -1, type: "confirmPreparation" }
          }
        ]
      })
    ).toBeUndefined();
    expect(parseWorkerMessage({ ...result, commands: [] })).toBeUndefined();
    expect(
      parseWorkerMessage({
        ...result,
        commands: [
          {
            tick: 0,
            sequence: 7,
            command: { atTick: 1, type: "confirmPreparation" }
          }
        ]
      })
    ).toBeUndefined();
    expect(parseWorkerMessage({ ...result, unexpected: true })).toBeUndefined();
  });

  it("strictly parses canonical target-policy replay evidence", () => {
    const result = {
      protocolVersion: 4,
      type: "result",
      terminalResult: "victory",
      terminalTick: 1,
      finalStateChecksum: "a".repeat(64),
      eventStreamChecksum: "b".repeat(64),
      commands: [
        {
          tick: 0,
          sequence: 0,
          command: { atTick: 0, type: "confirmPreparation" }
        },
        {
          tick: 1,
          sequence: 1,
          command: {
            atTick: 1,
            type: "setTargetPolicy",
            dwarfEntityId: "entity.dwarf.warden",
            requestedPolicy: "fastest"
          }
        }
      ]
    };
    const targetCommand = result.commands.at(1);
    if (targetCommand === undefined) throw new Error("missing target command");
    expect(parseWorkerMessage(result)).toEqual(result);
    expect(
      parseWorkerMessage({ ...result, commands: [targetCommand] })
    ).toBeUndefined();
    expect(
      parseWorkerMessage({
        ...result,
        commands: [
          {
            ...result.commands[0],
            tick: 1,
            command: { atTick: 1, type: "confirmPreparation" }
          },
          targetCommand
        ]
      })
    ).toBeUndefined();
    expect(
      parseWorkerMessage({
        ...result,
        commands: result.commands.slice().reverse()
      })
    ).toBeUndefined();
    expect(
      parseWorkerMessage({
        ...result,
        commands: [
          result.commands[0],
          {
            ...targetCommand,
            command: { ...targetCommand.command, requestedPolicy: "foreign" }
          }
        ]
      })
    ).toBeUndefined();
    expect(
      parseWorkerMessage({
        ...result,
        terminalTick: 5,
        commands: [
          result.commands[0],
          {
            ...targetCommand,
            tick: 5,
            command: { ...targetCommand.command, atTick: 5 }
          },
          { ...targetCommand, sequence: 2, tick: 2 }
        ]
      })
    ).toBeUndefined();
    expect(
      parseWorkerMessage({
        ...result,
        commands: [
          result.commands[0],
          targetCommand,
          { ...targetCommand, sequence: 2 }
        ]
      })
    ).toBeUndefined();
  });

  it("accepts only complete authoritative preparation summaries", () => {
    const snapshot = {
      protocolVersion: 1,
      type: "snapshot",
      phase: "preparation",
      levelId: "level.empty",
      deployableEntityCount: 0,
      placementPointCount: 0
    };
    expect(parseWorkerMessage(snapshot)).toEqual(snapshot);
    expect(
      parseWorkerMessage({ ...snapshot, deployableEntityCount: -1 })
    ).toBeUndefined();
    expect(
      parseWorkerMessage({ ...snapshot, placementPointCount: 0.5 })
    ).toBeUndefined();
    const { levelId: _levelId, ...missingLevel } = snapshot;
    expect(parseWorkerMessage(missingLevel)).toBeUndefined();
    expect(parseWorkerMessage({ ...snapshot, levelId: " " })).toBeUndefined();
    expect(
      parseWorkerMessage({ ...snapshot, levelId: "map.not_a_level" })
    ).toBeUndefined();
    expect(
      parseWorkerMessage({ ...snapshot, levelId: "level:empty" })
    ).toBeUndefined();
    expect(
      parseWorkerMessage({ ...snapshot, levelId: "level.-bad" })
    ).toBeUndefined();
    expect(
      parseWorkerMessage({ ...snapshot, levelId: `level.${"a".repeat(128)}` })
    ).toBeUndefined();
    expect(
      parseWorkerMessage({
        protocolVersion: 1,
        type: "snapshot",
        phase: "running"
      })
    ).toBeDefined();
    expect(
      parseWorkerMessage({
        protocolVersion: 2,
        type: "snapshot",
        phase: "running",
        manualPaused: true,
        resumeRequestId: null
      })
    ).toBeDefined();
    expect(
      parseWorkerMessage({
        protocolVersion: 2,
        type: "snapshot",
        phase: "running"
      })
    ).toBeUndefined();
  });

  it("accepts only the empty manifest-bound combat-control availability", () => {
    const controls = {
      protocolVersion: 3,
      type: "combat_controls",
      contentManifestHash: EMPTY_CONTENT_MANIFEST_HASH,
      dwarves: []
    };
    expect(parseWorkerMessage(controls)).toEqual(controls);
    expect(
      parseWorkerMessage({
        ...controls,
        contentManifestHash: "a".repeat(64)
      })
    ).toBeUndefined();
    expect(
      parseWorkerMessage({
        ...controls,
        dwarves: [
          {
            entityId: "foreign.entity",
            characterId: "foreign.character",
            supportedTargetPolicies: ["nearest"],
            abilityIds: ["foreign.ability"]
          }
        ]
      })
    ).toBeUndefined();
    expect(
      parseWorkerMessage({ ...controls, protocolVersion: 2 })
    ).toBeUndefined();
    expect(
      parseWorkerMessage({ ...controls, unexpected: true })
    ).toBeUndefined();
  });

  it("accepts only canonical version 4 combat-control capabilities", () => {
    const controls = {
      protocolVersion: 4,
      type: "combat_controls",
      authoritativeTick: 7,
      contentManifestHash: "a".repeat(64),
      dwarves: [
        {
          entityId: "entity.dwarf.warden",
          characterId: "character.iron_warden",
          supportedTargetPolicies: ["nearest", "highest_armor"]
        }
      ]
    };
    expect(parseWorkerMessage(controls)).toEqual(controls);
    expect(
      parseWorkerMessage({ ...controls, authoritativeTick: -1 })
    ).toBeUndefined();
    expect(
      parseWorkerMessage({ ...controls, authoritativeTick: 7.5 })
    ).toBeUndefined();
    expect(
      parseWorkerMessage({
        ...controls,
        dwarves: [
          {
            ...controls.dwarves[0],
            supportedTargetPolicies: ["highest_armor", "nearest"]
          }
        ]
      })
    ).toBeUndefined();
    expect(
      parseWorkerMessage({
        ...controls,
        dwarves: [controls.dwarves[0], controls.dwarves[0]]
      })
    ).toBeUndefined();
    expect(
      parseWorkerMessage({
        ...controls,
        dwarves: [{ ...controls.dwarves[0], foreign: true }]
      })
    ).toBeUndefined();
  });

  it("accepts only canonical, internally consistent render snapshots", () => {
    const snapshot = {
      schemaVersion: 1,
      levelId: "level.test",
      mapId: "map.test",
      tick: 3,
      phase: "running",
      nodes: [
        { id: "node.1", x: 0, y: 0 },
        { id: "node:1", x: 1, y: 0 }
      ],
      connections: [
        {
          id: "connection.a-b",
          fromNodeId: "node.1",
          toNodeId: "node:1"
        }
      ],
      entities: [{ id: "enemy.1", nodeId: "node:1", faction: "enemy" }]
    };
    const message = { protocolVersion: 1, type: "render_snapshot", snapshot };
    expect(parseWorkerMessage(message)).toEqual(message);
    expect(
      parseWorkerMessage({ ...message, protocolVersion: 4 })
    ).toBeUndefined();
    const presentationMessage = {
      protocolVersion: 4,
      type: "render_snapshot",
      snapshot: {
        schemaVersion: 2,
        scenarioId: "scenario.test",
        levelId: "level.test",
        mapId: null,
        tick: 0,
        previousTick: null,
        phase: "preparation",
        nodes: [],
        connections: [],
        entities: [],
        entityTransitions: [],
        encounter: {
          startedWaveIds: [],
          activeWaveId: null,
          pendingSpawnCount: 0,
          livingHostileCount: 0,
          terminalResult: null
        }
      }
    };
    expect(parseWorkerMessage(presentationMessage)).toEqual(
      presentationMessage
    );
    expect(
      parseWorkerMessage({ ...presentationMessage, protocolVersion: 1 })
    ).toBeUndefined();
    expect(
      parseWorkerMessage({ ...message, protocolVersion: 5 })
    ).toBeUndefined();
    expect(
      parseWorkerMessage({ ...message, snapshot: { ...snapshot, extra: true } })
    ).toBeUndefined();
    expect(
      parseWorkerMessage({
        ...message,
        snapshot: {
          ...snapshot,
          nodes: [snapshot.nodes[1], snapshot.nodes[0]]
        }
      })
    ).toBeUndefined();
    expect(
      parseWorkerMessage({
        ...message,
        snapshot: {
          ...snapshot,
          nodes: [snapshot.nodes[0], snapshot.nodes[0]]
        }
      })
    ).toBeUndefined();
    expect(
      parseWorkerMessage({
        ...message,
        snapshot: {
          ...snapshot,
          nodes: [{ ...snapshot.nodes[0], x: Number.MAX_SAFE_INTEGER + 1 }]
        }
      })
    ).toBeUndefined();
    expect(
      parseWorkerMessage({
        ...message,
        snapshot: {
          ...snapshot,
          entities: [{ ...snapshot.entities[0], nodeId: "node.unknown" }]
        }
      })
    ).toBeUndefined();
  });
});
