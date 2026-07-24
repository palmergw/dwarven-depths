import type {
  DwarfTargetCandidate,
  DwarfTargetLockCandidate,
  DwarfTargetLockDecision,
  DwarfTargetLockRequest,
  EnemyTargetCandidate,
  EnemyTargetLockDecision,
  EnemyTargetLockRequest,
  EntityId,
  TargetLockInvalidReason
} from "@dwarven-depths/contracts";
import { acquireEnemyTarget } from "./enemy-target-acquisition.js";
import {
  getAimPointDistanceSquared,
  hasLineOfSight,
  isAimPointInRange
} from "./range-line-of-sight.js";
import { selectDwarfTarget } from "./target-selection.js";

const entityIdPattern = /^entity\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const aimPointIdPattern = /^aim\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const maximumSafeRange = Math.floor(Math.sqrt(Number.MAX_SAFE_INTEGER));

function requireRecord<const Keys extends readonly string[]>(
  value: unknown,
  keys: Keys,
  description: string
): Readonly<Record<Keys[number], unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError(`${description} must be a plain object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
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
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    )
      throw new TypeError(
        `${description}.${key} must be an enumerable data property`
      );
  }
  return Object.fromEntries(
    keys.map((key) => [key, descriptors[key]?.value])
  ) as Record<Keys[number], unknown>;
}

function requireArray(value: unknown, description: string): readonly unknown[] {
  if (!Array.isArray(value))
    throw new TypeError(`${description} must be an array`);
  if (Reflect.ownKeys(value).length !== value.length + 1)
    throw new TypeError(`${description} must be a dense data array`);
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    )
      throw new TypeError(
        `${description}[${index}] must be an enumerable data item`
      );
    result.push(descriptor.value);
  }
  return result;
}

function requireId(
  value: unknown,
  pattern: RegExp,
  description: string
): string {
  if (typeof value !== "string" || !pattern.test(value))
    throw new RangeError(`${description} must be a stable ID`);
  return value;
}

function requireInteger(value: unknown, description: string): number {
  if (
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    (value as number) < 0
  )
    throw new RangeError(`${description} must be a non-negative safe integer`);
  return value as number;
}

function requireCurrentTarget(value: unknown): EntityId | null {
  if (value === null) return null;
  return requireId(value, entityIdPattern, "currentTargetEntityId") as EntityId;
}

function validateDwarfCandidate(
  value: unknown,
  index: number
): DwarfTargetLockCandidate {
  const description = `target-lock candidate ${index}`;
  const record = requireRecord(
    value,
    [
      "entityId",
      "aimPointId",
      "isHostile",
      "currentHealth",
      "maximumHealth",
      "armor",
      "speed",
      "isBoss",
      "isElite"
    ],
    description
  );
  const maximumHealth = requireInteger(
    record.maximumHealth,
    `${description} maximumHealth`
  );
  const currentHealth = requireInteger(
    record.currentHealth,
    `${description} currentHealth`
  );
  if (maximumHealth === 0 || currentHealth > maximumHealth)
    throw new RangeError(
      `${description} health must not exceed a positive maximumHealth`
    );
  for (const key of ["isHostile", "isBoss", "isElite"] as const)
    if (typeof record[key] !== "boolean")
      throw new TypeError(`${description} ${key} must be boolean`);
  return Object.freeze({
    entityId: requireId(
      record.entityId,
      entityIdPattern,
      `${description} entityId`
    ) as EntityId,
    aimPointId: requireId(
      record.aimPointId,
      aimPointIdPattern,
      `${description} aimPointId`
    ) as DwarfTargetLockCandidate["aimPointId"],
    isHostile: record.isHostile as boolean,
    currentHealth,
    maximumHealth,
    armor: requireInteger(record.armor, `${description} armor`),
    speed: requireInteger(record.speed, `${description} speed`),
    isBoss: record.isBoss as boolean,
    isElite: record.isElite as boolean
  });
}

function dwarfValidity(
  request: DwarfTargetLockRequest,
  candidate: DwarfTargetLockCandidate | undefined
): "target_remains_valid" | TargetLockInvalidReason {
  if (request.currentTargetEntityId === null) return "no_previous_target";
  if (candidate === undefined) return "target_absent";
  if (candidate.currentHealth === 0) return "target_not_living";
  if (!candidate.isHostile) return "target_not_hostile";
  if (
    !isAimPointInRange(
      request.map,
      request.sourceAimPointId,
      candidate.aimPointId,
      request.range
    )
  )
    return "target_out_of_range";
  if (
    request.requiresLineOfSight &&
    !hasLineOfSight(request.map, request.sourceAimPointId, candidate.aimPointId)
  )
    return "target_outside_line_of_sight";
  return "target_remains_valid";
}

/** Retains a valid dwarf lock or reacquires from geometry-filtered hostiles. */
export function resolveDwarfTargetLock(
  request: DwarfTargetLockRequest
): DwarfTargetLockDecision {
  const record = requireRecord(
    request,
    [
      "map",
      "sourceAimPointId",
      "range",
      "requiresLineOfSight",
      "currentTargetEntityId",
      "requestedPolicy",
      "supportedPolicies",
      "candidates"
    ],
    "dwarf target-lock request"
  );
  if (typeof record.requiresLineOfSight !== "boolean")
    throw new TypeError("requiresLineOfSight must be boolean");
  const candidates: DwarfTargetLockCandidate[] = [];
  const seen = new Set<string>();
  for (const [index, value] of requireArray(
    record.candidates,
    "target-lock candidates"
  ).entries()) {
    const candidate = validateDwarfCandidate(value, index);
    if (seen.has(candidate.entityId))
      throw new RangeError(
        `duplicate target-lock candidate entity ID (${candidate.entityId})`
      );
    seen.add(candidate.entityId);
    candidates.push(candidate);
  }
  const range = requireInteger(record.range, "range");
  if (range > maximumSafeRange)
    throw new RangeError(`range cannot exceed ${maximumSafeRange}`);
  const normalized: DwarfTargetLockRequest = {
    map: record.map as DwarfTargetLockRequest["map"],
    sourceAimPointId: requireId(
      record.sourceAimPointId,
      aimPointIdPattern,
      "sourceAimPointId"
    ) as DwarfTargetLockRequest["sourceAimPointId"],
    range,
    requiresLineOfSight: record.requiresLineOfSight,
    currentTargetEntityId: requireCurrentTarget(record.currentTargetEntityId),
    requestedPolicy:
      record.requestedPolicy as DwarfTargetLockRequest["requestedPolicy"],
    supportedPolicies:
      record.supportedPolicies as DwarfTargetLockRequest["supportedPolicies"],
    candidates
  };
  selectDwarfTarget({
    requestedPolicy: normalized.requestedPolicy,
    supportedPolicies: normalized.supportedPolicies,
    candidates: []
  });
  const distances = new Map<EntityId, number>();
  for (const candidate of candidates)
    distances.set(
      candidate.entityId,
      getAimPointDistanceSquared(
        normalized.map,
        normalized.sourceAimPointId,
        candidate.aimPointId
      )
    );
  if (candidates.length === 0)
    getAimPointDistanceSquared(
      normalized.map,
      normalized.sourceAimPointId,
      normalized.sourceAimPointId
    );
  const previous = candidates.find(
    (candidate) => candidate.entityId === normalized.currentTargetEntityId
  );
  const previousTargetReason = dwarfValidity(normalized, previous);
  if (previousTargetReason === "target_remains_valid") {
    if (previous === undefined)
      throw new Error("validated current dwarf target is missing");
    return Object.freeze({
      schemaVersion: 1,
      status: "retained",
      targetEntityId: previous.entityId,
      previousTargetReason
    });
  }

  const eligible: DwarfTargetCandidate[] = candidates
    .filter(
      (candidate) =>
        dwarfValidity(
          { ...normalized, currentTargetEntityId: candidate.entityId },
          candidate
        ) === "target_remains_valid"
    )
    .map((candidate) =>
      Object.freeze({
        entityId: candidate.entityId,
        distanceSquared: distances.get(candidate.entityId) as number,
        currentHealth: candidate.currentHealth,
        maximumHealth: candidate.maximumHealth,
        armor: candidate.armor,
        speed: candidate.speed,
        isBoss: candidate.isBoss,
        isElite: candidate.isElite
      })
    );
  const selected = selectDwarfTarget({
    requestedPolicy: normalized.requestedPolicy,
    supportedPolicies: normalized.supportedPolicies,
    candidates: eligible
  });
  return Object.freeze({
    schemaVersion: 1,
    status: selected.targetEntityId === undefined ? "unlocked" : "reacquired",
    ...(selected.targetEntityId === undefined
      ? {}
      : { targetEntityId: selected.targetEntityId }),
    previousTargetReason,
    selectionReason: selected.reason
  });
}

function enemyEligible(candidate: EnemyTargetCandidate): boolean {
  return (
    candidate.isAlive &&
    candidate.isReachable &&
    (candidate.targetKind === "living_dwarf" || candidate.opensRoute)
  );
}

/** Retains an eligible route target or delegates reacquisition to route policy. */
export function resolveEnemyTargetLock(
  request: EnemyTargetLockRequest
): EnemyTargetLockDecision {
  const record = requireRecord(
    request,
    ["currentTargetEntityId", "candidates"],
    "enemy target-lock request"
  );
  const currentTargetEntityId = requireCurrentTarget(
    record.currentTargetEntityId
  );
  const candidates = Object.freeze(
    requireArray(
      record.candidates,
      "enemy target-lock candidates"
    ) as readonly EnemyTargetCandidate[]
  );
  const acquisition = acquireEnemyTarget({ candidates });
  const previous = candidates.find(
    (candidate) => candidate.entityId === currentTargetEntityId
  );
  const previousTargetReason =
    currentTargetEntityId === null
      ? "no_previous_target"
      : previous === undefined
        ? "target_absent"
        : enemyEligible(previous)
          ? "target_remains_eligible"
          : "target_not_eligible";
  if (previousTargetReason === "target_remains_eligible")
    return Object.freeze({
      schemaVersion: 1,
      status: "retained",
      targetEntityId: currentTargetEntityId as EntityId,
      previousTargetReason
    });
  return Object.freeze({
    schemaVersion: 1,
    status:
      acquisition.targetEntityId === undefined ? "unlocked" : "reacquired",
    ...(acquisition.targetEntityId === undefined
      ? {}
      : { targetEntityId: acquisition.targetEntityId }),
    previousTargetReason,
    acquisitionReason: acquisition.reason
  });
}
