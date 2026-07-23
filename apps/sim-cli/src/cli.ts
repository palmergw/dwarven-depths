#!/usr/bin/env node
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
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
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  ContentValidationError,
  compileContent,
  compileReplay,
  compileScenario
} from "@dwarven-depths/content-runtime";
import {
  canonicalHash,
  type LifecycleDiagnosticRecord,
  type ReplayDefinition,
  type TimelineRecord
} from "@dwarven-depths/contracts";
import {
  compareRunEvidence,
  createLifecycleDiagnostics,
  createReplayDefinition,
  createTimelineRecords,
  ReplayDivergenceError,
  RuntimeAssertionError,
  RuntimeSafetyStopError,
  runScenario,
  verifyReplay
} from "@dwarven-depths/runtime";

const execFileAsync = promisify(execFile);
const runtimeRepositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const runBundleFiles = [
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
] as const;
const maximumArtifactBytes = 4 * 1024 * 1024;
const maximumBundleBytes = 16 * 1024 * 1024;
const maximumNdjsonRecords = 100_000;

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
  readonly replayIdentityHash?: unknown;
  readonly metadataHash?: unknown;
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

interface VerifiedRunBundle {
  readonly result: Awaited<ReturnType<typeof verifyReplay>>;
  readonly manifest: RunManifestArtifact;
  readonly replay: ReplayDefinition;
  readonly timeline: readonly TimelineRecord[];
  readonly diagnostics: readonly LifecycleDiagnosticRecord[];
  readonly replayIdentityHash: string;
  readonly content: Awaited<ReturnType<typeof compileContent>>;
  readonly scenario: ReturnType<typeof compileScenario>;
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
  readonly path: string | undefined;

  constructor(code: string, artifact: string, message: string, path?: string) {
    super(message);
    this.name = "ReplayArtifactError";
    this.code = code;
    this.artifact = artifact;
    this.path = path;
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

function integerFlag(
  args: ParsedArgs,
  name: string,
  defaultValue: number,
  maximum: number
): number {
  const value = args.flags.get(name);
  if (value === undefined) return defaultValue;
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new CliInputError(
      `--${name} must be a canonical nonnegative integer`
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new CliInputError(`--${name} must not exceed ${maximum}`);
  }
  return parsed;
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
  name: string,
  budget?: { bytes: number }
): Promise<string> {
  const path = resolve(directory, name);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const status = await handle.stat();
    if (!status.isFile() || status.nlink !== 1) {
      throw new ReplayArtifactError(
        "missing_or_unsafe_artifact",
        name,
        `${name} must be a regular file with exactly one hard link`
      );
    }
    if (status.size > maximumArtifactBytes) {
      throw new ReplayArtifactError(
        "artifact_size_limit_exceeded",
        name,
        `${name} exceeds the ${maximumArtifactBytes}-byte artifact limit`
      );
    }
    if (budget !== undefined) {
      budget.bytes += status.size;
      if (budget.bytes > maximumBundleBytes) {
        throw new ReplayArtifactError(
          "bundle_size_limit_exceeded",
          name,
          `run bundle exceeds the ${maximumBundleBytes}-byte aggregate artifact limit`
        );
      }
    }
    return await handle.readFile("utf8");
  } catch (error) {
    if (error instanceof ReplayArtifactError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new ReplayArtifactError(
      "missing_or_unsafe_artifact",
      name,
      `unable to open ${name} as a non-symlink regular file: ${message}`
    );
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function readArtifactJson(
  directory: string,
  name: string,
  budget?: { bytes: number }
): Promise<unknown> {
  try {
    const text = await readArtifactText(directory, name, budget);
    const value = JSON.parse(text) as unknown;
    if (text !== `${JSON.stringify(value, null, 2)}\n`) {
      throw new ReplayArtifactError(
        "noncanonical_json_artifact",
        name,
        `${name} must use the canonical run-bundle JSON encoding`
      );
    }
    return value;
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
  name: string,
  budget?: { bytes: number }
): Promise<unknown[]> {
  const text = await readArtifactText(directory, name, budget);
  if (text.length === 0) return [];
  if (!text.endsWith("\n")) {
    throw new ReplayArtifactError(
      "invalid_ndjson_artifact",
      name,
      `${name} must end with a newline`
    );
  }
  let recordCount = 0;
  for (
    let index = text.indexOf("\n");
    index !== -1;
    index = text.indexOf("\n", index + 1)
  ) {
    recordCount += 1;
    if (recordCount > maximumNdjsonRecords) {
      throw new ReplayArtifactError(
        "artifact_record_limit_exceeded",
        name,
        `${name} exceeds the ${maximumNdjsonRecords}-record NDJSON limit`
      );
    }
  }
  try {
    const values: unknown[] = [];
    for (const line of text.slice(0, -1).split("\n")) {
      const value = JSON.parse(line) as unknown;
      if (line !== JSON.stringify(value)) {
        throw new ReplayArtifactError(
          "noncanonical_ndjson_artifact",
          name,
          `${name} must use canonical JSON on every line`
        );
      }
      values.push(value);
    }
    return values;
  } catch (error) {
    if (error instanceof ReplayArtifactError) throw error;
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

function pointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function firstDifferencePath(
  expected: unknown,
  actual: unknown,
  path = "$"
): string | undefined {
  if (Object.is(expected, actual)) return undefined;
  if (
    expected === null ||
    actual === null ||
    typeof expected !== "object" ||
    typeof actual !== "object"
  ) {
    return path;
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) return path;
    const length = Math.max(expected.length, actual.length);
    for (let index = 0; index < length; index += 1) {
      if (index >= expected.length || index >= actual.length)
        return `${path}/${index}`;
      const difference = firstDifferencePath(
        expected[index],
        actual[index],
        `${path}/${index}`
      );
      if (difference !== undefined) return difference;
    }
    return undefined;
  }

  const expectedRecord = expected as Record<string, unknown>;
  const actualRecord = actual as Record<string, unknown>;
  const keys = [
    ...new Set([...Object.keys(expected), ...Object.keys(actual)])
  ].sort();
  for (const key of keys) {
    const childPath = `${path}/${pointerSegment(key)}`;
    if (
      !Object.hasOwn(expectedRecord, key) ||
      !Object.hasOwn(actualRecord, key)
    ) {
      return childPath;
    }
    const difference = firstDifferencePath(
      expectedRecord[key],
      actualRecord[key],
      childPath
    );
    if (difference !== undefined) return difference;
  }
  return undefined;
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

async function validateReplayArtifact<Value>(
  artifact: string,
  operation: () => Value | Promise<Value>
): Promise<Value> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ContentValidationError) {
      throw new ReplayArtifactError(
        "invalid_replay_artifact",
        artifact,
        `${artifact} failed strict validation: ${JSON.stringify(error.issues)}`
      );
    }
    throw error;
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
      execFileAsync("git", ["rev-parse", "HEAD"], {
        cwd: runtimeRepositoryRoot
      }),
      execFileAsync(
        "git",
        ["status", "--porcelain", "--untracked-files=normal"],
        {
          cwd: runtimeRepositoryRoot
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
  try {
    await verifyRunDirectory(outputDirectory, false);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `refusing to replace a bundle that does not pass full replay verification: ${message}`,
      { cause: error }
    );
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
          "output directory already exists; pass --replace true to perform a validated rollback-safe replacement"
        );
      }
      const expectedDevice = existing.dev;
      const expectedInode = existing.ino;
      await assertReplaceableRunBundle(outputDirectory);
      backupRoot = await mkdtemp(
        resolve(parentDirectory, `.${outputName}.backup-`)
      );
      previousBundle = resolve(backupRoot, "previous");
      await rename(outputDirectory, previousBundle);
      const movedBundle = await lstat(previousBundle);
      if (
        movedBundle.dev !== expectedDevice ||
        movedBundle.ino !== expectedInode
      ) {
        const unexpectedBundle = previousBundle;
        if ((await pathStatus(outputDirectory)) === undefined) {
          await rename(unexpectedBundle, outputDirectory);
          previousBundle = undefined;
          throw new Error(
            "output directory identity changed during replacement; the unexpected directory was restored and publication was aborted"
          );
        }
        backupRoot = undefined;
        throw new Error(
          `output directory identity changed during replacement; publication was aborted and the unexpected directory was preserved at ${unexpectedBundle}`
        );
      }
    }

    try {
      if (previousBundle !== undefined) {
        await assertReplaceableRunBundle(previousBundle);
      }
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
  const timeline = createTimelineRecords(result.events, replay);
  const diagnostics = createLifecycleDiagnostics(
    result.events,
    result.commands
  );
  const replayIdentityHash = await canonicalHash(replay);
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
  const manifestMetadata = {
    harnessVersion: "phase-1",
    protocolVersions: {
      harness: 2,
      contentSchema: content.bundle.schemaVersion,
      scenarioSchema: scenario.schemaVersion,
      replaySchema: replay.schemaVersion,
      stateSchema: result.finalState.schemaVersion,
      timelineSchema: 1,
      diagnosticSchema: 1
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
    replayIdentityHash,
    canonical: provenance.revisionKnown && !provenance.repositoryDirty
  };
  const manifest = {
    ...manifestMetadata,
    metadataHash: await canonicalHash(manifestMetadata),
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
          ),
          writeNewFile(
            resolve(stagingDirectory, "timeline.ndjson"),
            toNdjson(timeline)
          ),
          writeNewFile(
            resolve(stagingDirectory, "diagnostics.ndjson"),
            toNdjson(diagnostics)
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

async function verifyRunDirectory(
  runDirectory: string,
  emitVerification: boolean
): Promise<VerifiedRunBundle> {
  let runHandle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    runHandle = await open(
      runDirectory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
    );
    const runStatus = await runHandle.stat();
    if (!runStatus.isDirectory()) {
      throw new ReplayArtifactError(
        "missing_or_unsafe_bundle",
        "manifest.json",
        "--run must identify a non-symlink run-bundle directory"
      );
    }
  } catch (error) {
    await runHandle?.close().catch(() => undefined);
    if (error instanceof ReplayArtifactError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new ReplayArtifactError(
      "missing_or_unsafe_bundle",
      "manifest.json",
      `unable to open --run as a stable non-symlink directory: ${message}`
    );
  }

  try {
    return await verifyReplayBundle(
      runDirectory,
      `/proc/self/fd/${runHandle.fd}`,
      emitVerification
    );
  } finally {
    await runHandle.close().catch(() => undefined);
  }
}

async function replay(args: ParsedArgs): Promise<void> {
  rejectUnknownFlags(args, new Set(["run", "verify"]));
  if (!booleanFlag(args, "verify")) {
    throw new CliInputError("replay currently requires --verify");
  }
  await verifyRunDirectory(resolve(requiredFlag(args, "run")), true);
}

async function inspect(args: ParsedArgs): Promise<void> {
  rejectUnknownFlags(args, new Set(["run", "tick", "before", "after"]));
  const tick = integerFlag(args, "tick", 0, 4_294_967_295);
  const before = integerFlag(args, "before", 0, 100_000);
  const after = integerFlag(args, "after", 0, 100_000);
  if (tick + after > 4_294_967_295) {
    throw new CliInputError(
      "inspection window exceeds maximum tick 4294967295"
    );
  }
  const startTick = Math.max(0, tick - before);
  const endTick = tick + after;
  const runDirectory = resolve(requiredFlag(args, "run"));
  const evidence = await verifyRunDirectory(runDirectory, false);
  const inWindow = (value: { readonly tick: number }) =>
    value.tick >= startTick && value.tick <= endTick;
  const timeline = evidence.timeline.filter(inWindow);
  const events = timeline
    .filter((record) => record.kind === "event")
    .map((record) => record.event);
  const checkpoints = evidence.replay.checkpoints.filter(inWindow);
  const diagnostics = evidence.diagnostics.filter(inWindow);
  const stateEvidence =
    inWindow(evidence.result.finalState) &&
    checkpoints.some(
      (checkpoint) =>
        checkpoint.tick === evidence.result.finalState.tick &&
        checkpoint.stateChecksum === evidence.result.finalStateChecksum
    )
      ? [
          {
            tick: evidence.result.finalState.tick,
            stateChecksum: evidence.result.finalStateChecksum,
            state: evidence.result.finalState
          }
        ]
      : [];

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      inspected: true,
      runDirectory,
      identity: {
        repositoryRevision: evidence.manifest.repositoryRevision,
        contentManifestHash: evidence.replay.contentManifestHash,
        scenarioId: evidence.replay.scenarioId,
        scenarioHash: evidence.replay.scenarioHash,
        seed: evidence.replay.seed,
        replayIdentityHash: evidence.replayIdentityHash
      },
      window: { tick, before, after, startTick, endTick },
      events,
      checkpoints,
      stateEvidence,
      diagnostics,
      timeline
    })}\n`
  );
}

async function compare(args: ParsedArgs): Promise<void> {
  rejectUnknownFlags(args, new Set(["baseline", "candidate"]));
  const baselineDirectory = resolve(requiredFlag(args, "baseline"));
  const candidateDirectory = resolve(requiredFlag(args, "candidate"));
  const [baseline, candidate] = await Promise.all([
    verifyRunDirectory(baselineDirectory, false),
    verifyRunDirectory(candidateDirectory, false)
  ]);
  const comparison = compareRunEvidence(
    {
      content: baseline.content.bundle,
      scenario: baseline.scenario,
      commands: baseline.result.commands,
      checkpoints: baseline.replay.checkpoints,
      events: baseline.result.events,
      finalState: baseline.result.finalState
    },
    {
      content: candidate.content.bundle,
      scenario: candidate.scenario,
      commands: candidate.result.commands,
      checkpoints: candidate.replay.checkpoints,
      events: candidate.result.events,
      finalState: candidate.result.finalState
    }
  );
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      compared: true,
      baselineDirectory,
      candidateDirectory,
      ...comparison
    })}\n`
  );
}

async function verifyReplayBundle(
  runDirectory: string,
  artifactDirectory: string,
  emitVerification = true
): Promise<VerifiedRunBundle> {
  const actualEntries = (await readdir(artifactDirectory)).sort();
  const expectedEntries = [...runBundleFiles, "manifest.json"].sort();
  requireArtifactMatch(
    actualEntries.length === expectedEntries.length &&
      expectedEntries.every((name, index) => actualEntries[index] === name),
    "bundle_file_set_mismatch",
    "manifest.json",
    "run-bundle directory contains missing or unlisted files"
  );
  const budget = { bytes: 0 };
  const manifestInput = await readArtifactJson(
    artifactDirectory,
    "manifest.json",
    budget
  );
  const replayInput = await readArtifactJson(
    artifactDirectory,
    "replay.json",
    budget
  );
  const contentInput = await readArtifactJson(
    artifactDirectory,
    "content.compiled.json",
    budget
  );
  const contentManifestInput = await readArtifactJson(
    artifactDirectory,
    "content-manifest.json",
    budget
  );
  const scenarioInput = await readArtifactJson(
    artifactDirectory,
    "scenario.compiled.json",
    budget
  );
  const finalStateInput = await readArtifactJson(
    artifactDirectory,
    "state.final.json",
    budget
  );
  const summaryInput = await readArtifactJson(
    artifactDirectory,
    "summary.json",
    budget
  );
  const commandsInput = await readArtifactNdjson(
    artifactDirectory,
    "commands.ndjson",
    budget
  );
  const checkpointsInput = await readArtifactNdjson(
    artifactDirectory,
    "checkpoints.ndjson",
    budget
  );
  const eventsInput = await readArtifactNdjson(
    artifactDirectory,
    "events.ndjson",
    budget
  );
  const timelineInput = await readArtifactNdjson(
    artifactDirectory,
    "timeline.ndjson",
    budget
  );
  const diagnosticsInput = await readArtifactNdjson(
    artifactDirectory,
    "diagnostics.ndjson",
    budget
  );

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

  const content = await validateReplayArtifact("content.compiled.json", () =>
    compileContent(contentInput)
  );
  const scenario = await validateReplayArtifact("scenario.compiled.json", () =>
    compileScenario(scenarioInput, content)
  );
  const compiledReplay = await validateReplayArtifact("replay.json", () =>
    compileReplay(replayInput)
  );
  const replayIdentityHash = await canonicalArtifactHash(
    compiledReplay,
    "replay.json"
  );
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
      "replayIdentityHash",
      "canonical",
      "metadataHash",
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
      manifest.seed === compiledReplay.seed &&
      manifest.replayIdentityHash === replayIdentityHash,
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
  const manifestMetadataEvidence = {
    harnessVersion: manifest.harnessVersion,
    protocolVersions: manifest.protocolVersions,
    runtime: manifest.runtime,
    controller: manifest.controller,
    repositoryRevision: manifest.repositoryRevision,
    repositoryDirty: manifest.repositoryDirty,
    contentManifestHash: manifest.contentManifestHash,
    contentVersion: manifest.contentVersion,
    scenarioId: manifest.scenarioId,
    scenarioHash: manifest.scenarioHash,
    seed: manifest.seed,
    replayIdentityHash: manifest.replayIdentityHash,
    canonical: manifest.canonical
  };
  const [
    expectedManifestMetadataHash,
    protocolHash,
    expectedProtocolHash,
    runtimeHash,
    expectedRuntimeHash,
    controllerHash,
    expectedControllerHash,
    contentDefinitionsHash,
    expectedContentDefinitionsHash
  ] = await Promise.all([
    canonicalArtifactHash(manifestMetadataEvidence, "manifest.json"),
    canonicalArtifactHash(manifest.protocolVersions, "manifest.json"),
    canonicalArtifactHash(
      {
        harness: 2,
        contentSchema: content.bundle.schemaVersion,
        scenarioSchema: scenario.schemaVersion,
        replaySchema: compiledReplay.schemaVersion,
        stateSchema: 1,
        timelineSchema: 1,
        diagnosticSchema: 1
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
    manifest.metadataHash === expectedManifestMetadataHash,
    "manifest_metadata_hash_mismatch",
    "manifest.json",
    `expected metadata hash ${expectedManifestMetadataHash}, received ${String(manifest.metadataHash)}`
  );
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
  const result = await verifyReplay(compiledReplay, scenario, content);
  if (finalStateArtifactHash !== finalCheckpoint.stateChecksum) {
    throw new ReplayArtifactError(
      "state_artifact_checksum_mismatch",
      "state.final.json",
      `expected ${finalCheckpoint.stateChecksum}, received ${finalStateArtifactHash}`,
      firstDifferencePath(result.finalState, finalStateInput) ?? "$"
    );
  }
  if (eventArtifactHash !== finalCheckpoint.eventStreamChecksum) {
    throw new ReplayArtifactError(
      "event_artifact_checksum_mismatch",
      "events.ndjson",
      `expected ${finalCheckpoint.eventStreamChecksum}, received ${eventArtifactHash}`,
      firstDifferencePath(result.events, eventsInput) ?? "$"
    );
  }
  requireArtifactMatch(
    summary.scenarioId === result.scenarioId &&
      summary.scenarioHash === result.scenarioHash &&
      summary.finalStateChecksum === result.finalStateChecksum &&
      summary.eventStreamChecksum === result.eventStreamChecksum &&
      summary.terminalResult === result.terminalResult &&
      summary.terminalTick === result.terminalTick &&
      summary.commandCount === result.commands.length &&
      summary.eventCount === result.events.length,
    "summary_binding_mismatch",
    "summary.json",
    "summary does not match replay terminal evidence"
  );
  const expectedTimeline = createTimelineRecords(result.events, compiledReplay);
  const expectedDiagnostics = createLifecycleDiagnostics(
    result.events,
    result.commands
  );
  const [
    timelineArtifactHash,
    expectedTimelineHash,
    diagnosticArtifactHash,
    expectedDiagnosticHash
  ] = await Promise.all([
    canonicalArtifactHash(timelineInput, "timeline.ndjson"),
    canonicalArtifactHash(expectedTimeline, "timeline.ndjson"),
    canonicalArtifactHash(diagnosticsInput, "diagnostics.ndjson"),
    canonicalArtifactHash(expectedDiagnostics, "diagnostics.ndjson")
  ]);
  if (timelineArtifactHash !== expectedTimelineHash) {
    throw new ReplayArtifactError(
      "timeline_artifact_mismatch",
      "timeline.ndjson",
      `expected ${expectedTimelineHash}, received ${timelineArtifactHash}`,
      firstDifferencePath(expectedTimeline, timelineInput) ?? "$"
    );
  }
  if (diagnosticArtifactHash !== expectedDiagnosticHash) {
    throw new ReplayArtifactError(
      "diagnostic_artifact_mismatch",
      "diagnostics.ndjson",
      `expected ${expectedDiagnosticHash}, received ${diagnosticArtifactHash}`,
      firstDifferencePath(expectedDiagnostics, diagnosticsInput) ?? "$"
    );
  }
  if (emitVerification) {
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
  return {
    result,
    manifest,
    replay: compiledReplay,
    timeline: expectedTimeline,
    diagnostics: expectedDiagnostics,
    replayIdentityHash,
    content,
    scenario
  };
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
    case "inspect":
      await inspect(args);
      break;
    case "compare":
      await compare(args);
      break;
    default:
      throw new CliInputError(
        "Usage: dwarven-depths-sim <validate|run|replay|inspect|compare> [--content <file>] [--scenario <file>] [--out <dir>] [--replace true|false] [--run <bundle> --verify] [--run <bundle> --tick <n> --before <n> --after <n>] [--baseline <bundle> --candidate <bundle>]"
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
            : {
                artifact: error.artifact,
                ...(error.path === undefined ? {} : { path: error.path })
              })
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
