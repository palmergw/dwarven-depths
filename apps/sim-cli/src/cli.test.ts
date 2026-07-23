import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
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

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("simulation CLI", () => {
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
        harness: 1,
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
        { code: "round.started", ruleId: "SIM-LIFECYCLE-001" },
        { code: "final_cleanup.entered", ruleId: "SIM-FINAL-CLEANUP-001" },
        { code: "round.victory", ruleId: "SIM-VICTORY-001" }
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
    Object.assign(firstDiagnostic, { ruleId: "SIM-TAMPERED-001" });
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
        path: "$/0/ruleId"
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
        code: "command_artifact_checksum_mismatch",
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

  it("safely replaces bundles without following artifact symlinks", () => {
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
    expect(replaced.status).toBe(0);
    expect(readFileSync(victim, "utf8")).toBe("do-not-touch\n");
    expect(existsSync(resolve(output, "stale.txt"))).toBe(false);
    expect(lstatSync(resolve(output, "summary.json")).isSymbolicLink()).toBe(
      false
    );
  });
});
