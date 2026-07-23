import {
  compileContent,
  compileReplay,
  compileScenario
} from "@dwarven-depths/content-runtime";
import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import contentInput from "../../../content/fixtures/empty-content.json" with {
  type: "json"
};
import nonterminatingContentInput from "../../../content/fixtures/nonterminating-content.json" with {
  type: "json"
};
import scenarioInput from "../../../scenarios/conformance/empty-level.json" with {
  type: "json"
};
import replayInput from "../../../scenarios/conformance/empty-level.replay.json" with {
  type: "json"
};
import nonterminatingScenarioInput from "../../../scenarios/conformance/nonterminating.json" with {
  type: "json"
};
import {
  compareRunEvidence,
  createLifecycleDiagnostics,
  createReplayDefinition,
  createTimelineRecords,
  type ReplayDivergenceError,
  type RuntimeSafetyStopError,
  runScenario,
  verifyReplay
} from "./index.js";

function comparisonEvidence(overrides: Record<string, unknown> = {}) {
  return {
    content: {
      schemaVersion: 1 as const,
      contentVersion: "test",
      definitions: []
    },
    scenario: {
      schemaVersion: 1 as const,
      id: "scenario.compare" as never,
      levelId: "level.empty" as never,
      seed: "1",
      maximumTicks: 10,
      commands: [{ atTick: 2, type: "confirmPreparation" as const }]
    },
    commands: [
      {
        tick: 2,
        sequence: 0,
        command: { atTick: 2, type: "confirmPreparation" as const }
      }
    ],
    checkpoints: [
      {
        tick: 3,
        stateChecksum: "a".repeat(64),
        eventStreamChecksum: "b".repeat(64)
      }
    ],
    events: [
      {
        id: "event.000000",
        tick: 2,
        sequence: 0,
        type: "round.started" as const,
        ruleId: "SIM-LIFECYCLE-001"
      }
    ],
    finalState: {
      schemaVersion: 1 as const,
      contentVersion: "test",
      tick: 3,
      seed: "1",
      rngState: 1,
      levelId: "level.empty" as never,
      phase: "TERMINAL" as const,
      eventSequence: 1,
      terminalResult: "victory" as const
    },
    ...overrides
  };
}

describe("shared runtime", () => {
  it("reports stable first-divergence categories, ticks, and canonical paths", () => {
    const baseline = comparisonEvidence();
    expect(compareRunEvidence(baseline, comparisonEvidence())).toEqual({
      schemaVersion: 1,
      equivalent: true
    });

    const cases = [
      [
        "content",
        { content: { ...baseline.content, contentVersion: "changed" } },
        0,
        "$/contentVersion"
      ],
      [
        "scenario",
        { scenario: { ...baseline.scenario, seed: "2" } },
        0,
        "$/seed"
      ],
      [
        "input",
        { commands: [{ ...baseline.commands[0], tick: 1 }] },
        1,
        "$/0/tick"
      ],
      [
        "event",
        { events: [{ ...baseline.events[0], ruleId: "SIM-CHANGED" }] },
        2,
        "$/0/ruleId"
      ],
      [
        "state",
        { finalState: { ...baseline.finalState, rngState: 2 } },
        3,
        "$/rngState"
      ]
    ] as const;
    for (const [category, override, tick, path] of cases) {
      const first = compareRunEvidence(baseline, comparisonEvidence(override));
      expect(first).toMatchObject({
        schemaVersion: 1,
        equivalent: false,
        firstDivergence: { category, tick, path }
      });
      expect(
        compareRunEvidence(baseline, comparisonEvidence(override))
      ).toEqual(first);
    }
  });

  it("uses canonical key ordering and rejects unsupported comparison values", () => {
    const baseline = comparisonEvidence();
    for (const candidate of [
      { z: 1, a: 2 },
      Object.assign(Object.create(null), { a: 2, z: 1 })
    ]) {
      const compared = compareRunEvidence(
        comparisonEvidence({
          content: { ...baseline.content, metadata: { z: 1, a: 1 } }
        } as never),
        comparisonEvidence({
          content: { ...baseline.content, metadata: candidate }
        } as never)
      );
      if (!("firstDivergence" in compared))
        throw new Error("expected divergence");
      expect(compared.firstDivergence.path).toBe("$/metadata/a");
    }
    expect(() =>
      compareRunEvidence(
        baseline,
        comparisonEvidence({
          finalState: { ...baseline.finalState, invalid: undefined }
        } as never)
      )
    ).toThrow(/unsupported undefined/);
  });

  it("reports tick-budget exhaustion as a safety stop", async () => {
    const content = await compileContent(nonterminatingContentInput);
    const scenario = compileScenario(nonterminatingScenarioInput, content);

    await expect(runScenario(scenario, content)).rejects.toMatchObject({
      name: "RuntimeSafetyStopError",
      code: "tick_budget_exhausted"
    } satisfies Partial<RuntimeSafetyStopError>);
  });

  it("stops without advancing gameplay time when preparation has no command", async () => {
    const content = await compileContent(contentInput);
    const scenario = compileScenario(
      {
        schemaVersion: 1,
        id: "scenario.conformance.stalled_preparation",
        levelId: "level.empty",
        seed: "1",
        maximumTicks: 1,
        commands: []
      },
      content
    );

    await expect(runScenario(scenario, content)).rejects.toMatchObject({
      name: "RuntimeSafetyStopError",
      code: "simulation_stalled",
      message: expect.stringContaining("tick 0")
    } satisfies Partial<RuntimeSafetyStopError>);
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
    expect(Object.isFrozen(left.commands)).toBe(true);
    expect(Object.isFrozen(left.commands[0])).toBe(true);
  });

  it("creates and verifies replay evidence with stable divergence codes", async () => {
    const content = await compileContent(contentInput);
    const scenario = compileScenario(scenarioInput, content);
    const result = await runScenario(scenario, content);
    const generatedReplay = createReplayDefinition(result, scenario, content);
    const timeline = createTimelineRecords(result.events, generatedReplay);
    const diagnostics = createLifecycleDiagnostics(
      result.events,
      result.commands
    );
    const replay = compileReplay(replayInput);

    expect(await canonicalHash(timeline)).toBe(
      "04e1044de1adf6ba571172f83dddeffc05e5fc2a0c015f05f4ec35d522b6d2c3"
    );
    expect(await canonicalHash(diagnostics)).toBe(
      "b1a1f8638a600cce2b880d3071f7608864dc018d18c6480a5f1191fd2db1e247"
    );
    expect(Object.isFrozen(timeline)).toBe(true);
    expect(Object.isFrozen(timeline[0])).toBe(true);
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(diagnostics[0])).toBe(true);

    expect(generatedReplay).toEqual(replay);
    await expect(
      verifyReplay(replay, scenario, content)
    ).resolves.toMatchObject({
      finalStateChecksum: result.finalStateChecksum,
      eventStreamChecksum: result.eventStreamChecksum
    });
    expect(Object.isFrozen(replay)).toBe(true);
    expect(Object.isFrozen(replay.checkpoints)).toBe(true);
    expect(Object.isFrozen(replay.checkpoints[0])).toBe(true);

    const checkpoint = replay.checkpoints[0];
    if (checkpoint === undefined)
      throw new Error("expected terminal checkpoint");
    const tamperedReplay = {
      ...replay,
      checkpoints: [
        {
          ...checkpoint,
          stateChecksum: "0".repeat(64)
        }
      ]
    };
    await expect(
      verifyReplay(tamperedReplay, scenario, content)
    ).rejects.toMatchObject({
      name: "ReplayDivergenceError",
      code: "state_checksum_mismatch",
      checkpointTick: 0
    } satisfies Partial<ReplayDivergenceError>);

    const mismatchedScenario = compileScenario(
      { ...scenarioInput, expectedTerminalResult: "defeat" },
      content
    );
    const mismatchedScenarioReplay = {
      ...replay,
      scenarioHash: await canonicalHash(mismatchedScenario)
    };
    await expect(
      verifyReplay(mismatchedScenarioReplay, mismatchedScenario, content)
    ).rejects.toMatchObject({
      name: "ReplayDivergenceError",
      code: "scenario_expectation_mismatch"
    } satisfies Partial<ReplayDivergenceError>);
  });
});
