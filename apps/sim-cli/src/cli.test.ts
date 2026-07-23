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
        stateSchema: 1
      },
      controller: { type: "scenario.commands", version: 1 },
      scenarioHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      files: [
        "content-manifest.json",
        "events.ndjson",
        "scenario.compiled.json",
        "state.final.json",
        "summary.json"
      ]
    });
    expect(manifest.canonical).toBe(
      manifest.repositoryRevision !== "unknown" && !manifest.repositoryDirty
    );
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
    const content = temporaryFile("content.json", {
      schemaVersion: 1,
      contentVersion: "test",
      definitions: [
        { kind: "level", id: "level.test", waveIds: ["wave.first"] },
        { kind: "wave", id: "wave.first", durationTicks: 30 }
      ]
    });
    const scenario = temporaryFile("scenario.json", {
      schemaVersion: 1,
      id: "scenario.test.nonterminating",
      levelId: "level.test",
      seed: "1",
      maximumTicks: 2,
      commands: [{ atTick: 0, type: "confirmPreparation" }]
    });

    const output = resolve(dirname(content), "failed-run");
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

  it("atomically replaces bundles without following artifact symlinks", () => {
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
