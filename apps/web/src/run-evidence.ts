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
import type { WorkerMessage } from "./protocol.js";

export const RUN_EVIDENCE_SCHEMA_VERSION = 2 as const;

export type RunResult = Extract<WorkerMessage, { readonly type: "result" }>;

export async function createRunEvidenceReplay(
  result: RunResult
): Promise<ReplayDefinition> {
  const content = await compileContent(
    shieldSlamContentFixture as unknown as ContentBundle
  );
  const authoredScenario = compileScenario(
    shieldSlamScenarioFixture as unknown as ScenarioDefinition,
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

export async function serializeRunEvidence(result: RunResult): Promise<string> {
  return `${JSON.stringify(
    {
      schemaVersion: RUN_EVIDENCE_SCHEMA_VERSION,
      replay: await createRunEvidenceReplay(result)
    },
    null,
    2
  )}\n`;
}

export function runEvidenceFilename(result: RunResult): string {
  return `dwarven-depths-run-evidence-v2-${result.finalStateChecksum}.json`;
}

export async function downloadRunEvidence(result: RunResult): Promise<void> {
  const url = URL.createObjectURL(
    new Blob([await serializeRunEvidence(result)], {
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
