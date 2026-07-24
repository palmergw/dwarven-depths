import type {
  AttackWindup,
  DwarfAttackTargetingDecision,
  DwarfAttackTargetingRequest,
  DwarfAttackTargetingResolution,
  DwarfTargetLockRequest,
  EntityId
} from "@dwarven-depths/contracts";
import { resolveAttackCommitments } from "./attack-commitment.js";
import { resolveDwarfTargetLock } from "./target-locks.js";

const entityIdPattern = /^entity\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

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

function requireArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value))
    throw new TypeError("dwarf attack targeting entries must be an array");
  if (Reflect.ownKeys(value).length !== value.length + 1)
    throw new TypeError(
      "dwarf attack targeting entries must be a dense data array"
    );
  const items: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    )
      throw new TypeError(
        `dwarf attack targeting entries[${index}] must be an enumerable data item`
      );
    items.push(descriptor.value);
  }
  return items;
}

function requireEntityId(value: unknown, description: string): EntityId {
  if (typeof value !== "string" || !entityIdPattern.test(value))
    throw new RangeError(`${description} must be an entity.* stable ID`);
  return value as EntityId;
}

function requireTick(value: unknown): number {
  if (
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    (value as number) < 0
  )
    throw new RangeError("currentTick must be a non-negative safe integer");
  return value as number;
}

function normalizedEntry(
  value: unknown,
  index: number
): {
  readonly sourceEntityId: EntityId;
  readonly targetLock: DwarfTargetLockRequest;
  readonly windup: AttackWindup;
} {
  const description = `dwarf attack targeting entry ${index}`;
  const entry = requireRecord(
    value,
    ["schemaVersion", "sourceEntityId", "targetLock", "windup"],
    description
  );
  if (entry.schemaVersion !== 1)
    throw new RangeError(`${description} has unsupported schemaVersion`);
  const sourceEntityId = requireEntityId(
    entry.sourceEntityId,
    `${description} sourceEntityId`
  );
  const lock = requireRecord(
    entry.targetLock,
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
    `${description} targetLock`
  );
  const windup = requireRecord(
    entry.windup,
    [
      "schemaVersion",
      "attackId",
      "sourceEntityId",
      "targetEntityId",
      "startedAtTick",
      "commitAtTick",
      "impactAtTick",
      "cooldownDurationTicks",
      "damage",
      "range",
      "targetIsValid"
    ],
    `${description} windup`
  );
  if (windup.sourceEntityId !== sourceEntityId)
    throw new RangeError(
      `${description} source identity does not match windup`
    );
  if (lock.currentTargetEntityId !== windup.targetEntityId)
    throw new RangeError(
      `${description} current target does not match windup target`
    );
  if (typeof windup.targetIsValid !== "boolean")
    throw new TypeError(`${description} windup targetIsValid must be boolean`);
  return {
    sourceEntityId,
    targetLock: entry.targetLock as DwarfTargetLockRequest,
    windup: entry.windup as AttackWindup
  };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Resolves fixed-step phase 5 targeting before pre-commit windup decisions. */
export function resolveDwarfAttackTargeting(
  request: DwarfAttackTargetingRequest
): DwarfAttackTargetingResolution {
  const record = requireRecord(
    request,
    ["schemaVersion", "currentTick", "entries"],
    "dwarf attack targeting request"
  );
  if (record.schemaVersion !== 1)
    throw new RangeError(
      "dwarf attack targeting request has unsupported schemaVersion"
    );
  const currentTick = requireTick(record.currentTick);
  const entries = requireArray(record.entries).map(normalizedEntry);
  const seen = new Set<string>();
  const decisions = entries
    .map((entry): DwarfAttackTargetingDecision => {
      const targetLock = resolveDwarfTargetLock(entry.targetLock);
      if (entry.targetLock.range !== entry.windup.range)
        throw new RangeError(
          `attack windup range does not match target-lock range (${entry.windup.attackId})`
        );
      const commitment = resolveAttackCommitments({
        currentTick,
        windups: [
          {
            ...entry.windup,
            targetIsValid:
              targetLock.status === "retained" &&
              targetLock.targetEntityId === entry.windup.targetEntityId
          }
        ]
      }).decisions[0];
      if (commitment === undefined)
        throw new Error("dwarf attack targeting commitment is missing");
      if (seen.has(commitment.attackId))
        throw new RangeError(
          `duplicate attack windup ID (${commitment.attackId})`
        );
      seen.add(commitment.attackId);
      return Object.freeze({
        schemaVersion: 1,
        attackId: commitment.attackId,
        targetLock,
        commitment
      });
    })
    .sort((left, right) => compareText(left.attackId, right.attackId));
  return Object.freeze({
    schemaVersion: 1,
    decisions: Object.freeze(decisions)
  });
}
