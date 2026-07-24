import type {
  CombatantHealth,
  CombatantHealthResolution,
  CommittedAttack,
  CommittedAttackImpactDecision,
  CommittedAttackImpactRequest,
  CommittedAttackImpactResolution
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

function requireDenseDataArray(
  value: unknown,
  description: string
): readonly unknown[] {
  if (!Array.isArray(value))
    throw new TypeError(`${description} must be an array`);
  if (Reflect.ownKeys(value).length !== value.length + 1)
    throw new TypeError(`${description} must be a dense data array`);
  const items: unknown[] = [];
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
    items.push(descriptor.value);
  }
  return items;
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

function requireEntityId(
  value: unknown,
  description: string
): CombatantHealth["entityId"] {
  if (typeof value !== "string" || !entityIdPattern.test(value))
    throw new RangeError(`${description} must be an entity.* stable ID`);
  return value as CombatantHealth["entityId"];
}

function validateAttack(value: unknown, index: number): CommittedAttack {
  const description = `committed attack ${index}`;
  const record = requireDataRecord(
    value,
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
  if (record.schemaVersion !== 1)
    throw new RangeError(`${description} has unsupported schemaVersion`);
  if (
    typeof record.attackId !== "string" ||
    !stableIdPattern.test(record.attackId)
  )
    throw new RangeError(`${description} attackId must be a stable ID`);
  const sourceEntityId = requireEntityId(
    record.sourceEntityId,
    `${description} sourceEntityId`
  );
  const targetEntityId = requireEntityId(
    record.targetEntityId,
    `${description} targetEntityId`
  );
  const committedAtTick = requireNonNegativeSafeInteger(
    record.committedAtTick,
    `${description} committedAtTick`
  );
  const impactAtTick = requireNonNegativeSafeInteger(
    record.impactAtTick,
    `${description} impactAtTick`
  );
  const cooldownCompleteAtTick = requireNonNegativeSafeInteger(
    record.cooldownCompleteAtTick,
    `${description} cooldownCompleteAtTick`
  );
  const damage = requireNonNegativeSafeInteger(
    record.damage,
    `${description} damage`
  );
  const range = requireNonNegativeSafeInteger(
    record.range,
    `${description} range`
  );
  if (impactAtTick < committedAtTick)
    throw new RangeError(
      `${description} impactAtTick cannot precede committedAtTick`
    );
  if (cooldownCompleteAtTick < committedAtTick)
    throw new RangeError(
      `${description} cooldownCompleteAtTick cannot precede committedAtTick`
    );
  if (range > maximumSafeRange)
    throw new RangeError(
      `${description} range cannot exceed ${maximumSafeRange}`
    );
  return Object.freeze({
    schemaVersion: 1,
    attackId: record.attackId as CommittedAttack["attackId"],
    sourceEntityId,
    targetEntityId,
    committedAtTick,
    impactAtTick,
    cooldownCompleteAtTick,
    damage,
    range
  });
}

function validateCombatant(value: unknown, index: number): CombatantHealth {
  const description = `combatant ${index}`;
  const record = requireDataRecord(
    value,
    ["schemaVersion", "entityId", "currentHealth", "maximumHealth"],
    description
  );
  if (record.schemaVersion !== 1)
    throw new RangeError(`${description} has unsupported schemaVersion`);
  const entityId = requireEntityId(record.entityId, `${description} entityId`);
  const currentHealth = requireNonNegativeSafeInteger(
    record.currentHealth,
    `${description} currentHealth`
  );
  const maximumHealth = requireNonNegativeSafeInteger(
    record.maximumHealth,
    `${description} maximumHealth`
  );
  if (maximumHealth === 0)
    throw new RangeError(`${description} maximumHealth must be positive`);
  if (currentHealth > maximumHealth)
    throw new RangeError(
      `${description} currentHealth cannot exceed maximumHealth`
    );
  return Object.freeze({
    schemaVersion: 1,
    entityId,
    currentHealth,
    maximumHealth
  });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function impactDecision(
  attack: CommittedAttack,
  status: CommittedAttackImpactDecision["status"],
  reason: CommittedAttackImpactDecision["reason"],
  damage?: number
): CommittedAttackImpactDecision {
  return Object.freeze({
    schemaVersion: 1,
    attackId: attack.attackId,
    sourceEntityId: attack.sourceEntityId,
    targetEntityId: attack.targetEntityId,
    status,
    reason,
    ...(damage === undefined ? {} : { damage })
  });
}

/**
 * Resolves committed direct attacks at their exact impact tick. Due damage is
 * aggregated before health changes so same-tick outcomes do not depend on input
 * order. Armor and death-state transitions intentionally belong to later phases.
 */
export function resolveCommittedAttackImpacts(
  request: CommittedAttackImpactRequest
): CommittedAttackImpactResolution {
  const record = requireDataRecord(
    request,
    ["currentTick", "attacks", "combatants"],
    "committed attack impact request"
  );
  const currentTick = requireNonNegativeSafeInteger(
    record.currentTick,
    "currentTick"
  );

  const attackIds = new Set<string>();
  const attacks = requireDenseDataArray(record.attacks, "committed attacks")
    .map((value, index) => {
      const attack = validateAttack(value, index);
      if (attackIds.has(attack.attackId))
        throw new RangeError(
          `duplicate committed attack ID (${attack.attackId})`
        );
      attackIds.add(attack.attackId);
      if (currentTick < attack.committedAtTick)
        throw new RangeError(
          `committed attack is before its commit tick (${attack.attackId})`
        );
      if (currentTick > attack.impactAtTick)
        throw new RangeError(
          `committed attack passed its impact tick (${attack.attackId})`
        );
      return attack;
    })
    .sort((left, right) => compareText(left.attackId, right.attackId));

  const combatantsById = new Map<
    CombatantHealth["entityId"],
    CombatantHealth
  >();
  const combatants = requireDenseDataArray(record.combatants, "combatants")
    .map((value, index) => {
      const combatant = validateCombatant(value, index);
      if (combatantsById.has(combatant.entityId))
        throw new RangeError(
          `duplicate combatant entity ID (${combatant.entityId})`
        );
      combatantsById.set(combatant.entityId, combatant);
      return combatant;
    })
    .sort((left, right) => compareText(left.entityId, right.entityId));

  const incomingDamageByTarget = new Map<CombatantHealth["entityId"], number>();
  const decisions = attacks.map((attack): CommittedAttackImpactDecision => {
    if (currentTick < attack.impactAtTick)
      return impactDecision(attack, "pending", "waiting_for_impact");
    const target = combatantsById.get(attack.targetEntityId);
    if (target === undefined || target.currentHealth === 0)
      return impactDecision(attack, "discarded", "target_not_living_at_impact");
    const aggregate =
      (incomingDamageByTarget.get(target.entityId) ?? 0) + attack.damage;
    if (!Number.isSafeInteger(aggregate))
      throw new RangeError(
        `aggregate incoming damage exceeds the safe-integer range (${target.entityId})`
      );
    incomingDamageByTarget.set(target.entityId, aggregate);
    return impactDecision(attack, "resolved", "damage_applied", attack.damage);
  });

  const healthResolutions: CombatantHealthResolution[] = [];
  const health = combatants.map((combatant): CombatantHealth => {
    const incomingDamage = incomingDamageByTarget.get(combatant.entityId);
    if (incomingDamage === undefined) return combatant;
    const appliedDamage = Math.min(combatant.currentHealth, incomingDamage);
    const healthAfter = combatant.currentHealth - appliedDamage;
    healthResolutions.push(
      Object.freeze({
        schemaVersion: 1,
        entityId: combatant.entityId,
        healthBefore: combatant.currentHealth,
        incomingDamage,
        appliedDamage,
        healthAfter,
        becameZeroHealth: combatant.currentHealth > 0 && healthAfter === 0
      })
    );
    return Object.freeze({
      schemaVersion: 1,
      entityId: combatant.entityId,
      currentHealth: healthAfter,
      maximumHealth: combatant.maximumHealth
    });
  });

  return Object.freeze({
    decisions: Object.freeze(decisions),
    health: Object.freeze(health),
    healthResolutions: Object.freeze(healthResolutions)
  });
}
