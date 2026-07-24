import type {
  BattlefieldEnemyCombatant,
  CommittedAttack,
  EntityId,
  StableId
} from "@dwarven-depths/contracts";

const stableIdPattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const entityIdPattern = /^entity\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const maximumSafeRange = Math.floor(Math.sqrt(Number.MAX_SAFE_INTEGER));

interface ParsedAttackData extends Record<string, unknown> {
  readonly schemaVersion?: unknown;
  readonly attackId?: unknown;
  readonly sourceEntityId?: unknown;
  readonly targetEntityId?: unknown;
  readonly committedAtTick?: unknown;
  readonly impactAtTick?: unknown;
  readonly cooldownCompleteAtTick?: unknown;
  readonly damage?: unknown;
  readonly range?: unknown;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requireDataRecord(
  value: unknown,
  keys: readonly string[],
  description: string
): ParsedAttackData {
  if (
    value === null ||
    typeof value !== "object" ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    throw new TypeError(`${description} must be a plain object`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(value);
  if (
    actual.some((key) => typeof key !== "string") ||
    actual.length !== keys.length ||
    !keys.every((key) => Object.hasOwn(descriptors, key))
  )
    throw new TypeError(
      `${description} must contain exactly the expected keys`
    );
  const result: ParsedAttackData = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    )
      throw new TypeError(`${description}.${key} must be own enumerable data`);
    result[key] = descriptor.value;
  }
  return result;
}

function requireArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    throw new TypeError("pending committed attacks must be a standard array");
  if (Reflect.ownKeys(value).length !== value.length + 1)
    throw new TypeError("pending committed attacks must be a dense data array");
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    )
      throw new TypeError(
        `pending committed attack ${index} must be own enumerable data`
      );
    return descriptor.value;
  });
}

function requireNonNegativeSafeInteger(
  value: unknown,
  description: string
): number {
  if (
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    (value as number) < 0
  )
    throw new RangeError(`${description} must be a non-negative safe integer`);
  return value as number;
}

/** Validates persisted enemy attacks against their independently authored source. */
export function normalizePendingCommittedAttacks(
  value: unknown,
  currentTick: number,
  combatants: readonly BattlefieldEnemyCombatant[]
): readonly CommittedAttack[] {
  const combatantsById = new Map<EntityId, BattlefieldEnemyCombatant>(
    combatants.map((combatant) => [combatant.entityId, combatant])
  );
  const seen = new Set<StableId>();
  const attacks = requireArray(value).map((item, index): CommittedAttack => {
    const description = `pending committed attack ${index}`;
    const data = requireDataRecord(
      item,
      [
        "schemaVersion",
        "attackId",
        "sourceEntityId",
        "targetEntityId",
        "committedAtTick",
        "impactAtTick",
        "cooldownCompleteAtTick",
        "damage",
        "range"
      ],
      description
    );
    if (data.schemaVersion !== 1)
      throw new RangeError(`${description} has unsupported schemaVersion`);
    if (
      typeof data.attackId !== "string" ||
      !stableIdPattern.test(data.attackId)
    )
      throw new RangeError(`${description} attackId must be a stable ID`);
    const attackId = data.attackId as StableId;
    if (seen.has(attackId))
      throw new RangeError(
        `duplicate pending committed attack ID (${attackId})`
      );
    seen.add(attackId);
    if (
      typeof data.sourceEntityId !== "string" ||
      !entityIdPattern.test(data.sourceEntityId)
    )
      throw new RangeError(`${description} sourceEntityId must be entity.*`);
    if (
      typeof data.targetEntityId !== "string" ||
      !entityIdPattern.test(data.targetEntityId)
    )
      throw new RangeError(`${description} targetEntityId must be entity.*`);
    const sourceEntityId = data.sourceEntityId as EntityId;
    const source = combatantsById.get(sourceEntityId);
    if (source === undefined)
      throw new RangeError(
        `${description} source must be an admitted enemy (${sourceEntityId})`
      );
    const committedAtTick = requireNonNegativeSafeInteger(
      data.committedAtTick,
      `${description} committedAtTick`
    );
    const impactAtTick = requireNonNegativeSafeInteger(
      data.impactAtTick,
      `${description} impactAtTick`
    );
    const cooldownCompleteAtTick = requireNonNegativeSafeInteger(
      data.cooldownCompleteAtTick,
      `${description} cooldownCompleteAtTick`
    );
    const damage = requireNonNegativeSafeInteger(
      data.damage,
      `${description} damage`
    );
    const range = requireNonNegativeSafeInteger(
      data.range,
      `${description} range`
    );
    const startedAtTick = committedAtTick - source.basicAttack.windupTicks;
    const expectedAttackId = `${source.basicAttack.id}.${sourceEntityId.slice(
      "entity.".length
    )}.tick_${startedAtTick}`;
    if (
      startedAtTick < source.admittedAtTick ||
      attackId !== expectedAttackId ||
      impactAtTick !== committedAtTick + source.basicAttack.impactDelayTicks ||
      cooldownCompleteAtTick !==
        committedAtTick + source.basicAttack.cooldownTicks ||
      damage !== source.basicAttack.damage ||
      range !== source.basicAttack.range ||
      range > maximumSafeRange
    )
      throw new RangeError(
        `${description} does not match its authored enemy basic attack`
      );
    if (committedAtTick > currentTick)
      throw new RangeError(`${description} is before its commit tick`);
    if (impactAtTick < currentTick)
      throw new RangeError(`${description} has passed its impact tick`);
    return Object.freeze({
      schemaVersion: 1,
      attackId,
      sourceEntityId,
      targetEntityId: data.targetEntityId as EntityId,
      committedAtTick,
      impactAtTick,
      cooldownCompleteAtTick,
      damage,
      range
    });
  });
  const attacksBySource = new Map<EntityId, CommittedAttack[]>();
  for (const attack of attacks) {
    const sourceAttacks = attacksBySource.get(attack.sourceEntityId) ?? [];
    sourceAttacks.push(attack);
    attacksBySource.set(attack.sourceEntityId, sourceAttacks);
  }
  for (const [sourceEntityId, sourceAttacks] of attacksBySource) {
    sourceAttacks.sort(
      (left, right) =>
        left.committedAtTick - right.committedAtTick ||
        compareText(left.attackId, right.attackId)
    );
    for (let index = 1; index < sourceAttacks.length; index += 1) {
      const previous = sourceAttacks[index - 1];
      const current = sourceAttacks[index];
      if (
        previous !== undefined &&
        current !== undefined &&
        current.committedAtTick < previous.cooldownCompleteAtTick
      )
        throw new RangeError(
          `pending committed attacks overlap one source cooldown (${sourceEntityId})`
        );
    }
    const latest = sourceAttacks.at(-1);
    const source = combatantsById.get(sourceEntityId);
    if (
      latest !== undefined &&
      source !== undefined &&
      latest.cooldownCompleteAtTick > currentTick &&
      (source.actionState.activeBasicAttack !== null ||
        source.actionState.cooldownCompleteAtTick !==
          latest.cooldownCompleteAtTick)
    )
      throw new RangeError(
        `pending committed attack lacks source cooldown evidence (${sourceEntityId})`
      );
  }
  return Object.freeze(
    attacks.sort((left, right) => compareText(left.attackId, right.attackId))
  );
}
