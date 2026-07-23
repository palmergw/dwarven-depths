import {
  compileContent,
  compileScenario
} from "@dwarven-depths/content-runtime";
import { describe, expect, it } from "vitest";
import { runScenario } from "./index.js";

const expected = {
  contentManifestHash:
    "3166e781fc4cce29240c01099919f4475ebe03294a76987706214eb24e398abe",
  finalStateChecksum:
    "3273b044b92e0941e35341de5aaef023db045af7c97983a7bd947c040e60fb33",
  eventStreamChecksum:
    "d081b5fbde5b7d474a38545e401939cbd0b63ecc6ad2558aedeaea0be4fb0d59"
};

const contentInput = {
  schemaVersion: 1,
  contentVersion: "milestone-0",
  definitions: [{ kind: "level", id: "level.empty", waveIds: [] }]
};

const scenarioInput = {
  schemaVersion: 1,
  id: "scenario.conformance.empty",
  levelId: "level.empty",
  seed: "1",
  maximumTicks: 1,
  commands: [{ atTick: 0, type: "confirmPreparation" }],
  expectedTerminalResult: "victory"
};

describe("cross-runtime deterministic conformance", () => {
  it("matches the canonical Node hashes and ordered event stream", async () => {
    const content = await compileContent(contentInput);
    const scenario = compileScenario(scenarioInput, content);
    const result = await runScenario(scenario, content);

    expect(content.manifestHash).toBe(expected.contentManifestHash);
    expect(result.finalStateChecksum).toBe(expected.finalStateChecksum);
    expect(result.eventStreamChecksum).toBe(expected.eventStreamChecksum);
    expect(result.events.map((event) => event.type)).toEqual([
      "round.started",
      "final_cleanup.entered",
      "round.victory"
    ]);
  });
});
