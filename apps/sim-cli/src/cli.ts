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
  type DwarfTargetPolicy,
  type LifecycleDiagnosticRecord,
  type NavigationNodeId,
  type PlacementPointId,
  type ReplayDefinition,
  type TimelineRecord
} from "@dwarven-depths/contracts";
import {
  compareRunEvidence,
  createLifecycleDiagnostics,
  createReplayDefinition,
  createRunExplanation,
  createShuttergateCampaignArtifact,
  createShuttergateCampaignAuthority,
  createTimelineRecords,
  ReplayDivergenceError,
  RuntimeAssertionError,
  RuntimeSafetyStopError,
  renderBattlefieldSvg,
  renderBattlefieldText,
  renderRunExplanationMarkdown,
  restoreShuttergateCampaignArtifact,
  runScenario,
  runShuttergateCampaignTransition,
  runShuttergateSeedPlacementCalibration,
  runShuttergateSeedPlacementControllerBuildCalibration,
  runShuttergateSeedPlacementControllerCalibration,
  type ShuttergateBuildCalibrationEvidence,
  type ShuttergateCalibrationBuildId,
  type ShuttergateCampaignArtifact,
  type ShuttergateReferenceCalibrationEvidence,
  shuttergateCalibrationBuildIds,
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
const shuttergateCampaignScenarioId = "campaign_scenario.shuttergate.v1";
const sweepControllers = Object.freeze({
  "controller.target.nearest.v1": "nearest",
  "controller.target.lowest_health.v1": "lowest_health",
  "controller.target.highest_health.v1": "highest_health",
  "controller.target.highest_armor.v1": "highest_armor",
  "controller.target.fastest.v1": "fastest",
  "controller.target.boss_or_elite_first.v1": "boss_or_elite_first"
} satisfies Readonly<Record<string, DwarfTargetPolicy>>);
const sweepBuilds = Object.freeze(
  Object.fromEntries(
    shuttergateCalibrationBuildIds.map((buildId) => [buildId, buildId])
  ) as Readonly<
    Record<ShuttergateCalibrationBuildId, ShuttergateCalibrationBuildId>
  >
);

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

interface SweepMatrix {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly content: string;
  readonly scenario: string;
  readonly axes: {
    readonly seed: readonly string[];
    readonly placement?: readonly string[];
    readonly controller?: readonly string[];
    readonly build?: readonly string[];
  };
}

interface SweepSampleArtifact {
  readonly index: number;
  readonly seed: string;
  readonly runDirectory?: string;
  readonly scenarioHash?: string;
  readonly terminalResult: string;
  readonly terminalTick: number;
  readonly finalStateChecksum?: string;
  readonly eventStreamChecksum?: string;
  readonly placementPointId?: string;
  readonly controllerId?: string;
  readonly buildId?: string;
  readonly calibrationChecksum?: string;
  readonly calibrationEvidence?:
    | ShuttergateReferenceCalibrationEvidence
    | ShuttergateBuildCalibrationEvidence;
}

interface SweepAggregateArtifact {
  readonly terminalResultCounts: readonly {
    readonly terminalResult: string;
    readonly count: number;
  }[];
  readonly terminalTick: {
    readonly minimum: number;
    readonly maximum: number;
    readonly p50NearestRank: number;
    readonly p90NearestRank: number;
  };
}

interface SweepArtifact {
  readonly schemaVersion: 2 | 3 | 4 | 5;
  readonly complete: true;
  readonly matrixId: string;
  readonly matrixHash: string;
  readonly contentManifestHash: string;
  readonly scenarioHash: string;
  readonly sampleCount: number;
  readonly aggregate: SweepAggregateArtifact;
  readonly samples: readonly SweepSampleArtifact[];
}

interface CampaignScenario {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly content: string;
  readonly attemptCount: number;
  readonly applicationBuild: string;
  readonly writtenAtEpochMs: number;
  readonly profileId: string;
}

interface CampaignManifestArtifact {
  readonly schemaVersion: 1;
  readonly complete: true;
  readonly scenarioId: string;
  readonly scenarioHash: string;
  readonly contentManifestHash: string;
  readonly attemptCount: number;
  readonly campaignPayloadChecksum: string;
}

interface MinimizationArtifactBody {
  readonly schemaVersion: 1;
  readonly complete: true;
  readonly assertionCode: "unexpected_terminal_result";
  readonly expectedTerminalResult: string;
  readonly actualTerminalResult: string;
  readonly contentManifestHash: string;
  readonly sourceScenarioHash: string;
  readonly minimizedScenarioHash: string;
  readonly originalCommandCount: number;
  readonly minimizedCommandCount: number;
  readonly retainedCommandIndexes: readonly number[];
  readonly candidateEvaluationCount: number;
}

interface MinimizationArtifact extends MinimizationArtifactBody {
  readonly artifactChecksum: string;
}

interface SafetyStopMinimizationArtifactBody {
  readonly schemaVersion: 2;
  readonly complete: true;
  readonly assertionCode: "runtime_safety_stop";
  readonly safetyStopCode: "tick_budget_exhausted";
  readonly contentManifestHash: string;
  readonly sourceScenarioHash: string;
  readonly minimizedScenarioHash: string;
  readonly originalCommandCount: number;
  readonly minimizedCommandCount: number;
  readonly retainedCommandIndexes: readonly number[];
  readonly candidateEvaluationCount: number;
}

interface SafetyStopMinimizationArtifact
  extends SafetyStopMinimizationArtifactBody {
  readonly artifactChecksum: string;
}

interface StalledMinimizationArtifactBody {
  readonly schemaVersion: 6;
  readonly complete: true;
  readonly assertionCode: "runtime_safety_stop";
  readonly safetyStopCode: "simulation_stalled";
  readonly stalledTick: number;
  readonly contentManifestHash: string;
  readonly sourceScenarioHash: string;
  readonly minimizedScenarioHash: string;
  readonly originalCommandCount: number;
  readonly minimizedCommandCount: number;
  readonly retainedCommandIndexes: readonly number[];
  readonly candidateEvaluationCount: number;
  readonly originalMaximumTicks: number;
  readonly minimizedMaximumTicks: number;
}

interface StalledMinimizationArtifact extends StalledMinimizationArtifactBody {
  readonly artifactChecksum: string;
}

interface ReplayMinimizationArtifactBody {
  readonly schemaVersion: 3 | 4 | 5 | 7 | 8;
  readonly complete: true;
  readonly assertionCode: "replay_divergence";
  readonly divergenceCode:
    | "state_checksum_mismatch"
    | "event_stream_checksum_mismatch"
    | "terminal_result_mismatch"
    | "terminal_tick_mismatch"
    | "execution_failed";
  readonly checkpointTick: number;
  readonly divergenceExpected?: string | number;
  readonly divergenceActual?: string | number;
  readonly contentManifestHash: string;
  readonly sourceScenarioHash: string;
  readonly minimizedScenarioHash: string;
  readonly sourceReplayHash: string;
  readonly minimizedReplayHash: string;
  readonly originalCommandCount: number;
  readonly minimizedCommandCount: number;
  readonly retainedCommandIndexes: readonly number[];
  readonly candidateEvaluationCount: number;
  readonly originalMaximumTicks?: number;
  readonly minimizedMaximumTicks?: number;
}

interface ReplayMinimizationArtifact extends ReplayMinimizationArtifactBody {
  readonly artifactChecksum: string;
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

async function publishDirectory(
  outputDirectory: string,
  replace: boolean,
  writeBundle: (stagingDirectory: string) => Promise<void>,
  validateExisting: (
    directory: string
  ) => Promise<void> = assertReplaceableRunBundle
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
      await validateExisting(outputDirectory);
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
        await validateExisting(previousBundle);
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

function requireSweepRecord(
  value: unknown,
  path: string
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CliInputError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireSweepKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  path: string
): void {
  const actual = Object.keys(value);
  const unknown = actual.find((key) => !keys.includes(key));
  const missing = keys.find((key) => !actual.includes(key));
  if (unknown !== undefined)
    throw new CliInputError(`${path} contains unknown property ${unknown}`);
  if (missing !== undefined)
    throw new CliInputError(`${path} is missing required property ${missing}`);
}

function parseSweepMatrix(value: unknown): SweepMatrix {
  const matrix = requireSweepRecord(value, "sweep matrix");
  requireSweepKeys(
    matrix,
    ["schemaVersion", "id", "content", "scenario", "axes"],
    "sweep matrix"
  );
  if (matrix["schemaVersion"] !== 1)
    throw new CliInputError("sweep matrix schemaVersion must equal 1");
  if (
    typeof matrix["id"] !== "string" ||
    !/^matrix\.[a-z0-9][a-z0-9._-]{0,126}$/.test(matrix["id"])
  ) {
    throw new CliInputError("sweep matrix id must be a stable matrix.* ID");
  }
  for (const property of ["content", "scenario"] as const) {
    const path = matrix[property];
    if (
      typeof path !== "string" ||
      path.length === 0 ||
      path.length > 1024 ||
      isAbsolute(path)
    ) {
      throw new CliInputError(
        `sweep matrix ${property} must be a nonempty relative path`
      );
    }
  }
  const axes = requireSweepRecord(matrix["axes"], "sweep matrix axes");
  if (axes["controller"] !== undefined && axes["placement"] === undefined) {
    throw new CliInputError(
      "sweep matrix axes.controller requires the authoritative placement axis"
    );
  }
  if (axes["build"] !== undefined && axes["controller"] === undefined) {
    throw new CliInputError(
      "sweep matrix axes.build requires the authoritative controller axis"
    );
  }
  requireSweepKeys(
    axes,
    [
      "seed",
      ...(axes["placement"] === undefined ? [] : ["placement"]),
      ...(axes["controller"] === undefined ? [] : ["controller"]),
      ...(axes["build"] === undefined ? [] : ["build"])
    ],
    "sweep matrix axes"
  );
  if (!Array.isArray(axes["seed"]) || axes["seed"].length === 0) {
    throw new CliInputError("sweep matrix axes.seed must be a nonempty array");
  }
  if (axes["seed"].length > 64)
    throw new CliInputError(
      "sweep matrix axes.seed must not exceed 64 samples"
    );
  const seeds: string[] = [];
  const uniqueSeeds = new Set<string>();
  for (const [index, seed] of axes["seed"].entries()) {
    if (
      typeof seed !== "string" ||
      !/^[1-9]\d{0,9}$/.test(seed) ||
      BigInt(seed) > 0xffff_ffffn
    ) {
      throw new CliInputError(
        `sweep matrix axes.seed[${index}] must be a canonical uint32 string`
      );
    }
    if (uniqueSeeds.has(seed))
      throw new CliInputError(
        `sweep matrix axes.seed contains duplicate ${seed}`
      );
    uniqueSeeds.add(seed);
    seeds.push(seed);
  }
  let placements: string[] | undefined;
  if (axes["placement"] !== undefined) {
    if (!Array.isArray(axes["placement"]) || axes["placement"].length === 0) {
      throw new CliInputError(
        "sweep matrix axes.placement must be a nonempty array"
      );
    }
    placements = [];
    const uniquePlacements = new Set<string>();
    for (const [index, placement] of axes["placement"].entries()) {
      if (
        typeof placement !== "string" ||
        !/^placement\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(placement)
      ) {
        throw new CliInputError(
          `sweep matrix axes.placement[${index}] must be a stable placement.* ID`
        );
      }
      if (uniquePlacements.has(placement)) {
        throw new CliInputError(
          `sweep matrix axes.placement contains duplicate ${placement}`
        );
      }
      uniquePlacements.add(placement);
      placements.push(placement);
    }
    if (seeds.length * placements.length > 64) {
      throw new CliInputError(
        "sweep matrix seed × placement product must not exceed 64 samples"
      );
    }
  }
  let controllers: string[] | undefined;
  if (axes["controller"] !== undefined) {
    if (!Array.isArray(axes["controller"]) || axes["controller"].length === 0) {
      throw new CliInputError(
        "sweep matrix axes.controller must be a nonempty array"
      );
    }
    controllers = [];
    const uniqueControllers = new Set<string>();
    for (const [index, controller] of axes["controller"].entries()) {
      if (
        typeof controller !== "string" ||
        !Object.hasOwn(sweepControllers, controller)
      ) {
        throw new CliInputError(
          `sweep matrix axes.controller[${index}] must be a supported versioned controller ID`
        );
      }
      if (uniqueControllers.has(controller)) {
        throw new CliInputError(
          `sweep matrix axes.controller contains duplicate ${controller}`
        );
      }
      uniqueControllers.add(controller);
      controllers.push(controller);
    }
    if (seeds.length * (placements?.length ?? 0) * controllers.length > 64) {
      throw new CliInputError(
        "sweep matrix seed × placement × controller product must not exceed 64 samples"
      );
    }
  }
  let builds: string[] | undefined;
  if (axes["build"] !== undefined) {
    if (!Array.isArray(axes["build"]) || axes["build"].length === 0) {
      throw new CliInputError(
        "sweep matrix axes.build must be a nonempty array"
      );
    }
    builds = [];
    const uniqueBuilds = new Set<string>();
    for (const [index, build] of axes["build"].entries()) {
      if (typeof build !== "string" || !Object.hasOwn(sweepBuilds, build)) {
        throw new CliInputError(
          `sweep matrix axes.build[${index}] must be a supported versioned build ID`
        );
      }
      if (uniqueBuilds.has(build)) {
        throw new CliInputError(
          `sweep matrix axes.build contains duplicate ${build}`
        );
      }
      uniqueBuilds.add(build);
      builds.push(build);
    }
    if (
      seeds.length *
        (placements?.length ?? 0) *
        (controllers?.length ?? 0) *
        builds.length >
      64
    ) {
      throw new CliInputError(
        "sweep matrix seed × placement × controller × build product must not exceed 64 samples"
      );
    }
  }
  return {
    schemaVersion: 1,
    id: matrix["id"],
    content: matrix["content"] as string,
    scenario: matrix["scenario"] as string,
    axes:
      placements === undefined
        ? { seed: seeds }
        : controllers === undefined
          ? { seed: seeds, placement: placements }
          : builds === undefined
            ? { seed: seeds, placement: placements, controller: controllers }
            : {
                seed: seeds,
                placement: placements,
                controller: controllers,
                build: builds
              }
  };
}

function parseCampaignScenario(value: unknown): CampaignScenario {
  const scenario = requireSweepRecord(value, "campaign scenario");
  requireSweepKeys(
    scenario,
    [
      "schemaVersion",
      "id",
      "content",
      "attemptCount",
      "applicationBuild",
      "writtenAtEpochMs",
      "profileId"
    ],
    "campaign scenario"
  );
  if (scenario["schemaVersion"] !== 1)
    throw new CliInputError("campaign scenario schemaVersion must equal 1");
  if (scenario["id"] !== shuttergateCampaignScenarioId) {
    throw new CliInputError(
      `campaign scenario id must equal ${shuttergateCampaignScenarioId}`
    );
  }
  if (
    typeof scenario["content"] !== "string" ||
    scenario["content"].length === 0 ||
    scenario["content"].length > 1024 ||
    isAbsolute(scenario["content"])
  ) {
    throw new CliInputError(
      "campaign scenario content must be a nonempty relative path"
    );
  }
  if (
    !Number.isSafeInteger(scenario["attemptCount"]) ||
    (scenario["attemptCount"] as number) < 1 ||
    (scenario["attemptCount"] as number) > 64
  ) {
    throw new CliInputError(
      "campaign scenario attemptCount must be an integer from 1 through 64"
    );
  }
  if (
    typeof scenario["applicationBuild"] !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/.test(scenario["applicationBuild"])
  ) {
    throw new CliInputError(
      "campaign scenario applicationBuild must use 1–128 portable version characters"
    );
  }
  if (
    !Number.isSafeInteger(scenario["writtenAtEpochMs"]) ||
    (scenario["writtenAtEpochMs"] as number) < 0
  ) {
    throw new CliInputError(
      "campaign scenario writtenAtEpochMs must be a nonnegative safe integer"
    );
  }
  if (
    typeof scenario["profileId"] !== "string" ||
    !/^profile\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(
      scenario["profileId"]
    )
  ) {
    throw new CliInputError(
      "campaign scenario profileId must be a stable profile.* ID"
    );
  }
  return {
    schemaVersion: 1,
    id: shuttergateCampaignScenarioId,
    content: scenario["content"],
    attemptCount: scenario["attemptCount"] as number,
    applicationBuild: scenario["applicationBuild"],
    writtenAtEpochMs: scenario["writtenAtEpochMs"] as number,
    profileId: scenario["profileId"]
  };
}

function resolveMatrixInput(matrixDirectory: string, path: string): string {
  return resolve(matrixDirectory, path);
}

function expandSweepAxes(matrix: SweepMatrix): readonly {
  readonly seed: string;
  readonly placementPointId?: string;
  readonly controllerId?: string;
  readonly buildId?: string;
}[] {
  const placements = matrix.axes.placement;
  if (placements === undefined) {
    return matrix.axes.seed.map((seed) => ({ seed }));
  }
  const controllers = matrix.axes.controller;
  const builds = matrix.axes.build;
  return matrix.axes.seed.flatMap((seed) =>
    placements.flatMap((placementPointId) =>
      controllers === undefined
        ? [{ seed, placementPointId }]
        : controllers.flatMap((controllerId) =>
            builds === undefined
              ? [{ seed, placementPointId, controllerId }]
              : builds.map((buildId) => ({
                  seed,
                  placementPointId,
                  controllerId,
                  buildId
                }))
          )
    )
  );
}

function deriveSweepAggregate(
  samples: readonly Pick<
    SweepSampleArtifact,
    "terminalResult" | "terminalTick"
  >[]
): SweepAggregateArtifact {
  if (samples.length === 0) {
    throw new Error("cannot aggregate an empty sweep");
  }
  const counts = new Map<string, number>();
  const terminalTicks: number[] = [];
  for (const sample of samples) {
    counts.set(
      sample.terminalResult,
      (counts.get(sample.terminalResult) ?? 0) + 1
    );
    terminalTicks.push(sample.terminalTick);
  }
  terminalTicks.sort((left, right) => left - right);
  const nearestRank = (percent: number): number => {
    const index = Math.ceil((terminalTicks.length * percent) / 100) - 1;
    const value = terminalTicks[index];
    if (value === undefined) throw new Error("missing sweep percentile value");
    return value;
  };
  const minimum = terminalTicks[0];
  const maximum = terminalTicks.at(-1);
  if (minimum === undefined || maximum === undefined) {
    throw new Error("missing sweep terminal-tick boundary");
  }
  return {
    terminalResultCounts: [...counts.entries()]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([terminalResult, count]) => ({ terminalResult, count })),
    terminalTick: {
      minimum,
      maximum,
      p50NearestRank: nearestRank(50),
      p90NearestRank: nearestRank(90)
    }
  };
}

async function validate(args: ParsedArgs): Promise<void> {
  rejectUnknownFlags(args, new Set(["content", "scenario"]));
  const { content, scenario } = await load(args);
  process.stdout.write(
    `${JSON.stringify({ ok: true, contentManifestHash: content.manifestHash, scenarioId: scenario.id })}\n`
  );
}

async function executeAndPublishRun(
  content: Awaited<ReturnType<typeof compileContent>>,
  scenario: ReturnType<typeof compileScenario>,
  outputDirectory: string,
  replace: boolean,
  providedProvenance?: Awaited<ReturnType<typeof collectProvenance>>
) {
  const [result, provenance] = await Promise.all([
    runScenario(scenario, content),
    providedProvenance === undefined
      ? collectProvenance()
      : Promise.resolve(providedProvenance)
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
    await publishDirectory(
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

  return summary;
}

async function run(args: ParsedArgs): Promise<void> {
  rejectUnknownFlags(args, new Set(["content", "scenario", "out", "replace"]));
  const replace = booleanFlag(args, "replace");
  const { content, scenario } = await load(args);
  const outputDirectory = resolve(
    args.flags.get("out") ?? `.ddh/runs/${scenario.id}`
  );
  const summary = await executeAndPublishRun(
    content,
    scenario,
    outputDirectory,
    replace
  );
  process.stdout.write(
    `${JSON.stringify({ ok: true, outputDirectory, ...summary })}\n`
  );
}

function scenarioWithoutExpectation(
  scenario: ReturnType<typeof compileScenario>,
  content: Awaited<ReturnType<typeof compileContent>>,
  retainedCommandIndexes: readonly number[],
  maximumTicks = scenario.maximumTicks
): ReturnType<typeof compileScenario> {
  const { expectedTerminalResult: _expectedTerminalResult, ...input } =
    scenario;
  return compileScenario(
    {
      ...input,
      maximumTicks,
      commands: retainedCommandIndexes.map((index) => scenario.commands[index])
    },
    content
  );
}

async function reproducesTerminalAssertion(
  scenario: ReturnType<typeof compileScenario>,
  content: Awaited<ReturnType<typeof compileContent>>,
  retainedCommandIndexes: readonly number[],
  actualTerminalResult: string
): Promise<boolean> {
  try {
    const candidate = scenarioWithoutExpectation(
      scenario,
      content,
      retainedCommandIndexes
    );
    return (
      (await runScenario(candidate, content)).terminalResult ===
      actualTerminalResult
    );
  } catch (error) {
    if (error instanceof RuntimeSafetyStopError) return false;
    throw error;
  }
}

async function reproducesTerminalAssertionAtTickBudget(
  scenario: ReturnType<typeof compileScenario>,
  content: Awaited<ReturnType<typeof compileContent>>,
  retainedCommandIndexes: readonly number[],
  actualTerminalResult: string,
  maximumTicks: number
): Promise<boolean> {
  try {
    const candidate = scenarioWithoutExpectation(
      scenario,
      content,
      retainedCommandIndexes,
      maximumTicks
    );
    return (
      (await runScenario(candidate, content)).terminalResult ===
      actualTerminalResult
    );
  } catch (error) {
    if (
      error instanceof RuntimeSafetyStopError ||
      error instanceof ContentValidationError
    ) {
      return false;
    }
    throw error;
  }
}

async function deriveTerminalAssertionMinimization(
  scenario: ReturnType<typeof compileScenario>,
  content: Awaited<ReturnType<typeof compileContent>>,
  actualTerminalResult: string
): Promise<{
  readonly retainedCommandIndexes: readonly number[];
  readonly minimumTicks: number;
  readonly candidateEvaluationCount: number;
}> {
  let retainedCommandIndexes = scenario.commands.map((_, index) => index);
  let candidateEvaluationCount = 0;
  let changed: boolean;
  do {
    changed = false;
    for (
      let position = retainedCommandIndexes.length - 1;
      position >= 0;
      position -= 1
    ) {
      const candidate = retainedCommandIndexes.filter(
        (_, candidatePosition) => candidatePosition !== position
      );
      candidateEvaluationCount += 1;
      if (
        await reproducesTerminalAssertion(
          scenario,
          content,
          candidate,
          actualTerminalResult
        )
      ) {
        retainedCommandIndexes = candidate;
        changed = true;
      }
    }
  } while (changed);

  let minimumTicks = 1;
  let maximumTicks = scenario.maximumTicks;
  while (minimumTicks < maximumTicks) {
    const candidateTicks = Math.floor((minimumTicks + maximumTicks) / 2);
    candidateEvaluationCount += 1;
    if (
      await reproducesTerminalAssertionAtTickBudget(
        scenario,
        content,
        retainedCommandIndexes,
        actualTerminalResult,
        candidateTicks
      )
    ) {
      maximumTicks = candidateTicks;
    } else {
      minimumTicks = candidateTicks + 1;
    }
  }
  return {
    retainedCommandIndexes,
    minimumTicks,
    candidateEvaluationCount
  };
}

async function reproducesSafetyStop(
  scenario: ReturnType<typeof compileScenario>,
  content: Awaited<ReturnType<typeof compileContent>>,
  retainedCommandIndexes: readonly number[],
  maximumTicks = scenario.maximumTicks
): Promise<boolean> {
  try {
    await runScenario(
      scenarioWithoutExpectation(
        scenario,
        content,
        retainedCommandIndexes,
        maximumTicks
      ),
      content
    );
    return false;
  } catch (error) {
    if (error instanceof RuntimeSafetyStopError) {
      return error.code === "tick_budget_exhausted";
    }
    if (error instanceof ContentValidationError) return false;
    throw error;
  }
}

async function deriveSafetyStopMinimization(
  scenario: ReturnType<typeof compileScenario>,
  content: Awaited<ReturnType<typeof compileContent>>
): Promise<{
  readonly retainedCommandIndexes: readonly number[];
  readonly minimumTicks: number;
  readonly candidateEvaluationCount: number;
}> {
  let retainedCommandIndexes = scenario.commands.map((_, index) => index);
  let candidateEvaluationCount = 0;
  let changed: boolean;
  do {
    changed = false;
    for (
      let position = retainedCommandIndexes.length - 1;
      position >= 0;
      position -= 1
    ) {
      const candidate = retainedCommandIndexes.filter(
        (_, candidatePosition) => candidatePosition !== position
      );
      candidateEvaluationCount += 1;
      if (await reproducesSafetyStop(scenario, content, candidate)) {
        retainedCommandIndexes = candidate;
        changed = true;
      }
    }
  } while (changed);

  let minimumTicks = 1;
  let maximumTicks = scenario.maximumTicks;
  while (minimumTicks < maximumTicks) {
    const candidateTicks = Math.floor((minimumTicks + maximumTicks) / 2);
    candidateEvaluationCount += 1;
    if (
      await reproducesSafetyStop(
        scenario,
        content,
        retainedCommandIndexes,
        candidateTicks
      )
    ) {
      maximumTicks = candidateTicks;
    } else {
      minimumTicks = candidateTicks + 1;
    }
  }
  return {
    retainedCommandIndexes,
    minimumTicks,
    candidateEvaluationCount
  };
}

async function reproducesSimulationStall(
  scenario: ReturnType<typeof compileScenario>,
  content: Awaited<ReturnType<typeof compileContent>>,
  retainedCommandIndexes: readonly number[],
  stalledTick: number,
  maximumTicks = scenario.maximumTicks
): Promise<boolean> {
  try {
    await runScenario(
      scenarioWithoutExpectation(
        scenario,
        content,
        retainedCommandIndexes,
        maximumTicks
      ),
      content
    );
    return false;
  } catch (error) {
    if (error instanceof RuntimeSafetyStopError) {
      return error.code === "simulation_stalled" && error.tick === stalledTick;
    }
    if (error instanceof ContentValidationError) return false;
    throw error;
  }
}

async function deriveSimulationStallMinimization(
  scenario: ReturnType<typeof compileScenario>,
  content: Awaited<ReturnType<typeof compileContent>>,
  stalledTick: number
): Promise<{
  readonly retainedCommandIndexes: readonly number[];
  readonly minimumTicks: number;
  readonly candidateEvaluationCount: number;
}> {
  let retainedCommandIndexes = scenario.commands.map((_, index) => index);
  let candidateEvaluationCount = 0;
  let changed: boolean;
  do {
    changed = false;
    for (
      let position = retainedCommandIndexes.length - 1;
      position >= 0;
      position -= 1
    ) {
      const candidate = retainedCommandIndexes.filter(
        (_, candidatePosition) => candidatePosition !== position
      );
      candidateEvaluationCount += 1;
      if (
        await reproducesSimulationStall(
          scenario,
          content,
          candidate,
          stalledTick
        )
      ) {
        retainedCommandIndexes = candidate;
        changed = true;
      }
    }
  } while (changed);

  let minimumTicks = 1;
  let maximumTicks = scenario.maximumTicks;
  while (minimumTicks < maximumTicks) {
    const candidateTicks = Math.floor((minimumTicks + maximumTicks) / 2);
    candidateEvaluationCount += 1;
    if (
      await reproducesSimulationStall(
        scenario,
        content,
        retainedCommandIndexes,
        stalledTick,
        candidateTicks
      )
    ) {
      maximumTicks = candidateTicks;
    } else {
      minimumTicks = candidateTicks + 1;
    }
  }
  return { retainedCommandIndexes, minimumTicks, candidateEvaluationCount };
}

type MinimizedReplayDivergence = {
  readonly code:
    | "state_checksum_mismatch"
    | "event_stream_checksum_mismatch"
    | "terminal_result_mismatch"
    | "terminal_tick_mismatch"
    | "execution_failed";
  readonly checkpointTick: number;
  readonly expected?: string | number;
  readonly actual?: string | number;
};

function acceptedReplayDivergence(
  error: unknown
): MinimizedReplayDivergence | undefined {
  return error instanceof ReplayDivergenceError &&
    (error.code === "state_checksum_mismatch" ||
      error.code === "event_stream_checksum_mismatch" ||
      error.code === "terminal_result_mismatch" ||
      error.code === "terminal_tick_mismatch" ||
      error.code === "execution_failed") &&
    error.checkpointTick !== undefined
    ? {
        code: error.code,
        checkpointTick: error.checkpointTick,
        expected: error.expected,
        actual: error.actual
      }
    : undefined;
}

async function replayCandidate(
  sourceScenario: ReturnType<typeof compileScenario>,
  sourceReplay: ReplayDefinition,
  content: Awaited<ReturnType<typeof compileContent>>,
  retainedCommandIndexes: readonly number[],
  maximumTicks = sourceScenario.maximumTicks
): Promise<{
  readonly scenario: ReturnType<typeof compileScenario>;
  readonly replay: ReplayDefinition;
}> {
  const scenario = compileScenario(
    {
      ...sourceScenario,
      maximumTicks,
      commands: retainedCommandIndexes.map(
        (index) => sourceScenario.commands[index]
      )
    },
    content
  );
  const replay = compileReplay({
    ...sourceReplay,
    scenarioHash: await canonicalHash(scenario),
    commands: scenario.commands.map((command, sequence) => ({
      tick: command.atTick,
      sequence,
      command
    }))
  });
  return { scenario, replay };
}

async function reproducesReplayDivergence(
  sourceScenario: ReturnType<typeof compileScenario>,
  sourceReplay: ReplayDefinition,
  content: Awaited<ReturnType<typeof compileContent>>,
  retainedCommandIndexes: readonly number[],
  expected: MinimizedReplayDivergence,
  maximumTicks = sourceScenario.maximumTicks
): Promise<boolean> {
  try {
    const candidate = await replayCandidate(
      sourceScenario,
      sourceReplay,
      content,
      retainedCommandIndexes,
      maximumTicks
    );
    await verifyReplay(candidate.replay, candidate.scenario, content);
    return false;
  } catch (error) {
    if (error instanceof ContentValidationError) return false;
    const divergence = acceptedReplayDivergence(error);
    return (
      divergence?.code === expected.code &&
      divergence.checkpointTick === expected.checkpointTick &&
      (expected.expected === undefined ||
        divergence.expected === expected.expected) &&
      (expected.actual === undefined || divergence.actual === expected.actual)
    );
  }
}

async function deriveReplayMinimization(
  scenario: ReturnType<typeof compileScenario>,
  replay: ReplayDefinition,
  content: Awaited<ReturnType<typeof compileContent>>,
  divergence: MinimizedReplayDivergence,
  minimizeTicks = false
): Promise<{
  readonly retainedCommandIndexes: readonly number[];
  readonly minimumTicks: number;
  readonly candidateEvaluationCount: number;
}> {
  let retainedCommandIndexes = scenario.commands.map((_, index) => index);
  let candidateEvaluationCount = 0;
  let changed: boolean;
  do {
    changed = false;
    for (
      let position = retainedCommandIndexes.length - 1;
      position >= 0;
      position -= 1
    ) {
      const candidate = retainedCommandIndexes.filter(
        (_, candidatePosition) => candidatePosition !== position
      );
      candidateEvaluationCount += 1;
      if (
        await reproducesReplayDivergence(
          scenario,
          replay,
          content,
          candidate,
          divergence
        )
      ) {
        retainedCommandIndexes = candidate;
        changed = true;
      }
    }
  } while (changed);
  let minimumTicks = scenario.maximumTicks;
  if (minimizeTicks) {
    let lowerBound = 1;
    let upperBound = scenario.maximumTicks;
    while (lowerBound < upperBound) {
      const candidateTicks = Math.floor((lowerBound + upperBound) / 2);
      candidateEvaluationCount += 1;
      if (
        await reproducesReplayDivergence(
          scenario,
          replay,
          content,
          retainedCommandIndexes,
          divergence,
          candidateTicks
        )
      ) {
        upperBound = candidateTicks;
      } else {
        lowerBound = candidateTicks + 1;
      }
    }
    minimumTicks = lowerBound;
  }
  return { retainedCommandIndexes, minimumTicks, candidateEvaluationCount };
}

async function assertReplayMinimization(
  artifact: ReplayMinimizationArtifact,
  sourceScenario: ReturnType<typeof compileScenario>,
  minimizedScenario: ReturnType<typeof compileScenario>,
  sourceReplay: ReplayDefinition,
  minimizedReplay: ReplayDefinition,
  content: Awaited<ReturnType<typeof compileContent>>
): Promise<void> {
  requireExactKeys(
    artifact,
    [
      "schemaVersion",
      "complete",
      "assertionCode",
      "divergenceCode",
      "checkpointTick",
      ...(artifact.schemaVersion === 5 ||
      artifact.schemaVersion === 7 ||
      artifact.schemaVersion === 8
        ? ["divergenceExpected", "divergenceActual"]
        : []),
      "contentManifestHash",
      "sourceScenarioHash",
      "minimizedScenarioHash",
      "sourceReplayHash",
      "minimizedReplayHash",
      "originalCommandCount",
      "minimizedCommandCount",
      "retainedCommandIndexes",
      "candidateEvaluationCount",
      ...(artifact.schemaVersion === 4 || artifact.schemaVersion === 8
        ? ["originalMaximumTicks", "minimizedMaximumTicks"]
        : []),
      "artifactChecksum"
    ],
    "minimization.json"
  );
  const { artifactChecksum, ...artifactBody } = artifact;
  const indexes = artifact.retainedCommandIndexes;
  const validIndexes =
    Array.isArray(indexes) &&
    indexes.every(
      (index, position) =>
        Number.isSafeInteger(index) &&
        index >= 0 &&
        index < sourceScenario.commands.length &&
        (position === 0 || index > (indexes[position - 1] as number))
    );
  if (
    (artifact.schemaVersion !== 3 &&
      artifact.schemaVersion !== 4 &&
      artifact.schemaVersion !== 5 &&
      artifact.schemaVersion !== 7 &&
      artifact.schemaVersion !== 8) ||
    artifact.complete !== true ||
    artifact.assertionCode !== "replay_divergence" ||
    (artifact.schemaVersion === 7
      ? artifact.divergenceCode !== "execution_failed"
      : artifact.schemaVersion === 8
        ? artifact.divergenceCode !== "terminal_result_mismatch" &&
          artifact.divergenceCode !== "terminal_tick_mismatch" &&
          artifact.divergenceCode !== "execution_failed"
        : artifact.schemaVersion === 5
          ? artifact.divergenceCode !== "terminal_result_mismatch" &&
            artifact.divergenceCode !== "terminal_tick_mismatch"
          : artifact.divergenceCode !== "state_checksum_mismatch" &&
            artifact.divergenceCode !== "event_stream_checksum_mismatch") ||
    !Number.isSafeInteger(artifact.checkpointTick) ||
    artifact.checkpointTick < 0 ||
    ((artifact.schemaVersion === 5 ||
      artifact.schemaVersion === 7 ||
      artifact.schemaVersion === 8) &&
      ((typeof artifact.divergenceExpected !== "string" &&
        typeof artifact.divergenceExpected !== "number") ||
        (typeof artifact.divergenceActual !== "string" &&
          typeof artifact.divergenceActual !== "number") ||
        artifact.divergenceExpected === artifact.divergenceActual)) ||
    artifact.contentManifestHash !== content.manifestHash ||
    artifact.sourceScenarioHash !== (await canonicalHash(sourceScenario)) ||
    artifact.minimizedScenarioHash !==
      (await canonicalHash(minimizedScenario)) ||
    artifact.sourceReplayHash !== (await canonicalHash(sourceReplay)) ||
    artifact.minimizedReplayHash !== (await canonicalHash(minimizedReplay)) ||
    artifact.originalCommandCount !== sourceScenario.commands.length ||
    artifact.minimizedCommandCount !== minimizedScenario.commands.length ||
    artifact.minimizedCommandCount !== indexes.length ||
    ((artifact.schemaVersion === 4 || artifact.schemaVersion === 8) &&
      (artifact.originalMaximumTicks !== sourceScenario.maximumTicks ||
        artifact.minimizedMaximumTicks !== minimizedScenario.maximumTicks ||
        !Number.isSafeInteger(artifact.minimizedMaximumTicks) ||
        (artifact.minimizedMaximumTicks as number) < 1 ||
        (artifact.minimizedMaximumTicks as number) >
          sourceScenario.maximumTicks)) ||
    ((artifact.schemaVersion === 3 ||
      artifact.schemaVersion === 5 ||
      artifact.schemaVersion === 7) &&
      minimizedScenario.maximumTicks !== sourceScenario.maximumTicks) ||
    !validIndexes ||
    !Number.isSafeInteger(artifact.candidateEvaluationCount) ||
    artifact.candidateEvaluationCount < sourceScenario.commands.length ||
    typeof artifactChecksum !== "string" ||
    !/^[a-f0-9]{64}$/.test(artifactChecksum) ||
    artifactChecksum !==
      (await canonicalArtifactHash(artifactBody, "minimization.json"))
  ) {
    throw new Error(
      "minimization.json contains invalid or unbound replay evidence"
    );
  }

  const expected: MinimizedReplayDivergence = {
    code: artifact.divergenceCode,
    checkpointTick: artifact.checkpointTick,
    ...(artifact.schemaVersion === 5 ||
    artifact.schemaVersion === 7 ||
    artifact.schemaVersion === 8
      ? {
          expected: artifact.divergenceExpected,
          actual: artifact.divergenceActual
        }
      : {})
  };
  const sourceIndexes = sourceScenario.commands.map((_, index) => index);
  if (
    !(await reproducesReplayDivergence(
      sourceScenario,
      sourceReplay,
      content,
      sourceIndexes,
      expected
    ))
  ) {
    throw new Error("source replay no longer reproduces its bound divergence");
  }
  const derived = await deriveReplayMinimization(
    sourceScenario,
    sourceReplay,
    content,
    expected,
    artifact.schemaVersion === 4 || artifact.schemaVersion === 8
  );
  const candidate = await replayCandidate(
    sourceScenario,
    sourceReplay,
    content,
    indexes,
    minimizedScenario.maximumTicks
  );
  if (
    firstDifferencePath(derived.retainedCommandIndexes, indexes) !==
      undefined ||
    derived.candidateEvaluationCount !== artifact.candidateEvaluationCount ||
    derived.minimumTicks !== minimizedScenario.maximumTicks ||
    firstDifferencePath(candidate.scenario, minimizedScenario) !== undefined ||
    firstDifferencePath(candidate.replay, minimizedReplay) !== undefined
  ) {
    throw new Error(
      "replay minimization evidence does not match deterministic source reduction"
    );
  }
  for (let index = 0; index < indexes.length; index += 1) {
    const retained = indexes.filter((_, position) => position !== index);
    if (
      await reproducesReplayDivergence(
        sourceScenario,
        sourceReplay,
        content,
        retained,
        expected
      )
    ) {
      throw new Error("minimized replay is not command-deletion 1-minimal");
    }
  }
  if (
    (artifact.schemaVersion === 4 || artifact.schemaVersion === 8) &&
    minimizedScenario.maximumTicks > 1 &&
    (await reproducesReplayDivergence(
      sourceScenario,
      sourceReplay,
      content,
      indexes,
      expected,
      minimizedScenario.maximumTicks - 1
    ))
  ) {
    throw new Error("minimized replay does not have a minimal tick budget");
  }
}

async function assertSafetyStopMinimization(
  artifact: SafetyStopMinimizationArtifact,
  sourceScenario: ReturnType<typeof compileScenario>,
  minimizedScenario: ReturnType<typeof compileScenario>,
  content: Awaited<ReturnType<typeof compileContent>>
): Promise<void> {
  requireExactKeys(
    artifact,
    [
      "schemaVersion",
      "complete",
      "assertionCode",
      "safetyStopCode",
      "contentManifestHash",
      "sourceScenarioHash",
      "minimizedScenarioHash",
      "originalCommandCount",
      "minimizedCommandCount",
      "retainedCommandIndexes",
      "candidateEvaluationCount",
      "artifactChecksum"
    ],
    "minimization.json"
  );
  const { artifactChecksum, ...artifactBody } = artifact;
  const indexes = artifact.retainedCommandIndexes;
  const validIndexes =
    Array.isArray(indexes) &&
    indexes.every(
      (index, position) =>
        Number.isSafeInteger(index) &&
        index >= 0 &&
        index < sourceScenario.commands.length &&
        (position === 0 || index > (indexes[position - 1] as number))
    );
  if (
    artifact.schemaVersion !== 2 ||
    artifact.complete !== true ||
    artifact.assertionCode !== "runtime_safety_stop" ||
    artifact.safetyStopCode !== "tick_budget_exhausted" ||
    sourceScenario.expectedTerminalResult !== undefined ||
    minimizedScenario.expectedTerminalResult !== undefined ||
    artifact.contentManifestHash !== content.manifestHash ||
    artifact.sourceScenarioHash !== (await canonicalHash(sourceScenario)) ||
    artifact.minimizedScenarioHash !==
      (await canonicalHash(minimizedScenario)) ||
    artifact.originalCommandCount !== sourceScenario.commands.length ||
    artifact.minimizedCommandCount !== minimizedScenario.commands.length ||
    artifact.minimizedCommandCount !== indexes.length ||
    !validIndexes ||
    firstDifferencePath(minimizedScenario, {
      ...sourceScenario,
      maximumTicks: minimizedScenario.maximumTicks,
      commands: indexes.map((index) => sourceScenario.commands[index])
    }) !== undefined ||
    minimizedScenario.maximumTicks > sourceScenario.maximumTicks ||
    !Number.isSafeInteger(artifact.candidateEvaluationCount) ||
    artifact.candidateEvaluationCount < sourceScenario.commands.length ||
    typeof artifactChecksum !== "string" ||
    !/^[a-f0-9]{64}$/.test(artifactChecksum) ||
    artifactChecksum !==
      (await canonicalArtifactHash(artifactBody, "minimization.json"))
  ) {
    throw new Error("minimization.json contains invalid or unbound evidence");
  }

  const sourceIndexes = sourceScenario.commands.map((_, index) => index);
  if (!(await reproducesSafetyStop(sourceScenario, content, sourceIndexes))) {
    throw new Error("source scenario no longer reproduces its safety stop");
  }
  const derived = await deriveSafetyStopMinimization(sourceScenario, content);
  if (
    firstDifferencePath(derived.retainedCommandIndexes, indexes) !==
      undefined ||
    derived.minimumTicks !== minimizedScenario.maximumTicks ||
    derived.candidateEvaluationCount !== artifact.candidateEvaluationCount
  ) {
    throw new Error(
      "minimization evidence does not match deterministic source reduction"
    );
  }
  const minimizedIndexes = minimizedScenario.commands.map((_, index) => index);
  if (
    !(await reproducesSafetyStop(minimizedScenario, content, minimizedIndexes))
  ) {
    throw new Error(
      "minimized scenario does not reproduce the bound safety stop"
    );
  }
  for (let index = 0; index < minimizedScenario.commands.length; index += 1) {
    const retained = minimizedIndexes.filter(
      (commandIndex) => commandIndex !== index
    );
    if (await reproducesSafetyStop(minimizedScenario, content, retained)) {
      throw new Error("minimized scenario is not command-deletion 1-minimal");
    }
  }
  if (
    minimizedScenario.maximumTicks > 1 &&
    (await reproducesSafetyStop(
      minimizedScenario,
      content,
      minimizedIndexes,
      minimizedScenario.maximumTicks - 1
    ))
  ) {
    throw new Error("minimized scenario does not have a minimal tick budget");
  }
}

async function assertStalledMinimization(
  artifact: StalledMinimizationArtifact,
  sourceScenario: ReturnType<typeof compileScenario>,
  minimizedScenario: ReturnType<typeof compileScenario>,
  content: Awaited<ReturnType<typeof compileContent>>
): Promise<void> {
  requireExactKeys(
    artifact,
    [
      "schemaVersion",
      "complete",
      "assertionCode",
      "safetyStopCode",
      "stalledTick",
      "contentManifestHash",
      "sourceScenarioHash",
      "minimizedScenarioHash",
      "originalCommandCount",
      "minimizedCommandCount",
      "retainedCommandIndexes",
      "candidateEvaluationCount",
      "originalMaximumTicks",
      "minimizedMaximumTicks",
      "artifactChecksum"
    ],
    "minimization.json"
  );
  const { artifactChecksum, ...artifactBody } = artifact;
  const indexes = artifact.retainedCommandIndexes;
  const validIndexes =
    Array.isArray(indexes) &&
    indexes.every(
      (index, position) =>
        Number.isSafeInteger(index) &&
        index >= 0 &&
        index < sourceScenario.commands.length &&
        (position === 0 || index > (indexes[position - 1] as number))
    );
  if (
    artifact.schemaVersion !== 6 ||
    artifact.complete !== true ||
    artifact.assertionCode !== "runtime_safety_stop" ||
    artifact.safetyStopCode !== "simulation_stalled" ||
    !Number.isSafeInteger(artifact.stalledTick) ||
    artifact.stalledTick < 0 ||
    sourceScenario.expectedTerminalResult !== undefined ||
    minimizedScenario.expectedTerminalResult !== undefined ||
    artifact.contentManifestHash !== content.manifestHash ||
    artifact.sourceScenarioHash !== (await canonicalHash(sourceScenario)) ||
    artifact.minimizedScenarioHash !==
      (await canonicalHash(minimizedScenario)) ||
    artifact.originalCommandCount !== sourceScenario.commands.length ||
    artifact.minimizedCommandCount !== minimizedScenario.commands.length ||
    artifact.minimizedCommandCount !== indexes.length ||
    !validIndexes ||
    firstDifferencePath(minimizedScenario, {
      ...sourceScenario,
      maximumTicks: minimizedScenario.maximumTicks,
      commands: indexes.map((index) => sourceScenario.commands[index])
    }) !== undefined ||
    artifact.originalMaximumTicks !== sourceScenario.maximumTicks ||
    artifact.minimizedMaximumTicks !== minimizedScenario.maximumTicks ||
    minimizedScenario.maximumTicks > sourceScenario.maximumTicks ||
    !Number.isSafeInteger(artifact.candidateEvaluationCount) ||
    artifact.candidateEvaluationCount < sourceScenario.commands.length ||
    typeof artifactChecksum !== "string" ||
    !/^[a-f0-9]{64}$/.test(artifactChecksum) ||
    artifactChecksum !==
      (await canonicalArtifactHash(artifactBody, "minimization.json"))
  ) {
    throw new Error(
      "minimization.json contains invalid or unbound stall evidence"
    );
  }

  const sourceIndexes = sourceScenario.commands.map((_, index) => index);
  if (
    !(await reproducesSimulationStall(
      sourceScenario,
      content,
      sourceIndexes,
      artifact.stalledTick
    ))
  ) {
    throw new Error("source scenario no longer reproduces its bound stall");
  }
  const derived = await deriveSimulationStallMinimization(
    sourceScenario,
    content,
    artifact.stalledTick
  );
  if (
    firstDifferencePath(derived.retainedCommandIndexes, indexes) !==
      undefined ||
    derived.minimumTicks !== minimizedScenario.maximumTicks ||
    derived.candidateEvaluationCount !== artifact.candidateEvaluationCount
  ) {
    throw new Error(
      "stall minimization evidence does not match deterministic source reduction"
    );
  }
  const minimizedIndexes = minimizedScenario.commands.map((_, index) => index);
  if (
    !(await reproducesSimulationStall(
      minimizedScenario,
      content,
      minimizedIndexes,
      artifact.stalledTick
    ))
  ) {
    throw new Error("minimized scenario does not reproduce the bound stall");
  }
  for (let index = 0; index < minimizedScenario.commands.length; index += 1) {
    const retained = minimizedIndexes.filter(
      (commandIndex) => commandIndex !== index
    );
    if (
      await reproducesSimulationStall(
        minimizedScenario,
        content,
        retained,
        artifact.stalledTick
      )
    ) {
      throw new Error("minimized stall is not command-deletion 1-minimal");
    }
  }
  if (
    minimizedScenario.maximumTicks > 1 &&
    (await reproducesSimulationStall(
      minimizedScenario,
      content,
      minimizedIndexes,
      artifact.stalledTick,
      minimizedScenario.maximumTicks - 1
    ))
  ) {
    throw new Error("minimized stall does not have a minimal tick budget");
  }
}

async function assertReplaceableMinimization(directory: string): Promise<void> {
  let rootHandle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    rootHandle = await open(
      directory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
    );
    const rootDirectory = `/proc/self/fd/${rootHandle.fd}`;
    const artifactInput = requireRecord<Record<string, unknown>>(
      await readArtifactJson(rootDirectory, "minimization.json"),
      "minimization.json"
    );
    const entries = (await readdir(rootDirectory)).sort();
    if (
      firstDifferencePath(entries, [
        "content.compiled.json",
        "minimization.json",
        ...(artifactInput["schemaVersion"] === 3 ||
        artifactInput["schemaVersion"] === 4 ||
        artifactInput["schemaVersion"] === 5 ||
        artifactInput["schemaVersion"] === 7 ||
        artifactInput["schemaVersion"] === 8
          ? ["replay.minimized.json", "replay.source.json"]
          : []),
        "scenario.minimized.compiled.json",
        "scenario.source.compiled.json"
      ]) !== undefined
    ) {
      throw new Error(
        "minimization output contains an unexpected or missing artifact"
      );
    }

    const content = await compileContent(
      await readArtifactJson(rootDirectory, "content.compiled.json")
    );
    const sourceScenario = compileScenario(
      await readArtifactJson(rootDirectory, "scenario.source.compiled.json"),
      content
    );
    const minimizedScenario = compileScenario(
      await readArtifactJson(rootDirectory, "scenario.minimized.compiled.json"),
      content
    );
    if (
      artifactInput["schemaVersion"] === 3 ||
      artifactInput["schemaVersion"] === 4 ||
      artifactInput["schemaVersion"] === 5 ||
      artifactInput["schemaVersion"] === 7 ||
      artifactInput["schemaVersion"] === 8
    ) {
      await assertReplayMinimization(
        artifactInput as unknown as ReplayMinimizationArtifact,
        sourceScenario,
        minimizedScenario,
        compileReplay(
          await readArtifactJson(rootDirectory, "replay.source.json")
        ),
        compileReplay(
          await readArtifactJson(rootDirectory, "replay.minimized.json")
        ),
        content
      );
      return;
    }
    if (artifactInput["schemaVersion"] === 2) {
      await assertSafetyStopMinimization(
        artifactInput as unknown as SafetyStopMinimizationArtifact,
        sourceScenario,
        minimizedScenario,
        content
      );
      return;
    }
    if (artifactInput["schemaVersion"] === 6) {
      await assertStalledMinimization(
        artifactInput as unknown as StalledMinimizationArtifact,
        sourceScenario,
        minimizedScenario,
        content
      );
      return;
    }
    const artifact = artifactInput as unknown as MinimizationArtifact;
    requireExactKeys(
      artifact,
      [
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
      ],
      "minimization.json"
    );
    const { artifactChecksum, ...artifactBody } = artifact;
    const indexes = artifact.retainedCommandIndexes;
    const validIndexes =
      Array.isArray(indexes) &&
      indexes.every(
        (index, position) =>
          Number.isSafeInteger(index) &&
          index >= 0 &&
          index < sourceScenario.commands.length &&
          (position === 0 || index > (indexes[position - 1] as number))
      );
    if (
      artifact.schemaVersion !== 1 ||
      artifact.complete !== true ||
      artifact.assertionCode !== "unexpected_terminal_result" ||
      sourceScenario.expectedTerminalResult === undefined ||
      minimizedScenario.expectedTerminalResult !==
        sourceScenario.expectedTerminalResult ||
      artifact.expectedTerminalResult !==
        sourceScenario.expectedTerminalResult ||
      artifact.actualTerminalResult === artifact.expectedTerminalResult ||
      artifact.contentManifestHash !== content.manifestHash ||
      artifact.sourceScenarioHash !== (await canonicalHash(sourceScenario)) ||
      artifact.minimizedScenarioHash !==
        (await canonicalHash(minimizedScenario)) ||
      artifact.originalCommandCount !== sourceScenario.commands.length ||
      artifact.minimizedCommandCount !== minimizedScenario.commands.length ||
      artifact.minimizedCommandCount !== indexes.length ||
      !validIndexes ||
      firstDifferencePath(minimizedScenario, {
        ...sourceScenario,
        maximumTicks: minimizedScenario.maximumTicks,
        commands: indexes.map((index) => sourceScenario.commands[index])
      }) !== undefined ||
      minimizedScenario.maximumTicks > sourceScenario.maximumTicks ||
      !Number.isSafeInteger(artifact.candidateEvaluationCount) ||
      artifact.candidateEvaluationCount < sourceScenario.commands.length ||
      typeof artifactChecksum !== "string" ||
      !/^[a-f0-9]{64}$/.test(artifactChecksum) ||
      artifactChecksum !==
        (await canonicalArtifactHash(artifactBody, "minimization.json"))
    ) {
      throw new Error("minimization.json contains invalid or unbound evidence");
    }

    try {
      await runScenario(sourceScenario, content);
      throw new Error(
        "source scenario no longer reproduces its assertion failure"
      );
    } catch (error) {
      if (!(error instanceof RuntimeAssertionError)) throw error;
    }
    const sourceIndexes = sourceScenario.commands.map((_, index) => index);
    const sourceActual = await runScenario(
      scenarioWithoutExpectation(sourceScenario, content, sourceIndexes),
      content
    );
    const derived = await deriveTerminalAssertionMinimization(
      sourceScenario,
      content,
      artifact.actualTerminalResult
    );
    if (
      sourceActual.terminalResult !== artifact.actualTerminalResult ||
      firstDifferencePath(derived.retainedCommandIndexes, indexes) !==
        undefined ||
      derived.minimumTicks !== minimizedScenario.maximumTicks ||
      derived.candidateEvaluationCount !== artifact.candidateEvaluationCount
    ) {
      throw new Error(
        "minimization evidence does not match deterministic source reduction"
      );
    }
    const minimizedIndexes = minimizedScenario.commands.map(
      (_, index) => index
    );
    const minimizedActual = await runScenario(
      scenarioWithoutExpectation(minimizedScenario, content, minimizedIndexes),
      content
    );
    if (minimizedActual.terminalResult !== artifact.actualTerminalResult) {
      throw new Error(
        "minimized scenario does not reproduce the bound assertion"
      );
    }
    for (let index = 0; index < minimizedScenario.commands.length; index += 1) {
      const retained = minimizedIndexes.filter(
        (commandIndex) => commandIndex !== index
      );
      if (
        await reproducesTerminalAssertion(
          minimizedScenario,
          content,
          retained,
          artifact.actualTerminalResult
        )
      ) {
        throw new Error("minimized scenario is not command-deletion 1-minimal");
      }
    }
    if (
      minimizedScenario.maximumTicks > 1 &&
      (await reproducesTerminalAssertionAtTickBudget(
        minimizedScenario,
        content,
        minimizedIndexes,
        artifact.actualTerminalResult,
        minimizedScenario.maximumTicks - 1
      ))
    ) {
      throw new Error("minimized scenario does not have a minimal tick budget");
    }
  } finally {
    await rootHandle?.close().catch(() => undefined);
  }
}

async function minimize(args: ParsedArgs): Promise<void> {
  rejectUnknownFlags(
    args,
    new Set(["content", "scenario", "replay", "replay-ticks", "out", "replace"])
  );
  const { content, scenario } = await load(args);
  const replayPath = args.flags.get("replay");
  if (replayPath === undefined && args.flags.has("replay-ticks")) {
    throw new CliInputError("--replay-ticks requires --replay");
  }
  if (replayPath !== undefined) {
    const minimizeReplayTicks = booleanFlag(args, "replay-ticks");
    const sourceReplay = compileReplay(await readJson(replayPath));
    let divergence: MinimizedReplayDivergence | undefined;
    try {
      await verifyReplay(sourceReplay, scenario, content);
    } catch (error) {
      divergence = acceptedReplayDivergence(error);
      if (divergence === undefined) {
        throw new CliInputError(
          "replay does not reproduce a supported checksum, terminal, or execution divergence"
        );
      }
    }
    if (divergence === undefined) {
      throw new CliInputError("replay does not reproduce a divergence");
    }
    const terminalDivergence =
      divergence.code === "terminal_result_mismatch" ||
      divergence.code === "terminal_tick_mismatch";
    const executionFailure = divergence.code === "execution_failed";
    const reduction = await deriveReplayMinimization(
      scenario,
      sourceReplay,
      content,
      divergence,
      minimizeReplayTicks
    );
    const candidate = await replayCandidate(
      scenario,
      sourceReplay,
      content,
      reduction.retainedCommandIndexes,
      reduction.minimumTicks
    );
    const artifactBody: ReplayMinimizationArtifactBody = {
      schemaVersion: minimizeReplayTicks
        ? terminalDivergence || executionFailure
          ? 8
          : 4
        : executionFailure
          ? 7
          : terminalDivergence
            ? 5
            : 3,
      complete: true,
      assertionCode: "replay_divergence",
      divergenceCode: divergence.code,
      checkpointTick: divergence.checkpointTick,
      ...(terminalDivergence || executionFailure
        ? {
            divergenceExpected: divergence.expected,
            divergenceActual: divergence.actual
          }
        : {}),
      contentManifestHash: content.manifestHash,
      sourceScenarioHash: await canonicalHash(scenario),
      minimizedScenarioHash: await canonicalHash(candidate.scenario),
      sourceReplayHash: await canonicalHash(sourceReplay),
      minimizedReplayHash: await canonicalHash(candidate.replay),
      originalCommandCount: scenario.commands.length,
      minimizedCommandCount: candidate.scenario.commands.length,
      retainedCommandIndexes: reduction.retainedCommandIndexes,
      candidateEvaluationCount: reduction.candidateEvaluationCount,
      ...(minimizeReplayTicks
        ? {
            originalMaximumTicks: scenario.maximumTicks,
            minimizedMaximumTicks: reduction.minimumTicks
          }
        : {})
    };
    const artifact: ReplayMinimizationArtifact = {
      ...artifactBody,
      artifactChecksum: await canonicalHash(artifactBody)
    };
    const outputDirectory = resolve(
      args.flags.get("out") ?? `.ddh/minimizations/${scenario.id}`
    );
    try {
      await publishDirectory(
        outputDirectory,
        booleanFlag(args, "replace"),
        async (stagingDirectory) => {
          await Promise.all([
            writeJson(
              resolve(stagingDirectory, "content.compiled.json"),
              content.bundle
            ),
            writeJson(
              resolve(stagingDirectory, "scenario.source.compiled.json"),
              scenario
            ),
            writeJson(
              resolve(stagingDirectory, "scenario.minimized.compiled.json"),
              candidate.scenario
            ),
            writeJson(
              resolve(stagingDirectory, "replay.source.json"),
              sourceReplay
            ),
            writeJson(
              resolve(stagingDirectory, "replay.minimized.json"),
              candidate.replay
            ),
            writeJson(resolve(stagingDirectory, "minimization.json"), artifact)
          ]);
          await assertReplaceableMinimization(stagingDirectory);
        },
        assertReplaceableMinimization
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ReportGenerationError(
        `Unable to publish minimization at ${outputDirectory}: ${message}`
      );
    }
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        minimized: true,
        outputDirectory,
        scenarioId: scenario.id,
        assertionCode: artifact.assertionCode,
        divergenceCode: artifact.divergenceCode,
        checkpointTick: artifact.checkpointTick,
        ...(artifact.schemaVersion === 4 || artifact.schemaVersion === 8
          ? {
              originalMaximumTicks: artifact.originalMaximumTicks,
              minimizedMaximumTicks: artifact.minimizedMaximumTicks
            }
          : {}),
        originalCommandCount: artifact.originalCommandCount,
        minimizedCommandCount: artifact.minimizedCommandCount,
        artifactChecksum: artifact.artifactChecksum
      })}\n`
    );
    return;
  }
  const allIndexes = scenario.commands.map((_, index) => index);
  let actualTerminalResult: string | undefined;
  let stalledTick: number | undefined;
  let reduction: Awaited<
    ReturnType<typeof deriveTerminalAssertionMinimization>
  >;
  if (scenario.expectedTerminalResult !== undefined) {
    try {
      await runScenario(scenario, content);
      throw new CliInputError(
        "scenario does not reproduce unexpected_terminal_result"
      );
    } catch (error) {
      if (!(error instanceof RuntimeAssertionError)) throw error;
    }
    actualTerminalResult = (
      await runScenario(
        scenarioWithoutExpectation(scenario, content, allIndexes),
        content
      )
    ).terminalResult;
    reduction = await deriveTerminalAssertionMinimization(
      scenario,
      content,
      actualTerminalResult
    );
  } else {
    try {
      await runScenario(scenario, content);
      throw new CliInputError(
        "scenario does not reproduce tick_budget_exhausted"
      );
    } catch (error) {
      if (
        error instanceof RuntimeSafetyStopError &&
        error.code === "tick_budget_exhausted"
      ) {
        reduction = await deriveSafetyStopMinimization(scenario, content);
      } else if (
        error instanceof RuntimeSafetyStopError &&
        error.code === "simulation_stalled"
      ) {
        stalledTick = error.tick;
        reduction = await deriveSimulationStallMinimization(
          scenario,
          content,
          stalledTick
        );
      } else if (error instanceof CliInputError) {
        throw error;
      } else {
        throw new CliInputError(
          "scenario does not reproduce a supported runtime safety stop"
        );
      }
    }
  }
  const { retainedCommandIndexes, minimumTicks, candidateEvaluationCount } =
    reduction;

  const minimizedScenario = compileScenario(
    {
      ...scenario,
      maximumTicks: minimumTicks,
      commands: retainedCommandIndexes.map((index) => scenario.commands[index])
    },
    content
  );
  const sharedArtifactBody = {
    contentManifestHash: content.manifestHash,
    sourceScenarioHash: await canonicalHash(scenario),
    minimizedScenarioHash: await canonicalHash(minimizedScenario),
    originalCommandCount: scenario.commands.length,
    minimizedCommandCount: minimizedScenario.commands.length,
    retainedCommandIndexes,
    candidateEvaluationCount
  };
  const artifactBody:
    | MinimizationArtifactBody
    | SafetyStopMinimizationArtifactBody
    | StalledMinimizationArtifactBody =
    stalledTick !== undefined
      ? {
          schemaVersion: 6,
          complete: true,
          assertionCode: "runtime_safety_stop",
          safetyStopCode: "simulation_stalled",
          stalledTick,
          ...sharedArtifactBody,
          originalMaximumTicks: scenario.maximumTicks,
          minimizedMaximumTicks: minimizedScenario.maximumTicks
        }
      : scenario.expectedTerminalResult === undefined
        ? {
            schemaVersion: 2,
            complete: true,
            assertionCode: "runtime_safety_stop",
            safetyStopCode: "tick_budget_exhausted",
            ...sharedArtifactBody
          }
        : {
            schemaVersion: 1,
            complete: true,
            assertionCode: "unexpected_terminal_result",
            expectedTerminalResult: scenario.expectedTerminalResult,
            actualTerminalResult: actualTerminalResult as string,
            ...sharedArtifactBody
          };
  const artifact = {
    ...artifactBody,
    artifactChecksum: await canonicalHash(artifactBody)
  };
  const outputDirectory = resolve(
    args.flags.get("out") ?? `.ddh/minimizations/${scenario.id}`
  );
  try {
    await publishDirectory(
      outputDirectory,
      booleanFlag(args, "replace"),
      async (stagingDirectory) => {
        await Promise.all([
          writeJson(
            resolve(stagingDirectory, "content.compiled.json"),
            content.bundle
          ),
          writeJson(
            resolve(stagingDirectory, "scenario.source.compiled.json"),
            scenario
          ),
          writeJson(
            resolve(stagingDirectory, "scenario.minimized.compiled.json"),
            minimizedScenario
          ),
          writeJson(resolve(stagingDirectory, "minimization.json"), artifact)
        ]);
        await assertReplaceableMinimization(stagingDirectory);
      },
      assertReplaceableMinimization
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ReportGenerationError(
      `Unable to publish minimization at ${outputDirectory}: ${message}`
    );
  }
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      minimized: true,
      outputDirectory,
      scenarioId: scenario.id,
      assertionCode: artifact.assertionCode,
      ...(artifact.schemaVersion === 1
        ? {
            expectedTerminalResult: artifact.expectedTerminalResult,
            actualTerminalResult: artifact.actualTerminalResult
          }
        : {
            safetyStopCode: artifact.safetyStopCode,
            ...(artifact.schemaVersion === 6
              ? {
                  stalledTick: artifact.stalledTick,
                  originalMaximumTicks: artifact.originalMaximumTicks,
                  minimizedMaximumTicks: artifact.minimizedMaximumTicks
                }
              : {})
          }),
      originalCommandCount: artifact.originalCommandCount,
      minimizedCommandCount: artifact.minimizedCommandCount,
      artifactChecksum: artifact.artifactChecksum
    })}\n`
  );
}

async function assertReplaceableSweep(directory: string): Promise<void> {
  let rootHandle: Awaited<ReturnType<typeof open>> | undefined;
  let runsHandle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    rootHandle = await open(
      directory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
    );
    const rootDirectory = `/proc/self/fd/${rootHandle.fd}`;
    const matrix = parseSweepMatrix(
      await readArtifactJson(rootDirectory, "matrix.compiled.json")
    );
    const entries = (await readdir(rootDirectory)).sort();
    if (
      firstDifferencePath(entries, [
        ...(matrix.axes.placement === undefined
          ? []
          : ["content.compiled.json"]),
        "matrix.compiled.json",
        "runs",
        "scenario.base.compiled.json",
        "sweep.json"
      ]) !== undefined
    ) {
      throw new Error(
        "sweep output contains an unexpected or missing artifact"
      );
    }
    runsHandle = await open(
      resolve(rootDirectory, "runs"),
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
    );
    const runsDirectory = `/proc/self/fd/${runsHandle.fd}`;
    const baseScenarioInput = await readArtifactJson(
      rootDirectory,
      "scenario.base.compiled.json"
    );
    const artifact = requireRecord<SweepArtifact>(
      await readArtifactJson(rootDirectory, "sweep.json"),
      "sweep.json"
    );
    requireExactKeys(
      artifact,
      [
        "schemaVersion",
        "complete",
        "matrixId",
        "matrixHash",
        "contentManifestHash",
        "scenarioHash",
        "sampleCount",
        "aggregate",
        "samples"
      ],
      "sweep.json"
    );
    const expandedAxes = expandSweepAxes(matrix);
    if (
      artifact.schemaVersion !==
        (matrix.axes.build !== undefined
          ? 5
          : matrix.axes.controller !== undefined
            ? 4
            : matrix.axes.placement === undefined
              ? 2
              : 3) ||
      artifact.complete !== true ||
      artifact.matrixId !== matrix.id ||
      artifact.matrixHash !== (await canonicalHash(matrix)) ||
      typeof artifact.contentManifestHash !== "string" ||
      typeof artifact.scenarioHash !== "string" ||
      !Array.isArray(artifact.samples) ||
      artifact.sampleCount !== artifact.samples.length ||
      artifact.samples.length === 0 ||
      artifact.samples.length > 64 ||
      firstDifferencePath(
        expandedAxes,
        artifact.samples.map(
          ({ seed, placementPointId, controllerId, buildId }) => ({
            seed,
            ...(placementPointId === undefined ? {} : { placementPointId }),
            ...(controllerId === undefined ? {} : { controllerId }),
            ...(buildId === undefined ? {} : { buildId })
          })
        )
      ) !== undefined
    ) {
      throw new Error("sweep.json does not describe a complete bound sweep");
    }
    const seenSamples = new Set<string>();
    for (const [index, sample] of artifact.samples.entries()) {
      requireExactKeys(
        sample,
        artifact.schemaVersion === 5
          ? [
              "index",
              "seed",
              "placementPointId",
              "controllerId",
              "buildId",
              "terminalResult",
              "terminalTick",
              "calibrationChecksum",
              "calibrationEvidence"
            ]
          : artifact.schemaVersion === 4
            ? [
                "index",
                "seed",
                "placementPointId",
                "controllerId",
                "terminalResult",
                "terminalTick",
                "calibrationChecksum",
                "calibrationEvidence"
              ]
            : artifact.schemaVersion === 3
              ? [
                  "index",
                  "seed",
                  "placementPointId",
                  "terminalResult",
                  "terminalTick",
                  "calibrationChecksum",
                  "calibrationEvidence"
                ]
              : [
                  "index",
                  "seed",
                  "runDirectory",
                  "scenarioHash",
                  "terminalResult",
                  "terminalTick",
                  "finalStateChecksum",
                  "eventStreamChecksum"
                ],
        `sweep.json sample ${index}`
      );
      const sampleIdentity = `${sample.seed}\u0000${sample.placementPointId ?? ""}\u0000${sample.controllerId ?? ""}\u0000${sample.buildId ?? ""}`;
      if (
        sample.index !== index ||
        typeof sample.seed !== "string" ||
        !/^[1-9]\d{0,9}$/.test(sample.seed) ||
        BigInt(sample.seed) > 0xffff_ffffn ||
        seenSamples.has(sampleIdentity) ||
        ((artifact.schemaVersion === 3 ||
          artifact.schemaVersion === 4 ||
          artifact.schemaVersion === 5) &&
          (typeof sample.placementPointId !== "string" ||
            typeof sample.calibrationChecksum !== "string" ||
            !/^[a-f0-9]{64}$/.test(sample.calibrationChecksum) ||
            sample.calibrationEvidence === undefined)) ||
        ((artifact.schemaVersion === 4 || artifact.schemaVersion === 5) &&
          (typeof sample.controllerId !== "string" ||
            !Object.hasOwn(sweepControllers, sample.controllerId))) ||
        (artifact.schemaVersion === 5 &&
          (typeof sample.buildId !== "string" ||
            !Object.hasOwn(sweepBuilds, sample.buildId))) ||
        (artifact.schemaVersion === 2 &&
          (sample.runDirectory !==
            `runs/${String(index).padStart(4, "0")}-seed-${sample.seed}` ||
            typeof sample.scenarioHash !== "string" ||
            !/^[a-f0-9]{64}$/.test(sample.scenarioHash) ||
            typeof sample.finalStateChecksum !== "string" ||
            !/^[a-f0-9]{64}$/.test(sample.finalStateChecksum) ||
            typeof sample.eventStreamChecksum !== "string" ||
            !/^[a-f0-9]{64}$/.test(sample.eventStreamChecksum))) ||
        typeof sample.terminalResult !== "string" ||
        sample.terminalResult.length === 0 ||
        !Number.isSafeInteger(sample.terminalTick) ||
        sample.terminalTick < 0 ||
        sample.terminalTick > 0xffff_ffff
      ) {
        throw new Error(`sweep sample ${index} has invalid identity evidence`);
      }
      seenSamples.add(sampleIdentity);
    }
    const expectedAggregate = deriveSweepAggregate(artifact.samples);
    if (
      firstDifferencePath(expectedAggregate, artifact.aggregate) !== undefined
    ) {
      throw new Error("sweep aggregate does not match its sample evidence");
    }

    const runEntries = (await readdir(runsDirectory)).sort();
    if (artifact.schemaVersion === 2) {
      const expectedEntries = artifact.samples
        .map((sample) => basename(sample.runDirectory as string))
        .sort();
      if (firstDifferencePath(expectedEntries, runEntries) !== undefined) {
        throw new Error("sweep run directory set does not match sweep.json");
      }
      for (const sample of artifact.samples) {
        const verified = await verifyRunDirectory(
          resolve(runsDirectory, basename(sample.runDirectory as string)),
          false
        );
        const expectedScenario = compileScenario(
          {
            ...requireSweepRecord(baseScenarioInput, "base scenario"),
            seed: sample.seed
          },
          verified.content
        );
        if (
          verified.content.manifestHash !== artifact.contentManifestHash ||
          (await canonicalHash(
            compileScenario(baseScenarioInput, verified.content)
          )) !== artifact.scenarioHash ||
          firstDifferencePath(expectedScenario, verified.scenario) !==
            undefined ||
          verified.result.scenarioHash !== sample.scenarioHash ||
          verified.result.terminalResult !== sample.terminalResult ||
          verified.result.terminalTick !== sample.terminalTick ||
          verified.result.finalStateChecksum !== sample.finalStateChecksum ||
          verified.result.eventStreamChecksum !== sample.eventStreamChecksum
        ) {
          throw new Error(
            "sweep sample evidence does not match its verified run"
          );
        }
      }
    } else {
      if (runEntries.length !== 0) {
        throw new Error("placement sweep runs directory must be empty");
      }
      const content = await compileContent(
        await readArtifactJson(rootDirectory, "content.compiled.json")
      );
      if (
        content.manifestHash !== artifact.contentManifestHash ||
        (await canonicalHash(compileScenario(baseScenarioInput, content))) !==
          artifact.scenarioHash
      ) {
        throw new Error("placement sweep inputs do not match sweep.json");
      }
      for (const sample of artifact.samples) {
        const calibrationEvidence =
          sample.buildId !== undefined
            ? await runShuttergateSeedPlacementControllerBuildCalibration(
                content,
                sample.seed,
                sample.placementPointId as PlacementPointId,
                sweepControllers[
                  sample.controllerId as keyof typeof sweepControllers
                ],
                sweepBuilds[
                  sample.buildId as keyof typeof sweepBuilds
                ] as ShuttergateCalibrationBuildId
              )
            : sample.controllerId === undefined
              ? await runShuttergateSeedPlacementCalibration(
                  content,
                  sample.seed,
                  sample.placementPointId as PlacementPointId
                )
              : await runShuttergateSeedPlacementControllerCalibration(
                  content,
                  sample.seed,
                  sample.placementPointId as PlacementPointId,
                  sweepControllers[
                    sample.controllerId as keyof typeof sweepControllers
                  ]
                );
        if (
          (await canonicalHash(calibrationEvidence)) !==
            sample.calibrationChecksum ||
          firstDifferencePath(
            calibrationEvidence,
            sample.calibrationEvidence
          ) !== undefined ||
          calibrationEvidence.terminalResult !== sample.terminalResult ||
          calibrationEvidence.terminalTick !== sample.terminalTick
        ) {
          throw new Error(
            "sweep calibration evidence does not match its authoritative run"
          );
        }
      }
    }
  } finally {
    await runsHandle?.close().catch(() => undefined);
    await rootHandle?.close().catch(() => undefined);
  }
}

async function sweep(args: ParsedArgs): Promise<void> {
  rejectUnknownFlags(args, new Set(["matrix", "out", "replace"]));
  const matrixPath = resolve(requiredFlag(args, "matrix"));
  const matrix = parseSweepMatrix(await readJson(matrixPath));
  const matrixDirectory = dirname(matrixPath);
  const content = await compileContent(
    await readJson(resolveMatrixInput(matrixDirectory, matrix.content))
  );
  const scenarioInput = requireSweepRecord(
    await readJson(resolveMatrixInput(matrixDirectory, matrix.scenario)),
    "sweep scenario"
  );
  const baseScenario = compileScenario(scenarioInput, content);
  const [matrixHash, scenarioHash, provenance] = await Promise.all([
    canonicalHash(matrix),
    canonicalHash(baseScenario),
    collectProvenance()
  ]);
  const outputDirectory = resolve(
    args.flags.get("out") ?? `.ddh/sweeps/${matrix.id}`
  );
  try {
    await publishDirectory(
      outputDirectory,
      booleanFlag(args, "replace"),
      async (stagingDirectory) => {
        const runsDirectory = resolve(stagingDirectory, "runs");
        await mkdir(runsDirectory);
        await Promise.all([
          writeJson(resolve(stagingDirectory, "matrix.compiled.json"), matrix),
          writeJson(
            resolve(stagingDirectory, "scenario.base.compiled.json"),
            baseScenario
          ),
          ...(matrix.axes.placement === undefined
            ? []
            : [
                writeJson(
                  resolve(stagingDirectory, "content.compiled.json"),
                  content.bundle
                )
              ])
        ]);
        const samples: SweepSampleArtifact[] = [];
        for (const [index, axis] of expandSweepAxes(matrix).entries()) {
          const { seed, placementPointId, controllerId, buildId } = axis;
          if (placementPointId === undefined) {
            const scenario = compileScenario(
              { ...scenarioInput, seed },
              content
            );
            const runDirectory = `runs/${String(index).padStart(4, "0")}-seed-${seed}`;
            const summary = await executeAndPublishRun(
              content,
              scenario,
              resolve(stagingDirectory, runDirectory),
              false,
              provenance
            );
            samples.push({
              index,
              seed,
              runDirectory,
              scenarioHash: summary.scenarioHash,
              terminalResult: summary.terminalResult,
              terminalTick: summary.terminalTick,
              finalStateChecksum: summary.finalStateChecksum,
              eventStreamChecksum: summary.eventStreamChecksum
            });
          } else {
            const calibrationEvidence =
              buildId !== undefined
                ? await runShuttergateSeedPlacementControllerBuildCalibration(
                    content,
                    seed,
                    placementPointId as PlacementPointId,
                    sweepControllers[
                      controllerId as keyof typeof sweepControllers
                    ],
                    sweepBuilds[
                      buildId as keyof typeof sweepBuilds
                    ] as ShuttergateCalibrationBuildId
                  )
                : controllerId === undefined
                  ? await runShuttergateSeedPlacementCalibration(
                      content,
                      seed,
                      placementPointId as PlacementPointId
                    )
                  : await runShuttergateSeedPlacementControllerCalibration(
                      content,
                      seed,
                      placementPointId as PlacementPointId,
                      sweepControllers[
                        controllerId as keyof typeof sweepControllers
                      ]
                    );
            samples.push({
              index,
              seed,
              placementPointId,
              ...(controllerId === undefined ? {} : { controllerId }),
              ...(buildId === undefined ? {} : { buildId }),
              terminalResult: calibrationEvidence.terminalResult,
              terminalTick: calibrationEvidence.terminalTick,
              calibrationChecksum: await canonicalHash(calibrationEvidence),
              calibrationEvidence
            });
          }
        }
        const artifact: SweepArtifact = {
          schemaVersion:
            matrix.axes.build !== undefined
              ? 5
              : matrix.axes.controller !== undefined
                ? 4
                : matrix.axes.placement === undefined
                  ? 2
                  : 3,
          complete: true,
          matrixId: matrix.id,
          matrixHash,
          contentManifestHash: content.manifestHash,
          scenarioHash,
          sampleCount: samples.length,
          aggregate: deriveSweepAggregate(samples),
          samples
        };
        await writeJson(resolve(stagingDirectory, "sweep.json"), artifact);
      },
      assertReplaceableSweep
    );
  } catch (error) {
    if (
      error instanceof RuntimeAssertionError ||
      error instanceof RuntimeSafetyStopError ||
      error instanceof ContentValidationError ||
      error instanceof CliInputError ||
      error instanceof ReportGenerationError
    ) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new ReportGenerationError(
      `Unable to publish sweep at ${outputDirectory}: ${message}`
    );
  }
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      swept: true,
      outputDirectory,
      matrixId: matrix.id,
      matrixHash,
      sampleCount: expandSweepAxes(matrix).length
    })}\n`
  );
}

async function assertReplaceableCampaign(
  directory: string,
  replayAttempts: boolean
): Promise<void> {
  let rootHandle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    rootHandle = await open(
      directory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
    );
    const rootDirectory = `/proc/self/fd/${rootHandle.fd}`;
    const entries = (await readdir(rootDirectory)).sort();
    if (
      firstDifferencePath(entries, [
        "campaign-manifest.json",
        "campaign.json",
        "content.compiled.json",
        "scenario.compiled.json"
      ]) !== undefined
    ) {
      throw new Error(
        "campaign output contains an unexpected or missing artifact"
      );
    }
    const scenario = parseCampaignScenario(
      await readArtifactJson(rootDirectory, "scenario.compiled.json")
    );
    const content = await compileContent(
      await readArtifactJson(rootDirectory, "content.compiled.json")
    );
    const artifact = (await readArtifactJson(
      rootDirectory,
      "campaign.json"
    )) as ShuttergateCampaignArtifact;
    const manifest = requireRecord<CampaignManifestArtifact>(
      await readArtifactJson(rootDirectory, "campaign-manifest.json"),
      "campaign-manifest.json"
    );
    requireExactKeys(
      manifest,
      [
        "schemaVersion",
        "complete",
        "scenarioId",
        "scenarioHash",
        "contentManifestHash",
        "attemptCount",
        "campaignPayloadChecksum"
      ],
      "campaign-manifest.json"
    );
    const scenarioHash = await canonicalHash(scenario);
    if (
      manifest.schemaVersion !== 1 ||
      manifest.complete !== true ||
      scenario.content !== "content.compiled.json" ||
      manifest.scenarioId !== scenario.id ||
      manifest.scenarioHash !== scenarioHash ||
      manifest.contentManifestHash !== content.manifestHash ||
      manifest.attemptCount !== scenario.attemptCount ||
      manifest.campaignPayloadChecksum !== artifact.payloadChecksum ||
      artifact.attemptChecksums.length !== scenario.attemptCount ||
      artifact.profileSave.contentVersion !== content.bundle.contentVersion ||
      artifact.profileSave.applicationBuild !== scenario.applicationBuild ||
      artifact.profileSave.writtenAtEpochMs !== scenario.writtenAtEpochMs ||
      artifact.profileSave.profileId !== scenario.profileId
    ) {
      throw new Error(
        "campaign manifest does not match its scenario, content, and durable artifact"
      );
    }
    if (replayAttempts) {
      const restored = await restoreShuttergateCampaignArtifact(
        content,
        artifact
      );
      if (restored.attempts.length !== scenario.attemptCount) {
        throw new Error(
          "campaign artifact replay does not match the configured attempt count"
        );
      }
    }
  } finally {
    await rootHandle?.close().catch(() => undefined);
  }
}

async function campaign(args: ParsedArgs): Promise<void> {
  rejectUnknownFlags(args, new Set(["scenario", "out", "replace"]));
  const scenarioPath = resolve(requiredFlag(args, "scenario"));
  const scenario = parseCampaignScenario(await readJson(scenarioPath));
  const content = await compileContent(
    await readJson(resolve(dirname(scenarioPath), scenario.content))
  );
  const compiledScenario: CampaignScenario = {
    ...scenario,
    content: "content.compiled.json"
  };
  const scenarioHash = await canonicalHash(compiledScenario);
  let authority = createShuttergateCampaignAuthority();
  for (let index = 0; index < scenario.attemptCount; index += 1) {
    authority = (await runShuttergateCampaignTransition(content, authority))
      .authority;
  }
  const artifact = await createShuttergateCampaignArtifact({
    schemaVersion: 1,
    content,
    authority,
    applicationBuild: scenario.applicationBuild,
    writtenAtEpochMs: scenario.writtenAtEpochMs,
    profileId: scenario.profileId
  });
  const manifest: CampaignManifestArtifact = {
    schemaVersion: 1,
    complete: true,
    scenarioId: scenario.id,
    scenarioHash,
    contentManifestHash: content.manifestHash,
    attemptCount: scenario.attemptCount,
    campaignPayloadChecksum: artifact.payloadChecksum
  };
  const outputDirectory = resolve(
    args.flags.get("out") ?? `.ddh/campaigns/${scenario.id}`
  );
  let campaignValidationPass = 0;
  try {
    await publishDirectory(
      outputDirectory,
      booleanFlag(args, "replace"),
      async (stagingDirectory) => {
        await Promise.all([
          writeJson(
            resolve(stagingDirectory, "scenario.compiled.json"),
            compiledScenario
          ),
          writeJson(
            resolve(stagingDirectory, "content.compiled.json"),
            content.bundle
          ),
          writeJson(resolve(stagingDirectory, "campaign.json"), artifact),
          writeJson(
            resolve(stagingDirectory, "campaign-manifest.json"),
            manifest
          )
        ]);
      },
      async (directory) => {
        campaignValidationPass += 1;
        await assertReplaceableCampaign(directory, campaignValidationPass > 1);
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ReportGenerationError(
      `Unable to publish campaign at ${outputDirectory}: ${message}`
    );
  }
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      campaigned: true,
      outputDirectory,
      scenarioId: scenario.id,
      scenarioHash,
      attemptCount: scenario.attemptCount,
      campaignPayloadChecksum: artifact.payloadChecksum
    })}\n`
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

async function explain(args: ParsedArgs): Promise<void> {
  rejectUnknownFlags(args, new Set(["run", "format"]));
  const format = requiredFlag(args, "format");
  if (format !== "markdown" && format !== "json") {
    throw new CliInputError("--format must be markdown or json");
  }
  const runDirectory = resolve(requiredFlag(args, "run"));
  const evidence = await verifyRunDirectory(runDirectory, false);
  const report = createRunExplanation({
    identity: {
      repositoryRevision: String(evidence.manifest.repositoryRevision),
      contentManifestHash: evidence.replay.contentManifestHash,
      scenarioId: evidence.replay.scenarioId,
      scenarioHash: evidence.replay.scenarioHash,
      seed: evidence.replay.seed,
      replayIdentityHash: evidence.replayIdentityHash
    },
    terminalResult: evidence.result.terminalResult,
    terminalTick: evidence.result.terminalTick,
    events: evidence.result.events,
    diagnostics: evidence.diagnostics
  });
  process.stdout.write(
    format === "markdown"
      ? renderRunExplanationMarkdown(report)
      : `${JSON.stringify(report)}\n`
  );
}

async function render(args: ParsedArgs): Promise<void> {
  rejectUnknownFlags(
    args,
    new Set(["run", "format", "layers", "from-node", "to-node"])
  );
  const format = requiredFlag(args, "format");
  if (format !== "text" && format !== "svg")
    throw new CliInputError("--format must be text or svg");
  const layerNames = requiredFlag(args, "layers").split(",");
  if (
    layerNames.some(
      (layer) => layer !== "map" && layer !== "occupancy" && layer !== "path"
    )
  )
    throw new CliInputError(
      "--layers must be a comma-separated subset of map,occupancy,path"
    );

  const fromNodeId = args.flags.get("from-node");
  const toNodeId = args.flags.get("to-node");
  if ((fromNodeId === undefined) !== (toNodeId === undefined))
    throw new CliInputError(
      "--from-node and --to-node must be provided together"
    );

  const evidence = await verifyRunDirectory(
    resolve(requiredFlag(args, "run")),
    false
  );
  const level = evidence.content.levels.get(evidence.scenario.levelId);
  const battlefield = evidence.result.finalState.battlefield;
  if (level?.mapId === undefined || battlefield === undefined)
    throw new CliInputError("verified run does not contain a battlefield map");
  const map = evidence.content.maps.get(level.mapId);
  if (map === undefined)
    throw new CliInputError(
      `verified run references missing battlefield map (${level.mapId})`
    );

  try {
    const request = {
      map,
      state: battlefield,
      layers: layerNames as Array<"map" | "occupancy" | "path">,
      ...(fromNodeId === undefined || toNodeId === undefined
        ? {}
        : {
            route: {
              fromNodeId: fromNodeId as NavigationNodeId,
              toNodeId: toNodeId as NavigationNodeId
            }
          })
    };
    process.stdout.write(
      format === "text"
        ? renderBattlefieldText(request)
        : renderBattlefieldSvg(request)
    );
  } catch (error) {
    if (error instanceof RangeError) throw new CliInputError(error.message);
    throw error;
  }
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
    case "explain":
      await explain(args);
      break;
    case "render":
      await render(args);
      break;
    case "compare":
      await compare(args);
      break;
    case "sweep":
      await sweep(args);
      break;
    case "campaign":
      await campaign(args);
      break;
    case "minimize":
      await minimize(args);
      break;
    default:
      throw new CliInputError(
        "Usage: dwarven-depths-sim <validate|run|replay|inspect|explain|render|compare|sweep|campaign|minimize> [--content <file>] [--scenario <file>] [--out <dir>] [--replace true|false] [--run <bundle> --verify] [--run <bundle> --tick <n> --before <n> --after <n>] [--run <bundle> --format <markdown|json>] [--run <bundle> --format <text|svg> --layers <map,occupancy,path> --from-node <id> --to-node <id>] [--baseline <bundle> --candidate <bundle>] [--matrix <file> --out <directory>] [--scenario <campaign-file> --out <directory>]"
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
