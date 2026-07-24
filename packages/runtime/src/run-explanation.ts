import {
  canonicalStringify,
  type DiagnosticCause,
  type LifecycleDiagnosticRecord,
  type SimulationEvent,
  type TerminalResult
} from "@dwarven-depths/contracts";

export interface RunExplanationIdentity {
  readonly repositoryRevision: string;
  readonly contentManifestHash: string;
  readonly scenarioId: string;
  readonly scenarioHash: string;
  readonly seed: string;
  readonly replayIdentityHash: string;
}

export interface RunExplanationEntry {
  readonly eventId: string;
  readonly tick: number;
  readonly sequence: number;
  readonly eventType: SimulationEvent["type"];
  readonly reasonCode: string;
  readonly causes: readonly DiagnosticCause[];
}

export interface RunExplanationReport {
  readonly schemaVersion: 1;
  readonly identity: RunExplanationIdentity;
  readonly outcome: {
    readonly terminalResult: TerminalResult;
    readonly terminalTick: number;
    readonly eventCount: number;
  };
  readonly events: readonly RunExplanationEntry[];
}

export interface RunExplanationRequest {
  readonly identity: RunExplanationIdentity;
  readonly terminalResult: TerminalResult;
  readonly terminalTick: number;
  readonly events: readonly SimulationEvent[];
  readonly diagnostics: readonly LifecycleDiagnosticRecord[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareEventOrder(
  left: Pick<SimulationEvent, "tick" | "sequence" | "id">,
  right: Pick<SimulationEvent, "tick" | "sequence" | "id">
): number {
  return (
    left.tick - right.tick ||
    left.sequence - right.sequence ||
    compareText(left.id, right.id)
  );
}

function cloneCause(cause: DiagnosticCause): DiagnosticCause {
  return cause.kind === "event"
    ? Object.freeze({ kind: "event", eventId: cause.eventId })
    : Object.freeze({
        kind: "command",
        sequence: cause.sequence,
        atTick: cause.atTick,
        commandType: cause.commandType
      });
}

export function createRunExplanation(
  request: RunExplanationRequest
): RunExplanationReport {
  canonicalStringify(request);
  if (!Number.isSafeInteger(request.terminalTick) || request.terminalTick < 0) {
    throw new RangeError("terminalTick must be a non-negative safe integer");
  }

  const diagnosticsByEventId = new Map<string, LifecycleDiagnosticRecord>();
  for (const diagnostic of request.diagnostics) {
    if (diagnosticsByEventId.has(diagnostic.eventId)) {
      throw new TypeError(
        `duplicate diagnostic eventId: ${diagnostic.eventId}`
      );
    }
    diagnosticsByEventId.set(diagnostic.eventId, diagnostic);
  }

  const seenEventIds = new Set<string>();
  const events = [...request.events].sort(compareEventOrder).map((event) => {
    if (seenEventIds.has(event.id)) {
      throw new TypeError(`duplicate event id: ${event.id}`);
    }
    seenEventIds.add(event.id);
    const diagnostic = diagnosticsByEventId.get(event.id);
    if (diagnostic === undefined) {
      throw new TypeError(`missing diagnostic for event: ${event.id}`);
    }
    if (
      diagnostic.tick !== event.tick ||
      diagnostic.sequence !== event.sequence ||
      diagnostic.eventType !== event.type ||
      diagnostic.reasonCode !== event.ruleId
    ) {
      throw new TypeError(`diagnostic does not match event: ${event.id}`);
    }
    return Object.freeze({
      eventId: event.id,
      tick: event.tick,
      sequence: event.sequence,
      eventType: event.type,
      reasonCode: diagnostic.reasonCode,
      causes: Object.freeze(diagnostic.causes.map(cloneCause))
    });
  });

  const unmatchedDiagnostic = request.diagnostics.find(
    (diagnostic) => !seenEventIds.has(diagnostic.eventId)
  );
  if (unmatchedDiagnostic !== undefined) {
    throw new TypeError(
      `diagnostic references unknown event: ${unmatchedDiagnostic.eventId}`
    );
  }

  return Object.freeze({
    schemaVersion: 1,
    identity: Object.freeze({ ...request.identity }),
    outcome: Object.freeze({
      terminalResult: request.terminalResult,
      terminalTick: request.terminalTick,
      eventCount: events.length
    }),
    events: Object.freeze(events)
  });
}

function formatCause(cause: DiagnosticCause): string {
  return cause.kind === "event"
    ? `event ${cause.eventId}`
    : `command #${cause.sequence} (${cause.commandType}) at tick ${cause.atTick}`;
}

export function renderRunExplanationMarkdown(
  report: RunExplanationReport
): string {
  const lines = [
    `# Run explanation: ${report.identity.scenarioId}`,
    "",
    "## Identity",
    "",
    `- Repository revision: \`${report.identity.repositoryRevision}\``,
    `- Content manifest: \`${report.identity.contentManifestHash}\``,
    `- Scenario hash: \`${report.identity.scenarioHash}\``,
    `- Seed: \`${report.identity.seed}\``,
    `- Replay identity: \`${report.identity.replayIdentityHash}\``,
    "",
    "## Outcome",
    "",
    `- Result: **${report.outcome.terminalResult}** at tick ${report.outcome.terminalTick}`,
    `- Explained events: ${report.outcome.eventCount}`,
    "",
    "## Causal events",
    ""
  ];

  if (report.events.length === 0) {
    lines.push("- No canonical events were emitted.");
  } else {
    for (const event of report.events) {
      const causes =
        event.causes.length === 0
          ? "no recorded causal reference"
          : event.causes.map(formatCause).join(", ");
      lines.push(
        `- Tick ${event.tick}, sequence ${event.sequence}: \`${event.eventId}\` ` +
          `emitted \`${event.eventType}\` under \`${event.reasonCode}\`; caused by ${causes}.`
      );
    }
  }

  return `${lines.join("\n")}\n`;
}
