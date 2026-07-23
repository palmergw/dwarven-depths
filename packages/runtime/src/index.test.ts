import {
  compileContent,
  compileScenario
} from "@dwarven-depths/content-runtime";
import { describe, expect, it } from "vitest";
import { runScenario } from "./index.js";

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

describe("shared runtime", () => {
  it("produces identical events and checksums for repeated runs", async () => {
    const content = await compileContent(contentInput);
    const scenario = compileScenario(scenarioInput, content);
    const left = await runScenario(scenario, content);
    const right = await runScenario(scenario, content);

    expect(left.events).toEqual(right.events);
    expect(left.finalStateChecksum).toBe(right.finalStateChecksum);
    expect(left.eventStreamChecksum).toBe(right.eventStreamChecksum);
  });
});
