import {
  compileContent,
  compileScenario
} from "@dwarven-depths/content-runtime";
import {
  type ContentBundle,
  canonicalHash,
  type ReplayDefinition,
  type ScenarioDefinition
} from "@dwarven-depths/contracts";
import shieldSlamContentFixture from "../../../content/fixtures/phase-3-shuttergate.json";
import shieldSlamScenarioFixture from "../../../scenarios/conformance/shield-slam.json";
import shuttergateScenarioFixture from "../../../scenarios/conformance/shuttergate-web-truth.json";
import type { ClientMessage, WorkerMessage } from "./protocol.js";

export const RUN_EVIDENCE_SCHEMA_VERSION = 2 as const;

export type RunResult = Extract<WorkerMessage, { readonly type: "result" }>;
export type RunConfiguration = Extract<
  ClientMessage,
  { readonly type: "initialize"; readonly protocolVersion: 4 }
>["runConfiguration"];

export async function createRunEvidenceReplay(
  result: RunResult,
  runConfiguration?: RunConfiguration
): Promise<ReplayDefinition> {
  const content = await compileContent(
    shieldSlamContentFixture as unknown as ContentBundle
  );
  const authoredScenario = compileScenario(
    (runConfiguration === undefined
      ? shieldSlamScenarioFixture
      : {
          ...shuttergateScenarioFixture,
          seed: runConfiguration.seed
        }) as unknown as ScenarioDefinition,
    content
  );
  const scenario = compileScenario(
    {
      ...authoredScenario,
      commands: result.commands.map(({ command }) => command)
    },
    content
  );
  const commands: ReplayDefinition["commands"] = result.commands.map(
    (envelope, index) => ({
      tick: envelope.tick,
      sequence: envelope.sequence,
      command: scenario.commands[index] as (typeof scenario.commands)[number]
    })
  );
  return {
    schemaVersion: 1,
    simulationSchemaVersion: 1,
    contentVersion: content.bundle.contentVersion,
    contentManifestHash: content.manifestHash,
    scenarioId: scenario.id,
    scenarioHash: await canonicalHash(scenario),
    levelId: scenario.levelId,
    seed: scenario.seed,
    rngAlgorithm: "xorshift32-v1",
    commands,
    checkpoints: [
      {
        tick: result.terminalTick,
        stateChecksum: result.finalStateChecksum,
        eventStreamChecksum: result.eventStreamChecksum
      }
    ],
    expectedTerminalResult: result.terminalResult,
    expectedTerminalTick: result.terminalTick
  };
}

export async function serializeRunEvidence(
  result: RunResult,
  runConfiguration?: RunConfiguration
): Promise<string> {
  return `${JSON.stringify(
    {
      schemaVersion: RUN_EVIDENCE_SCHEMA_VERSION,
      ...(runConfiguration === undefined ? {} : { runConfiguration }),
      replay: await createRunEvidenceReplay(result, runConfiguration)
    },
    null,
    2
  )}\n`;
}

export function runEvidenceFilename(result: RunResult): string {
  return `dwarven-depths-run-evidence-v2-${result.finalStateChecksum}.json`;
}

export async function downloadRunEvidence(
  result: RunResult,
  runConfiguration?: RunConfiguration
): Promise<void> {
  const url = URL.createObjectURL(
    new Blob([await serializeRunEvidence(result, runConfiguration)], {
      type: "application/json;charset=utf-8"
    })
  );
  try {
    const link = document.createElement("a");
    link.download = runEvidenceFilename(result);
    link.href = url;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
