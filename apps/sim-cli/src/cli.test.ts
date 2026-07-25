import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  compileContent,
  compileScenario
} from "@dwarven-depths/content-runtime";
import { canonicalHash } from "@dwarven-depths/contracts";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

function temporaryFile(name: string, value: unknown): string {
  const directory = mkdtempSync(resolve(tmpdir(), "dwarven-depths-cli-"));
  temporaryDirectories.push(directory);
  const path = resolve(directory, name);
  writeFileSync(path, JSON.stringify(value), "utf8");
  return path;
}

function temporaryDirectory(): string {
  const directory = mkdtempSync(resolve(tmpdir(), "dwarven-depths-cli-"));
  temporaryDirectories.push(directory);
  return directory;
}

function runCli(...args: string[]) {
  return spawnSync(
    process.execPath,
    [resolve("apps/sim-cli/dist/cli.js"), ...args],
    { encoding: "utf8" }
  );
}

function runCliFrom(cwd: string, ...args: string[]) {
  return spawnSync(
    process.execPath,
    [resolve("apps/sim-cli/dist/cli.js"), ...args],
    { cwd, encoding: "utf8" }
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("simulation CLI", () => {
  it("minimizes a terminal-result assertion into self-verifying 1-minimal evidence", () => {
    const directory = temporaryDirectory();
    const content = resolve(directory, "content.json");
    const scenario = resolve(directory, "scenario.json");
    const output = resolve(directory, "minimization-output");
    writeFileSync(
      content,
      JSON.stringify({
        schemaVersion: 1,
        contentVersion: "minimization-test",
        definitions: [{ kind: "level", id: "level.empty", waveIds: [] }]
      })
    );
    const scenarioValue = {
      schemaVersion: 1,
      id: "scenario.test.minimization",
      levelId: "level.empty",
      seed: "1",
      maximumTicks: 64,
      commands: [{ atTick: 0, type: "confirmPreparation" }],
      expectedTerminalResult: "defeat"
    };
    writeFileSync(scenario, JSON.stringify(scenarioValue));

    const first = runCli(
      "minimize",
      "--content",
      content,
      "--scenario",
      scenario,
      "--out",
      output
    );
    expect(first.status).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({
      ok: true,
      minimized: true,
      assertionCode: "unexpected_terminal_result",
      expectedTerminalResult: "defeat",
      actualTerminalResult: "victory",
      originalCommandCount: 1,
      minimizedCommandCount: 1
    });
    const artifactPath = resolve(output, "minimization.json");
    const artifactText = readFileSync(artifactPath, "utf8");
    const artifact = JSON.parse(artifactText) as {
      retainedCommandIndexes: number[];
      candidateEvaluationCount: number;
      actualTerminalResult: string;
    };
    expect(Object.keys(JSON.parse(artifactText))).toEqual([
      "schemaVersion",
      "complete",
      "assertionCode",
      "expectedTerminalResult",
      "actualTerminalResult",
      "contentManifestHash",
      "sourceScenarioHash",
      "minimizedScenarioHash",
      "originalCommandCount",
      "minimizedCommandCount",
      "retainedCommandIndexes",
      "candidateEvaluationCount",
      "artifactChecksum"
    ]);
    expect(artifact.retainedCommandIndexes).toEqual([0]);
    expect(artifact.candidateEvaluationCount).toBeGreaterThan(1);
    expect(
      JSON.parse(
        readFileSync(
          resolve(output, "scenario.minimized.compiled.json"),
          "utf8"
        )
      ).maximumTicks
    ).toBe(1);
    expect(
      JSON.parse(
        readFileSync(
          resolve(output, "scenario.minimized.compiled.json"),
          "utf8"
        )
      ).commands
    ).toEqual([{ atTick: 0, type: "confirmPreparation" }]);

    const replaced = runCli(
      "minimize",
      "--content",
      content,
      "--scenario",
      scenario,
      "--out",
      output,
      "--replace",
      "true"
    );
    expect(replaced.status).toBe(0);
    expect(readFileSync(artifactPath, "utf8")).toBe(artifactText);

    writeFileSync(
      artifactPath,
      artifactText.replace(
        '"actualTerminalResult": "victory"',
        '"actualTerminalResult": "defeat"'
      )
    );
    const tampered = runCli(
      "minimize",
      "--content",
      content,
      "--scenario",
      scenario,
      "--out",
      output,
      "--replace",
      "true"
    );
    expect(tampered.status).toBe(3);
    expect(JSON.parse(tampered.stderr)).toMatchObject({
      ok: false,
      error: { type: "report", code: "report_generation_failed" }
    });
    writeFileSync(artifactPath, artifactText);

    writeFileSync(resolve(output, "unexpected.json"), "{}\n");
    expect(
      runCli(
        "minimize",
        "--content",
        content,
        "--scenario",
        scenario,
        "--out",
        output,
        "--replace",
        "true"
      ).status
    ).toBe(3);
    rmSync(resolve(output, "unexpected.json"));

    const hardlinkSource = resolve(directory, "hardlinked-minimization.json");
    writeFileSync(hardlinkSource, artifactText);
    rmSync(artifactPath);
    linkSync(hardlinkSource, artifactPath);
    expect(
      runCli(
        "minimize",
        "--content",
        content,
        "--scenario",
        scenario,
        "--out",
        output,
        "--replace",
        "true"
      ).status
    ).toBe(3);
    rmSync(artifactPath);
    rmSync(hardlinkSource);
    writeFileSync(artifactPath, artifactText);

    const symlinkedOutput = resolve(directory, "symlinked-minimization");
    symlinkSync(output, symlinkedOutput, "dir");
    expect(
      runCli(
        "minimize",
        "--content",
        content,
        "--scenario",
        scenario,
        "--out",
        symlinkedOutput,
        "--replace",
        "true"
      ).status
    ).toBe(3);

    const oversizedContent = resolve(directory, "oversized-content.json");
    const oversizedScenario = resolve(directory, "oversized-scenario.json");
    const oversizedOutput = resolve(directory, "oversized-output");
    writeFileSync(
      oversizedContent,
      JSON.stringify({
        schemaVersion: 1,
        contentVersion: "oversized-minimization-test",
        definitions: Array.from({ length: 80_001 }, (_, index) => ({
          kind: "level",
          id: `level.minimization.level_${index}`,
          waveIds: []
        }))
      })
    );
    writeFileSync(
      oversizedScenario,
      JSON.stringify({
        ...scenarioValue,
        id: "scenario.test.oversized_minimization",
        levelId: "level.minimization.level_0"
      })
    );
    const oversized = runCli(
      "minimize",
      "--content",
      oversizedContent,
      "--scenario",
      oversizedScenario,
      "--out",
      oversizedOutput
    );
    expect(oversized.status).toBe(3);
    expect(JSON.parse(oversized.stderr)).toMatchObject({
      ok: false,
      error: { type: "report", code: "report_generation_failed" }
    });
    expect(existsSync(oversizedOutput)).toBe(false);

    const nonFailingOutput = resolve(directory, "non-failing-output");
    writeFileSync(
      scenario,
      JSON.stringify({ ...scenarioValue, expectedTerminalResult: "victory" })
    );
    const nonFailing = runCli(
      "minimize",
      "--content",
      content,
      "--scenario",
      scenario,
      "--out",
      nonFailingOutput
    );
    expect(nonFailing.status).toBe(2);
    expect(JSON.parse(nonFailing.stderr)).toMatchObject({
      ok: false,
      error: { type: "input", code: "invalid_cli_input" }
    });
    expect(existsSync(nonFailingOutput)).toBe(false);
  });

  it("minimizes tick-budget safety stops into self-verifying schema-2 evidence", () => {
    const directory = temporaryDirectory();
    const output = resolve(directory, "safety-stop-minimization");
    const content = resolve("content/fixtures/nonterminating-content.json");
    const scenario = resolve("scenarios/conformance/nonterminating.json");

    const first = runCli(
      "minimize",
      "--content",
      content,
      "--scenario",
      scenario,
      "--out",
      output
    );
    expect(first.status).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({
      ok: true,
      minimized: true,
      assertionCode: "runtime_safety_stop",
      safetyStopCode: "tick_budget_exhausted",
      originalCommandCount: 1,
      minimizedCommandCount: 1
    });
    const artifactPath = resolve(output, "minimization.json");
    const artifactText = readFileSync(artifactPath, "utf8");
    expect(JSON.parse(artifactText)).toMatchObject({
      schemaVersion: 2,
      complete: true,
      assertionCode: "runtime_safety_stop",
      safetyStopCode: "tick_budget_exhausted",
      retainedCommandIndexes: [0],
      candidateEvaluationCount: 2
    });
    expect(
      JSON.parse(
        readFileSync(
          resolve(output, "scenario.minimized.compiled.json"),
          "utf8"
        )
      )
    ).toMatchObject({
      maximumTicks: 1,
      commands: [{ atTick: 0, type: "confirmPreparation" }]
    });

    const replaced = runCli(
      "minimize",
      "--content",
      content,
      "--scenario",
      scenario,
      "--out",
      output,
      "--replace",
      "true"
    );
    expect(replaced.status).toBe(0);
    expect(readFileSync(artifactPath, "utf8")).toBe(artifactText);

    writeFileSync(
      artifactPath,
      artifactText.replace(
        '"safetyStopCode": "tick_budget_exhausted"',
        '"safetyStopCode": "simulation_stalled"'
      )
    );
    const tampered = runCli(
      "minimize",
      "--content",
      content,
      "--scenario",
      scenario,
      "--out",
      output,
      "--replace",
      "true"
    );
    expect(tampered.status).toBe(3);
    expect(JSON.parse(tampered.stderr)).toMatchObject({
      ok: false,
      error: { type: "report", code: "report_generation_failed" }
    });
    expect(
      readFileSync(artifactPath, "utf8").includes("simulation_stalled")
    ).toBe(true);

    const terminalScenario = resolve(directory, "terminal-scenario.json");
    const terminalContent = resolve(directory, "terminal-content.json");
    const terminalOutput = resolve(directory, "terminal-output");
    writeFileSync(
      terminalContent,
      JSON.stringify({
        schemaVersion: 1,
        contentVersion: "terminal-minimization-test",
        definitions: [{ kind: "level", id: "level.empty", waveIds: [] }]
      })
    );
    writeFileSync(
      terminalScenario,
      JSON.stringify({
        schemaVersion: 1,
        id: "scenario.test.non_failure",
        levelId: "level.empty",
        seed: "1",
        maximumTicks: 64,
        commands: [{ atTick: 0, type: "confirmPreparation" }]
      })
    );
    const terminal = runCli(
      "minimize",
      "--content",
      terminalContent,
      "--scenario",
      terminalScenario,
      "--out",
      terminalOutput
    );
    expect(terminal.status).toBe(2);
    expect(JSON.parse(terminal.stderr)).toMatchObject({
      ok: false,
      error: { type: "input", code: "invalid_cli_input" }
    });
    expect(existsSync(terminalOutput)).toBe(false);
  });

  it("minimizes an exact simulation stall into self-verifying schema-6 evidence", async () => {
    const directory = temporaryDirectory();
    const content = resolve(directory, "content.json");
    const scenario = resolve(directory, "scenario.json");
    const output = resolve(directory, "stall-minimization");
    writeFileSync(
      content,
      JSON.stringify({
        schemaVersion: 1,
        contentVersion: "stall-minimization-test",
        definitions: [{ kind: "level", id: "level.empty", waveIds: [] }]
      })
    );
    writeFileSync(
      scenario,
      JSON.stringify({
        schemaVersion: 1,
        id: "scenario.test.stall_minimization",
        levelId: "level.empty",
        seed: "1",
        maximumTicks: 64,
        commands: []
      })
    );

    const first = runCli(
      "minimize",
      "--content",
      content,
      "--scenario",
      scenario,
      "--out",
      output
    );
    expect(first.status, first.stderr).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({
      assertionCode: "runtime_safety_stop",
      safetyStopCode: "simulation_stalled",
      stalledTick: 0,
      originalMaximumTicks: 64,
      minimizedMaximumTicks: 1,
      originalCommandCount: 0,
      minimizedCommandCount: 0
    });
    const artifactPath = resolve(output, "minimization.json");
    const artifactText = readFileSync(artifactPath, "utf8");
    expect(JSON.parse(artifactText)).toMatchObject({
      schemaVersion: 6,
      safetyStopCode: "simulation_stalled",
      stalledTick: 0,
      retainedCommandIndexes: [],
      originalMaximumTicks: 64,
      minimizedMaximumTicks: 1
    });
    expect(
      JSON.parse(
        readFileSync(
          resolve(output, "scenario.minimized.compiled.json"),
          "utf8"
        )
      )
    ).toMatchObject({ maximumTicks: 1, commands: [] });

    expect(
      runCli(
        "minimize",
        "--content",
        content,
        "--scenario",
        scenario,
        "--out",
        output,
        "--replace",
        "true"
      ).status
    ).toBe(0);
    expect(readFileSync(artifactPath, "utf8")).toBe(artifactText);

    const artifact = JSON.parse(artifactText);
    artifact.stalledTick = 1;
    const { artifactChecksum: _, ...body } = artifact;
    artifact.artifactChecksum = await canonicalHash(body);
    writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
    const tamperedText = readFileSync(artifactPath, "utf8");
    const tampered = runCli(
      "minimize",
      "--content",
      content,
      "--scenario",
      scenario,
      "--out",
      output,
      "--replace",
      "true"
    );
    expect(tampered.status).toBe(3);
    expect(readFileSync(artifactPath, "utf8")).toBe(tamperedText);
  });

  it("minimizes replay checkpoint divergences into schema-3 evidence", () => {
    const directory = temporaryDirectory();
    const content = resolve(directory, "content.json");
    const scenario = resolve(directory, "scenario.json");
    const runOutput = resolve(directory, "source-run");
    const output = resolve(directory, "replay-minimization");
    writeFileSync(
      content,
      JSON.stringify({
        schemaVersion: 1,
        contentVersion: "replay-minimization-test",
        definitions: [{ kind: "level", id: "level.empty", waveIds: [] }]
      })
    );
    writeFileSync(
      scenario,
      JSON.stringify({
        schemaVersion: 1,
        id: "scenario.test.replay_minimization",
        levelId: "level.empty",
        seed: "1",
        maximumTicks: 4,
        commands: [{ atTick: 0, type: "confirmPreparation" }],
        expectedTerminalResult: "victory"
      })
    );
    expect(
      runCli(
        "run",
        "--content",
        content,
        "--scenario",
        scenario,
        "--out",
        runOutput
      ).status
    ).toBe(0);
    const compiledContent = resolve(runOutput, "content.compiled.json");
    const compiledScenario = resolve(runOutput, "scenario.compiled.json");
    const validReplay = resolve(runOutput, "replay.json");
    const divergentReplay = resolve(directory, "divergent-replay.json");
    const replayValue = JSON.parse(readFileSync(validReplay, "utf8")) as {
      checkpoints: Array<{ stateChecksum: string }>;
    };
    const finalCheckpoint = replayValue.checkpoints[0];
    expect(finalCheckpoint).toBeDefined();
    if (finalCheckpoint === undefined) throw new Error("missing checkpoint");
    finalCheckpoint.stateChecksum = "0".repeat(64);
    writeFileSync(divergentReplay, JSON.stringify(replayValue));

    const first = runCli(
      "minimize",
      "--content",
      compiledContent,
      "--scenario",
      compiledScenario,
      "--replay",
      divergentReplay,
      "--out",
      output
    );
    expect(first.status).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({
      assertionCode: "replay_divergence",
      divergenceCode: "state_checksum_mismatch",
      checkpointTick: 0,
      originalCommandCount: 1,
      minimizedCommandCount: 1
    });
    const artifactPath = resolve(output, "minimization.json");
    const artifactText = readFileSync(artifactPath, "utf8");
    expect(JSON.parse(artifactText)).toMatchObject({
      schemaVersion: 3,
      retainedCommandIndexes: [0]
    });
    expect(
      JSON.parse(readFileSync(resolve(output, "replay.minimized.json"), "utf8"))
        .commands
    ).toHaveLength(1);

    const replaced = runCli(
      "minimize",
      "--content",
      compiledContent,
      "--scenario",
      compiledScenario,
      "--replay",
      divergentReplay,
      "--out",
      output,
      "--replace",
      "true"
    );
    expect(replaced.status, replaced.stderr).toBe(0);
    expect(readFileSync(artifactPath, "utf8")).toBe(artifactText);

    writeFileSync(
      artifactPath,
      artifactText.replace(
        '"divergenceCode": "state_checksum_mismatch"',
        '"divergenceCode": "event_stream_checksum_mismatch"'
      )
    );
    expect(
      runCli(
        "minimize",
        "--content",
        compiledContent,
        "--scenario",
        compiledScenario,
        "--replay",
        divergentReplay,
        "--out",
        output,
        "--replace",
        "true"
      ).status
    ).toBe(3);

    const validOutput = resolve(directory, "valid-replay-output");
    expect(
      runCli(
        "minimize",
        "--content",
        compiledContent,
        "--scenario",
        compiledScenario,
        "--replay",
        validReplay,
        "--out",
        validOutput
      ).status
    ).toBe(2);
    expect(existsSync(validOutput)).toBe(false);

    const identityReplay = resolve(directory, "identity-replay.json");
    writeFileSync(
      identityReplay,
      JSON.stringify({ ...replayValue, scenarioId: "scenario.test.foreign" })
    );
    const identityOutput = resolve(directory, "identity-output");
    expect(
      runCli(
        "minimize",
        "--content",
        compiledContent,
        "--scenario",
        compiledScenario,
        "--replay",
        identityReplay,
        "--out",
        identityOutput
      ).status
    ).toBe(2);
    expect(existsSync(identityOutput)).toBe(false);
  });

  it("optionally minimizes a replay divergence tick budget into schema-4 evidence", async () => {
    const directory = temporaryDirectory();
    const content = resolve(directory, "content.json");
    const scenario = resolve(directory, "scenario.json");
    const runOutput = resolve(directory, "source-run");
    const output = resolve(directory, "replay-minimization");
    writeFileSync(
      content,
      JSON.stringify({
        schemaVersion: 1,
        contentVersion: "replay-tick-minimization-test",
        definitions: [{ kind: "level", id: "level.empty", waveIds: [] }]
      })
    );
    writeFileSync(
      scenario,
      JSON.stringify({
        schemaVersion: 1,
        id: "scenario.test.replay_tick_minimization",
        levelId: "level.empty",
        seed: "1",
        maximumTicks: 64,
        commands: [{ atTick: 0, type: "confirmPreparation" }],
        expectedTerminalResult: "victory"
      })
    );
    expect(
      runCli(
        "run",
        "--content",
        content,
        "--scenario",
        scenario,
        "--out",
        runOutput
      ).status
    ).toBe(0);
    const compiledContent = resolve(runOutput, "content.compiled.json");
    const compiledScenario = resolve(runOutput, "scenario.compiled.json");
    const divergentReplay = resolve(directory, "divergent-replay.json");
    const replayValue = JSON.parse(
      readFileSync(resolve(runOutput, "replay.json"), "utf8")
    ) as { checkpoints: Array<{ eventStreamChecksum: string }> };
    const finalCheckpoint = replayValue.checkpoints[0];
    expect(finalCheckpoint).toBeDefined();
    if (finalCheckpoint === undefined) throw new Error("missing checkpoint");
    finalCheckpoint.eventStreamChecksum = "0".repeat(64);
    writeFileSync(divergentReplay, JSON.stringify(replayValue));

    const defaultOutput = resolve(directory, "default-replay-minimization");
    const explicitFalseOutput = resolve(directory, "false-replay-minimization");
    expect(
      runCli(
        "minimize",
        "--content",
        compiledContent,
        "--scenario",
        compiledScenario,
        "--replay",
        divergentReplay,
        "--out",
        defaultOutput
      ).status
    ).toBe(0);
    expect(
      runCli(
        "minimize",
        "--content",
        compiledContent,
        "--scenario",
        compiledScenario,
        "--replay",
        divergentReplay,
        "--replay-ticks",
        "false",
        "--out",
        explicitFalseOutput
      ).status
    ).toBe(0);
    for (const name of readdirSync(defaultOutput)) {
      expect(readFileSync(resolve(explicitFalseOutput, name), "utf8")).toBe(
        readFileSync(resolve(defaultOutput, name), "utf8")
      );
    }
    expect(
      JSON.parse(
        readFileSync(resolve(defaultOutput, "minimization.json"), "utf8")
      ).schemaVersion
    ).toBe(3);

    const first = runCli(
      "minimize",
      "--content",
      compiledContent,
      "--scenario",
      compiledScenario,
      "--replay",
      divergentReplay,
      "--replay-ticks",
      "true",
      "--out",
      output
    );
    expect(first.status).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({
      divergenceCode: "event_stream_checksum_mismatch",
      checkpointTick: 0,
      originalMaximumTicks: 64,
      minimizedMaximumTicks: 1
    });
    const artifactPath = resolve(output, "minimization.json");
    const artifactText = readFileSync(artifactPath, "utf8");
    expect(JSON.parse(artifactText)).toMatchObject({
      schemaVersion: 4,
      originalMaximumTicks: 64,
      minimizedMaximumTicks: 1,
      retainedCommandIndexes: [0]
    });
    expect(
      JSON.parse(
        readFileSync(
          resolve(output, "scenario.minimized.compiled.json"),
          "utf8"
        )
      ).maximumTicks
    ).toBe(1);

    const replaced = runCli(
      "minimize",
      "--content",
      compiledContent,
      "--scenario",
      compiledScenario,
      "--replay",
      divergentReplay,
      "--replay-ticks",
      "true",
      "--out",
      output,
      "--replace",
      "true"
    );
    expect(replaced.status).toBe(0);
    expect(readFileSync(artifactPath, "utf8")).toBe(artifactText);

    writeFileSync(
      artifactPath,
      artifactText.replace(
        '"minimizedMaximumTicks": 1',
        '"minimizedMaximumTicks": 2'
      )
    );
    expect(
      runCli(
        "minimize",
        "--content",
        compiledContent,
        "--scenario",
        compiledScenario,
        "--replay",
        divergentReplay,
        "--replay-ticks",
        "true",
        "--out",
        output,
        "--replace",
        "true"
      ).status
    ).toBe(3);

    const invalidOutput = resolve(directory, "invalid-output");
    expect(
      runCli(
        "minimize",
        "--content",
        compiledContent,
        "--scenario",
        compiledScenario,
        "--replay-ticks",
        "true",
        "--out",
        invalidOutput
      ).status
    ).toBe(2);
    expect(existsSync(invalidOutput)).toBe(false);
  });

  it("minimizes exact replay terminal divergences into schema-5 evidence", async () => {
    const directory = temporaryDirectory();
    const content = resolve(directory, "content.json");
    const scenario = resolve(directory, "scenario.json");
    const runOutput = resolve(directory, "source-run");
    writeFileSync(
      content,
      JSON.stringify({
        schemaVersion: 1,
        contentVersion: "replay-terminal-minimization-test",
        definitions: [{ kind: "level", id: "level.empty", waveIds: [] }]
      })
    );
    writeFileSync(
      scenario,
      JSON.stringify({
        schemaVersion: 1,
        id: "scenario.test.replay_terminal_minimization",
        levelId: "level.empty",
        seed: "1",
        maximumTicks: 4,
        commands: [{ atTick: 0, type: "confirmPreparation" }],
        expectedTerminalResult: "victory"
      })
    );
    expect(
      runCli(
        "run",
        "--content",
        content,
        "--scenario",
        scenario,
        "--out",
        runOutput
      ).status
    ).toBe(0);
    const compiledContent = resolve(runOutput, "content.compiled.json");
    const compiledScenarioPath = resolve(runOutput, "scenario.compiled.json");
    const compiledScenario = JSON.parse(
      readFileSync(compiledScenarioPath, "utf8")
    ) as Record<string, unknown>;
    const validReplay = JSON.parse(
      readFileSync(resolve(runOutput, "replay.json"), "utf8")
    ) as {
      scenarioHash: string;
      expectedTerminalResult: string;
      expectedTerminalTick: number;
      checkpoints: Array<{ tick: number }>;
    };

    const terminalResultScenario = {
      ...compiledScenario,
      expectedTerminalResult: "defeat"
    };
    const terminalResultScenarioPath = resolve(
      directory,
      "terminal-result-scenario.json"
    );
    const terminalResultReplayPath = resolve(
      directory,
      "terminal-result-replay.json"
    );
    writeFileSync(
      terminalResultScenarioPath,
      JSON.stringify(terminalResultScenario)
    );
    writeFileSync(
      terminalResultReplayPath,
      JSON.stringify({
        ...validReplay,
        scenarioHash: await canonicalHash(terminalResultScenario),
        expectedTerminalResult: "defeat"
      })
    );

    const terminalTickReplayPath = resolve(
      directory,
      "terminal-tick-replay.json"
    );
    writeFileSync(
      terminalTickReplayPath,
      JSON.stringify({
        ...validReplay,
        expectedTerminalTick: 1,
        checkpoints: validReplay.checkpoints.map((checkpoint) => ({
          ...checkpoint,
          tick: 1
        }))
      })
    );

    for (const testCase of [
      {
        name: "result",
        scenario: terminalResultScenarioPath,
        replay: terminalResultReplayPath,
        code: "terminal_result_mismatch",
        expected: "defeat",
        actual: "victory"
      },
      {
        name: "tick",
        scenario: compiledScenarioPath,
        replay: terminalTickReplayPath,
        code: "terminal_tick_mismatch",
        expected: 1,
        actual: 0
      }
    ] as const) {
      const output = resolve(directory, `${testCase.name}-minimization`);
      const first = runCli(
        "minimize",
        "--content",
        compiledContent,
        "--scenario",
        testCase.scenario,
        "--replay",
        testCase.replay,
        "--out",
        output
      );
      expect(first.status, first.stderr).toBe(0);
      expect(JSON.parse(first.stdout)).toMatchObject({
        divergenceCode: testCase.code,
        checkpointTick: 0
      });
      const artifactPath = resolve(output, "minimization.json");
      const artifactText = readFileSync(artifactPath, "utf8");
      expect(JSON.parse(artifactText)).toMatchObject({
        schemaVersion: 5,
        divergenceCode: testCase.code,
        checkpointTick: 0,
        divergenceExpected: testCase.expected,
        divergenceActual: testCase.actual,
        retainedCommandIndexes: [0]
      });

      expect(
        runCli(
          "minimize",
          "--content",
          compiledContent,
          "--scenario",
          testCase.scenario,
          "--replay",
          testCase.replay,
          "--out",
          output,
          "--replace",
          "true"
        ).status
      ).toBe(0);
      expect(readFileSync(artifactPath, "utf8")).toBe(artifactText);

      if (testCase.name === "result") {
        const tamperCases: Array<{
          name: string;
          mutate: (directory: string) => Promise<void> | void;
        }> = [
          {
            name: "expected",
            mutate: async (directory) => {
              const path = resolve(directory, "minimization.json");
              const value = JSON.parse(readFileSync(path, "utf8"));
              value.divergenceExpected = "draw";
              const { artifactChecksum: _, ...body } = value;
              value.artifactChecksum = await canonicalHash(body);
              writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
            }
          },
          {
            name: "actual",
            mutate: async (directory) => {
              const path = resolve(directory, "minimization.json");
              const value = JSON.parse(readFileSync(path, "utf8"));
              value.divergenceActual = "draw";
              const { artifactChecksum: _, ...body } = value;
              value.artifactChecksum = await canonicalHash(body);
              writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
            }
          },
          {
            name: "observed-tick",
            mutate: async (directory) => {
              const path = resolve(directory, "minimization.json");
              const value = JSON.parse(readFileSync(path, "utf8"));
              value.checkpointTick = 1;
              const { artifactChecksum: _, ...body } = value;
              value.artifactChecksum = await canonicalHash(body);
              writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
            }
          },
          {
            name: "identity",
            mutate: async (directory) => {
              const path = resolve(directory, "minimization.json");
              const value = JSON.parse(readFileSync(path, "utf8"));
              value.sourceReplayHash = "0".repeat(64);
              const { artifactChecksum: _, ...body } = value;
              value.artifactChecksum = await canonicalHash(body);
              writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
            }
          },
          {
            name: "artifact-checksum",
            mutate: (directory) => {
              const path = resolve(directory, "minimization.json");
              const value = JSON.parse(readFileSync(path, "utf8"));
              value.artifactChecksum = "0".repeat(64);
              writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
            }
          },
          {
            name: "source-replay",
            mutate: (directory) => {
              const path = resolve(directory, "replay.source.json");
              const value = JSON.parse(readFileSync(path, "utf8"));
              value.expectedTerminalResult = "victory";
              writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
            }
          },
          {
            name: "minimized-replay",
            mutate: (directory) => {
              const path = resolve(directory, "replay.minimized.json");
              const value = JSON.parse(readFileSync(path, "utf8"));
              value.expectedTerminalResult = "victory";
              writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
            }
          }
        ];
        for (const tamperCase of tamperCases) {
          const tamperedOutput = resolve(
            directory,
            `tampered-${tamperCase.name}`
          );
          cpSync(output, tamperedOutput, { recursive: true });
          await tamperCase.mutate(tamperedOutput);
          const before = readdirSync(tamperedOutput)
            .sort()
            .map((name) => [
              name,
              lstatSync(resolve(tamperedOutput, name)).nlink,
              readFileSync(resolve(tamperedOutput, name), "utf8")
            ]);
          expect(
            runCli(
              "minimize",
              "--content",
              compiledContent,
              "--scenario",
              testCase.scenario,
              "--replay",
              testCase.replay,
              "--out",
              tamperedOutput,
              "--replace",
              "true"
            ).status,
            tamperCase.name
          ).toBe(3);
          expect(
            readdirSync(tamperedOutput)
              .sort()
              .map((name) => [
                name,
                lstatSync(resolve(tamperedOutput, name)).nlink,
                readFileSync(resolve(tamperedOutput, name), "utf8")
              ])
          ).toEqual(before);
        }
      }
      if (testCase.name === "tick") {
        for (const [name, field] of [
          ["tick-expected", "divergenceExpected"],
          ["tick-actual", "divergenceActual"],
          ["tick-observed", "checkpointTick"]
        ] as const) {
          const tamperedOutput = resolve(directory, `tampered-${name}`);
          cpSync(output, tamperedOutput, { recursive: true });
          const path = resolve(tamperedOutput, "minimization.json");
          const value = JSON.parse(readFileSync(path, "utf8"));
          value[field] = 2;
          const { artifactChecksum: _, ...body } = value;
          value.artifactChecksum = await canonicalHash(body);
          writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
          const before = readdirSync(tamperedOutput)
            .sort()
            .map((entry) => [
              entry,
              lstatSync(resolve(tamperedOutput, entry)).nlink,
              readFileSync(resolve(tamperedOutput, entry), "utf8")
            ]);
          expect(
            runCli(
              "minimize",
              "--content",
              compiledContent,
              "--scenario",
              testCase.scenario,
              "--replay",
              testCase.replay,
              "--out",
              tamperedOutput,
              "--replace",
              "true"
            ).status,
            name
          ).toBe(3);
          expect(
            readdirSync(tamperedOutput)
              .sort()
              .map((entry) => [
                entry,
                lstatSync(resolve(tamperedOutput, entry)).nlink,
                readFileSync(resolve(tamperedOutput, entry), "utf8")
              ])
          ).toEqual(before);
        }
      }

      const ticksOutput = resolve(
        directory,
        `${testCase.name}-ticks-minimization`
      );
      const ticks = runCli(
        "minimize",
        "--content",
        compiledContent,
        "--scenario",
        testCase.scenario,
        "--replay",
        testCase.replay,
        "--replay-ticks",
        "true",
        "--out",
        ticksOutput
      );
      expect(ticks.status, ticks.stderr).toBe(0);
      expect(JSON.parse(ticks.stdout)).toMatchObject({
        divergenceCode: testCase.code,
        checkpointTick: 0,
        originalMaximumTicks: 4,
        minimizedMaximumTicks: 1
      });
      const ticksArtifactPath = resolve(ticksOutput, "minimization.json");
      const ticksArtifactText = readFileSync(ticksArtifactPath, "utf8");
      expect(JSON.parse(ticksArtifactText)).toMatchObject({
        schemaVersion: 8,
        divergenceCode: testCase.code,
        divergenceExpected: testCase.expected,
        divergenceActual: testCase.actual,
        originalMaximumTicks: 4,
        minimizedMaximumTicks: 1
      });
      expect(
        runCli(
          "minimize",
          "--content",
          compiledContent,
          "--scenario",
          testCase.scenario,
          "--replay",
          testCase.replay,
          "--replay-ticks",
          "true",
          "--out",
          ticksOutput,
          "--replace",
          "true"
        ).status
      ).toBe(0);
      expect(readFileSync(ticksArtifactPath, "utf8")).toBe(ticksArtifactText);

      if (testCase.name === "result") {
        const tamperedArtifact = JSON.parse(ticksArtifactText);
        tamperedArtifact.minimizedMaximumTicks = 2;
        const { artifactChecksum: _, ...tamperedBody } = tamperedArtifact;
        tamperedArtifact.artifactChecksum = await canonicalHash(tamperedBody);
        writeFileSync(
          ticksArtifactPath,
          `${JSON.stringify(tamperedArtifact, null, 2)}\n`
        );
        const tamperedText = readFileSync(ticksArtifactPath, "utf8");
        expect(
          runCli(
            "minimize",
            "--content",
            compiledContent,
            "--scenario",
            testCase.scenario,
            "--replay",
            testCase.replay,
            "--replay-ticks",
            "true",
            "--out",
            ticksOutput,
            "--replace",
            "true"
          ).status
        ).toBe(3);
        expect(readFileSync(ticksArtifactPath, "utf8")).toBe(tamperedText);
      }
    }
  }, 15_000);

  it("minimizes exact replay execution failures into schema-7 evidence", async () => {
    const directory = temporaryDirectory();
    const sourceScenarioPath = resolve(directory, "stalled-scenario.json");
    const validContent = resolve(directory, "valid-content.json");
    const validScenario = resolve(directory, "valid-scenario.json");
    const runOutput = resolve(directory, "source-run");
    writeFileSync(
      validContent,
      JSON.stringify({
        schemaVersion: 1,
        contentVersion: "replay-execution-failure-minimization-test",
        definitions: [{ kind: "level", id: "level.empty", waveIds: [] }]
      })
    );
    writeFileSync(
      validScenario,
      JSON.stringify({
        schemaVersion: 1,
        id: "scenario.test.replay_execution_failure_minimization",
        levelId: "level.empty",
        seed: "1",
        maximumTicks: 4,
        commands: [{ atTick: 0, type: "confirmPreparation" }],
        expectedTerminalResult: "victory"
      })
    );
    expect(
      runCli(
        "run",
        "--content",
        validContent,
        "--scenario",
        validScenario,
        "--out",
        runOutput
      ).status
    ).toBe(0);

    const compiledSource = await compileContent(
      JSON.parse(readFileSync(validContent, "utf8"))
    );
    const sourceScenario = compileScenario(
      {
        schemaVersion: 1,
        id: "scenario.test.replay_execution_failure_stall",
        levelId: "level.empty",
        seed: "1",
        maximumTicks: 64,
        commands: []
      },
      compiledSource
    );
    writeFileSync(sourceScenarioPath, JSON.stringify(sourceScenario));
    const compiledContent = resolve(directory, "compiled-content.json");
    const sourceReplayPath = resolve(directory, "stalled-replay.json");
    writeFileSync(compiledContent, JSON.stringify(compiledSource.bundle));
    const sourceReplay = {
      ...(JSON.parse(
        readFileSync(resolve(runOutput, "replay.json"), "utf8")
      ) as Record<string, unknown>),
      contentManifestHash: compiledSource.manifestHash,
      contentVersion: compiledSource.bundle.contentVersion,
      scenarioId: sourceScenario.id,
      levelId: sourceScenario.levelId,
      seed: sourceScenario.seed,
      scenarioHash: await canonicalHash(sourceScenario),
      commands: []
    };
    writeFileSync(sourceReplayPath, JSON.stringify(sourceReplay));

    const output = resolve(directory, "execution-failure-minimization");
    const first = runCli(
      "minimize",
      "--content",
      compiledContent,
      "--scenario",
      sourceScenarioPath,
      "--replay",
      sourceReplayPath,
      "--out",
      output
    );
    expect(first.status, first.stderr).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({
      divergenceCode: "execution_failed",
      checkpointTick: 0,
      originalCommandCount: 0,
      minimizedCommandCount: 0
    });
    const artifactPath = resolve(output, "minimization.json");
    const artifactText = readFileSync(artifactPath, "utf8");
    expect(JSON.parse(artifactText)).toMatchObject({
      schemaVersion: 7,
      divergenceCode: "execution_failed",
      checkpointTick: 0,
      divergenceExpected: "victory",
      divergenceActual: "simulation_stalled",
      retainedCommandIndexes: []
    });
    expect(
      runCli(
        "minimize",
        "--content",
        compiledContent,
        "--scenario",
        sourceScenarioPath,
        "--replay",
        sourceReplayPath,
        "--out",
        output,
        "--replace",
        "true"
      ).status
    ).toBe(0);
    expect(readFileSync(artifactPath, "utf8")).toBe(artifactText);

    for (const [name, field, value] of [
      ["expected", "divergenceExpected", "defeat"],
      ["actual", "divergenceActual", "tick_budget_exhausted"],
      ["tick", "checkpointTick", 1]
    ] as const) {
      const tamperedOutput = resolve(directory, `tampered-execution-${name}`);
      cpSync(output, tamperedOutput, { recursive: true });
      const tamperedArtifactPath = resolve(tamperedOutput, "minimization.json");
      const tamperedArtifact = JSON.parse(
        readFileSync(tamperedArtifactPath, "utf8")
      );
      tamperedArtifact[field] = value;
      const { artifactChecksum: _, ...body } = tamperedArtifact;
      tamperedArtifact.artifactChecksum = await canonicalHash(body);
      writeFileSync(
        tamperedArtifactPath,
        `${JSON.stringify(tamperedArtifact, null, 2)}\n`
      );
      const before = readdirSync(tamperedOutput)
        .sort()
        .map((entry) => [
          entry,
          lstatSync(resolve(tamperedOutput, entry)).nlink,
          readFileSync(resolve(tamperedOutput, entry), "utf8")
        ]);
      expect(
        runCli(
          "minimize",
          "--content",
          compiledContent,
          "--scenario",
          sourceScenarioPath,
          "--replay",
          sourceReplayPath,
          "--out",
          tamperedOutput,
          "--replace",
          "true"
        ).status,
        name
      ).toBe(3);
      expect(
        readdirSync(tamperedOutput)
          .sort()
          .map((entry) => [
            entry,
            lstatSync(resolve(tamperedOutput, entry)).nlink,
            readFileSync(resolve(tamperedOutput, entry), "utf8")
          ])
      ).toEqual(before);
    }

    const ticksOutput = resolve(directory, "execution-failure-ticks");
    const ticks = runCli(
      "minimize",
      "--content",
      compiledContent,
      "--scenario",
      sourceScenarioPath,
      "--replay",
      sourceReplayPath,
      "--replay-ticks",
      "true",
      "--out",
      ticksOutput
    );
    expect(ticks.status, ticks.stderr).toBe(0);
    expect(JSON.parse(ticks.stdout)).toMatchObject({
      divergenceCode: "execution_failed",
      checkpointTick: 0,
      originalMaximumTicks: 64,
      minimizedMaximumTicks: 1
    });
    const ticksArtifactPath = resolve(ticksOutput, "minimization.json");
    const ticksArtifactText = readFileSync(ticksArtifactPath, "utf8");
    expect(JSON.parse(ticksArtifactText)).toMatchObject({
      schemaVersion: 8,
      divergenceExpected: "victory",
      divergenceActual: "simulation_stalled",
      originalMaximumTicks: 64,
      minimizedMaximumTicks: 1
    });

    const schema8TamperCases: Array<{
      name: string;
      mutate: (directory: string) => Promise<void> | void;
    }> = [
      ...[
        ["original-ticks", "originalMaximumTicks", 63],
        ["minimized-ticks", "minimizedMaximumTicks", 2],
        ["expected", "divergenceExpected", "defeat"],
        ["actual", "divergenceActual", "tick_budget_exhausted"],
        ["observed-tick", "checkpointTick", 1]
      ].map(([name, field, value]) => ({
        name: name as string,
        mutate: async (directory: string) => {
          const path = resolve(directory, "minimization.json");
          const artifact = JSON.parse(readFileSync(path, "utf8"));
          artifact[field as string] = value;
          const { artifactChecksum: _, ...body } = artifact;
          artifact.artifactChecksum = await canonicalHash(body);
          writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`);
        }
      })),
      ...[
        ["source-replay", "replay.source.json", "sourceReplayHash"],
        ["minimized-replay", "replay.minimized.json", "minimizedReplayHash"]
      ].map(([name, file, binding]) => ({
        name: name as string,
        mutate: async (directory: string) => {
          const path = resolve(directory, file as string);
          const replay = JSON.parse(readFileSync(path, "utf8"));
          replay.expectedTerminalResult = "defeat";
          writeFileSync(path, `${JSON.stringify(replay, null, 2)}\n`);
          const artifactPath = resolve(directory, "minimization.json");
          const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
          artifact[binding as string] = await canonicalHash(replay);
          const { artifactChecksum: _, ...body } = artifact;
          artifact.artifactChecksum = await canonicalHash(body);
          writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
        }
      })),
      ...[
        [
          "source-scenario",
          "scenario.source.compiled.json",
          "sourceScenarioHash",
          63
        ],
        [
          "minimized-scenario",
          "scenario.minimized.compiled.json",
          "minimizedScenarioHash",
          2
        ]
      ].map(([name, file, binding, maximumTicks]) => ({
        name: name as string,
        mutate: async (directory: string) => {
          const path = resolve(directory, file as string);
          const scenario = JSON.parse(readFileSync(path, "utf8"));
          scenario.maximumTicks = maximumTicks;
          writeFileSync(path, `${JSON.stringify(scenario, null, 2)}\n`);
          const artifactPath = resolve(directory, "minimization.json");
          const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
          artifact[binding as string] = await canonicalHash(scenario);
          if (name === "source-scenario") {
            const replayPath = resolve(directory, "replay.source.json");
            const replay = JSON.parse(readFileSync(replayPath, "utf8"));
            replay.scenarioHash = artifact.sourceScenarioHash;
            writeFileSync(replayPath, `${JSON.stringify(replay, null, 2)}\n`);
            artifact.sourceReplayHash = await canonicalHash(replay);
            artifact.originalMaximumTicks = maximumTicks;
          }
          const { artifactChecksum: _, ...body } = artifact;
          artifact.artifactChecksum = await canonicalHash(body);
          writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
        }
      }))
    ];
    for (const tamperCase of schema8TamperCases) {
      const tamperedOutput = resolve(
        directory,
        `tampered-schema-8-${tamperCase.name}`
      );
      cpSync(ticksOutput, tamperedOutput, { recursive: true });
      await tamperCase.mutate(tamperedOutput);
      const before = readdirSync(tamperedOutput)
        .sort()
        .map((entry) => [
          entry,
          readFileSync(resolve(tamperedOutput, entry), "utf8")
        ]);
      expect(
        runCli(
          "minimize",
          "--content",
          compiledContent,
          "--scenario",
          sourceScenarioPath,
          "--replay",
          sourceReplayPath,
          "--replay-ticks",
          "true",
          "--out",
          tamperedOutput,
          "--replace",
          "true"
        ).status,
        tamperCase.name
      ).toBe(3);
      expect(
        readdirSync(tamperedOutput)
          .sort()
          .map((entry) => [
            entry,
            readFileSync(resolve(tamperedOutput, entry), "utf8")
          ])
      ).toEqual(before);
    }
    expect(readFileSync(ticksArtifactPath, "utf8")).toBe(ticksArtifactText);
  }, 15_000);

  it("publishes and replay-validates a durable authoritative campaign", async () => {
    const directory = temporaryDirectory();
    const content = resolve(directory, "content.json");
    const scenario = resolve(directory, "campaign.json");
    const output = resolve(directory, "campaign-output");
    writeFileSync(
      content,
      readFileSync(resolve("content/fixtures/phase-3-shuttergate.json"))
    );
    const scenarioValue = {
      schemaVersion: 1,
      id: "campaign_scenario.shuttergate.v1",
      content: "content.json",
      attemptCount: 3,
      applicationBuild: "cli-test",
      writtenAtEpochMs: 1_725_000_000_000,
      profileId: "profile.test.campaign"
    };
    writeFileSync(scenario, JSON.stringify(scenarioValue));

    const first = runCli("campaign", "--scenario", scenario, "--out", output);
    expect(first.status).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({
      ok: true,
      campaigned: true,
      scenarioId: "campaign_scenario.shuttergate.v1",
      attemptCount: 3
    });
    const firstArtifact = readFileSync(
      resolve(output, "campaign.json"),
      "utf8"
    );
    const artifact = JSON.parse(firstArtifact) as {
      attemptChecksums: string[];
      profileSave: {
        profile: {
          forgeOre: number;
          purchasedUpgrades: Array<{ upgradeId: string; rank: number }>;
        };
      };
    };
    expect(artifact.attemptChecksums).toHaveLength(3);
    expect(artifact.profileSave.profile.forgeOre).toBeGreaterThan(0);
    expect(artifact.profileSave.profile.purchasedUpgrades).toEqual([
      expect.objectContaining({
        upgradeId: "upgrade.ability.shield_slam",
        rank: 1
      })
    ]);
    const calibrationPath = resolve(output, "campaign-calibration.json");
    const calibrationText = readFileSync(calibrationPath, "utf8");
    expect(JSON.parse(calibrationText)).toMatchObject({
      schemaVersion: 1,
      attemptCount: 3,
      comparison: {
        baselineAttemptNumber: 1,
        upgradedAttemptNumber: 3,
        terminalTickDelta: 40,
        defeatedEnemyDelta: 0,
        observation: "survived_longer"
      }
    });
    expect(JSON.parse(first.stdout)).toMatchObject({
      calibrationReportChecksum:
        "f797acbc3a071e569a9ddbc3ee8e88808ef5889db13afa807e94e199deb27ced"
    });

    const replaced = runCli(
      "campaign",
      "--scenario",
      scenario,
      "--out",
      output,
      "--replace",
      "true"
    );
    expect(replaced.status).toBe(0);
    expect(readFileSync(resolve(output, "campaign.json"), "utf8")).toBe(
      firstArtifact
    );
    expect(readFileSync(calibrationPath, "utf8")).toBe(calibrationText);

    const originalManifestText = readFileSync(
      resolve(output, "campaign-manifest.json"),
      "utf8"
    );
    const forgedCalibration = JSON.parse(calibrationText);
    forgedCalibration.comparison.terminalTickDelta = 41;
    writeFileSync(
      calibrationPath,
      `${JSON.stringify(forgedCalibration, null, 2)}\n`
    );
    const forgedCalibrationManifest = JSON.parse(originalManifestText);
    forgedCalibrationManifest.calibrationReportChecksum =
      await canonicalHash(forgedCalibration);
    writeFileSync(
      resolve(output, "campaign-manifest.json"),
      `${JSON.stringify(forgedCalibrationManifest, null, 2)}\n`
    );
    expect(
      runCli(
        "campaign",
        "--scenario",
        scenario,
        "--out",
        output,
        "--replace",
        "true"
      ).status
    ).toBe(3);
    expect(readFileSync(calibrationPath, "utf8")).toContain(
      '"terminalTickDelta": 41'
    );
    writeFileSync(calibrationPath, calibrationText);
    writeFileSync(
      resolve(output, "campaign-manifest.json"),
      originalManifestText
    );

    const scenarioArtifactPath = resolve(output, "scenario.compiled.json");
    const manifestArtifactPath = resolve(output, "campaign-manifest.json");
    const scenarioArtifact = JSON.parse(
      readFileSync(scenarioArtifactPath, "utf8")
    ) as typeof scenarioValue;
    const forgedScenario = {
      ...scenarioArtifact,
      id: "campaign_scenario.forged",
      content: "forged-content.json",
      applicationBuild: "forged-build"
    };
    writeFileSync(
      scenarioArtifactPath,
      `${JSON.stringify(forgedScenario, null, 2)}\n`
    );
    const forgedManifest = JSON.parse(
      readFileSync(manifestArtifactPath, "utf8")
    ) as { scenarioHash: string };
    forgedManifest.scenarioHash = await canonicalHash(forgedScenario);
    writeFileSync(
      manifestArtifactPath,
      `${JSON.stringify(forgedManifest, null, 2)}\n`
    );
    const forgedMetadata = runCli(
      "campaign",
      "--scenario",
      scenario,
      "--out",
      output,
      "--replace",
      "true"
    );
    expect(forgedMetadata.status).toBe(3);
    writeFileSync(
      scenarioArtifactPath,
      `${JSON.stringify(scenarioArtifact, null, 2)}\n`
    );
    forgedManifest.scenarioHash = await canonicalHash(scenarioArtifact);
    writeFileSync(
      manifestArtifactPath,
      `${JSON.stringify(forgedManifest, null, 2)}\n`
    );

    writeFileSync(
      resolve(output, "campaign.json"),
      firstArtifact.replace(
        artifact.attemptChecksums[0] as string,
        "0".repeat(64)
      )
    );
    const tampered = runCli(
      "campaign",
      "--scenario",
      scenario,
      "--out",
      output,
      "--replace",
      "true"
    );
    expect(tampered.status).toBe(3);
    expect(JSON.parse(tampered.stderr)).toMatchObject({
      ok: false,
      error: { type: "report", code: "report_generation_failed" }
    });
    expect(
      JSON.parse(readFileSync(resolve(output, "campaign.json"), "utf8"))
        .attemptChecksums[0]
    ).toBe("0".repeat(64));

    writeFileSync(resolve(output, "campaign.json"), firstArtifact);
    writeFileSync(resolve(output, "unexpected.json"), "{}\n");
    const extraArtifact = runCli(
      "campaign",
      "--scenario",
      scenario,
      "--out",
      output,
      "--replace",
      "true"
    );
    expect(extraArtifact.status).toBe(3);
    rmSync(resolve(output, "unexpected.json"));

    const manifestPath = resolve(output, "campaign-manifest.json");
    const manifestText = readFileSync(manifestPath, "utf8");
    const hardlinkSource = resolve(directory, "hardlinked-manifest.json");
    writeFileSync(hardlinkSource, manifestText);
    rmSync(manifestPath);
    linkSync(hardlinkSource, manifestPath);
    const hardlinkedArtifact = runCli(
      "campaign",
      "--scenario",
      scenario,
      "--out",
      output,
      "--replace",
      "true"
    );
    expect(hardlinkedArtifact.status).toBe(3);
    rmSync(hardlinkSource);

    const symlinkedOutput = resolve(directory, "symlinked-output");
    symlinkSync(output, symlinkedOutput, "dir");
    const symlinked = runCli(
      "campaign",
      "--scenario",
      scenario,
      "--out",
      symlinkedOutput,
      "--replace",
      "true"
    );
    expect(symlinked.status).toBe(3);

    const invalidOutput = resolve(directory, "invalid-output");
    writeFileSync(
      scenario,
      JSON.stringify({ ...scenarioValue, attemptCount: 0 })
    );
    const invalid = runCli(
      "campaign",
      "--scenario",
      scenario,
      "--out",
      invalidOutput
    );
    expect(invalid.status).toBe(2);
    expect(JSON.parse(invalid.stderr)).toMatchObject({
      ok: false,
      error: { type: "input", code: "invalid_cli_input" }
    });
    expect(existsSync(invalidOutput)).toBe(false);
  }, 90_000);

  it("expands a bounded seed sweep into ordered replay-verifiable runs", () => {
    const directory = temporaryDirectory();
    const content = resolve(directory, "content.json");
    const scenario = resolve(directory, "scenario.json");
    const matrix = resolve(directory, "matrix.json");
    const output = resolve(directory, "sweep-output");
    writeFileSync(
      content,
      JSON.stringify({
        schemaVersion: 1,
        contentVersion: "sweep-test",
        definitions: [{ kind: "level", id: "level.empty", waveIds: [] }]
      })
    );
    writeFileSync(
      scenario,
      JSON.stringify({
        schemaVersion: 1,
        id: "scenario.test.sweep",
        levelId: "level.empty",
        seed: "99",
        maximumTicks: 1,
        commands: [{ atTick: 0, type: "confirmPreparation" }]
      })
    );
    const matrixValue = {
      schemaVersion: 1,
      id: "matrix.test.seed_sweep",
      content: "content.json",
      scenario: "scenario.json",
      axes: { seed: ["2", "1", "4294967295"] }
    };
    writeFileSync(matrix, JSON.stringify(matrixValue));

    const first = runCli("sweep", "--matrix", matrix, "--out", output);
    expect(first.status).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({
      ok: true,
      swept: true,
      matrixId: "matrix.test.seed_sweep",
      sampleCount: 3
    });
    const firstArtifact = readFileSync(resolve(output, "sweep.json"), "utf8");
    const artifact = JSON.parse(firstArtifact) as {
      aggregate: {
        terminalResultCounts: Array<{
          terminalResult: string;
          count: number;
        }>;
        terminalTick: {
          minimum: number;
          maximum: number;
          p50NearestRank: number;
          p90NearestRank: number;
        };
      };
      samples: Array<{ seed: string; runDirectory: string }>;
    };
    expect(artifact.aggregate).toEqual({
      terminalResultCounts: [{ terminalResult: "victory", count: 3 }],
      terminalTick: {
        minimum: 0,
        maximum: 0,
        p50NearestRank: 0,
        p90NearestRank: 0
      }
    });
    expect(artifact.samples.map((sample) => sample.seed)).toEqual([
      "2",
      "1",
      "4294967295"
    ]);
    for (const sample of artifact.samples) {
      const verified = runCli(
        "replay",
        "--run",
        resolve(output, sample.runDirectory),
        "--verify"
      );
      expect(verified.status).toBe(0);
      expect(JSON.parse(verified.stdout)).toMatchObject({
        ok: true,
        verified: true
      });
    }

    const replaced = runCli(
      "sweep",
      "--matrix",
      matrix,
      "--out",
      output,
      "--replace",
      "true"
    );
    expect(replaced.status).toBe(0);
    expect(readFileSync(resolve(output, "sweep.json"), "utf8")).toBe(
      firstArtifact
    );

    const sweepArtifactPath = resolve(output, "sweep.json");
    writeFileSync(
      sweepArtifactPath,
      `${JSON.stringify(
        {
          ...artifact,
          aggregate: {
            ...artifact.aggregate,
            terminalTick: {
              ...artifact.aggregate.terminalTick,
              p90NearestRank: 1
            }
          }
        },
        null,
        2
      )}\n`
    );
    const aggregateTamper = runCli(
      "sweep",
      "--matrix",
      matrix,
      "--out",
      output,
      "--replace",
      "true"
    );
    expect(aggregateTamper.status).toBe(3);
    expect(JSON.parse(aggregateTamper.stderr)).toMatchObject({
      ok: false,
      error: { type: "report", code: "report_generation_failed" }
    });
    writeFileSync(sweepArtifactPath, firstArtifact);

    const matrixArtifactPath = resolve(output, "matrix.compiled.json");
    const matrixArtifact = readFileSync(matrixArtifactPath, "utf8");
    writeFileSync(
      matrixArtifactPath,
      matrixArtifact.replace("matrix.test.seed_sweep", "matrix.test.forged")
    );
    const forgedReplacement = runCli(
      "sweep",
      "--matrix",
      matrix,
      "--out",
      output,
      "--replace",
      "true"
    );
    expect(forgedReplacement.status).toBe(3);
    expect(JSON.parse(forgedReplacement.stderr)).toMatchObject({
      ok: false,
      error: { type: "report", code: "report_generation_failed" }
    });
    writeFileSync(matrixArtifactPath, matrixArtifact);

    const externalRuns = resolve(directory, "external-runs");
    renameSync(resolve(output, "runs"), externalRuns);
    symlinkSync(externalRuns, resolve(output, "runs"), "dir");
    const symlinkedReplacement = runCli(
      "sweep",
      "--matrix",
      matrix,
      "--out",
      output,
      "--replace",
      "true"
    );
    expect(symlinkedReplacement.status).toBe(3);
    expect(existsSync(externalRuns)).toBe(true);

    writeFileSync(
      matrix,
      JSON.stringify({ ...matrixValue, axes: { seed: ["1", "1"] } })
    );
    const rejectedOutput = resolve(directory, "rejected-output");
    const rejected = runCli(
      "sweep",
      "--matrix",
      matrix,
      "--out",
      rejectedOutput
    );
    expect(rejected.status).toBe(2);
    expect(JSON.parse(rejected.stderr)).toMatchObject({
      ok: false,
      error: { type: "input", code: "invalid_cli_input" }
    });
    expect(existsSync(rejectedOutput)).toBe(false);

    writeFileSync(matrix, JSON.stringify(matrixValue));
    writeFileSync(
      scenario,
      JSON.stringify({
        schemaVersion: 1,
        id: "scenario.test.sweep",
        levelId: "level.empty",
        seed: "99",
        maximumTicks: 1,
        commands: [{ atTick: 0, type: "confirmPreparation" }],
        expectedTerminalResult: "defeat"
      })
    );
    const assertionOutput = resolve(directory, "assertion-output");
    const assertion = runCli(
      "sweep",
      "--matrix",
      matrix,
      "--out",
      assertionOutput
    );
    expect(assertion.status).toBe(1);
    expect(JSON.parse(assertion.stderr)).toMatchObject({
      ok: false,
      error: { type: "assertion", code: "unexpected_terminal_result" }
    });
    expect(existsSync(assertionOutput)).toBe(false);
  });

  it("expands seed, placement, and controller axes through authoritative calibration", () => {
    const directory = temporaryDirectory();
    const content = resolve(directory, "content.json");
    const scenario = resolve(directory, "scenario.json");
    const matrix = resolve(directory, "matrix.json");
    const output = resolve(directory, "placement-sweep-output");
    writeFileSync(
      content,
      readFileSync(resolve("content/fixtures/phase-3-shuttergate.json"))
    );
    writeFileSync(
      scenario,
      JSON.stringify({
        schemaVersion: 1,
        id: "scenario.test.placement_sweep",
        levelId: "level.shuttergate_hall",
        seed: "99",
        maximumTicks: 1,
        commands: [{ atTick: 0, type: "confirmPreparation" }]
      })
    );
    const matrixValue = {
      schemaVersion: 1,
      id: "matrix.test.placement_sweep",
      content: "content.json",
      scenario: "scenario.json",
      axes: {
        seed: ["2"],
        placement: [
          "placement.shuttergate_north_guard",
          "placement.shuttergate_keep_guard"
        ],
        controller: [
          "controller.target.nearest.v1",
          "controller.target.lowest_health.v1"
        ]
      }
    };
    writeFileSync(matrix, JSON.stringify(matrixValue));

    const result = runCli("sweep", "--matrix", matrix, "--out", output);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      swept: true,
      matrixId: "matrix.test.placement_sweep",
      sampleCount: 4
    });
    const artifact = JSON.parse(
      readFileSync(resolve(output, "sweep.json"), "utf8")
    ) as {
      schemaVersion: number;
      aggregate: unknown;
      samples: Array<{
        seed: string;
        placementPointId: string;
        controllerId: string;
        terminalResult: string;
        terminalTick: number;
        calibrationChecksum: string;
        calibrationEvidence: {
          seed: string;
          placementPointId: string;
          targetPolicy: string;
          terminalResult: string;
          terminalTick: number;
        };
      }>;
    };
    expect(artifact.schemaVersion).toBe(4);
    expect(
      artifact.samples.map((sample) => [
        sample.seed,
        sample.placementPointId,
        sample.controllerId
      ])
    ).toEqual([
      [
        "2",
        "placement.shuttergate_north_guard",
        "controller.target.nearest.v1"
      ],
      [
        "2",
        "placement.shuttergate_north_guard",
        "controller.target.lowest_health.v1"
      ],
      ["2", "placement.shuttergate_keep_guard", "controller.target.nearest.v1"],
      [
        "2",
        "placement.shuttergate_keep_guard",
        "controller.target.lowest_health.v1"
      ]
    ]);
    for (const sample of artifact.samples) {
      expect(sample).toMatchObject({
        seed: sample.calibrationEvidence.seed,
        placementPointId: sample.calibrationEvidence.placementPointId,
        terminalResult: sample.calibrationEvidence.terminalResult,
        terminalTick: sample.calibrationEvidence.terminalTick,
        calibrationChecksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        calibrationEvidence: {
          targetPolicy: sample.controllerId.includes("lowest_health")
            ? "lowest_health"
            : "nearest"
        }
      });
    }
    const terminalTicks = artifact.samples
      .map((sample) => sample.terminalTick)
      .sort((left, right) => left - right);
    expect(artifact.aggregate).toEqual({
      terminalResultCounts: [{ terminalResult: "defeat", count: 4 }],
      terminalTick: {
        minimum: terminalTicks[0],
        maximum: terminalTicks[3],
        p50NearestRank: terminalTicks[1],
        p90NearestRank: terminalTicks[3]
      }
    });
    expect(existsSync(resolve(output, "content.compiled.json"))).toBe(true);
    expect(readdirSync(resolve(output, "runs"))).toEqual([]);

    writeFileSync(
      resolve(output, "sweep.json"),
      JSON.stringify({
        ...artifact,
        samples: artifact.samples.map((sample, index) =>
          index === 0
            ? {
                ...sample,
                controllerId: "controller.target.lowest_health.v1"
              }
            : sample
        )
      })
    );
    expect(
      runCli("sweep", "--matrix", matrix, "--out", output, "--replace", "true")
        .status
    ).toBe(3);

    writeFileSync(
      matrix,
      JSON.stringify({
        ...matrixValue,
        axes: {
          seed: ["1"],
          placement: ["placement.shuttergate_north_guard"],
          controller: [
            "controller.target.nearest.v1",
            "controller.target.nearest.v1"
          ]
        }
      })
    );
    expect(
      runCli(
        "sweep",
        "--matrix",
        matrix,
        "--out",
        resolve(directory, "duplicate-output")
      ).status
    ).toBe(2);

    const invalidAxes = [
      {
        seed: ["1"],
        placement: ["placement.shuttergate_north_guard"],
        controller: ["toString"]
      },
      {
        seed: Array.from({ length: 17 }, (_, index) => String(index + 1)),
        placement: [
          "placement.shuttergate_north_guard",
          "placement.shuttergate_keep_guard"
        ],
        controller: [
          "controller.target.nearest.v1",
          "controller.target.lowest_health.v1"
        ]
      }
    ];
    for (const [index, axes] of invalidAxes.entries()) {
      writeFileSync(matrix, JSON.stringify({ ...matrixValue, axes }));
      expect(
        runCli(
          "sweep",
          "--matrix",
          matrix,
          "--out",
          resolve(directory, `invalid-controller-output-${index}`)
        ).status
      ).toBe(2);
    }
  }, 60_000);

  it("expands and verifies the purchased-build sweep axis", () => {
    const directory = temporaryDirectory();
    const content = resolve(directory, "content.json");
    const scenario = resolve(directory, "scenario.json");
    const matrix = resolve(directory, "matrix.json");
    const output = resolve(directory, "build-sweep-output");
    writeFileSync(
      content,
      readFileSync(resolve("content/fixtures/phase-3-shuttergate.json"))
    );
    writeFileSync(
      scenario,
      JSON.stringify({
        schemaVersion: 1,
        id: "scenario.test.build_sweep",
        levelId: "level.shuttergate_hall",
        seed: "99",
        maximumTicks: 1,
        commands: [{ atTick: 0, type: "confirmPreparation" }]
      })
    );
    const matrixValue = {
      schemaVersion: 1,
      id: "matrix.test.build_sweep",
      content: "content.json",
      scenario: "scenario.json",
      axes: {
        seed: ["2"],
        placement: ["placement.shuttergate_north_guard"],
        controller: ["controller.target.nearest.v1"],
        build: [
          "build.profile.new_campaign.v1",
          "build.warden.shield_slam_rank_1.v1"
        ]
      }
    };
    writeFileSync(matrix, JSON.stringify(matrixValue));

    const result = runCli("sweep", "--matrix", matrix, "--out", output);
    expect(result.status, result.stderr).toBe(0);
    const artifact = JSON.parse(
      readFileSync(resolve(output, "sweep.json"), "utf8")
    ) as {
      schemaVersion: number;
      samples: Array<{
        buildId: string;
        calibrationChecksum: string;
        calibrationEvidence: {
          buildId: string;
          deployedWardenMaximumHealth: number;
          deployedWardenAttackDamage: number;
        };
      }>;
    };
    expect(artifact.schemaVersion).toBe(5);
    expect(artifact.samples.map((sample) => sample.buildId)).toEqual(
      matrixValue.axes.build
    );
    expect(
      artifact.samples.map((sample) => [
        sample.calibrationEvidence.buildId,
        sample.calibrationEvidence.deployedWardenMaximumHealth,
        sample.calibrationEvidence.deployedWardenAttackDamage,
        sample.calibrationChecksum
      ])
    ).toEqual([
      [
        "build.profile.new_campaign.v1",
        240,
        18,
        "e0bd85a5aad379a8fe662c2e7be82b247c1848b56993e8e6a0147009525b0100"
      ],
      [
        "build.warden.shield_slam_rank_1.v1",
        260,
        20,
        "58e6f8047ccf310e4a80d3110e1b6e761508169b0447483488f5e679c778154f"
      ]
    ]);

    writeFileSync(
      resolve(output, "sweep.json"),
      JSON.stringify({
        ...artifact,
        samples: artifact.samples.map((sample, index) =>
          index === 0
            ? { ...sample, buildId: "build.warden.shield_slam_rank_1.v1" }
            : sample
        )
      })
    );
    expect(
      runCli("sweep", "--matrix", matrix, "--out", output, "--replace", "true")
        .status
    ).toBe(3);

    for (const build of [
      ["toString"],
      ["build.profile.new_campaign.v1", "build.profile.new_campaign.v1"]
    ]) {
      writeFileSync(
        matrix,
        JSON.stringify({
          ...matrixValue,
          axes: { ...matrixValue.axes, build }
        })
      );
      expect(
        runCli(
          "sweep",
          "--matrix",
          matrix,
          "--out",
          resolve(directory, `invalid-build-${build.length}`)
        ).status
      ).toBe(2);
    }
  }, 60_000);

  it("compares verified bundles while ignoring provenance metadata", async () => {
    const directory = temporaryDirectory();
    const content = temporaryFile("content.json", {
      schemaVersion: 1,
      contentVersion: "baseline",
      definitions: [{ kind: "level", id: "level.empty", waveIds: [] }]
    });
    const scenario = temporaryFile("scenario.json", {
      schemaVersion: 1,
      id: "scenario.test.compare",
      levelId: "level.empty",
      seed: "1",
      maximumTicks: 1,
      commands: [{ atTick: 0, type: "confirmPreparation" }]
    });
    const baseline = resolve(directory, "baseline");
    const candidate = resolve(directory, "candidate");
    for (const output of [baseline, candidate]) {
      expect(
        runCli(
          "run",
          "--content",
          content,
          "--scenario",
          scenario,
          "--out",
          output
        ).status
      ).toBe(0);
    }
    const manifestPath = resolve(candidate, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
      string,
      unknown
    > & {
      repositoryDirty: boolean;
      canonical: boolean;
      metadataHash: string;
    };
    manifest.repositoryDirty = true;
    manifest.canonical = false;
    const {
      metadataHash: _oldHash,
      complete: _complete,
      files: _files,
      ...metadata
    } = manifest;
    manifest.metadataHash = await canonicalHash(metadata);
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const equivalent = runCli(
      "compare",
      "--baseline",
      baseline,
      "--candidate",
      candidate
    );
    expect(equivalent.status).toBe(0);
    expect(JSON.parse(equivalent.stdout)).toMatchObject({
      ok: true,
      compared: true,
      schemaVersion: 1,
      equivalent: true
    });

    writeFileSync(
      content,
      JSON.stringify({
        schemaVersion: 1,
        contentVersion: "candidate",
        definitions: [{ kind: "level", id: "level.empty", waveIds: [] }]
      })
    );
    const changed = resolve(directory, "changed");
    expect(
      runCli(
        "run",
        "--content",
        content,
        "--scenario",
        scenario,
        "--out",
        changed
      ).status
    ).toBe(0);
    const different = runCli(
      "compare",
      "--baseline",
      baseline,
      "--candidate",
      changed
    );
    expect(different.status).toBe(0);
    expect(JSON.parse(different.stdout)).toMatchObject({
      equivalent: false,
      firstDivergence: {
        category: "content",
        tick: 0,
        path: "$/contentVersion"
      }
    });
  });

  it("publishes the completion manifest after a successful run", () => {
    const content = temporaryFile("content.json", {
      schemaVersion: 1,
      contentVersion: "test",
      definitions: [{ kind: "level", id: "level.empty", waveIds: [] }]
    });
    const scenario = temporaryFile("scenario.json", {
      schemaVersion: 1,
      id: "scenario.test.empty",
      levelId: "level.empty",
      seed: "1",
      maximumTicks: 1,
      commands: [{ atTick: 0, type: "confirmPreparation" }],
      expectedTerminalResult: "victory"
    });
    const output = resolve(dirname(content), "run");

    const result = runCli(
      "run",
      "--content",
      content,
      "--scenario",
      scenario,
      "--out",
      output
    );
    expect(result.status).toBe(0);
    const manifest = JSON.parse(
      readFileSync(resolve(output, "manifest.json"), "utf8")
    ) as {
      readonly repositoryRevision: string;
      readonly repositoryDirty: boolean;
      readonly canonical: boolean;
    };
    expect(manifest).toMatchObject({
      complete: true,
      repositoryRevision: expect.stringMatching(/^(unknown|[a-f0-9]{40})$/),
      repositoryDirty: expect.any(Boolean),
      protocolVersions: {
        harness: 2,
        contentSchema: 1,
        scenarioSchema: 1,
        replaySchema: 1,
        stateSchema: 1,
        timelineSchema: 1,
        diagnosticSchema: 1
      },
      controller: { type: "scenario.commands", version: 1 },
      scenarioHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      metadataHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      files: [
        "checkpoints.ndjson",
        "commands.ndjson",
        "content.compiled.json",
        "content-manifest.json",
        "diagnostics.ndjson",
        "events.ndjson",
        "replay.json",
        "scenario.compiled.json",
        "state.final.json",
        "summary.json",
        "timeline.ndjson"
      ]
    });
    expect(manifest.canonical).toBe(
      manifest.repositoryRevision !== "unknown" && !manifest.repositoryDirty
    );
  });

  it("records the executing checkout revision independently of caller cwd", () => {
    const callerDirectory = temporaryDirectory();
    const output = resolve(callerDirectory, "run");
    const expectedRevision = spawnSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8"
    }).stdout.trim();
    const result = runCliFrom(
      callerDirectory,
      "run",
      "--content",
      resolve("content/fixtures/empty-content.json"),
      "--scenario",
      resolve("scenarios/conformance/empty-level.json"),
      "--out",
      output
    );

    expect(result.status).toBe(0);
    expect(
      JSON.parse(readFileSync(resolve(output, "manifest.json"), "utf8"))
    ).toMatchObject({
      repositoryRevision: expectedRevision,
      replayIdentityHash:
        "2775dc989013a317bca8984b8f2466171311f03fc1ce8d2b606c5e8eb3e9a402"
    });
  });

  it("renders verified battlefield map, occupancy, queue, and route evidence", () => {
    const directory = temporaryDirectory();
    const output = resolve(directory, "battlefield-run");
    expect(
      runCli(
        "run",
        "--content",
        resolve("content/fixtures/conformance-map.json"),
        "--scenario",
        resolve("scenarios/conformance/battlefield-map.json"),
        "--out",
        output
      ).status
    ).toBe(0);

    const text = runCli(
      "render",
      "--run",
      output,
      "--format",
      "text",
      "--layers",
      "map,occupancy,path",
      "--from-node",
      "node.entry",
      "--to-node",
      "node.goal"
    );
    expect(text.status).toBe(0);
    expect(text.stderr).toBe("");
    expect(text.stdout).toBe(`battlefield map.conformance_diamond
layers map,occupancy,path
legend E=entrance P=placement O=occupied *=route
route node.entry -> node.goal cost=20 nodes=node.entry,node.south,node.goal
grid
y=0 [E..*]-[.P..]
y=1 [...*]-[.P.*]
nodes
- node.east coord=1,0 placement=placement.east
- node.entry coord=0,0 entrance=entrance.west routeIndex=0
- node.goal coord=1,1 placement=placement.goal routeIndex=2
- node.south coord=0,1 routeIndex=1
connections
- connection.east_goal node.east <-> node.goal cost=10
- connection.entry_east node.east <-> node.entry cost=10
- connection.entry_south node.entry <-> node.south cost=10
- connection.south_goal node.goal <-> node.south cost=10
queued-spawns
- none
`);

    const svg = runCli(
      "render",
      "--run",
      output,
      "--format",
      "svg",
      "--layers",
      "map,path",
      "--from-node",
      "node.entry",
      "--to-node",
      "node.goal"
    );
    expect(svg.status).toBe(0);
    expect(svg.stdout).toContain(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 360"'
    );
    expect(svg.stdout).toContain('data-connection-id="connection.entry_south"');
    expect(svg.stdout).toContain('class="node entrance route"');

    const incompletePath = runCli(
      "render",
      "--run",
      output,
      "--format",
      "text",
      "--layers",
      "map,path",
      "--from-node",
      "node.entry"
    );
    expect(incompletePath.status).toBe(2);
    expect(JSON.parse(incompletePath.stderr)).toMatchObject({
      error: { type: "input", code: "invalid_cli_input" }
    });
    expect(incompletePath.stdout).toBe("");
  });

  it("inspects verified timeline windows and rejects invalid or tampered evidence", () => {
    const content = temporaryFile("content.json", {
      schemaVersion: 1,
      contentVersion: "test",
      definitions: [{ kind: "level", id: "level.empty", waveIds: [] }]
    });
    const scenario = temporaryFile("scenario.json", {
      schemaVersion: 1,
      id: "scenario.test.inspect",
      levelId: "level.empty",
      seed: "1",
      maximumTicks: 1,
      commands: [{ atTick: 0, type: "confirmPreparation" }],
      expectedTerminalResult: "victory"
    });
    const output = resolve(dirname(content), "inspect-run");
    expect(
      runCli(
        "run",
        "--content",
        content,
        "--scenario",
        scenario,
        "--out",
        output
      ).status
    ).toBe(0);

    const inspected = runCli(
      "inspect",
      "--run",
      output,
      "--tick",
      "0",
      "--before",
      "0",
      "--after",
      "0"
    );
    expect(inspected.status).toBe(0);
    expect(JSON.parse(inspected.stdout)).toMatchObject({
      ok: true,
      inspected: true,
      identity: {
        repositoryRevision: expect.stringMatching(/^(unknown|[a-f0-9]{40})$/),
        contentManifestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        scenarioId: "scenario.test.inspect",
        scenarioHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        seed: "1",
        replayIdentityHash: expect.stringMatching(/^[a-f0-9]{64}$/)
      },
      window: { tick: 0, before: 0, after: 0, startTick: 0, endTick: 0 },
      events: [
        { type: "round.started", tick: 0 },
        { type: "final_cleanup.entered", tick: 0 },
        { type: "round.victory", tick: 0 }
      ],
      checkpoints: [{ tick: 0 }],
      stateEvidence: [{ tick: 0 }],
      diagnostics: [
        {
          eventType: "round.started",
          reasonCode: "SIM-LIFECYCLE-001",
          causes: [{ kind: "command", sequence: 0 }]
        },
        {
          eventType: "final_cleanup.entered",
          reasonCode: "SIM-FINAL-CLEANUP-001",
          causes: [{ kind: "event", eventId: "event.000000" }]
        },
        {
          eventType: "round.victory",
          reasonCode: "SIM-VICTORY-001",
          causes: [{ kind: "event", eventId: "event.000001" }]
        }
      ]
    });

    const emptyWindow = runCli("inspect", "--run", output, "--tick", "1");
    expect(emptyWindow.status).toBe(0);
    expect(JSON.parse(emptyWindow.stdout)).toMatchObject({
      events: [],
      checkpoints: [],
      stateEvidence: [],
      diagnostics: [],
      timeline: []
    });

    const invalidWindow = runCli("inspect", "--run", output, "--tick", "-1");
    expect(invalidWindow.status).toBe(2);
    expect(JSON.parse(invalidWindow.stderr)).toMatchObject({
      error: { type: "input", code: "invalid_cli_input" }
    });

    const timelinePath = resolve(output, "timeline.ndjson");
    const originalTimeline = readFileSync(timelinePath, "utf8");
    const timeline = originalTimeline
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const firstTimelineRecord = timeline[0];
    if (firstTimelineRecord === undefined)
      throw new Error("missing timeline record");
    Object.assign(firstTimelineRecord, { tick: 1 });
    writeFileSync(
      timelinePath,
      `${timeline.map((record) => JSON.stringify(record)).join("\n")}\n`,
      "utf8"
    );
    const tampered = runCli("inspect", "--run", output, "--tick", "0");
    expect(tampered.status).toBe(4);
    expect(JSON.parse(tampered.stderr)).toMatchObject({
      error: {
        type: "replay_divergence",
        code: "timeline_artifact_mismatch",
        artifact: "timeline.ndjson",
        path: "$/0/tick"
      }
    });
    writeFileSync(timelinePath, originalTimeline, "utf8");

    const diagnosticsPath = resolve(output, "diagnostics.ndjson");
    const originalDiagnostics = readFileSync(diagnosticsPath, "utf8");
    const diagnostics = originalDiagnostics
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const firstDiagnostic = diagnostics[0];
    if (firstDiagnostic === undefined)
      throw new Error("missing diagnostic record");
    Object.assign(firstDiagnostic, { reasonCode: "SIM-TAMPERED-001" });
    writeFileSync(
      diagnosticsPath,
      `${diagnostics.map((record) => JSON.stringify(record)).join("\n")}\n`,
      "utf8"
    );
    const tamperedDiagnostic = runCli(
      "inspect",
      "--run",
      output,
      "--tick",
      "0"
    );
    expect(tamperedDiagnostic.status).toBe(4);
    expect(JSON.parse(tamperedDiagnostic.stderr)).toMatchObject({
      error: {
        code: "diagnostic_artifact_mismatch",
        artifact: "diagnostics.ndjson",
        path: "$/0/reasonCode"
      }
    });
    writeFileSync(diagnosticsPath, originalDiagnostics, "utf8");

    rmSync(resolve(output, "manifest.json"));
    const incomplete = runCli("inspect", "--run", output, "--tick", "0");
    expect(incomplete.status).toBe(4);
    expect(JSON.parse(incomplete.stderr)).toMatchObject({
      error: { code: "bundle_file_set_mismatch" }
    });
  });

  it("explains a fully verified run as deterministic Markdown or JSON", () => {
    const directory = temporaryDirectory();
    const output = resolve(directory, "explain-run");
    expect(
      runCli(
        "run",
        "--content",
        resolve("content/fixtures/empty-content.json"),
        "--scenario",
        resolve("scenarios/conformance/empty-level.json"),
        "--out",
        output
      ).status
    ).toBe(0);

    const markdown = runCli("explain", "--run", output, "--format", "markdown");
    expect(markdown.status).toBe(0);
    expect(markdown.stderr).toBe("");
    expect(markdown.stdout).toContain(
      "# Run explanation: scenario.conformance.empty"
    );
    expect(markdown.stdout).toContain(
      "`event.000000` emitted `round.started` under `SIM-LIFECYCLE-001`"
    );

    const json = runCli("explain", "--run", output, "--format", "json");
    expect(json.status).toBe(0);
    const report = JSON.parse(json.stdout) as {
      readonly events: readonly unknown[];
    };
    expect(report).toMatchObject({
      schemaVersion: 1,
      identity: { scenarioId: "scenario.conformance.empty", seed: "1" },
      outcome: { terminalResult: "victory", terminalTick: 0, eventCount: 3 }
    });
    expect(report.events[0]).toMatchObject({
      eventId: "event.000000",
      eventType: "round.started",
      reasonCode: "SIM-LIFECYCLE-001"
    });

    const invalidFormat = runCli(
      "explain",
      "--run",
      output,
      "--format",
      "text"
    );
    expect(invalidFormat.status).toBe(2);
    expect(JSON.parse(invalidFormat.stderr)).toMatchObject({
      error: { type: "input", code: "invalid_cli_input" }
    });

    const eventsPath = resolve(output, "events.ndjson");
    writeFileSync(
      eventsPath,
      readFileSync(eventsPath, "utf8").replace("round.started", "round.changed")
    );
    const tampered = runCli("explain", "--run", output, "--format", "json");
    expect(tampered.status).toBe(4);
    expect(JSON.parse(tampered.stderr)).toMatchObject({
      error: { code: "event_artifact_checksum_mismatch" }
    });
  });

  it("rejects ambiguous JSON, hardlinked artifacts, and forged replacement targets", () => {
    const directory = temporaryDirectory();
    const output = resolve(directory, "run");
    const content = resolve("content/fixtures/empty-content.json");
    const scenario = resolve("scenarios/conformance/empty-level.json");
    expect(
      runCli(
        "run",
        "--content",
        content,
        "--scenario",
        scenario,
        "--out",
        output
      ).status
    ).toBe(0);

    const manifestPath = resolve(output, "manifest.json");
    const originalManifest = readFileSync(manifestPath, "utf8");
    writeFileSync(
      manifestPath,
      originalManifest.replace(
        '  "repositoryRevision": ',
        `  "repositoryRevision": "${"f".repeat(40)}",\n  "repositoryRevision": `
      )
    );
    const duplicateKey = runCli("replay", "--run", output, "--verify");
    expect(duplicateKey.status).toBe(4);
    expect(JSON.parse(duplicateKey.stderr)).toMatchObject({
      error: {
        code: "noncanonical_json_artifact",
        artifact: "manifest.json"
      }
    });
    writeFileSync(manifestPath, originalManifest);

    const externalSummary = resolve(directory, "external-summary.json");
    linkSync(resolve(output, "summary.json"), externalSummary);
    const hardlinked = runCli("inspect", "--run", output, "--tick", "0");
    expect(hardlinked.status).toBe(4);
    expect(JSON.parse(hardlinked.stderr)).toMatchObject({
      error: {
        code: "missing_or_unsafe_artifact",
        artifact: "summary.json"
      }
    });
    rmSync(externalSummary);

    const victim = resolve(directory, "victim");
    mkdirSync(victim);
    writeFileSync(resolve(victim, "keeper.txt"), "keep\n");
    writeFileSync(
      resolve(victim, "manifest.json"),
      '{"complete":true,"harnessVersion":"phase-1"}\n'
    );
    const replacement = runCli(
      "run",
      "--content",
      content,
      "--scenario",
      scenario,
      "--out",
      victim,
      "--replace",
      "true"
    );
    expect(replacement.status).toBe(3);
    expect(readFileSync(resolve(victim, "keeper.txt"), "utf8")).toBe("keep\n");
  });

  it("emits machine-readable validation issues with exit code 2", () => {
    const content = temporaryFile("content.json", {
      schemaVersion: 1,
      contentVersion: "test",
      definitions: [
        { kind: "level", id: "level.test", waveIds: ["wave.missing"] }
      ]
    });
    const scenario = temporaryFile("scenario.json", {
      schemaVersion: 1,
      id: "scenario.test.invalid",
      levelId: "level.test",
      seed: "1",
      maximumTicks: 1,
      commands: []
    });

    const result = runCli(
      "validate",
      "--content",
      content,
      "--scenario",
      scenario
    );
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      error: {
        type: "validation",
        issues: [
          {
            path: "$/definitions/0/waveIds/0",
            code: "unknown_reference"
          }
        ]
      }
    });
  });

  it("classifies tick-budget exhaustion as a safety stop", () => {
    const content = resolve("content/fixtures/nonterminating-content.json");
    const scenario = resolve("scenarios/conformance/nonterminating.json");
    const output = resolve(temporaryDirectory(), "failed-run");
    mkdirSync(output);
    writeFileSync(resolve(output, "manifest.json"), '{"complete":true}\n');

    const result = runCli(
      "run",
      "--content",
      content,
      "--scenario",
      scenario,
      "--out",
      output
    );
    expect(result.status).toBe(5);
    expect(readFileSync(resolve(output, "manifest.json"), "utf8")).toBe(
      '{"complete":true}\n'
    );
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      error: {
        type: "safety_stop",
        code: "tick_budget_exhausted"
      }
    });
  });

  it("classifies expected-result mismatches as assertions", () => {
    const content = temporaryFile("content.json", {
      schemaVersion: 1,
      contentVersion: "test",
      definitions: [{ kind: "level", id: "level.empty", waveIds: [] }]
    });
    const scenario = temporaryFile("scenario.json", {
      schemaVersion: 1,
      id: "scenario.test.assertion",
      levelId: "level.empty",
      seed: "1",
      maximumTicks: 1,
      commands: [{ atTick: 0, type: "confirmPreparation" }],
      expectedTerminalResult: "defeat"
    });

    const result = runCli("run", "--content", content, "--scenario", scenario);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      error: {
        type: "assertion",
        code: "unexpected_terminal_result"
      }
    });
  });

  it("verifies a self-contained replay and rejects tampered artifacts", () => {
    const content = temporaryFile("content.json", {
      schemaVersion: 1,
      contentVersion: "test",
      definitions: [{ kind: "level", id: "level.empty", waveIds: [] }]
    });
    const scenario = temporaryFile("scenario.json", {
      schemaVersion: 1,
      id: "scenario.test.replay",
      levelId: "level.empty",
      seed: "1",
      maximumTicks: 1,
      commands: [{ atTick: 0, type: "confirmPreparation" }],
      expectedTerminalResult: "victory"
    });
    const output = resolve(dirname(content), "replay-run");
    expect(
      runCli(
        "run",
        "--content",
        content,
        "--scenario",
        scenario,
        "--out",
        output
      ).status
    ).toBe(0);

    const verified = runCli("replay", "--run", output, "--verify");
    expect(verified.status).toBe(0);
    expect(JSON.parse(verified.stdout)).toMatchObject({
      ok: true,
      verified: true,
      scenarioId: "scenario.test.replay",
      terminalResult: "victory"
    });

    const tamperCases: ReadonlyArray<{
      readonly file: string;
      readonly code: string;
      readonly path?: string;
      readonly mutate: (original: string) => string;
    }> = [
      {
        file: "state.final.json",
        code: "state_artifact_checksum_mismatch",
        path: "$/rngState",
        mutate: (original) => original.replace('"rngState": 1', '"rngState": 2')
      },
      {
        file: "events.ndjson",
        code: "event_artifact_checksum_mismatch",
        path: "$/0/type",
        mutate: (original) =>
          original.replace("round.started", "round.tampered")
      },
      {
        file: "commands.ndjson",
        code: "command_artifact_checksum_mismatch",
        mutate: () => ""
      },
      {
        file: "content.compiled.json",
        code: "content_manifest_mismatch",
        mutate: (original) =>
          original.replace(
            '"contentVersion": "test"',
            '"contentVersion": "tampered"'
          )
      },
      {
        file: "content-manifest.json",
        code: "content_manifest_binding_mismatch",
        mutate: (original) => original.replace("level.empty", "level.tampered")
      },
      {
        file: "summary.json",
        code: "summary_binding_mismatch",
        mutate: (original) =>
          original.replace('"eventCount": 3', '"eventCount": 4')
      },
      {
        file: "manifest.json",
        code: "manifest_metadata_hash_mismatch",
        mutate: (original) =>
          original.replace('"replaySchema": 1', '"replaySchema": 2')
      },
      {
        file: "manifest.json",
        code: "manifest_metadata_hash_mismatch",
        mutate: (original) =>
          original.replace(
            /"repositoryRevision": "[^"]+"/,
            `"repositoryRevision": "${"f".repeat(40)}"`
          )
      },
      {
        file: "scenario.compiled.json",
        code: "seed_mismatch",
        mutate: (original) => original.replace('"seed": "1"', '"seed": "2"')
      },
      {
        file: "replay.json",
        code: "invalid_replay_artifact",
        mutate: (original) =>
          original.replace('"schemaVersion": 1', '"schemaVersion": 2')
      },
      {
        file: "replay.json",
        code: "scenario_binding_mismatch",
        mutate: (original) =>
          original.replace(
            /"commands": \[[\s\S]*?\],\n {2}"checkpoints"/,
            '"commands": [],\n  "checkpoints"'
          )
      }
    ];

    for (const tamperCase of tamperCases) {
      const path = resolve(output, tamperCase.file);
      const original = readFileSync(path, "utf8");
      const mutated = tamperCase.mutate(original);
      expect(mutated).not.toBe(original);
      writeFileSync(path, mutated, "utf8");
      const rejected = runCli("replay", "--run", output, "--verify");
      expect(rejected.status, tamperCase.file).toBe(4);
      expect(JSON.parse(rejected.stderr), tamperCase.file).toMatchObject({
        ok: false,
        error: {
          type: "replay_divergence",
          code: tamperCase.code,
          ...(tamperCase.path === undefined ? {} : { path: tamperCase.path })
        }
      });
      writeFileSync(path, original, "utf8");
    }

    const oversizedSummaryPath = resolve(output, "summary.json");
    const originalSummary = readFileSync(oversizedSummaryPath, "utf8");
    writeFileSync(
      oversizedSummaryPath,
      " ".repeat(4 * 1024 * 1024 + 1),
      "utf8"
    );
    const oversizedArtifact = runCli("replay", "--run", output, "--verify");
    expect(oversizedArtifact.status).toBe(4);
    expect(JSON.parse(oversizedArtifact.stderr)).toMatchObject({
      ok: false,
      error: {
        type: "replay_divergence",
        code: "artifact_size_limit_exceeded",
        artifact: "summary.json"
      }
    });
    writeFileSync(oversizedSummaryPath, originalSummary, "utf8");

    const eventsPath = resolve(output, "events.ndjson");
    const originalEvents = readFileSync(eventsPath, "utf8");
    writeFileSync(eventsPath, "{}\n".repeat(100_001), "utf8");
    const excessiveRecords = runCli("replay", "--run", output, "--verify");
    expect(excessiveRecords.status).toBe(4);
    expect(JSON.parse(excessiveRecords.stderr)).toMatchObject({
      ok: false,
      error: {
        type: "replay_divergence",
        code: "artifact_record_limit_exceeded",
        artifact: "events.ndjson"
      }
    });
    writeFileSync(eventsPath, originalEvents, "utf8");

    const unexpectedPath = resolve(output, "unexpected.txt");
    writeFileSync(unexpectedPath, "unexpected\n", "utf8");
    const extraArtifact = runCli("replay", "--run", output, "--verify");
    expect(extraArtifact.status).toBe(4);
    expect(JSON.parse(extraArtifact.stderr)).toMatchObject({
      error: {
        type: "replay_divergence",
        code: "bundle_file_set_mismatch"
      }
    });
    rmSync(unexpectedPath);

    const bundleLink = resolve(dirname(output), "bundle-link");
    symlinkSync(output, bundleLink, "dir");
    const symlinkedBundle = runCli("replay", "--run", bundleLink, "--verify");
    expect(symlinkedBundle.status).toBe(4);
    expect(JSON.parse(symlinkedBundle.stderr)).toMatchObject({
      error: {
        type: "replay_divergence",
        code: "missing_or_unsafe_bundle"
      }
    });
    rmSync(bundleLink);

    const summaryPath = resolve(output, "summary.json");
    const summary = readFileSync(summaryPath, "utf8");
    const externalSummary = resolve(dirname(output), "external-summary.json");
    writeFileSync(externalSummary, summary, "utf8");
    rmSync(summaryPath);
    symlinkSync(externalSummary, summaryPath);
    const symlinked = runCli("replay", "--run", output, "--verify");
    expect(symlinked.status).toBe(4);
    expect(JSON.parse(symlinked.stderr)).toMatchObject({
      error: {
        type: "replay_divergence",
        code: "missing_or_unsafe_artifact",
        artifact: "summary.json"
      }
    });
  });

  it("replaces verified bundles and refuses tampered artifact symlinks", () => {
    const content = temporaryFile("content.json", {
      schemaVersion: 1,
      contentVersion: "test",
      definitions: [{ kind: "level", id: "level.empty", waveIds: [] }]
    });
    const scenario = temporaryFile("scenario.json", {
      schemaVersion: 1,
      id: "scenario.test.atomic",
      levelId: "level.empty",
      seed: "1",
      maximumTicks: 1,
      commands: [{ atTick: 0, type: "confirmPreparation" }]
    });
    const output = resolve(dirname(content), "atomic-run");
    const victim = resolve(dirname(content), "victim.txt");

    const arbitraryDirectory = runCli(
      "run",
      "--content",
      content,
      "--scenario",
      scenario,
      "--out",
      dirname(content),
      "--replace",
      "true"
    );
    expect(arbitraryDirectory.status).toBe(3);
    expect(existsSync(content)).toBe(true);

    expect(
      runCli(
        "run",
        "--content",
        content,
        "--scenario",
        scenario,
        "--out",
        output
      ).status
    ).toBe(0);
    const validReplacement = runCli(
      "run",
      "--content",
      content,
      "--scenario",
      scenario,
      "--out",
      output,
      "--replace",
      "true"
    );
    expect(validReplacement.status).toBe(0);
    writeFileSync(victim, "do-not-touch\n");
    writeFileSync(resolve(output, "stale.txt"), "stale\n");
    rmSync(resolve(output, "summary.json"));
    symlinkSync(victim, resolve(output, "summary.json"));

    const withoutReplace = runCli(
      "run",
      "--content",
      content,
      "--scenario",
      scenario,
      "--out",
      output
    );
    expect(withoutReplace.status).toBe(3);
    expect(readFileSync(victim, "utf8")).toBe("do-not-touch\n");

    const replaced = runCli(
      "run",
      "--content",
      content,
      "--scenario",
      scenario,
      "--out",
      output,
      "--replace",
      "true"
    );
    expect(replaced.status).toBe(3);
    expect(readFileSync(victim, "utf8")).toBe("do-not-touch\n");
    expect(existsSync(resolve(output, "stale.txt"))).toBe(true);
    expect(lstatSync(resolve(output, "summary.json")).isSymbolicLink()).toBe(
      true
    );
  });
});
