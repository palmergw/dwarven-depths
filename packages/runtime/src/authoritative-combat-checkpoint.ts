import type { CompiledContent } from "@dwarven-depths/content-runtime";
import type {
  AuthoritativeCombatTickResolution,
  DwarfActionPhaseEntry,
  EntityId,
  SimulationState,
  StableId,
  WaveScheduleRequest
} from "@dwarven-depths/contracts";
import type {
  BossRewardDefinition,
  BossRewardResolution,
  ProfileState
} from "@dwarven-depths/progression";
import { resolveBossDeathRewards } from "@dwarven-depths/progression";
import {
  type BattlefieldDwarfDeploymentAuthority,
  resolveAuthoritativeCombatTick
} from "@dwarven-depths/sim-core";
import { resolveBossRewardCheckpoint } from "./boss-reward-checkpoint.js";
import type {
  TerminalEvaluationRequest,
  TerminalEvaluationResult
} from "./terminal-evaluation.js";

export interface AuthoritativeCombatCheckpointRequest {
  readonly schemaVersion: 1;
  readonly state: SimulationState;
  readonly dwarfActionEntries: readonly DwarfActionPhaseEntry[];
  readonly profile: ProfileState;
  readonly rewards: readonly BossRewardDefinition[];
}

export interface AuthoritativeCombatCheckpointResolution {
  readonly schemaVersion: 1;
  readonly combat: AuthoritativeCombatTickResolution;
  readonly bossRewards: BossRewardResolution;
  readonly terminalEvaluation: TerminalEvaluationResult;
}

const requestKeys = [
  "schemaVersion",
  "state",
  "dwarfActionEntries",
  "profile",
  "rewards"
] as const;

interface ParsedCheckpointRequest {
  readonly schemaVersion?: unknown;
  readonly state?: unknown;
  readonly dwarfActionEntries?: unknown;
  readonly profile?: unknown;
  readonly rewards?: unknown;
}

function requireExactDataRecord(
  value: unknown,
  keys: readonly string[],
  description: string
): ParsedCheckpointRequest {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    throw new TypeError(`${description} must be a plain object`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actualKeys = Reflect.ownKeys(value);
  if (
    actualKeys.some((key) => typeof key !== "string") ||
    actualKeys.length !== keys.length ||
    !keys.every((key) => Object.hasOwn(descriptors, key))
  )
    throw new TypeError(
      `${description} must contain exactly ${keys.join(", ")}`
    );
  const record: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    )
      throw new TypeError(`${description}.${key} must be own enumerable data`);
    record[key] = descriptor.value;
  }
  return record;
}

function waveScheduleFromBattlefield(
  state: SimulationState,
  content: CompiledContent
): WaveScheduleRequest {
  const battlefield = state.battlefield;
  if (battlefield === undefined)
    throw new Error(
      "authoritative combat checkpoint requires battlefield state"
    );
  const level = content.levels.get(state.levelId);
  if (level === undefined)
    throw new RangeError(
      "combat checkpoint levelId must reference compiled content"
    );
  const waves = level.waveIds.map((waveId) => {
    const wave = content.waves.get(waveId);
    if (wave === undefined)
      throw new RangeError(
        `combat checkpoint is missing authored wave (${waveId})`
      );
    return wave;
  });
  return Object.freeze({
    schemaVersion: 1,
    currentTick: state.tick,
    level,
    waves: Object.freeze(waves),
    startedWaveIds: battlefield.startedWaveIds,
    firedSpawnIds: battlefield.firedSpawnIds,
    pendingSpawns: battlefield.pendingSpawns
  });
}

/** Derives phase-13 input directly from authoritative battlefield state. */
export function createBattlefieldTerminalEvaluationRequest(
  state: SimulationState,
  content: CompiledContent
): TerminalEvaluationRequest {
  const battlefield = state.battlefield;
  if (battlefield === undefined)
    throw new Error("terminal evaluation requires battlefield state");
  return Object.freeze({
    schemaVersion: 1,
    waveSchedule: waveScheduleFromBattlefield(state, content),
    livingDwarfIds: battlefield.dwarfCombatants
      .filter((combatant) => combatant.lifecycleState === "active")
      .map((combatant) => combatant.entityId),
    livingHostileEnemyIds: battlefield.enemyCombatants
      .filter((combatant) => combatant.lifecycleState === "active")
      .map((combatant) => combatant.entityId),
    livingHostileDeployableIds: []
  });
}

function bossDeathEventId(entityId: EntityId): StableId {
  return `death.${entityId.slice("entity.".length)}` as StableId;
}

function prevalidateBossRewards(
  state: SimulationState,
  profile: ProfileState,
  rewards: readonly BossRewardDefinition[],
  content: CompiledContent
): void {
  const level = content.levels.get(state.levelId);
  if (level === undefined)
    throw new RangeError(
      "combat checkpoint levelId must reference compiled content"
    );
  const bossEntityIds = level.waveIds.flatMap((waveId) => {
    const wave = content.waves.get(waveId);
    if (wave === undefined)
      throw new RangeError(
        `combat checkpoint is missing authored wave (${waveId})`
      );
    return wave.spawnEvents.flatMap((spawn) =>
      content.enemies.get(spawn.enemyDefinitionId)?.classification === "boss"
        ? [spawn.entityId]
        : []
    );
  });
  resolveBossDeathRewards({
    schemaVersion: 1,
    profile,
    bossDeaths: bossEntityIds.map((bossEntityId) => ({
      schemaVersion: 1,
      eventId: bossDeathEventId(bossEntityId),
      bossEntityId
    })),
    rewards
  });
}

/**
 * Composes the authoritative combat work for one fixed tick with phases 12 and
 * 13. Boss deaths and living-combatant sets are derived from producer-backed
 * battlefield state rather than accepted from the caller.
 */
export function resolveAuthoritativeCombatCheckpoint(
  request: AuthoritativeCombatCheckpointRequest,
  content: CompiledContent,
  dwarfAuthority: BattlefieldDwarfDeploymentAuthority
): AuthoritativeCombatCheckpointResolution {
  const input = requireExactDataRecord(
    request,
    requestKeys,
    "authoritative combat checkpoint request"
  );
  if (input.schemaVersion !== 1)
    throw new RangeError(
      "authoritative combat checkpoint request has unsupported schemaVersion"
    );
  const startingState = input.state as SimulationState;
  const profile = input.profile as ProfileState;
  const rewards = input.rewards as readonly BossRewardDefinition[];
  // Validate the worst-case set of authored boss claims before combat producers
  // accept any new action or health evidence into opaque round authority.
  prevalidateBossRewards(startingState, profile, rewards, content);
  const combat = resolveAuthoritativeCombatTick(
    {
      schemaVersion: 1,
      state: startingState,
      dwarfActionEntries:
        input.dwarfActionEntries as readonly DwarfActionPhaseEntry[]
    },
    content,
    dwarfAuthority
  );
  const battlefield = combat.state.battlefield;
  if (battlefield === undefined)
    throw new Error(
      "authoritative combat checkpoint requires battlefield state"
    );
  const newlyDestroyedEnemies = new Set(
    combat.impacts.lifecycleDecisions
      .filter(
        (decision) =>
          decision.kind === "enemy" &&
          decision.status === "transitioned" &&
          decision.lifecycleBefore === "active" &&
          decision.lifecycleAfter === "destroyed"
      )
      .map((decision) => decision.entityId)
  );
  const bossDeaths = battlefield.enemyCombatants
    .filter(
      (combatant) =>
        newlyDestroyedEnemies.has(combatant.entityId) &&
        combatant.classification === "boss" &&
        combatant.lifecycleState === "destroyed"
    )
    .map((combatant) =>
      Object.freeze({
        schemaVersion: 1 as const,
        eventId: bossDeathEventId(combatant.entityId),
        bossEntityId: combatant.entityId
      })
    );
  const terminalEvaluation = createBattlefieldTerminalEvaluationRequest(
    combat.state,
    content
  );
  const checkpoint = resolveBossRewardCheckpoint({
    schemaVersion: 1,
    bossRewards: {
      schemaVersion: 1,
      profile,
      bossDeaths: Object.freeze(bossDeaths),
      rewards
    },
    terminalEvaluation
  });
  return Object.freeze({
    schemaVersion: 1,
    combat,
    bossRewards: checkpoint.bossRewards,
    terminalEvaluation: checkpoint.terminalEvaluation
  });
}
