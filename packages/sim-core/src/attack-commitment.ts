import type {
  AttackCommitmentDecision,
  AttackCommitmentRequest,
  AttackCommitmentResolution,
  AttackWindup,
  CommittedAttack
} from "@dwarven-depths/contracts";

const stableIdPattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const entityIdPattern = /^entity\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const maximumSafeRange = Math.floor(Math.sqrt(Number.MAX_SAFE_INTEGER));

function requireDataRecord<const Keys extends readonly string[]>(
  value: unknown,
  expectedKeys: Keys,
  description: string
): Readonly<Record<Keys[number], unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError(`${description} must be a plain object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`${description} must be a plain object`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(value);
  if (
    keys.some((key) => typeof key !== "string") ||
    keys.length !== expectedKeys.length ||
    !expectedKeys.every((key) => Object.hasOwn(descriptors, key))
  )
    throw new TypeError(
      `${description} must contain exactly ${expectedKeys.join(", ")}`
    );
  for (const key of expectedKeys) {
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
    expectedKeys.map((key) => [key, descriptors[key]?.value])
  ) as Record<Keys[number], unknown>;
}

function requireDenseDataArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value))
    throw new TypeError("attack windups must be an array");
  if (Reflect.ownKeys(value).length !== value.length + 1)
    throw new TypeError("attack windups must be a dense data array");
  const items: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    )
      throw new TypeError(
        `attack windups[${index}] must be an enumerable data item`
      );
    items.push(descriptor.value);
  }
  return items;
}

function requireTick(value: unknown, description: string): number {
  if (
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    (value as number) < 0
  )
    throw new RangeError(`${description} must be a non-negative safe integer`);
  return value as number;
}

function validateWindup(value: unknown, index: number): AttackWindup {
  const description = `attack windup ${index}`;
  const record = requireDataRecord(
    value,
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
    description
  );
  if (record.schemaVersion !== 1)
    throw new RangeError(`${description} has unsupported schemaVersion`);
  if (
    typeof record.attackId !== "string" ||
    !stableIdPattern.test(record.attackId)
  )
    throw new RangeError(`${description} attackId must be a stable ID`);
  for (const key of ["sourceEntityId", "targetEntityId"] as const) {
    if (typeof record[key] !== "string" || !entityIdPattern.test(record[key]))
      throw new RangeError(
        `${description} ${key} must be an entity.* stable ID`
      );
  }
  const startedAtTick = requireTick(
    record.startedAtTick,
    `${description} startedAtTick`
  );
  const commitAtTick = requireTick(
    record.commitAtTick,
    `${description} commitAtTick`
  );
  const impactAtTick = requireTick(
    record.impactAtTick,
    `${description} impactAtTick`
  );
  const cooldownDurationTicks = requireTick(
    record.cooldownDurationTicks,
    `${description} cooldownDurationTicks`
  );
  const damage = requireTick(record.damage, `${description} damage`);
  const range = requireTick(record.range, `${description} range`);
  if (commitAtTick < startedAtTick)
    throw new RangeError(
      `${description} commitAtTick cannot precede startedAtTick`
    );
  if (impactAtTick < commitAtTick)
    throw new RangeError(
      `${description} impactAtTick cannot precede commitAtTick`
    );
  if (range > maximumSafeRange)
    throw new RangeError(
      `${description} range cannot exceed ${maximumSafeRange}`
    );
  if (!Number.isSafeInteger(commitAtTick + cooldownDurationTicks))
    throw new RangeError(
      `${description} cooldown completion exceeds the safe-integer range`
    );
  if (typeof record.targetIsValid !== "boolean")
    throw new TypeError(`${description} targetIsValid must be boolean`);
  return Object.freeze({
    schemaVersion: 1,
    attackId: record.attackId as AttackWindup["attackId"],
    sourceEntityId: record.sourceEntityId as AttackWindup["sourceEntityId"],
    targetEntityId: record.targetEntityId as AttackWindup["targetEntityId"],
    startedAtTick,
    commitAtTick,
    impactAtTick,
    cooldownDurationTicks,
    damage,
    range,
    targetIsValid: record.targetIsValid
  });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function decision(
  windup: AttackWindup,
  status: AttackCommitmentDecision["status"],
  reason: AttackCommitmentDecision["reason"],
  committedAttack?: CommittedAttack
): AttackCommitmentDecision {
  return Object.freeze({
    schemaVersion: 1,
    attackId: windup.attackId,
    status,
    reason,
    ...(committedAttack === undefined ? {} : { committedAttack })
  });
}

/** Resolves attack windups after target validation and before impact effects. */
export function resolveAttackCommitments(
  request: AttackCommitmentRequest
): AttackCommitmentResolution {
  const record = requireDataRecord(
    request,
    ["currentTick", "windups"],
    "attack commitment request"
  );
  const currentTick = requireTick(record.currentTick, "currentTick");
  const seen = new Set<string>();
  const windups = requireDenseDataArray(record.windups).map((value, index) => {
    const windup = validateWindup(value, index);
    if (seen.has(windup.attackId))
      throw new RangeError(`duplicate attack windup ID (${windup.attackId})`);
    seen.add(windup.attackId);
    if (currentTick < windup.startedAtTick)
      throw new RangeError(
        `attack windup has not started (${windup.attackId})`
      );
    if (currentTick > windup.commitAtTick)
      throw new RangeError(
        `attack windup passed its commit tick (${windup.attackId})`
      );
    return windup;
  });

  const decisions = windups
    .sort((left, right) => compareText(left.attackId, right.attackId))
    .map((windup): AttackCommitmentDecision => {
      if (!windup.targetIsValid)
        return decision(windup, "cancelled", "target_invalid_before_commit");
      if (currentTick < windup.commitAtTick)
        return decision(windup, "winding_up", "waiting_for_commit");
      const cooldownCompleteAtTick =
        windup.commitAtTick + windup.cooldownDurationTicks;
      const committedAttack: CommittedAttack = Object.freeze({
        schemaVersion: 1,
        attackId: windup.attackId,
        sourceEntityId: windup.sourceEntityId,
        targetEntityId: windup.targetEntityId,
        committedAtTick: windup.commitAtTick,
        impactAtTick: windup.impactAtTick,
        cooldownCompleteAtTick,
        damage: windup.damage,
        range: windup.range
      });
      return decision(windup, "committed", "committed", committedAttack);
    });
  return Object.freeze({ decisions: Object.freeze(decisions) });
}
