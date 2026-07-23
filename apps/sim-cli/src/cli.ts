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
  compileScenario
} from "@dwarven-depths/content-runtime";
import {
  RuntimeAssertionError,
  RuntimeSafetyStopError,
  runScenario
} from "@dwarven-depths/runtime";

const execFileAsync = promisify(execFile);
const runBundleFiles = [
  "content-manifest.json",
  "events.ndjson",
  "scenario.compiled.json",
  "state.final.json",
  "summary.json"
] as const;

interface ParsedArgs {
  readonly command: string | undefined;
  readonly flags: ReadonlyMap<string, string>;
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

function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const flags = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new CliInputError(
        `Expected --name value arguments, received: ${rest.slice(index).join(" ")}`
      );
    }
    const name = key.slice(2);
    if (flags.has(name))
      throw new CliInputError(`Duplicate --${name} argument`);
    flags.set(name, value);
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

async function writeNewFile(path: string, content: string): Promise<void> {
  await writeFile(path, content, { encoding: "utf8", flag: "wx" });
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeNewFile(path, `${JSON.stringify(value, null, 2)}\n`);
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
      manifest.harnessVersion !== "milestone-0"
    ) {
      throw new Error("completion manifest is not a Milestone 0 run bundle");
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
  const summary = {
    scenarioId: result.scenarioId,
    scenarioHash: result.scenarioHash,
    terminalResult: result.terminalResult,
    terminalTick: result.terminalTick,
    eventCount: result.events.length,
    finalStateChecksum: result.finalStateChecksum,
    eventStreamChecksum: result.eventStreamChecksum
  };
  const manifest = {
    harnessVersion: "milestone-0",
    protocolVersions: {
      harness: 1,
      contentSchema: content.bundle.schemaVersion,
      scenarioSchema: scenario.schemaVersion,
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
            resolve(stagingDirectory, "scenario.compiled.json"),
            scenario
          ),
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
            resolve(stagingDirectory, "events.ndjson"),
            result.events.length === 0
              ? ""
              : `${result.events.map((event) => JSON.stringify(event)).join("\n")}\n`
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  switch (args.command) {
    case "validate":
      await validate(args);
      break;
    case "run":
      await run(args);
      break;
    default:
      throw new CliInputError(
        "Usage: dwarven-depths-sim <validate|run> --content <file> --scenario <file> [--out <dir>] [--replace true|false]"
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
