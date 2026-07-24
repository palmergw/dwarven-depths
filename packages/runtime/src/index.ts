import {
  type CompiledContent,
  compileReplay
} from "@dwarven-depths/content-runtime";
import {
  type CommandEnvelope,
  type ContentBundle,
  canonicalHash,
  canonicalStringify,
  type DiagnosticCause,
  type LifecycleDiagnosticRecord,
  type ReplayCheckpoint,
  type ReplayDefinition,
  type ScenarioDefinition,
  type SimulationEvent,
  type SimulationState,
  type TimelineRecord
} from "@dwarven-depths/contracts";
import {
  createInitialState,
  stateChecksum,
  stepSimulation
} from "@dwarven-depths/sim-core";

export {
  type BattlefieldRenderFormat,
  type BattlefieldRenderLayer,
  type BattlefieldRenderRequest,
  type BattlefieldRouteSelection,
  renderBattlefieldSvg,
  renderBattlefieldText
} from "./battlefield-render.js";
export {
  type BossRewardCheckpointRequest,
  type BossRewardCheckpointResult,
  resolveBossRewardCheckpoint
} from "./boss-reward-checkpoint.js";
export {
  createPhase2SystemScenarioEvidence,
  type Phase2SystemScenarioEvidence
} from "./phase-2-system-scenarios.js";
export {
  createPhase3SystemScenarioEvidence,
  type Phase3SystemScenarioEvidence
} from "./phase-3-system-scenarios.js";
export {
  createRunExplanation,
  type RunExplanationEntry,
  type RunExplanationIdentity,
  type RunExplanationReport,
  type RunExplanationRequest,
  renderRunExplanationMarkdown
} from "./run-explanation.js";
export {
  evaluateTerminalState,
  type TerminalEvaluationReason,
  type TerminalEvaluationRequest,
  type TerminalEvaluationResult
} from "./terminal-evaluation.js";

export interface RuntimeResult {
  readonly scenarioId: string;
  readonly scenarioHash: string;
  readonly terminalResult: "victory" | "defeat";
  readonly terminalTick: number;
  readonly finalState: SimulationState;
  readonly finalStateChecksum: string;
  readonly commands: readonly CommandEnvelope[];
  readonly events: readonly SimulationEvent[];
  readonly eventStreamChecksum: string;
}

export interface RunComparisonEvidence {
  readonly content: ContentBundle;
  readonly scenario: ScenarioDefinition;
  readonly commands: readonly CommandEnvelope[];
  readonly checkpoints: readonly ReplayCheckpoint[];
  readonly events: readonly SimulationEvent[];
  readonly finalState: SimulationState;
}

export type DivergenceCategory =
  | "content"
  | "scenario"
  | "input"
  | "event"
  | "state";

export interface FirstDivergenceEvidence {
  readonly category: DivergenceCategory;
  readonly tick: number;
  readonly path: string;
}

export type RunComparisonResult =
  | { readonly schemaVersion: 1; readonly equivalent: true }
  | {
      readonly schemaVersion: 1;
      readonly equivalent: false;
      readonly firstDivergence: FirstDivergenceEvidence;
    };

function comparisonPointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function firstCanonicalDifference(
  baseline: unknown,
  candidate: unknown,
  path = "$"
): string | undefined {
  if (Object.is(baseline, candidate)) return undefined;
  if (
    typeof baseline !== "object" ||
    baseline === null ||
    typeof candidate !== "object" ||
    candidate === null
  ) {
    return path;
  }
  if (Array.isArray(baseline) || Array.isArray(candidate)) {
    if (!Array.isArray(baseline) || !Array.isArray(candidate)) return path;
    const length = Math.max(baseline.length, candidate.length);
    for (let index = 0; index < length; index += 1) {
      if (index >= baseline.length || index >= candidate.length)
        return `${path}/${index}`;
      const difference = firstCanonicalDifference(
        baseline[index],
        candidate[index],
        `${path}/${index}`
      );
      if (difference !== undefined) return difference;
    }
    return path;
  }
  const baselineRecord = baseline as Record<string, unknown>;
  const candidateRecord = candidate as Record<string, unknown>;
  const keys = [
    ...new Set([
      ...Object.keys(baselineRecord),
      ...Object.keys(candidateRecord)
    ])
  ].sort();
  for (const key of keys) {
    const childPath = `${path}/${comparisonPointerSegment(key)}`;
    if (
      !Object.hasOwn(baselineRecord, key) ||
      !Object.hasOwn(candidateRecord, key)
    ) {
      return childPath;
    }
    const difference = firstCanonicalDifference(
      baselineRecord[key],
      candidateRecord[key],
      childPath
    );
    if (difference !== undefined) return difference;
  }
  return path;
}

function changedTick(
  baseline: readonly { readonly tick: number }[],
  candidate: readonly { readonly tick: number }[],
  path: string
): number {
  const match = /^\$\/(\d+)/.exec(path);
  const index = match === null ? 0 : Number(match[1]);
  return Math.min(
    baseline[index]?.tick ?? candidate[index]?.tick ?? 0,
    candidate[index]?.tick ?? baseline[index]?.tick ?? 0
  );
}

/**
 * Compares only authoritative evidence. Paths use an RFC 6901-style JSON
 * Pointer rooted at `$`; object keys are code-point sorted and array segments
 * are zero-based indexes. Provenance and other manifest metadata are excluded.
 */
export function compareRunEvidence(
  baseline: RunComparisonEvidence,
  candidate: RunComparisonEvidence
): RunComparisonResult {
  // Validate the complete boundary before emitting partial comparison evidence.
  canonicalStringify(baseline);
  canonicalStringify(candidate);

  const { commands: _baselineCommands, ...baselineScenario } =
    baseline.scenario;
  const { commands: _candidateCommands, ...candidateScenario } =
    candidate.scenario;
  const comparisons: readonly {
    category: DivergenceCategory;
    baseline: unknown;
    candidate: unknown;
    tick: (path: string) => number;
  }[] = [
    {
      category: "content",
      baseline: baseline.content,
      candidate: candidate.content,
      tick: () => 0
    },
    {
      category: "scenario",
      baseline: baselineScenario,
      candidate: candidateScenario,
      tick: () => 0
    },
    {
      category: "input",
      baseline: baseline.commands,
      candidate: candidate.commands,
      tick: (path) => changedTick(baseline.commands, candidate.commands, path)
    },
    {
      category: "event",
      baseline: baseline.events,
      candidate: candidate.events,
      tick: (path) => changedTick(baseline.events, candidate.events, path)
    },
    {
      category: "state",
      baseline: baseline.finalState,
      candidate: candidate.finalState,
      tick: () => Math.min(baseline.finalState.tick, candidate.finalState.tick)
    }
  ];
  for (const comparison of comparisons) {
    if (
      canonicalStringify(comparison.baseline) ===
      canonicalStringify(comparison.candidate)
    ) {
      continue;
    }
    const path =
      firstCanonicalDifference(comparison.baseline, comparison.candidate) ??
      "$";
    return Object.freeze({
      schemaVersion: 1,
      equivalent: false,
      firstDivergence: Object.freeze({
        category: comparison.category,
        tick: comparison.tick(path),
        path
      })
    });
  }
  return Object.freeze({ schemaVersion: 1, equivalent: true });
}

export function createTimelineRecords(
  events: readonly SimulationEvent[],
  replay: ReplayDefinition
): readonly TimelineRecord[] {
  const records: TimelineRecord[] = [];
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event === undefined) throw new TypeError(`events/${index} is missing`);
    const eventEvidence = Object.freeze({ ...event });
    records.push(
      Object.freeze({
        schemaVersion: 1,
        kind: "event",
        tick: eventEvidence.tick,
        sequence: eventEvidence.sequence,
        event: eventEvidence
      })
    );
  }
  for (
    let checkpointIndex = 0;
    checkpointIndex < replay.checkpoints.length;
    checkpointIndex += 1
  ) {
    const checkpoint = replay.checkpoints[checkpointIndex];
    if (checkpoint === undefined) {
      throw new TypeError(`replay/checkpoints/${checkpointIndex} is missing`);
    }
    let sequence = 0;
    for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
      const event = events[eventIndex];
      if (event === undefined) {
        throw new TypeError(`events/${eventIndex} is missing`);
      }
      if (event.tick === checkpoint.tick && event.sequence >= sequence) {
        sequence = event.sequence + 1;
      }
    }
    records.push(
      Object.freeze({
        schemaVersion: 1,
        kind: "checkpoint",
        tick: checkpoint.tick,
        sequence,
        checkpoint: Object.freeze({ ...checkpoint })
      })
    );
  }
  records.sort(
    (left, right) =>
      left.tick - right.tick ||
      left.sequence - right.sequence ||
      (left.kind < right.kind ? -1 : left.kind > right.kind ? 1 : 0)
  );
  return Object.freeze(records);
}

export function createLifecycleDiagnostics(
  events: readonly SimulationEvent[],
  commands: readonly CommandEnvelope[]
): readonly LifecycleDiagnosticRecord[] {
  const diagnostics: LifecycleDiagnosticRecord[] = [];
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event === undefined) throw new TypeError(`events/${index} is missing`);
    const causes: DiagnosticCause[] = [];
    const priorEvent = index === 0 ? undefined : events[index - 1];
    if (priorEvent !== undefined) {
      causes.push(Object.freeze({ kind: "event", eventId: priorEvent.id }));
    } else {
      for (
        let commandIndex = 0;
        commandIndex < commands.length;
        commandIndex += 1
      ) {
        const command = commands[commandIndex];
        if (command === undefined) {
          throw new TypeError(`commands/${commandIndex} is missing`);
        }
        if (command.tick === event.tick) {
          causes.push(
            Object.freeze({
              kind: "command",
              sequence: command.sequence,
              atTick: command.tick,
              commandType: command.command.type
            })
          );
        }
      }
    }
    diagnostics.push(
      Object.freeze({
        schemaVersion: 1,
        id: `diagnostic.${String(index).padStart(6, "0")}`,
        kind: "lifecycle",
        tick: event.tick,
        sequence: event.sequence,
        eventType: event.type,
        reasonCode: event.ruleId,
        eventId: event.id,
        causes: Object.freeze(causes)
      })
    );
  }
  return Object.freeze(diagnostics);
}

export class RuntimeAssertionError extends Error {
  readonly code = "unexpected_terminal_result";

  constructor(message: string) {
    super(message);
    this.name = "RuntimeAssertionError";
  }
}

export class RuntimeSafetyStopError extends Error {
  readonly code: "simulation_stalled" | "tick_budget_exhausted";

  constructor(
    code: "simulation_stalled" | "tick_budget_exhausted",
    message: string
  ) {
    super(message);
    this.name = "RuntimeSafetyStopError";
    this.code = code;
  }
}

export type ReplayDivergenceCode =
  | "content_manifest_mismatch"
  | "content_version_mismatch"
  | "scenario_hash_mismatch"
  | "scenario_expectation_mismatch"
  | "scenario_id_mismatch"
  | "level_id_mismatch"
  | "seed_mismatch"
  | "simulation_schema_mismatch"
  | "rng_algorithm_mismatch"
  | "execution_failed"
  | "commands_mismatch"
  | "terminal_result_mismatch"
  | "terminal_tick_mismatch"
  | "state_checksum_mismatch"
  | "event_stream_checksum_mismatch";

export class ReplayDivergenceError extends Error {
  readonly code: ReplayDivergenceCode;
  readonly expected: string | number;
  readonly actual: string | number;
  readonly checkpointTick: number | undefined;

  constructor(
    code: ReplayDivergenceCode,
    message: string,
    expected: string | number,
    actual: string | number,
    checkpointTick?: number
  ) {
    super(message);
    this.name = "ReplayDivergenceError";
    this.code = code;
    this.expected = expected;
    this.actual = actual;
    this.checkpointTick = checkpointTick;
  }
}

async function executeScenario(
  scenario: ScenarioDefinition,
  content: CompiledContent,
  replayCommands: readonly CommandEnvelope[] | undefined,
  enforceScenarioExpectation: boolean
): Promise<RuntimeResult> {
  let state = createInitialState(content, scenario.levelId, scenario.seed);
  const events: SimulationEvent[] = [];
  const executedCommands: CommandEnvelope[] = [];
  let commandSequence = 0;

  while (state.phase !== "TERMINAL" && state.tick < scenario.maximumTicks) {
    const commands: CommandEnvelope[] =
      replayCommands === undefined
        ? scenario.commands
            .filter((command) => command.atTick === state.tick)
            .map((command) => ({
              tick: state.tick,
              sequence: commandSequence++,
              command
            }))
        : replayCommands
            .filter((envelope) => envelope.tick === state.tick)
            .map((envelope) => ({ ...envelope }));
    const previousState = state;
    executedCommands.push(...commands);
    const result = stepSimulation(state, commands, content);
    if (result.state === previousState) {
      throw new RuntimeSafetyStopError(
        "simulation_stalled",
        `Scenario ${scenario.id} made no progress at tick ${state.tick}`
      );
    }
    state = result.state;
    events.push(...result.events);
  }

  if (state.phase !== "TERMINAL" || !state.terminalResult) {
    throw new RuntimeSafetyStopError(
      "tick_budget_exhausted",
      `Scenario ${scenario.id} did not terminate within ${scenario.maximumTicks} ticks`
    );
  }
  if (
    enforceScenarioExpectation &&
    scenario.expectedTerminalResult &&
    state.terminalResult !== scenario.expectedTerminalResult
  ) {
    throw new RuntimeAssertionError(
      `Scenario ${scenario.id} expected ${scenario.expectedTerminalResult} but produced ${state.terminalResult}`
    );
  }

  const terminalResult = state.terminalResult;
  const finalState = Object.freeze({ ...state });
  const immutableCommands = Object.freeze(
    executedCommands.map((envelope) =>
      Object.freeze({
        ...envelope,
        command: Object.freeze({ ...envelope.command })
      })
    )
  );
  const immutableEvents = Object.freeze(
    events.map((simulationEvent) => Object.freeze({ ...simulationEvent }))
  );
  const [scenarioHash, finalStateChecksum, eventStreamChecksum] =
    await Promise.all([
      canonicalHash(scenario),
      stateChecksum(finalState),
      canonicalHash(immutableEvents)
    ]);
  return Object.freeze({
    scenarioId: scenario.id,
    scenarioHash,
    terminalResult,
    terminalTick: finalState.tick,
    finalState,
    finalStateChecksum,
    commands: immutableCommands,
    events: immutableEvents,
    eventStreamChecksum
  });
}

export async function runScenario(
  scenario: ScenarioDefinition,
  content: CompiledContent
): Promise<RuntimeResult> {
  return executeScenario(scenario, content, undefined, true);
}

export function createReplayDefinition(
  result: RuntimeResult,
  scenario: ScenarioDefinition,
  content: CompiledContent
): ReplayDefinition {
  return Object.freeze({
    schemaVersion: 1,
    simulationSchemaVersion: result.finalState.schemaVersion,
    contentVersion: content.bundle.contentVersion,
    contentManifestHash: content.manifestHash,
    scenarioId: scenario.id,
    scenarioHash: result.scenarioHash,
    levelId: scenario.levelId,
    seed: scenario.seed,
    rngAlgorithm: "xorshift32-v1",
    commands: result.commands,
    checkpoints: Object.freeze([
      Object.freeze({
        tick: result.terminalTick,
        stateChecksum: result.finalStateChecksum,
        eventStreamChecksum: result.eventStreamChecksum
      })
    ]),
    expectedTerminalResult: result.terminalResult,
    expectedTerminalTick: result.terminalTick
  });
}

function requireMatch(
  condition: boolean,
  code: ReplayDivergenceCode,
  expected: string | number,
  actual: string | number,
  checkpointTick?: number
): void {
  if (condition) return;
  throw new ReplayDivergenceError(
    code,
    `${code}: expected ${expected}, received ${actual}`,
    expected,
    actual,
    checkpointTick
  );
}

export async function verifyReplay(
  replayInput: ReplayDefinition,
  scenario: ScenarioDefinition,
  content: CompiledContent
): Promise<RuntimeResult> {
  const replay = compileReplay(replayInput);
  requireMatch(
    content.manifestHash === replay.contentManifestHash,
    "content_manifest_mismatch",
    replay.contentManifestHash,
    content.manifestHash
  );
  requireMatch(
    content.bundle.contentVersion === replay.contentVersion,
    "content_version_mismatch",
    replay.contentVersion,
    content.bundle.contentVersion
  );
  requireMatch(
    scenario.id === replay.scenarioId,
    "scenario_id_mismatch",
    replay.scenarioId,
    scenario.id
  );
  requireMatch(
    scenario.levelId === replay.levelId,
    "level_id_mismatch",
    replay.levelId,
    scenario.levelId
  );
  requireMatch(
    scenario.seed === replay.seed,
    "seed_mismatch",
    replay.seed,
    scenario.seed
  );
  requireMatch(
    replay.simulationSchemaVersion === 1,
    "simulation_schema_mismatch",
    replay.simulationSchemaVersion,
    1
  );
  requireMatch(
    replay.rngAlgorithm === "xorshift32-v1",
    "rng_algorithm_mismatch",
    replay.rngAlgorithm,
    "xorshift32-v1"
  );
  const scenarioHash = await canonicalHash(scenario);
  requireMatch(
    scenarioHash === replay.scenarioHash,
    "scenario_hash_mismatch",
    replay.scenarioHash,
    scenarioHash
  );
  if (scenario.expectedTerminalResult !== undefined) {
    requireMatch(
      scenario.expectedTerminalResult === replay.expectedTerminalResult,
      "scenario_expectation_mismatch",
      replay.expectedTerminalResult,
      scenario.expectedTerminalResult
    );
  }
  const authoredCommands = scenario.commands.map((command, sequence) => ({
    tick: command.atTick,
    sequence,
    command
  }));
  const [authoredCommandsHash, replayCommandsHash] = await Promise.all([
    canonicalHash(authoredCommands),
    canonicalHash(replay.commands)
  ]);
  requireMatch(
    authoredCommandsHash === replayCommandsHash,
    "commands_mismatch",
    authoredCommandsHash,
    replayCommandsHash
  );

  let result: RuntimeResult;
  try {
    result = await executeScenario(scenario, content, replay.commands, false);
  } catch (error) {
    if (
      error instanceof RuntimeAssertionError ||
      error instanceof RuntimeSafetyStopError
    ) {
      throw new ReplayDivergenceError(
        "execution_failed",
        `Replay execution failed: ${error.code}`,
        replay.expectedTerminalResult,
        error.code,
        replay.expectedTerminalTick
      );
    }
    throw error;
  }
  const [expectedCommandsHash, actualCommandsHash] = await Promise.all([
    canonicalHash(replay.commands),
    canonicalHash(result.commands)
  ]);
  requireMatch(
    actualCommandsHash === expectedCommandsHash,
    "commands_mismatch",
    expectedCommandsHash,
    actualCommandsHash
  );
  requireMatch(
    result.terminalResult === replay.expectedTerminalResult,
    "terminal_result_mismatch",
    replay.expectedTerminalResult,
    result.terminalResult,
    result.terminalTick
  );
  requireMatch(
    result.terminalTick === replay.expectedTerminalTick,
    "terminal_tick_mismatch",
    replay.expectedTerminalTick,
    result.terminalTick,
    result.terminalTick
  );

  const finalCheckpoint = replay.checkpoints.at(-1);
  if (finalCheckpoint === undefined) {
    throw new TypeError("Replay must contain a terminal checkpoint");
  }
  requireMatch(
    result.finalStateChecksum === finalCheckpoint.stateChecksum,
    "state_checksum_mismatch",
    finalCheckpoint.stateChecksum,
    result.finalStateChecksum,
    finalCheckpoint.tick
  );
  requireMatch(
    result.eventStreamChecksum === finalCheckpoint.eventStreamChecksum,
    "event_stream_checksum_mismatch",
    finalCheckpoint.eventStreamChecksum,
    result.eventStreamChecksum,
    finalCheckpoint.tick
  );
  return result;
}
