import {
  type CompiledContent,
  compileReplay
} from "@dwarven-depths/content-runtime";
import {
  type CommandEnvelope,
  canonicalHash,
  type ReplayDefinition,
  type ScenarioDefinition,
  type SimulationEvent,
  type SimulationState
} from "@dwarven-depths/contracts";
import {
  createInitialState,
  stateChecksum,
  stepSimulation
} from "@dwarven-depths/sim-core";

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
  | "scenario_id_mismatch"
  | "level_id_mismatch"
  | "seed_mismatch"
  | "simulation_schema_mismatch"
  | "rng_algorithm_mismatch"
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

export async function runScenario(
  scenario: ScenarioDefinition,
  content: CompiledContent
): Promise<RuntimeResult> {
  let state = createInitialState(content, scenario.levelId, scenario.seed);
  const events: SimulationEvent[] = [];
  const executedCommands: CommandEnvelope[] = [];
  let commandSequence = 0;

  while (state.phase !== "TERMINAL" && state.tick < scenario.maximumTicks) {
    const commands: CommandEnvelope[] = scenario.commands
      .filter((command) => command.atTick === state.tick)
      .map((command) => ({
        tick: state.tick,
        sequence: commandSequence++,
        command
      }));
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

  const result = await runScenario(scenario, content);
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
