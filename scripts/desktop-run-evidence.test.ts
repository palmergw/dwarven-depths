import { describe, expect, it } from "vitest";
import { validateDesktopRunEvidence } from "./desktop-run-evidence.mjs";

const stateChecksum = "a".repeat(64);
const eventChecksum = "b".repeat(64);
const expected = {
  terminalResult: "defeat",
  terminalTick: 1834,
  finalStateChecksum: stateChecksum,
  eventStreamChecksum: eventChecksum
};

function validEvidence() {
  return {
    schemaVersion: 2,
    runConfiguration: { schemaVersion: 1 },
    campaign: {
      schemaVersion: 1,
      attemptId: "attempt.1",
      rewardId: "reward.1",
      forgeOreAwarded: 8,
      profile: { schemaVersion: 1 }
    },
    replay: {
      schemaVersion: 1,
      simulationSchemaVersion: 1,
      contentVersion: "1",
      contentManifestHash: "c".repeat(64),
      scenarioId: "scenario.shuttergate",
      scenarioHash: "d".repeat(64),
      levelId: "level.shuttergate",
      seed: 1,
      rngAlgorithm: "xorshift32-v1",
      commands: [],
      checkpoints: [
        {
          tick: expected.terminalTick,
          stateChecksum,
          eventStreamChecksum: eventChecksum
        }
      ],
      expectedTerminalResult: expected.terminalResult,
      expectedTerminalTick: expected.terminalTick
    }
  };
}

describe("packaged desktop run evidence", () => {
  it("accepts evidence bound to the observed terminal result", () => {
    expect(() =>
      validateDesktopRunEvidence(validEvidence(), expected)
    ).not.toThrow();
  });

  it.each([
    ["extra top-level property", (value) => (value.untrusted = true)],
    ["extra replay property", (value) => (value.replay.untrusted = true)],
    ["extra campaign property", (value) => (value.campaign.untrusted = true)],
    [
      "terminal tick mismatch",
      (value) => (value.replay.expectedTerminalTick += 1)
    ],
    [
      "state checksum mismatch",
      (value) => (value.replay.checkpoints[0].stateChecksum = "e".repeat(64))
    ],
    ["missing checkpoint", (value) => (value.replay.checkpoints = [])]
  ])("rejects %s", (_label, mutate) => {
    const value = validEvidence();
    mutate(value);
    expect(() => validateDesktopRunEvidence(value, expected)).toThrow();
  });
});
