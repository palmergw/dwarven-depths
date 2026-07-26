import { describe, expect, it } from "vitest";
import { parseClientMessage, parseWorkerMessage } from "./protocol.js";

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
      parseClientMessage({ protocolVersion: 2, type: "initialize" })
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
      parseWorkerMessage({ ...message, protocolVersion: 2 })
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
