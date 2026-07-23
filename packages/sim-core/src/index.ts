import type { CompiledContent } from "@dwarven-depths/content-runtime";
import {
  type CommandEnvelope,
  canonicalHash,
  type SimulationEvent,
  type SimulationState
} from "@dwarven-depths/contracts";

export interface StepResult {
  readonly state: SimulationState;
  readonly events: readonly SimulationEvent[];
}

export function seedToUint32(seed: string): number {
  if (seed.length > 10 || !/^[1-9]\d*$/.test(seed)) {
    throw new RangeError(
      "seed must be a canonical integer between 1 and 4294967295"
    );
  }
  const value = BigInt(seed);
  if (value > 0xffff_ffffn) {
    throw new RangeError(
      "seed must be a canonical integer between 1 and 4294967295"
    );
  }
  return Number(value);
}

export function nextUint32(state: number): number {
  let value = state >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

export function createInitialState(
  content: CompiledContent,
  levelId: SimulationState["levelId"],
  seed: string
): SimulationState {
  if (!content.levels.has(levelId))
    throw new Error(`Unknown level ID: ${levelId}`);
  return {
    schemaVersion: 1,
    contentVersion: content.bundle.contentVersion,
    tick: 0,
    seed,
    rngState: seedToUint32(seed),
    levelId,
    phase: "PREPARATION",
    eventSequence: 0
  };
}

function event(
  state: SimulationState,
  offset: number,
  type: SimulationEvent["type"],
  ruleId: string
): SimulationEvent {
  const sequence = state.eventSequence + offset;
  return {
    id: `event.${String(sequence).padStart(6, "0")}`,
    tick: state.tick,
    sequence,
    type,
    ruleId
  };
}

export function stepSimulation(
  state: SimulationState,
  commands: readonly CommandEnvelope[],
  content: CompiledContent
): StepResult {
  if (state.phase === "TERMINAL") return { state, events: [] };

  const accepted = commands
    .filter(
      (envelope) =>
        envelope.tick === state.tick &&
        envelope.command.atTick === envelope.tick &&
        envelope.command.type === "confirmPreparation"
    )
    .sort((left, right) => left.sequence - right.sequence);

  if (state.phase === "PREPARATION" && accepted.length > 0) {
    const level = content.levels.get(state.levelId);
    if (!level) throw new Error(`Unknown level ID: ${state.levelId}`);

    const events: SimulationEvent[] = [
      event(state, 0, "round.started", "SIM-LIFECYCLE-001")
    ];
    if (level.waveIds.length === 0) {
      events.push(
        event(state, 1, "final_cleanup.entered", "SIM-FINAL-CLEANUP-001")
      );
      events.push(event(state, 2, "round.victory", "SIM-VICTORY-001"));
      return {
        state: {
          ...state,
          phase: "TERMINAL",
          terminalResult: "victory",
          eventSequence: state.eventSequence + events.length
        },
        events
      };
    }

    return {
      state: {
        ...state,
        tick: state.tick + 1,
        phase: "COMBAT_RUNNING",
        eventSequence: state.eventSequence + events.length
      },
      events
    };
  }

  if (state.phase === "PREPARATION") return { state, events: [] };

  return {
    state: {
      ...state,
      tick: state.tick + 1
    },
    events: []
  };
}

export async function stateChecksum(state: SimulationState): Promise<string> {
  return canonicalHash(state);
}
