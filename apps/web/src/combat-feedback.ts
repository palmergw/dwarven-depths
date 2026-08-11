import type { RenderEntity, RenderSnapshot } from "./render-snapshot.js";

export interface CombatFeedback {
  readonly tick: number;
  readonly arrivals: readonly RenderEntity[];
  readonly departures: readonly RenderEntity[];
  readonly terminal: boolean;
  readonly cues: readonly CombatSoundCue[];
  readonly summary: string;
}

export type CombatSoundCue =
  | "wave"
  | "elite"
  | "boss"
  | "basic_attack"
  | "ranged_attack"
  | "shield_slam_commit"
  | "shield_slam_impact"
  | "damage"
  | "status"
  | "departure"
  | "victory"
  | "defeat"
  | "terminal"
  | "ui_confirm"
  | "ui_reject"
  | "pause"
  | "resume"
  | "speed";

const phaseOrder = { preparation: 0, running: 1, terminal: 2 } as const;

function byId(left: RenderEntity, right: RenderEntity): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function deriveSoundCues(
  previous: RenderSnapshot | undefined,
  current: RenderSnapshot,
  arrivals: readonly RenderEntity[],
  departures: readonly RenderEntity[],
  terminal: boolean
): readonly CombatSoundCue[] {
  const cues: CombatSoundCue[] = [];
  if (arrivals.length > 0) {
    if (current.schemaVersion === 2) {
      const arrived = new Set(arrivals.map(({ id }) => id));
      const entities = current.entities.filter(({ id }) => arrived.has(id));
      cues.push(
        entities.some(({ boss }) => boss)
          ? "boss"
          : entities.some(({ elite }) => elite)
            ? "elite"
            : "wave"
      );
    } else cues.push("wave");
  }
  if (previous?.schemaVersion === 2 && current.schemaVersion === 2) {
    const previousById = new Map(
      previous.entities.map((entity) => [entity.id, entity])
    );
    let basicAttack = false;
    let rangedAttack = false;
    let shieldSlamCommit = false;
    let shieldSlamImpact = false;
    let damage = false;
    let status = false;
    for (const entity of current.entities) {
      const prior = previousById.get(entity.id);
      if (prior === undefined) continue;
      const enteredActionPhase =
        prior.action.kind !== entity.action.kind ||
        prior.action.phase !== entity.action.phase ||
        prior.action.abilityId !== entity.action.abilityId;
      if (enteredActionPhase && entity.action.kind === "basic_attack") {
        if (entity.visualId === "enemy.goblin_slinger") rangedAttack = true;
        else basicAttack = true;
      }
      if (
        enteredActionPhase &&
        entity.action.kind === "ability" &&
        entity.action.abilityId === "ability.iron_warden.shield_slam"
      ) {
        if (entity.action.phase === "committed") shieldSlamCommit = true;
        if (entity.action.phase === "impact") shieldSlamImpact = true;
      }
      if (entity.currentHealth < prior.currentHealth) damage = true;
      const priorStatuses = new Set(prior.statuses.map(({ id }) => id));
      if (entity.statuses.some(({ id }) => !priorStatuses.has(id)))
        status = true;
    }
    if (basicAttack) cues.push("basic_attack");
    if (rangedAttack) cues.push("ranged_attack");
    if (shieldSlamCommit) cues.push("shield_slam_commit");
    if (shieldSlamImpact) cues.push("shield_slam_impact");
    if (damage) cues.push("damage");
    if (status) cues.push("status");
  }
  if (departures.length > 0) cues.push("departure");
  if (terminal)
    cues.push(
      current.schemaVersion === 2
        ? (current.encounter.terminalResult ?? "terminal")
        : "terminal"
    );
  return cues;
}

export function isCombatFeedbackProgression(
  previous: RenderSnapshot,
  current: RenderSnapshot
): boolean {
  return (
    previous.levelId === current.levelId &&
    (current.schemaVersion !== 2 ||
      (previous.schemaVersion === 2 &&
        previous.scenarioId === current.scenarioId &&
        current.previousTick === previous.tick &&
        previous.mapId === current.mapId)) &&
    (current.tick > previous.tick ||
      (current.tick === previous.tick &&
        phaseOrder[current.phase] > phaseOrder[previous.phase]))
  );
}

export function shouldAdvanceCombatFeedbackBaseline(
  previous: RenderSnapshot,
  current: RenderSnapshot
): boolean {
  if (isCombatFeedbackProgression(previous, current)) return true;
  return (
    previous.schemaVersion === 2 &&
    current.schemaVersion === 2 &&
    previous.levelId === current.levelId &&
    previous.mapId === current.mapId &&
    previous.scenarioId === current.scenarioId &&
    current.tick > previous.tick &&
    current.previousTick !== null &&
    current.previousTick > previous.tick
  );
}

export function deriveCombatFeedback(
  previous: RenderSnapshot | undefined,
  current: RenderSnapshot
): CombatFeedback | undefined {
  if (previous === undefined) {
    if (current.schemaVersion !== 2) return undefined;
    const arrivals = current.entities
      .filter((entity) =>
        current.entityTransitions.some(
          (transition) =>
            transition.entityId === entity.id && transition.kind === "spawned"
        )
      )
      .sort(byId);
    if (arrivals.length === 0) return undefined;
    return {
      tick: current.tick,
      arrivals,
      departures: [],
      terminal: false,
      cues: deriveSoundCues(undefined, current, arrivals, [], false),
      summary: `Combat update at tick ${current.tick}: ${arrivals.length} ${arrivals.length === 1 ? "combatant arrived" : "combatants arrived"}.`
    };
  }
  if (!isCombatFeedbackProgression(previous, current)) return undefined;

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
  const cues = deriveSoundCues(
    previous,
    current,
    arrivals,
    departures,
    terminal
  );
  if (cues.length === 0) return undefined;

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
  if (
    arrivals.length === 0 &&
    departures.length === 0 &&
    !terminal &&
    cues.length > 0
  )
    details.push(cues.map((cue) => cue.replaceAll("_", " ")).join(", "));
  return {
    tick: current.tick,
    arrivals,
    departures,
    terminal,
    cues,
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
  playCue(cue: CombatSoundCue): void;
  unlock(): void;
  close(): void;
}

export function createCombatSoundPlayer(
  createContext: () => CombatAudioContext = () => new AudioContext(),
  volumeScale = 1
): CombatSoundPlayer {
  let context: CombatAudioContext | undefined;
  let closed = false;
  let resumePromise: Promise<void> | undefined;
  let pendingCues: readonly CombatSoundCue[] | undefined;

  function ensureContext(): CombatAudioContext | undefined {
    if (closed) return undefined;
    context ??= createContext();
    return context;
  }

  function schedule(cues: readonly CombatSoundCue[]): void {
    if (context === undefined || closed) return;
    const cueSettings: Readonly<
      Record<CombatSoundCue, readonly [number, OscillatorType, number]>
    > = {
      wave: [330, "square", 0.035],
      elite: [260, "sawtooth", 0.04],
      boss: [110, "sawtooth", 0.05],
      basic_attack: [190, "triangle", 0.025],
      ranged_attack: [620, "sine", 0.022],
      shield_slam_commit: [145, "square", 0.035],
      shield_slam_impact: [90, "sawtooth", 0.05],
      damage: [120, "square", 0.03],
      status: [520, "triangle", 0.022],
      departure: [165, "square", 0.035],
      victory: [660, "triangle", 0.045],
      defeat: [82, "sawtooth", 0.045],
      terminal: [440, "square", 0.035],
      ui_confirm: [480, "sine", 0.018],
      ui_reject: [130, "square", 0.025],
      pause: [240, "triangle", 0.02],
      resume: [360, "triangle", 0.02],
      speed: [540, "sine", 0.018]
    };
    const finalCue = cues.at(-1);
    const boundedCues =
      cues.length <= 4 || finalCue === undefined
        ? cues
        : [...cues.slice(0, 3), finalCue];
    for (const [index, cue] of boundedCues.entries()) {
      const [frequency, oscillatorType, volume] = cueSettings[cue];
      const start = context.currentTime + index * 0.07;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = oscillatorType;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(
        volume * Math.min(1, Math.max(0, volumeScale)),
        start
      );
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.06);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.07);
    }
  }

  function beginResume(activeContext: CombatAudioContext): void {
    if (resumePromise !== undefined) return;
    resumePromise = activeContext.resume().then(
      () => {
        resumePromise = undefined;
        const latestCues = pendingCues;
        pendingCues = undefined;
        if (latestCues !== undefined) schedule(latestCues);
      },
      () => {
        resumePromise = undefined;
        pendingCues = undefined;
      }
    );
  }

  function playCues(cues: readonly CombatSoundCue[]): void {
    const activeContext = ensureContext();
    if (activeContext === undefined) return;
    if (resumePromise !== undefined) {
      pendingCues = cues;
      return;
    }
    if (activeContext.state === "suspended") {
      pendingCues = cues;
      beginResume(activeContext);
      return;
    }
    schedule(cues);
  }

  return {
    play(feedback) {
      if (closed) return;
      try {
        playCues(feedback.cues);
      } catch {
        // Presentation feedback remains visual and textual without Web Audio.
      }
    },
    playCue(cue) {
      if (closed) return;
      try {
        playCues([cue]);
      } catch {
        // Player controls remain operable when Web Audio is unavailable.
      }
    },
    unlock() {
      if (closed) return;
      try {
        const activeContext = ensureContext();
        if (activeContext?.state === "suspended") beginResume(activeContext);
      } catch {
        // A later user gesture may retry context creation.
      }
    },
    close() {
      if (closed) return;
      closed = true;
      pendingCues = undefined;
      if (context !== undefined) void context.close().catch(() => undefined);
    }
  };
}
