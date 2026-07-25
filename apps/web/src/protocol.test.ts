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
    expect(parseWorkerMessage({ ...result, unexpected: true })).toBeUndefined();
  });
});
