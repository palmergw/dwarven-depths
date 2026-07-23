import type { CompiledContent } from "@dwarven-depths/content-runtime";
import {
  type CommandEnvelope,
  canonicalHash,
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

export async function runScenario(
  scenario: ScenarioDefinition,
  content: CompiledContent
): Promise<RuntimeResult> {
  let state = createInitialState(content, scenario.levelId, scenario.seed);
  const events: SimulationEvent[] = [];
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
    events: immutableEvents,
    eventStreamChecksum
  });
}
