import type { WorkerMessage } from "./protocol.js";

export const RUN_EVIDENCE_SCHEMA_VERSION = 1 as const;

export type RunResult = Extract<WorkerMessage, { readonly type: "result" }>;

export function serializeRunEvidence(result: RunResult): string {
  return `${JSON.stringify(
    {
      schemaVersion: RUN_EVIDENCE_SCHEMA_VERSION,
      terminalResult: result.terminalResult,
      terminalTick: result.terminalTick,
      finalStateChecksum: result.finalStateChecksum,
      eventStreamChecksum: result.eventStreamChecksum,
      commands: result.commands
    },
    null,
    2
  )}\n`;
}

export function runEvidenceFilename(result: RunResult): string {
  return `dwarven-depths-run-evidence-v1-${result.finalStateChecksum}.json`;
}

export function downloadRunEvidence(result: RunResult): void {
  const url = URL.createObjectURL(
    new Blob([serializeRunEvidence(result)], {
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
