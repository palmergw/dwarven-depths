import type { RenderEntity, RenderSnapshot } from "./render-snapshot.js";

export interface CombatFeedback {
  readonly tick: number;
  readonly arrivals: readonly RenderEntity[];
  readonly departures: readonly RenderEntity[];
  readonly terminal: boolean;
  readonly summary: string;
}

const phaseOrder = { preparation: 0, running: 1, terminal: 2 } as const;

function byId(left: RenderEntity, right: RenderEntity): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export function isCombatFeedbackProgression(
  previous: RenderSnapshot,
  current: RenderSnapshot
): boolean {
  return (
    previous.levelId === current.levelId &&
    (current.schemaVersion !== 2 ||
      (previous.schemaVersion === 2 &&
        current.previousTick === previous.tick &&
        previous.mapId === current.mapId)) &&
    (current.tick > previous.tick ||
      (current.tick === previous.tick &&
        phaseOrder[current.phase] > phaseOrder[previous.phase]))
  );
}

export function deriveCombatFeedback(
  previous: RenderSnapshot | undefined,
  current: RenderSnapshot
): CombatFeedback | undefined {
  if (previous === undefined || !isCombatFeedbackProgression(previous, current))
    return undefined;

  const previousById = new Map(
    previous.entities.map((entity) => [entity.id, entity])
  );
  const currentIds = new Set(current.entities.map((entity) => entity.id));
  const arrivals = current.entities
    .filter((entity) =>
      current.schemaVersion === 2
        ? current.entityTransitions.some(
            (transition) =>
              transition.entityId === entity.id && transition.kind === "spawned"
          )
        : !previousById.has(entity.id)
    )
    .sort(byId);
  const departures = previous.entities
    .filter((entity) =>
      current.schemaVersion === 2
        ? current.entityTransitions.some(
            (transition) =>
              transition.entityId === entity.id &&
              (transition.kind === "downed" || transition.kind === "destroyed")
          )
        : !currentIds.has(entity.id)
    )
    .sort(byId);
  const terminal =
    previous.phase !== "terminal" && current.phase === "terminal";
  if (arrivals.length === 0 && departures.length === 0 && !terminal)
    return undefined;

  const details: string[] = [];
  if (arrivals.length > 0)
    details.push(
      `${arrivals.length} ${arrivals.length === 1 ? "combatant arrived" : "combatants arrived"}`
    );
  if (departures.length > 0)
    details.push(
      `${departures.length} ${departures.length === 1 ? "combatant departed" : "combatants departed"}`
    );
  if (terminal) details.push("combat resolved");
  return {
    tick: current.tick,
    arrivals,
    departures,
    terminal,
    summary: `Combat update at tick ${current.tick}: ${details.join("; ")}.`
  };
}

interface AudioParamLike {
  setValueAtTime(value: number, startTime: number): void;
  exponentialRampToValueAtTime(value: number, endTime: number): void;
}

interface AudioNodeLike {
  connect(destination: unknown): void;
}

interface OscillatorLike extends AudioNodeLike {
  readonly frequency: AudioParamLike;
  type: OscillatorType;
  start(when?: number): void;
  stop(when?: number): void;
}

interface GainLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}

export interface CombatAudioContext {
  readonly currentTime: number;
  readonly destination: unknown;
  readonly state: AudioContextState;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
  resume(): Promise<void>;
  close(): Promise<void>;
}

export interface CombatSoundPlayer {
  play(feedback: CombatFeedback): void;
  close(): void;
}

export function createCombatSoundPlayer(
  createContext: () => CombatAudioContext = () => new AudioContext()
): CombatSoundPlayer {
  let context: CombatAudioContext | undefined;
  let closed = false;

  function schedule(feedback: CombatFeedback): void {
    if (context === undefined || closed) return;
    const frequencies = [
      ...(feedback.arrivals.length > 0 ? [330] : []),
      ...(feedback.departures.length > 0 ? [165] : []),
      ...(feedback.terminal ? [440] : [])
    ];
    for (const [index, frequency] of frequencies.entries()) {
      const start = context.currentTime + index * 0.07;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.035, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.06);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.07);
    }
  }

  return {
    play(feedback) {
      if (closed) return;
      try {
        context ??= createContext();
        if (context.state === "suspended")
          void context
            .resume()
            .then(() => schedule(feedback))
            .catch(() => undefined);
        else schedule(feedback);
      } catch {
        // Presentation feedback remains visual and textual without Web Audio.
      }
    },
    close() {
      if (closed) return;
      closed = true;
      if (context !== undefined) void context.close().catch(() => undefined);
    }
  };
}
