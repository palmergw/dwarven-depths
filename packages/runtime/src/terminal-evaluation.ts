import {
  canonicalStringify,
  type EntityId,
  type StableId,
  type WaveScheduleRequest
} from "@dwarven-depths/contracts";
import { resolveWaveSchedule } from "@dwarven-depths/sim-core";

export type TerminalEvaluationReason =
  | "all_dwarves_downed"
  | "final_wave_in_progress"
  | "pending_spawns_queued"
  | "living_hostile_enemies_remain"
  | "living_hostile_deployables_remain"
  | "victory_conditions_met";

export interface TerminalEvaluationRequest {
  readonly schemaVersion: 1;
  /** Authoritative phase-2 state observed by phase 13. */
  readonly waveSchedule: WaveScheduleRequest;
  readonly livingDwarfIds: readonly EntityId[];
  readonly livingHostileEnemyIds: readonly EntityId[];
  readonly livingHostileDeployableIds: readonly EntityId[];
}

export interface TerminalEvaluationResult {
  readonly schemaVersion: 1;
  readonly state: "combat_running" | "final_cleanup" | "terminal";
  readonly finalCleanupEntered: boolean;
  readonly terminalResult?: "victory" | "defeat";
  readonly reason: TerminalEvaluationReason;
  readonly livingDwarves: number;
  readonly livingHostileEnemies: number;
  readonly livingHostileDeployables: number;
  readonly pendingSpawns: number;
  readonly firedSpawns: number;
  readonly scheduledSpawns: number;
}

const stableIdPattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const requestKeys = [
  "schemaVersion",
  "waveSchedule",
  "livingDwarfIds",
  "livingHostileEnemyIds",
  "livingHostileDeployableIds"
] as const;

function requirePlainExactRecord(
  value: unknown,
  keys: readonly string[],
  path: string
): asserts value is Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    throw new TypeError(`${path} must be a plain object`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).length !== keys.length ||
    !keys.every((key) => {
      const descriptor = descriptors[key];
      return descriptor?.enumerable === true && "value" in descriptor;
    })
  )
    throw new TypeError(`${path} must contain exactly ${keys.join(", ")}`);
}

function requireStandardArray(
  value: unknown,
  path: string
): asserts value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    throw new TypeError(`${path} must be a standard array`);
}

function requireEntityIds(value: unknown, path: string): readonly EntityId[] {
  requireStandardArray(value, path);
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const id = value[index];
    if (
      typeof id !== "string" ||
      !stableIdPattern.test(id) ||
      !id.startsWith("entity.")
    )
      throw new RangeError(`${path} must contain only entity.* stable IDs`);
    if (seen.has(id))
      throw new RangeError(`${path} contains duplicate ID (${id})`);
    seen.add(id);
  }
  return value as readonly EntityId[];
}

function validateWaveScheduleShape(
  value: unknown
): asserts value is WaveScheduleRequest {
  requirePlainExactRecord(
    value,
    [
      "schemaVersion",
      "currentTick",
      "level",
      "waves",
      "startedWaveIds",
      "firedSpawnIds",
      "pendingSpawns"
    ],
    "terminal evaluation waveSchedule"
  );
  const schedule = value as unknown as WaveScheduleRequest;
  requirePlainExactRecord(
    schedule.level,
    Object.hasOwn(schedule.level, "mapId")
      ? ["kind", "id", "waveIds", "mapId"]
      : ["kind", "id", "waveIds"],
    "terminal evaluation waveSchedule.level"
  );
  if (
    schedule.level.mapId !== undefined &&
    (typeof schedule.level.mapId !== "string" ||
      !stableIdPattern.test(schedule.level.mapId) ||
      !schedule.level.mapId.startsWith("map."))
  )
    throw new RangeError("waveSchedule.level.mapId must be a map.* stable ID");
  requireStandardArray(schedule.level.waveIds, "waveSchedule.level.waveIds");
  requireStandardArray(schedule.waves, "waveSchedule.waves");
  for (let waveIndex = 0; waveIndex < schedule.waves.length; waveIndex += 1) {
    const wave = schedule.waves[waveIndex];
    requirePlainExactRecord(
      wave,
      ["kind", "id", "startAtTick", "durationTicks", "spawnEvents"],
      `waveSchedule.waves[${waveIndex}]`
    );
    requireStandardArray(
      wave.spawnEvents,
      `waveSchedule.waves[${waveIndex}].spawnEvents`
    );
    for (
      let spawnIndex = 0;
      spawnIndex < wave.spawnEvents.length;
      spawnIndex += 1
    ) {
      requirePlainExactRecord(
        wave.spawnEvents[spawnIndex],
        [
          "id",
          "authoredOrder",
          "atTick",
          "entityId",
          "enemyDefinitionId",
          "entranceId"
        ],
        `waveSchedule.waves[${waveIndex}].spawnEvents[${spawnIndex}]`
      );
    }
  }
  requireStandardArray(schedule.startedWaveIds, "waveSchedule.startedWaveIds");
  requireStandardArray(schedule.firedSpawnIds, "waveSchedule.firedSpawnIds");
  requireStandardArray(schedule.pendingSpawns, "waveSchedule.pendingSpawns");
  for (let index = 0; index < schedule.pendingSpawns.length; index += 1) {
    requirePlainExactRecord(
      schedule.pendingSpawns[index],
      ["id", "authoredOrder", "entityId", "entranceId"],
      `waveSchedule.pendingSpawns[${index}]`
    );
  }
}

function sameIdSet(
  left: readonly StableId[],
  right: readonly StableId[]
): boolean {
  if (left.length !== right.length) return false;
  const rightIds = new Set(right);
  return left.every((id) => rightIds.has(id));
}

/**
 * Evaluates fixed-step phase 13 from the authoritative post-scheduling state.
 * Defeat is checked first. Victory is available only in final cleanup after the
 * complete authored spawn schedule has fired and all queued/living hostiles are
 * gone.
 */
export function evaluateTerminalState(
  request: TerminalEvaluationRequest
): TerminalEvaluationResult {
  requirePlainExactRecord(request, requestKeys, "terminal evaluation request");
  canonicalStringify(request);
  if (request.schemaVersion !== 1)
    throw new RangeError("terminal evaluation request schemaVersion must be 1");
  validateWaveScheduleShape(request.waveSchedule);

  const livingDwarfIds = requireEntityIds(
    request.livingDwarfIds,
    "livingDwarfIds"
  );
  const livingHostileEnemyIds = requireEntityIds(
    request.livingHostileEnemyIds,
    "livingHostileEnemyIds"
  );
  const livingHostileDeployableIds = requireEntityIds(
    request.livingHostileDeployableIds,
    "livingHostileDeployableIds"
  );
  const allCombatantIds = [
    ...livingDwarfIds,
    ...livingHostileEnemyIds,
    ...livingHostileDeployableIds
  ];
  if (new Set(allCombatantIds).size !== allCombatantIds.length)
    throw new RangeError("living combatant ID sets must be disjoint");
  const livingDwarves = livingDwarfIds.length;
  const livingHostileEnemies = livingHostileEnemyIds.length;
  const livingHostileDeployables = livingHostileDeployableIds.length;

  const scheduled = resolveWaveSchedule(request.waveSchedule);
  const suppliedPendingById = new Map(
    request.waveSchedule.pendingSpawns.map((spawn) => [spawn.id, spawn])
  );
  if (
    !sameIdSet(scheduled.startedWaveIds, request.waveSchedule.startedWaveIds) ||
    !sameIdSet(scheduled.firedSpawnIds, request.waveSchedule.firedSpawnIds) ||
    scheduled.pendingSpawns.length !==
      request.waveSchedule.pendingSpawns.length ||
    scheduled.pendingSpawns.some((spawn) => {
      const supplied = suppliedPendingById.get(spawn.id);
      return (
        supplied === undefined ||
        spawn.id !== supplied.id ||
        spawn.authoredOrder !== supplied.authoredOrder ||
        spawn.entityId !== supplied.entityId ||
        spawn.entranceId !== supplied.entranceId
      );
    })
  )
    throw new RangeError(
      "terminal evaluation waveSchedule must already be resolved through currentTick"
    );

  const orderedWaves = request.waveSchedule.level.waveIds.map((waveId) => {
    const wave = request.waveSchedule.waves.find(
      (candidate) => candidate.id === waveId
    );
    if (wave === undefined)
      throw new RangeError(`missing wave definition (${waveId})`);
    return wave;
  });
  if (orderedWaves.length === 0)
    throw new RangeError(
      "terminal evaluation requires at least one authored wave"
    );
  const finalWave = orderedWaves.at(-1);
  if (finalWave === undefined)
    throw new RangeError("final wave is unavailable");
  const finalWaveEndTick = finalWave.startAtTick + finalWave.durationTicks;
  if (
    orderedWaves.some(
      (wave) => wave.startAtTick + wave.durationTicks > finalWaveEndTick
    )
  )
    throw new RangeError(
      "final level wave must not end before an earlier authored wave"
    );
  const finalCleanupEntered =
    request.waveSchedule.currentTick >= finalWaveEndTick;
  const scheduledSpawns = orderedWaves.reduce(
    (count, wave) => count + wave.spawnEvents.length,
    0
  );
  const firedSpawns = scheduled.firedSpawnIds.length;
  const pendingSpawns = scheduled.pendingSpawns.length;

  let state: TerminalEvaluationResult["state"] = finalCleanupEntered
    ? "final_cleanup"
    : "combat_running";
  let terminalResult: TerminalEvaluationResult["terminalResult"];
  let reason: TerminalEvaluationReason;

  if (livingDwarves === 0) {
    state = "terminal";
    terminalResult = "defeat";
    reason = "all_dwarves_downed";
  } else if (!finalCleanupEntered) {
    reason = "final_wave_in_progress";
  } else if (firedSpawns !== scheduledSpawns) {
    throw new RangeError(
      "final cleanup requires the complete authored spawn schedule to be fired"
    );
  } else if (pendingSpawns > 0) {
    reason = "pending_spawns_queued";
  } else if (livingHostileEnemies > 0) {
    reason = "living_hostile_enemies_remain";
  } else if (livingHostileDeployables > 0) {
    reason = "living_hostile_deployables_remain";
  } else {
    state = "terminal";
    terminalResult = "victory";
    reason = "victory_conditions_met";
  }

  return Object.freeze({
    schemaVersion: 1,
    state,
    finalCleanupEntered,
    ...(terminalResult === undefined ? {} : { terminalResult }),
    reason,
    livingDwarves,
    livingHostileEnemies,
    livingHostileDeployables,
    pendingSpawns,
    firedSpawns,
    scheduledSpawns
  });
}
