#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  compileContent,
  compileScenario
} from "@dwarven-depths/content-runtime";
import { runScenario } from "@dwarven-depths/runtime";

interface ParsedArgs {
  readonly command: string | undefined;
  readonly flags: ReadonlyMap<string, string>;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const flags = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(
        `Expected --name value arguments, received: ${rest.slice(index).join(" ")}`
      );
    }
    flags.set(key.slice(2), value);
  }
  return { command, flags };
}

function requiredFlag(args: ParsedArgs, name: string): string {
  const value = args.flags.get(name);
  if (!value) throw new Error(`Missing required --${name} argument`);
  return value;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(path), "utf8")) as unknown;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
  const { content, scenario } = await load(args);
  process.stdout.write(
    `${JSON.stringify({ ok: true, contentManifestHash: content.manifestHash, scenarioId: scenario.id })}\n`
  );
}

async function run(args: ParsedArgs): Promise<void> {
  const { content, scenario } = await load(args);
  const result = await runScenario(scenario, content);
  const outputDirectory = resolve(
    args.flags.get("out") ?? `.ddh/runs/${scenario.id}`
  );
  const manifest = {
    harnessVersion: "milestone-0",
    contentManifestHash: content.manifestHash,
    contentVersion: content.bundle.contentVersion,
    scenarioId: scenario.id,
    seed: scenario.seed,
    canonical: true
  };
  const summary = {
    scenarioId: result.scenarioId,
    terminalResult: result.terminalResult,
    terminalTick: result.terminalTick,
    eventCount: result.events.length,
    finalStateChecksum: result.finalStateChecksum,
    eventStreamChecksum: result.eventStreamChecksum
  };

  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeJson(resolve(outputDirectory, "manifest.json"), manifest),
    writeJson(resolve(outputDirectory, "scenario.compiled.json"), scenario),
    writeJson(resolve(outputDirectory, "content-manifest.json"), {
      contentVersion: content.bundle.contentVersion,
      contentManifestHash: content.manifestHash
    }),
    writeJson(resolve(outputDirectory, "state.final.json"), result.finalState),
    writeJson(resolve(outputDirectory, "summary.json"), summary),
    writeFile(
      resolve(outputDirectory, "events.ndjson"),
      `${result.events.map((event) => JSON.stringify(event)).join("\n")}\n`,
      "utf8"
    )
  ]);

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
      throw new Error(
        "Usage: dwarven-depths-sim <validate|run> --content <file> --scenario <file> [--out <dir>]"
      );
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  process.exitCode = 2;
});
