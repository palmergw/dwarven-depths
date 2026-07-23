#!/usr/bin/env node
import { execFile } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep
} from "node:path";
import { promisify } from "node:util";
import {
  ContentValidationError,
  compileContent,
  compileReplay,
  compileScenario
} from "@dwarven-depths/content-runtime";
import { canonicalHash } from "@dwarven-depths/contracts";
import {
  createReplayDefinition,
  ReplayDivergenceError,
  RuntimeAssertionError,
  RuntimeSafetyStopError,
  runScenario,
  verifyReplay
} from "@dwarven-depths/runtime";

const execFileAsync = promisify(execFile);
const runBundleFiles = [
  "checkpoints.ndjson",
  "commands.ndjson",
  "content.compiled.json",
  "content-manifest.json",
  "events.ndjson",
  "replay.json",
  "scenario.compiled.json",
  "state.final.json",
  "summary.json"
] as const;

interface ParsedArgs {
  readonly command: string | undefined;
  readonly flags: ReadonlyMap<string, string>;
}

interface RunManifestArtifact {
  readonly complete?: unknown;
  readonly harnessVersion?: unknown;
  readonly files?: unknown;
  readonly protocolVersions?: unknown;
  readonly runtime?: unknown;
  readonly controller?: unknown;
  readonly repositoryRevision?: unknown;
  readonly repositoryDirty?: unknown;
  readonly canonical?: unknown;
  readonly contentManifestHash?: unknown;
  readonly contentVersion?: unknown;
  readonly scenarioId?: unknown;
  readonly scenarioHash?: unknown;
  readonly seed?: unknown;
}

interface ContentManifestArtifact {
  readonly contentVersion?: unknown;
  readonly contentManifestHash?: unknown;
  readonly definitions?: unknown;
}

interface SummaryArtifact {
  readonly scenarioId?: unknown;
  readonly scenarioHash?: unknown;
  readonly terminalResult?: unknown;
  readonly terminalTick?: unknown;
  readonly commandCount?: unknown;
  readonly eventCount?: unknown;
  readonly finalStateChecksum?: unknown;
  readonly eventStreamChecksum?: unknown;
}

class CliInputError extends Error {
  readonly code = "invalid_cli_input";

  constructor(message: string) {
    super(message);
    this.name = "CliInputError";
  }
}

class ReportGenerationError extends Error {
  readonly code = "report_generation_failed";

  constructor(message: string) {
    super(message);
    this.name = "ReportGenerationError";
  }
}

class ReplayArtifactError extends Error {
  readonly code: string;
  readonly artifact: string;

  constructor(code: string, artifact: string, message: string) {
    super(message);
    this.name = "ReplayArtifactError";
    this.code = code;
    this.artifact = artifact;
  }
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const flags = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (!key?.startsWith("--")) {
      throw new CliInputError(
        `Expected --name value arguments, received: ${rest.slice(index).join(" ")}`
      );
    }
    const name = key.slice(2);
    if (flags.has(name))
      throw new CliInputError(`Duplicate --${name} argument`);

    if (
      name === "verify" &&
      (rest[index + 1] === undefined || rest[index + 1]?.startsWith("--"))
    ) {
      flags.set(name, "true");
      continue;
    }
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new CliInputError(`Missing value for --${name}`);
    }
    flags.set(name, value);
    index += 1;
  }
  return { command, flags };
}

function requiredFlag(args: ParsedArgs, name: string): string {
  const value = args.flags.get(name);
  if (!value) throw new CliInputError(`Missing required --${name} argument`);
  return value;
}

function booleanFlag(args: ParsedArgs, name: string): boolean {
  const value = args.flags.get(name);
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new CliInputError(`--${name} must be true or false`);
}

function rejectUnknownFlags(
  args: ParsedArgs,
  allowed: ReadonlySet<string>
): void {
  for (const name of args.flags.keys()) {
    if (!allowed.has(name))
      throw new CliInputError(`Unknown --${name} argument`);
  }
}

async function readJson(path: string): Promise<unknown> {
  const resolvedPath = resolve(path);
  try {
    return JSON.parse(await readFile(resolvedPath, "utf8")) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ContentValidationError([
        {
          path: "$",
          code: "invalid_json",
          message: `${resolvedPath}: ${error.message}`
        }
      ]);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new CliInputError(`Unable to read ${resolvedPath}: ${message}`);
  }
}

async function readArtifactText(
  directory: string,
  name: string
): Promise<string> {
  const path = resolve(directory, name);
  const status = await pathStatus(path);
  if (status === undefined || status.isSymbolicLink() || !status.isFile()) {
    throw new ReplayArtifactError(
      "missing_or_unsafe_artifact",
      name,
      `${name} must be a regular file inside the run bundle`
    );
  }
  return readFile(path, "utf8");
}

async function readArtifactJson(
  directory: string,
  name: string
): Promise<unknown> {
  try {
    return JSON.parse(await readArtifactText(directory, name)) as unknown;
  } catch (error) {
    if (error instanceof ReplayArtifactError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new ReplayArtifactError(
      "invalid_json_artifact",
      name,
      `${name} is not valid JSON: ${message}`
    );
  }
}

async function readArtifactNdjson(
  directory: string,
  name: string
): Promise<unknown[]> {
  const text = await readArtifactText(directory, name);
  if (text.length === 0) return [];
  if (!text.endsWith("\n")) {
    throw new ReplayArtifactError(
      "invalid_ndjson_artifact",
      name,
      `${name} must end with a newline`
    );
  }
  try {
    return text
      .slice(0, -1)
      .split("\n")
      .map((line) => JSON.parse(line) as unknown);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ReplayArtifactError(
      "invalid_ndjson_artifact",
      name,
      `${name} contains invalid JSON: ${message}`
    );
  }
}

function requireRecord<Value extends object = Record<string, unknown>>(
  value: unknown,
  artifact: string
): Value {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ReplayArtifactError(
      "invalid_artifact_shape",
      artifact,
      `${artifact} must contain a JSON object`
    );
  }
  return { ...value } as Value;
}

function requireExactKeys(
  value: object,
  allowedKeys: readonly string[],
  artifact: string
): void {
  const actualKeys = Object.keys(value);
  const unexpected = actualKeys.find((key) => !allowedKeys.includes(key));
  const missing = allowedKeys.find((key) => !actualKeys.includes(key));
  if (unexpected === undefined && missing === undefined) return;
  throw new ReplayArtifactError(
    "invalid_artifact_shape",
    artifact,
    unexpected === undefined
      ? `${artifact} is missing required property ${missing}`
      : `${artifact} contains unknown property ${unexpected}`
  );
}

function requireArtifactMatch(
  condition: boolean,
  code: string,
  artifact: string,
  message: string
): void {
  if (condition) return;
  throw new ReplayArtifactError(code, artifact, message);
}

async function canonicalArtifactHash(
  value: unknown,
  artifact: string
): Promise<string> {
  try {
    return await canonicalHash(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ReplayArtifactError(
      "noncanonical_artifact",
      artifact,
      `${artifact} is outside the canonical JSON domain: ${message}`
    );
  }
}

async function writeNewFile(path: string, content: string): Promise<void> {
  await writeFile(path, content, { encoding: "utf8", flag: "wx" });
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeNewFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function toNdjson(values: readonly unknown[]): string {
  return values.length === 0
    ? ""
    : `${values.map((value) => JSON.stringify(value)).join("\n")}\n`;
}

async function collectProvenance(): Promise<{
  readonly repositoryRevision: string;
  readonly repositoryDirty: boolean;
  readonly revisionKnown: boolean;
}> {
  try {
    const [{ stdout: revision }, { stdout: status }] = await Promise.all([
      execFileAsync("git", ["rev-parse", "HEAD"], { cwd: process.cwd() }),
      execFileAsync(
        "git",
        ["status", "--porcelain", "--untracked-files=normal"],
        {
          cwd: process.cwd()
        }
      )
    ]);
    const repositoryRevision = revision.trim();
    return {
      repositoryRevision,
      repositoryDirty: status.trim().length > 0,
      revisionKnown: repositoryRevision.length > 0
    };
  } catch {
    return {
      repositoryRevision: "unknown",
      repositoryDirty: true,
      revisionKnown: false
    };
  }
}

async function pathStatus(
  path: string
): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
  try {
    return await lstat(path);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
  }
}

async function assertReplaceableRunBundle(
  outputDirectory: string
): Promise<void> {
  const manifestPath = resolve(outputDirectory, "manifest.json");
  const manifestStatus = await pathStatus(manifestPath);
  if (
    manifestStatus === undefined ||
    manifestStatus.isSymbolicLink() ||
    !manifestStatus.isFile()
  ) {
    throw new Error(
      "refusing to replace a directory without a regular completion manifest"
    );
  }

  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      readonly complete?: unknown;
      readonly harnessVersion?: unknown;
    };
    if (
      manifest.complete !== true ||
      (manifest.harnessVersion !== "milestone-0" &&
        manifest.harnessVersion !== "phase-1")
    ) {
      throw new Error("completion manifest is not a supported run bundle");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`refusing to replace invalid run bundle: ${message}`);
  }
}

async function publishRunBundle(
  outputDirectory: string,
  replace: boolean,
  writeBundle: (stagingDirectory: string) => Promise<void>
): Promise<void> {
  const currentDirectoryFromOutput = relative(outputDirectory, process.cwd());
  if (
    currentDirectoryFromOutput === "" ||
    (!currentDirectoryFromOutput.startsWith(`..${sep}`) &&
      currentDirectoryFromOutput !== ".." &&
      !isAbsolute(currentDirectoryFromOutput))
  ) {
    throw new Error(
      "refusing to publish over the current working directory or one of its ancestors"
    );
  }

  const parentDirectory = dirname(outputDirectory);
  const outputName = basename(outputDirectory);
  await mkdir(parentDirectory, { recursive: true });
  const stagingDirectory = await mkdtemp(
    resolve(parentDirectory, `.${outputName}.tmp-`)
  );
  let backupRoot: string | undefined;
  let previousBundle: string | undefined;

  try {
    await writeBundle(stagingDirectory);
    const existing = await pathStatus(outputDirectory);
    if (existing !== undefined) {
      if (existing.isSymbolicLink() || !existing.isDirectory()) {
        throw new Error(
          "output path must be a real directory, not a file or symlink"
        );
      }
      if (!replace) {
        throw new Error(
          "output directory already exists; pass --replace true to replace it atomically"
        );
      }
      await assertReplaceableRunBundle(outputDirectory);
      backupRoot = await mkdtemp(
        resolve(parentDirectory, `.${outputName}.backup-`)
      );
      previousBundle = resolve(backupRoot, "previous");
      await rename(outputDirectory, previousBundle);
    }

    try {
      await rename(stagingDirectory, outputDirectory);
    } catch (error) {
      if (previousBundle !== undefined) {
        try {
          await rename(previousBundle, outputDirectory);
        } catch (restoreError) {
          const preservedAt = previousBundle;
          backupRoot = undefined;
          const restoreMessage =
            restoreError instanceof Error
              ? restoreError.message
              : String(restoreError);
          throw new Error(
            `replacement failed and the previous bundle could not be restored; it remains at ${preservedAt}: ${restoreMessage}`,
            { cause: error }
          );
        }
      }
      throw error;
    }

    if (backupRoot !== undefined) {
      await rm(backupRoot, { recursive: true, force: true }).catch(
        () => undefined
      );
      backupRoot = undefined;
    }
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true }).catch(
      () => undefined
    );
    if (backupRoot !== undefined) {
      await rm(backupRoot, { recursive: true, force: true }).catch(
        () => undefined
      );
    }
  }
}

async function load(args: ParsedArgs) {
  const content = await compileContent(
    await readJson(requiredFlag(args, "content"))
  );
  const scenario = compileScenario(
    await readJson(requiredFlag(args, "scenario")),
    content
  );
  return { content, scenario };
}

async function validate(args: ParsedArgs): Promise<void> {
  rejectUnknownFlags(args, new Set(["content", "scenario"]));
  const { content, scenario } = await load(args);
  process.stdout.write(
    `${JSON.stringify({ ok: true, contentManifestHash: content.manifestHash, scenarioId: scenario.id })}\n`
  );
}

async function run(args: ParsedArgs): Promise<void> {
  rejectUnknownFlags(args, new Set(["content", "scenario", "out", "replace"]));
  const replace = booleanFlag(args, "replace");
  const { content, scenario } = await load(args);
  const outputDirectory = resolve(
    args.flags.get("out") ?? `.ddh/runs/${scenario.id}`
  );
  const [result, provenance] = await Promise.all([
    runScenario(scenario, content),
    collectProvenance()
  ]);
  const replay = createReplayDefinition(result, scenario, content);
  const summary = {
    scenarioId: result.scenarioId,
    scenarioHash: result.scenarioHash,
    terminalResult: result.terminalResult,
    terminalTick: result.terminalTick,
    commandCount: result.commands.length,
    eventCount: result.events.length,
    finalStateChecksum: result.finalStateChecksum,
    eventStreamChecksum: result.eventStreamChecksum
  };
  const manifest = {
    harnessVersion: "phase-1",
    protocolVersions: {
      harness: 1,
      contentSchema: content.bundle.schemaVersion,
      scenarioSchema: scenario.schemaVersion,
      replaySchema: replay.schemaVersion,
      stateSchema: result.finalState.schemaVersion
    },
    runtime: { name: "@dwarven-depths/runtime", version: "0.0.0" },
    controller: { type: "scenario.commands", version: 1 },
    repositoryRevision: provenance.repositoryRevision,
    repositoryDirty: provenance.repositoryDirty,
    contentManifestHash: content.manifestHash,
    contentVersion: content.bundle.contentVersion,
    scenarioId: scenario.id,
    scenarioHash: result.scenarioHash,
    seed: scenario.seed,
    canonical: provenance.revisionKnown && !provenance.repositoryDirty,
    complete: true,
    files: runBundleFiles
  };

  try {
    await publishRunBundle(
      outputDirectory,
      replace,
      async (stagingDirectory) => {
        await Promise.all([
          writeJson(
            resolve(stagingDirectory, "content.compiled.json"),
            content.bundle
          ),
          writeJson(
            resolve(stagingDirectory, "scenario.compiled.json"),
            scenario
          ),
          writeJson(resolve(stagingDirectory, "replay.json"), replay),
          writeJson(resolve(stagingDirectory, "content-manifest.json"), {
            contentVersion: content.bundle.contentVersion,
            contentManifestHash: content.manifestHash,
            definitions: content.bundle.definitions.map((definition) => ({
              kind: definition.kind,
              id: definition.id
            }))
          }),
          writeJson(
            resolve(stagingDirectory, "state.final.json"),
            result.finalState
          ),
          writeJson(resolve(stagingDirectory, "summary.json"), summary),
          writeNewFile(
            resolve(stagingDirectory, "commands.ndjson"),
            toNdjson(result.commands)
          ),
          writeNewFile(
            resolve(stagingDirectory, "checkpoints.ndjson"),
            toNdjson(replay.checkpoints)
          ),
          writeNewFile(
            resolve(stagingDirectory, "events.ndjson"),
            toNdjson(result.events)
          )
        ]);
        await writeJson(resolve(stagingDirectory, "manifest.json"), manifest);
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ReportGenerationError(
      `Unable to publish run bundle at ${outputDirectory}: ${message}`
    );
  }

  process.stdout.write(
    `${JSON.stringify({ ok: true, outputDirectory, ...summary })}\n`
  );
}

async function replay(args: ParsedArgs): Promise<void> {
  rejectUnknownFlags(args, new Set(["run", "verify"]));
  if (!booleanFlag(args, "verify")) {
    throw new CliInputError("replay currently requires --verify");
  }
  const runDirectory = resolve(requiredFlag(args, "run"));
  const [
    manifestInput,
    replayInput,
    contentInput,
    contentManifestInput,
    scenarioInput,
    finalStateInput,
    summaryInput,
    commandsInput,
    checkpointsInput,
    eventsInput
  ] = await Promise.all([
    readArtifactJson(runDirectory, "manifest.json"),
    readArtifactJson(runDirectory, "replay.json"),
    readArtifactJson(runDirectory, "content.compiled.json"),
    readArtifactJson(runDirectory, "content-manifest.json"),
    readArtifactJson(runDirectory, "scenario.compiled.json"),
    readArtifactJson(runDirectory, "state.final.json"),
    readArtifactJson(runDirectory, "summary.json"),
    readArtifactNdjson(runDirectory, "commands.ndjson"),
    readArtifactNdjson(runDirectory, "checkpoints.ndjson"),
    readArtifactNdjson(runDirectory, "events.ndjson")
  ]);

  const manifest = requireRecord<RunManifestArtifact>(
    manifestInput,
    "manifest.json"
  );
  const listedFiles = manifest.files;
  requireArtifactMatch(
    manifest.complete === true && manifest.harnessVersion === "phase-1",
    "incomplete_or_unsupported_bundle",
    "manifest.json",
    "manifest must mark a completed Phase 1 run bundle"
  );
  requireArtifactMatch(
    Array.isArray(listedFiles) &&
      listedFiles.length === runBundleFiles.length &&
      runBundleFiles.every((name, index) => listedFiles[index] === name),
    "manifest_file_list_mismatch",
    "manifest.json",
    "manifest file list does not match the required replay bundle"
  );

  const content = await compileContent(contentInput);
  const scenario = compileScenario(scenarioInput, content);
  const compiledReplay = compileReplay(replayInput);
  const contentManifest = requireRecord<ContentManifestArtifact>(
    contentManifestInput,
    "content-manifest.json"
  );
  const summary = requireRecord<SummaryArtifact>(summaryInput, "summary.json");
  requireExactKeys(
    manifest,
    [
      "harnessVersion",
      "protocolVersions",
      "runtime",
      "controller",
      "repositoryRevision",
      "repositoryDirty",
      "contentManifestHash",
      "contentVersion",
      "scenarioId",
      "scenarioHash",
      "seed",
      "canonical",
      "complete",
      "files"
    ],
    "manifest.json"
  );
  requireExactKeys(
    contentManifest,
    ["contentVersion", "contentManifestHash", "definitions"],
    "content-manifest.json"
  );
  requireExactKeys(
    summary,
    [
      "scenarioId",
      "scenarioHash",
      "terminalResult",
      "terminalTick",
      "commandCount",
      "eventCount",
      "finalStateChecksum",
      "eventStreamChecksum"
    ],
    "summary.json"
  );
  const finalCheckpoint = compiledReplay.checkpoints[0];
  if (finalCheckpoint === undefined) {
    throw new ReplayArtifactError(
      "missing_terminal_checkpoint",
      "replay.json",
      "replay must contain its terminal checkpoint"
    );
  }

  requireArtifactMatch(
    manifest.contentManifestHash === compiledReplay.contentManifestHash &&
      manifest.contentVersion === compiledReplay.contentVersion &&
      contentManifest.contentManifestHash ===
        compiledReplay.contentManifestHash &&
      contentManifest.contentVersion === compiledReplay.contentVersion,
    "content_manifest_binding_mismatch",
    "content-manifest.json",
    "manifest and replay content hashes must agree"
  );
  requireArtifactMatch(
    manifest.scenarioHash === compiledReplay.scenarioHash &&
      manifest.scenarioId === compiledReplay.scenarioId &&
      manifest.seed === compiledReplay.seed,
    "scenario_binding_mismatch",
    "manifest.json",
    "manifest and replay scenario identity must agree"
  );

  requireArtifactMatch(
    typeof manifest.repositoryRevision === "string" &&
      (manifest.repositoryRevision === "unknown" ||
        /^[a-f0-9]{40}$/.test(manifest.repositoryRevision)) &&
      typeof manifest.repositoryDirty === "boolean" &&
      typeof manifest.canonical === "boolean" &&
      manifest.canonical ===
        (manifest.repositoryRevision !== "unknown" &&
          !manifest.repositoryDirty),
    "invalid_provenance_metadata",
    "manifest.json",
    "manifest provenance and canonical status are inconsistent"
  );
  const expectedContentDefinitions = content.bundle.definitions.map(
    (definition) => ({ kind: definition.kind, id: definition.id })
  );
  const [
    protocolHash,
    expectedProtocolHash,
    runtimeHash,
    expectedRuntimeHash,
    controllerHash,
    expectedControllerHash,
    contentDefinitionsHash,
    expectedContentDefinitionsHash
  ] = await Promise.all([
    canonicalArtifactHash(manifest.protocolVersions, "manifest.json"),
    canonicalArtifactHash(
      {
        harness: 1,
        contentSchema: content.bundle.schemaVersion,
        scenarioSchema: scenario.schemaVersion,
        replaySchema: compiledReplay.schemaVersion,
        stateSchema: 1
      },
      "manifest.json"
    ),
    canonicalArtifactHash(manifest.runtime, "manifest.json"),
    canonicalArtifactHash(
      { name: "@dwarven-depths/runtime", version: "0.0.0" },
      "manifest.json"
    ),
    canonicalArtifactHash(manifest.controller, "manifest.json"),
    canonicalArtifactHash(
      { type: "scenario.commands", version: 1 },
      "manifest.json"
    ),
    canonicalArtifactHash(contentManifest.definitions, "content-manifest.json"),
    canonicalArtifactHash(expectedContentDefinitions, "content-manifest.json")
  ]);
  requireArtifactMatch(
    protocolHash === expectedProtocolHash &&
      runtimeHash === expectedRuntimeHash &&
      controllerHash === expectedControllerHash,
    "manifest_metadata_mismatch",
    "manifest.json",
    "manifest protocol, runtime, or controller metadata is inconsistent"
  );
  requireArtifactMatch(
    contentDefinitionsHash === expectedContentDefinitionsHash,
    "content_manifest_binding_mismatch",
    "content-manifest.json",
    "content manifest definitions do not match compiled content"
  );

  const [
    finalStateArtifactHash,
    eventArtifactHash,
    commandArtifactHash,
    replayCommandHash,
    checkpointArtifactHash,
    replayCheckpointHash
  ] = await Promise.all([
    canonicalArtifactHash(finalStateInput, "state.final.json"),
    canonicalArtifactHash(eventsInput, "events.ndjson"),
    canonicalArtifactHash(commandsInput, "commands.ndjson"),
    canonicalArtifactHash(compiledReplay.commands, "replay.json"),
    canonicalArtifactHash(checkpointsInput, "checkpoints.ndjson"),
    canonicalArtifactHash(compiledReplay.checkpoints, "replay.json")
  ]);
  requireArtifactMatch(
    finalStateArtifactHash === finalCheckpoint.stateChecksum,
    "state_artifact_checksum_mismatch",
    "state.final.json",
    `expected ${finalCheckpoint.stateChecksum}, received ${finalStateArtifactHash}`
  );
  requireArtifactMatch(
    eventArtifactHash === finalCheckpoint.eventStreamChecksum,
    "event_artifact_checksum_mismatch",
    "events.ndjson",
    `expected ${finalCheckpoint.eventStreamChecksum}, received ${eventArtifactHash}`
  );
  requireArtifactMatch(
    commandArtifactHash === replayCommandHash,
    "command_artifact_checksum_mismatch",
    "commands.ndjson",
    `expected ${replayCommandHash}, received ${commandArtifactHash}`
  );
  requireArtifactMatch(
    checkpointArtifactHash === replayCheckpointHash,
    "checkpoint_artifact_checksum_mismatch",
    "checkpoints.ndjson",
    `expected ${replayCheckpointHash}, received ${checkpointArtifactHash}`
  );
  requireArtifactMatch(
    summary.scenarioId === compiledReplay.scenarioId &&
      summary.scenarioHash === compiledReplay.scenarioHash &&
      summary.finalStateChecksum === finalCheckpoint.stateChecksum &&
      summary.eventStreamChecksum === finalCheckpoint.eventStreamChecksum &&
      summary.terminalResult === compiledReplay.expectedTerminalResult &&
      summary.terminalTick === compiledReplay.expectedTerminalTick &&
      summary.commandCount === commandsInput.length &&
      summary.eventCount === eventsInput.length,
    "summary_binding_mismatch",
    "summary.json",
    "summary does not match replay terminal evidence"
  );

  const result = await verifyReplay(compiledReplay, scenario, content);
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      verified: true,
      runDirectory,
      scenarioId: result.scenarioId,
      terminalResult: result.terminalResult,
      terminalTick: result.terminalTick,
      finalStateChecksum: result.finalStateChecksum,
      eventStreamChecksum: result.eventStreamChecksum
    })}\n`
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  switch (args.command) {
    case "validate":
      await validate(args);
      break;
    case "run":
      await run(args);
      break;
    case "replay":
      await replay(args);
      break;
    default:
      throw new CliInputError(
        "Usage: dwarven-depths-sim <validate|run|replay> [--content <file>] [--scenario <file>] [--out <dir>] [--replace true|false] [--run <bundle> --verify]"
      );
  }
}

main().catch((error: unknown) => {
  if (error instanceof ContentValidationError) {
    process.stderr.write(
      `${JSON.stringify({ ok: false, error: { type: "validation", issues: error.issues } })}\n`
    );
    process.exitCode = 2;
    return;
  }
  if (error instanceof CliInputError) {
    process.stderr.write(
      `${JSON.stringify({ ok: false, error: { type: "input", code: error.code, message: error.message } })}\n`
    );
    process.exitCode = 2;
    return;
  }
  if (
    error instanceof ReplayDivergenceError ||
    error instanceof ReplayArtifactError
  ) {
    process.stderr.write(
      `${JSON.stringify({
        ok: false,
        error: {
          type: "replay_divergence",
          code: error.code,
          message: error.message,
          ...(error instanceof ReplayDivergenceError
            ? {
                expected: error.expected,
                actual: error.actual,
                ...(error.checkpointTick === undefined
                  ? {}
                  : { checkpointTick: error.checkpointTick })
              }
            : { artifact: error.artifact })
        }
      })}\n`
    );
    process.exitCode = 4;
    return;
  }
  if (error instanceof RuntimeAssertionError) {
    process.stderr.write(
      `${JSON.stringify({ ok: false, error: { type: "assertion", code: error.code, message: error.message } })}\n`
    );
    process.exitCode = 1;
    return;
  }
  if (error instanceof ReportGenerationError) {
    process.stderr.write(
      `${JSON.stringify({ ok: false, error: { type: "report", code: error.code, message: error.message } })}\n`
    );
    process.exitCode = 3;
    return;
  }
  if (error instanceof RuntimeSafetyStopError) {
    process.stderr.write(
      `${JSON.stringify({ ok: false, error: { type: "safety_stop", code: error.code, message: error.message } })}\n`
    );
    process.exitCode = 5;
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `${JSON.stringify({ ok: false, error: { type: "runtime", message } })}\n`
  );
  process.exitCode = 3;
});
