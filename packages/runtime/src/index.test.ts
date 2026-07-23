import {
  compileContent,
  compileScenario
} from "@dwarven-depths/content-runtime";
import { describe, expect, it } from "vitest";
import contentInput from "../../../content/fixtures/empty-content.json" with {
  type: "json"
};
import scenarioInput from "../../../scenarios/conformance/empty-level.json" with {
  type: "json"
};
import { type RuntimeAssertionError, runScenario } from "./index.js";

describe("shared runtime", () => {
  it("reports nontermination as a scenario assertion", async () => {
    const content = await compileContent({
      schemaVersion: 1,
      contentVersion: "milestone-0",
      definitions: [
        { kind: "level", id: "level.wave", waveIds: ["wave.first"] },
        { kind: "wave", id: "wave.first", durationTicks: 30 }
      ]
    });
    const scenario = compileScenario(
      {
        schemaVersion: 1,
        id: "scenario.conformance.nonterminating",
        levelId: "level.wave",
        seed: "1",
        maximumTicks: 2,
        commands: [{ atTick: 0, type: "confirmPreparation" }]
      },
      content
    );

    await expect(runScenario(scenario, content)).rejects.toMatchObject({
      name: "RuntimeAssertionError",
      code: "scenario_nontermination"
    } satisfies Partial<RuntimeAssertionError>);
  });

  it("produces identical events and checksums for repeated runs", async () => {
    const content = await compileContent(contentInput);
    const scenario = compileScenario(scenarioInput, content);
    const left = await runScenario(scenario, content);
    const right = await runScenario(scenario, content);

    expect(content.manifestHash).toBe(
      "3166e781fc4cce29240c01099919f4475ebe03294a76987706214eb24e398abe"
    );
    expect(left.scenarioHash).toBe(
      "7b51d2008c37b6ee79d4b41b17767e41441f8f86cbeddfe761db399fe45c1139"
    );
    expect(left.events).toEqual(right.events);
    expect(left.finalStateChecksum).toBe(
      "3273b044b92e0941e35341de5aaef023db045af7c97983a7bd947c040e60fb33"
    );
    expect(left.eventStreamChecksum).toBe(
      "d081b5fbde5b7d474a38545e401939cbd0b63ecc6ad2558aedeaea0be4fb0d59"
    );
    expect(left.scenarioHash).toBe(right.scenarioHash);
    expect(left.finalStateChecksum).toBe(right.finalStateChecksum);
    expect(left.eventStreamChecksum).toBe(right.eventStreamChecksum);
    expect(Object.isFrozen(left)).toBe(true);
    expect(Object.isFrozen(left.finalState)).toBe(true);
    expect(Object.isFrozen(left.events)).toBe(true);
    expect(Object.isFrozen(left.events[0])).toBe(true);
  });
});
