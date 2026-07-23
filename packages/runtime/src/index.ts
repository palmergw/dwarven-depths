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
  readonly terminalResult: "victory" | "defeat";
  readonly terminalTick: number;
  readonly finalState: SimulationState;
  readonly finalStateChecksum: string;
  readonly events: readonly SimulationEvent[];
  readonly eventStreamChecksum: string;
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
    const result = stepSimulation(state, commands, content);
    state = result.state;
    events.push(...result.events);
  }

  if (state.phase !== "TERMINAL" || !state.terminalResult) {
    throw new Error(
      `Scenario ${scenario.id} did not terminate within ${scenario.maximumTicks} ticks`
    );
  }
  if (
    scenario.expectedTerminalResult &&
    state.terminalResult !== scenario.expectedTerminalResult
  ) {
    throw new Error(
      `Scenario ${scenario.id} expected ${scenario.expectedTerminalResult} but produced ${state.terminalResult}`
    );
  }

  return {
    scenarioId: scenario.id,
    terminalResult: state.terminalResult,
    terminalTick: state.tick,
    finalState: state,
    finalStateChecksum: await stateChecksum(state),
    events,
    eventStreamChecksum: await canonicalHash(events)
  };
}
