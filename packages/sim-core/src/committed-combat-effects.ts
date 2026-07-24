import type {
  ActiveStatus,
  CombatantHealingResolution,
  CombatantHealth,
  CommittedCombatEffectDecision,
  CommittedCombatEffectRequest,
  CommittedCombatEffectResolution,
  CommittedHealingEffect,
  CommittedStatusEffect,
  EffectId,
  EntityId,
  StatusApplicationDecision,
  StatusId
} from "@dwarven-depths/contracts";
import { applyStatusApplications } from "./combat-timers.js";
import { applyStatusApplicationRule } from "./status-application-rule.js";

const effectIdPattern = /^effect\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const entityIdPattern = /^entity\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const statusIdPattern = /^status\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const maximumRecords = 100_000;

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
  if (value.length > maximumRecords)
    throw new RangeError(
      `${description} cannot exceed ${maximumRecords} items`
    );
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

function requireInteger(value: unknown, description: string): number {
  if (
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    (value as number) < 0
  )
    throw new RangeError(`${description} must be a non-negative safe integer`);
  return value as number;
}

function requireId<Id extends string>(
  value: unknown,
  pattern: RegExp,
  description: string
): Id {
  if (typeof value !== "string" || !pattern.test(value))
    throw new RangeError(`${description} must be a valid domain stable ID`);
  return value as Id;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function activeStatusKey(status: {
  readonly ownerEntityId: EntityId;
  readonly statusId: StatusId;
}): string {
  return `${status.ownerEntityId}::${status.statusId}`;
}

function validateTiming(
  committedAtTickValue: unknown,
  impactAtTickValue: unknown,
  currentTick: number,
  description: string
): { readonly committedAtTick: number; readonly impactAtTick: number } {
  const committedAtTick = requireInteger(
    committedAtTickValue,
    `${description} committedAtTick`
  );
  const impactAtTick = requireInteger(
    impactAtTickValue,
    `${description} impactAtTick`
  );
  if (impactAtTick < committedAtTick)
    throw new RangeError(`${description} impact cannot precede commitment`);
  if (currentTick < committedAtTick)
    throw new RangeError(`${description} is before its commit tick`);
  if (currentTick > impactAtTick)
    throw new RangeError(`${description} passed its impact tick`);
  return { committedAtTick, impactAtTick };
}

function validateHealingEffect(
  value: unknown,
  index: number,
  currentTick: number
): CommittedHealingEffect {
  const description = `committed healing effect ${index}`;
  const record = requireDataRecord(
    value,
    [
      "schemaVersion",
      "effectId",
      "sourceEntityId",
      "targetEntityId",
      "committedAtTick",
      "impactAtTick",
      "healing"
    ],
    description
  );
  if (record.schemaVersion !== 1)
    throw new RangeError(`${description} has unsupported schemaVersion`);
  const timing = validateTiming(
    record.committedAtTick,
    record.impactAtTick,
    currentTick,
    description
  );
  return Object.freeze({
    schemaVersion: 1,
    effectId: requireId<EffectId>(
      record.effectId,
      effectIdPattern,
      `${description} effectId`
    ),
    sourceEntityId: requireId<EntityId>(
      record.sourceEntityId,
      entityIdPattern,
      `${description} sourceEntityId`
    ),
    targetEntityId: requireId<EntityId>(
      record.targetEntityId,
      entityIdPattern,
      `${description} targetEntityId`
    ),
    ...timing,
    healing: requireInteger(record.healing, `${description} healing`)
  });
}

function validateStatusEffect(
  value: unknown,
  index: number,
  currentTick: number
): CommittedStatusEffect {
  const description = `committed status effect ${index}`;
  const record = requireDataRecord(
    value,
    [
      "schemaVersion",
      "effectId",
      "sourceEntityId",
      "targetEntityId",
      "committedAtTick",
      "impactAtTick",
      "statusId",
      "durationTicks",
      "magnitude"
    ],
    description
  );
  if (record.schemaVersion !== 1)
    throw new RangeError(`${description} has unsupported schemaVersion`);
  const timing = validateTiming(
    record.committedAtTick,
    record.impactAtTick,
    currentTick,
    description
  );
  const durationTicks = requireInteger(
    record.durationTicks,
    `${description} durationTicks`
  );
  if (durationTicks === 0)
    throw new RangeError(`${description} durationTicks must be positive`);
  if (!Number.isSafeInteger(timing.impactAtTick + durationTicks))
    throw new RangeError(
      `${description} expiry exceeds the safe-integer range`
    );
  return Object.freeze({
    schemaVersion: 1,
    effectId: requireId<EffectId>(
      record.effectId,
      effectIdPattern,
      `${description} effectId`
    ),
    sourceEntityId: requireId<EntityId>(
      record.sourceEntityId,
      entityIdPattern,
      `${description} sourceEntityId`
    ),
    targetEntityId: requireId<EntityId>(
      record.targetEntityId,
      entityIdPattern,
      `${description} targetEntityId`
    ),
    ...timing,
    statusId: requireId<StatusId>(
      record.statusId,
      statusIdPattern,
      `${description} statusId`
    ),
    durationTicks,
    magnitude: requireInteger(record.magnitude, `${description} magnitude`)
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
  const currentHealth = requireInteger(
    record.currentHealth,
    `${description} currentHealth`
  );
  const maximumHealth = requireInteger(
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
    entityId: requireId<EntityId>(
      record.entityId,
      entityIdPattern,
      `${description} entityId`
    ),
    currentHealth,
    maximumHealth
  });
}

interface OrderedHealingEffect {
  readonly kind: "healing";
  readonly effect: CommittedHealingEffect;
}

interface OrderedStatusEffect {
  readonly kind: "status";
  readonly effect: CommittedStatusEffect;
}

type OrderedEffect = OrderedHealingEffect | OrderedStatusEffect;

function baseDecision(effect: OrderedEffect) {
  return {
    schemaVersion: 1 as const,
    effectId: effect.effect.effectId,
    sourceEntityId: effect.effect.sourceEntityId,
    targetEntityId: effect.effect.targetEntityId,
    effectKind: effect.kind
  };
}

/** Resolves committed healing and status work during fixed-step phase 8. */
export function resolveCommittedCombatEffects(
  request: CommittedCombatEffectRequest
): CommittedCombatEffectResolution {
  const record = requireDataRecord(
    request,
    [
      "currentTick",
      "healingEffects",
      "statusEffects",
      "combatants",
      "statuses"
    ],
    "committed combat effect request"
  );
  const currentTick = requireInteger(record.currentTick, "currentTick");
  const healingEffects = requireDenseDataArray(
    record.healingEffects,
    "committed healing effects"
  ).map((value, index) => validateHealingEffect(value, index, currentTick));
  const statusEffects = requireDenseDataArray(
    record.statusEffects,
    "committed status effects"
  ).map((value, index) => validateStatusEffect(value, index, currentTick));

  const effectIds = new Set<EffectId>();
  for (const effect of [...healingEffects, ...statusEffects]) {
    if (effectIds.has(effect.effectId))
      throw new RangeError(
        `duplicate committed effect ID (${effect.effectId})`
      );
    effectIds.add(effect.effectId);
  }

  const combatantsById = new Map<EntityId, CombatantHealth>();
  const combatants = requireDenseDataArray(record.combatants, "combatants")
    .map(validateCombatant)
    .map((combatant) => {
      if (combatantsById.has(combatant.entityId))
        throw new RangeError(
          `duplicate combatant entity ID (${combatant.entityId})`
        );
      combatantsById.set(combatant.entityId, combatant);
      return combatant;
    })
    .sort((left, right) => compareText(left.entityId, right.entityId));

  let statuses: readonly ActiveStatus[] = applyStatusApplications({
    currentTick,
    statuses: record.statuses as readonly ActiveStatus[],
    applications: []
  }).statuses;
  const statusesByKey = new Map(
    statuses.map((status) => [activeStatusKey(status), status])
  );
  const orderedEffects: OrderedEffect[] = [
    ...healingEffects.map(
      (effect): OrderedHealingEffect => ({
        kind: "healing",
        effect
      })
    ),
    ...statusEffects.map(
      (effect): OrderedStatusEffect => ({
        kind: "status",
        effect
      })
    )
  ].sort((left, right) =>
    compareText(left.effect.effectId, right.effect.effectId)
  );

  const incomingHealingByTarget = new Map<EntityId, number>();
  const pendingHealingEffects: CommittedHealingEffect[] = [];
  const pendingStatusEffects: CommittedStatusEffect[] = [];
  const decisions: CommittedCombatEffectDecision[] = [];

  for (const ordered of orderedEffects) {
    const effect = ordered.effect;
    if (currentTick < effect.impactAtTick) {
      if (ordered.kind === "healing")
        pendingHealingEffects.push(ordered.effect);
      else pendingStatusEffects.push(ordered.effect);
      decisions.push(
        Object.freeze({
          ...baseDecision(ordered),
          status: "pending",
          reason: "waiting_for_impact"
        })
      );
      continue;
    }

    const target = combatantsById.get(effect.targetEntityId);
    if (target === undefined || target.currentHealth === 0) {
      decisions.push(
        Object.freeze({
          ...baseDecision(ordered),
          status: "discarded",
          reason: "target_not_living_at_impact"
        })
      );
      continue;
    }

    if (ordered.kind === "healing") {
      const aggregate =
        (incomingHealingByTarget.get(target.entityId) ?? 0) +
        ordered.effect.healing;
      if (!Number.isSafeInteger(aggregate))
        throw new RangeError(
          `aggregate incoming healing exceeds the safe-integer range (${target.entityId})`
        );
      incomingHealingByTarget.set(target.entityId, aggregate);
      decisions.push(
        Object.freeze({
          ...baseDecision(ordered),
          status: "resolved",
          reason: "healing_applied",
          healing: ordered.effect.healing
        })
      );
      continue;
    }

    const application = Object.freeze({
      schemaVersion: 1 as const,
      statusId: ordered.effect.statusId,
      ownerEntityId: ordered.effect.targetEntityId,
      durationTicks: ordered.effect.durationTicks,
      magnitude: ordered.effect.magnitude
    });
    const key = activeStatusKey(application);
    const applied = applyStatusApplicationRule(
      currentTick,
      statusesByKey.get(key),
      application
    );
    statusesByKey.set(key, applied.status);
    const statusApplication: StatusApplicationDecision = applied.decision;
    decisions.push(
      Object.freeze({
        ...baseDecision(ordered),
        status: "resolved",
        reason: "status_applied",
        statusApplication
      })
    );
  }

  const healingResolutions: CombatantHealingResolution[] = [];
  const health = combatants.map((combatant): CombatantHealth => {
    const incomingHealing = incomingHealingByTarget.get(combatant.entityId);
    if (incomingHealing === undefined) return combatant;
    const appliedHealing = Math.min(
      combatant.maximumHealth - combatant.currentHealth,
      incomingHealing
    );
    const healthAfter = combatant.currentHealth + appliedHealing;
    healingResolutions.push(
      Object.freeze({
        schemaVersion: 1,
        entityId: combatant.entityId,
        healthBefore: combatant.currentHealth,
        incomingHealing,
        appliedHealing,
        healthAfter
      })
    );
    return Object.freeze({
      schemaVersion: 1,
      entityId: combatant.entityId,
      currentHealth: healthAfter,
      maximumHealth: combatant.maximumHealth
    });
  });
  statuses = [...statusesByKey.values()].sort(
    (left, right) =>
      compareText(left.ownerEntityId, right.ownerEntityId) ||
      compareText(left.statusId, right.statusId)
  );

  return Object.freeze({
    schemaVersion: 1,
    pendingHealingEffects: Object.freeze(pendingHealingEffects),
    pendingStatusEffects: Object.freeze(pendingStatusEffects),
    decisions: Object.freeze(decisions),
    health: Object.freeze(health),
    healingResolutions: Object.freeze(healingResolutions),
    statuses: Object.freeze(statuses)
  });
}
