import type {
  CombatantKind,
  CombatantLifecycle,
  CombatantLifecycleState,
  DeathTriggerDecision,
  DeathTriggerEffect,
  DeathTriggerHealthResolution,
  DeathTriggerLifecycleTransition,
  DeathTriggerResolution,
  DeathTriggerResolutionRequest,
  EffectId,
  EntityId
} from "@dwarven-depths/contracts";

const entityIdPattern = /^entity\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const effectIdPattern = /^effect\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const combatantKinds = new Set<CombatantKind>(["dwarf", "enemy", "deployable"]);
const lifecycleStates = new Set<CombatantLifecycleState>([
  "active",
  "downed",
  "destroyed"
]);
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

function requireId<Id extends EntityId | EffectId>(
  value: unknown,
  pattern: RegExp,
  description: string
): Id {
  if (typeof value !== "string" || !pattern.test(value))
    throw new RangeError(`${description} must be a valid stable ID`);
  return value as Id;
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

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateCombatant(value: unknown, index: number): CombatantLifecycle {
  const description = `combatant ${index}`;
  const record = requireDataRecord(
    value,
    ["schemaVersion", "entityId", "kind", "currentHealth", "lifecycleState"],
    description
  );
  if (record.schemaVersion !== 1)
    throw new RangeError(`${description} has unsupported schemaVersion`);
  const entityId = requireId<EntityId>(
    record.entityId,
    entityIdPattern,
    `${description} entityId`
  );
  if (!combatantKinds.has(record.kind as CombatantKind))
    throw new RangeError(`${description} kind is invalid`);
  const kind = record.kind as CombatantKind;
  const currentHealth = requireNonNegativeSafeInteger(
    record.currentHealth,
    `${description} currentHealth`
  );
  if (!lifecycleStates.has(record.lifecycleState as CombatantLifecycleState))
    throw new RangeError(`${description} lifecycleState is invalid`);
  const lifecycleState = record.lifecycleState as CombatantLifecycleState;
  if (lifecycleState === "downed" && kind !== "dwarf")
    throw new RangeError(`${description} only a dwarf can be downed`);
  if (lifecycleState === "destroyed" && kind === "dwarf")
    throw new RangeError(`${description} a dwarf cannot be destroyed`);
  if (lifecycleState === "active" && currentHealth === 0)
    throw new RangeError(
      `${description} active trigger-stage combatant must have positive health`
    );
  if (lifecycleState !== "active" && currentHealth !== 0)
    throw new RangeError(
      `${description} resolved lifecycle state requires zero health`
    );
  return Object.freeze({
    schemaVersion: 1,
    entityId,
    kind,
    currentHealth,
    lifecycleState
  });
}

function validateEffect(value: unknown, index: number): DeathTriggerEffect {
  const description = `death trigger effect ${index}`;
  const record = requireDataRecord(
    value,
    ["schemaVersion", "effectId", "ownerEntityId", "targetEntityId", "damage"],
    description
  );
  if (record.schemaVersion !== 1)
    throw new RangeError(`${description} has unsupported schemaVersion`);
  return Object.freeze({
    schemaVersion: 1,
    effectId: requireId<EffectId>(
      record.effectId,
      effectIdPattern,
      `${description} effectId`
    ),
    ownerEntityId: requireId<EntityId>(
      record.ownerEntityId,
      entityIdPattern,
      `${description} ownerEntityId`
    ),
    targetEntityId: requireId<EntityId>(
      record.targetEntityId,
      entityIdPattern,
      `${description} targetEntityId`
    ),
    damage: requireNonNegativeSafeInteger(
      record.damage,
      `${description} damage`
    )
  });
}

function freezeCombatant(
  combatant: CombatantLifecycle,
  currentHealth = combatant.currentHealth,
  lifecycleState = combatant.lifecycleState
): CombatantLifecycle {
  return Object.freeze({
    schemaVersion: 1,
    entityId: combatant.entityId,
    kind: combatant.kind,
    currentHealth,
    lifecycleState
  });
}

/**
 * Resolves direct-damage death triggers in bounded recursion rounds. Eligible
 * owners and effects use stable ID order; each round aggregates damage before
 * simultaneously transitioning newly zero-health combatants.
 */
export function resolveDeathTriggers(
  request: DeathTriggerResolutionRequest
): DeathTriggerResolution {
  const record = requireDataRecord(
    request,
    ["combatants", "deathEntityIds", "effects", "recursionLimit"],
    "death trigger resolution request"
  );
  const recursionLimit = requireNonNegativeSafeInteger(
    record.recursionLimit,
    "recursionLimit"
  );
  if (recursionLimit === 0 || recursionLimit > maximumRecords)
    throw new RangeError(
      `recursionLimit must be between 1 and ${maximumRecords}`
    );

  const combatantsById = new Map<EntityId, CombatantLifecycle>();
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

  const deathEntityIds = requireDenseDataArray(
    record.deathEntityIds,
    "death entity IDs"
  ).map((value, index) =>
    requireId<EntityId>(value, entityIdPattern, `death entity ID ${index}`)
  );
  const uniqueDeathEntityIds = new Set<EntityId>();
  for (const entityId of deathEntityIds) {
    if (uniqueDeathEntityIds.has(entityId))
      throw new RangeError(`duplicate death entity ID (${entityId})`);
    uniqueDeathEntityIds.add(entityId);
    const combatant = combatantsById.get(entityId);
    if (combatant === undefined)
      throw new RangeError(
        `death event references unknown combatant (${entityId})`
      );
    if (combatant.lifecycleState === "active")
      throw new RangeError(`death event owner is still active (${entityId})`);
  }

  const effectIds = new Set<EffectId>();
  const effects = requireDenseDataArray(record.effects, "death trigger effects")
    .map((value, index) => {
      const effect = validateEffect(value, index);
      if (effectIds.has(effect.effectId))
        throw new RangeError(
          `duplicate death trigger effect ID (${effect.effectId})`
        );
      effectIds.add(effect.effectId);
      if (!combatantsById.has(effect.ownerEntityId))
        throw new RangeError(
          `death trigger effect references unknown owner (${effect.ownerEntityId})`
        );
      return effect;
    })
    .sort(
      (left, right) =>
        compareText(left.ownerEntityId, right.ownerEntityId) ||
        compareText(left.effectId, right.effectId)
    );
  const effectsByOwner = new Map<EntityId, DeathTriggerEffect[]>();
  for (const effect of effects) {
    const ownerEffects = effectsByOwner.get(effect.ownerEntityId) ?? [];
    ownerEffects.push(effect);
    effectsByOwner.set(effect.ownerEntityId, ownerEffects);
  }

  const mutableCombatants = new Map(
    combatants.map((combatant) => [combatant.entityId, combatant] as const)
  );
  const decisions: DeathTriggerDecision[] = [];
  const healthResolutions: DeathTriggerHealthResolution[] = [];
  const lifecycleTransitions: DeathTriggerLifecycleTransition[] = [];
  let pendingDeathEntityIds = [...deathEntityIds].sort(compareText);
  let completedRounds = 0;

  while (pendingDeathEntityIds.length > 0 && completedRounds < recursionLimit) {
    const round = completedRounds + 1;
    const incomingDamageByTarget = new Map<EntityId, number>();

    for (const ownerEntityId of pendingDeathEntityIds) {
      for (const effect of effectsByOwner.get(ownerEntityId) ?? []) {
        const target = mutableCombatants.get(effect.targetEntityId);
        if (target === undefined || target.lifecycleState !== "active") {
          decisions.push(
            Object.freeze({
              schemaVersion: 1,
              round,
              effectId: effect.effectId,
              ownerEntityId,
              targetEntityId: effect.targetEntityId,
              status: "discarded",
              reason: "target_not_living"
            })
          );
          continue;
        }
        const incomingDamage =
          (incomingDamageByTarget.get(effect.targetEntityId) ?? 0) +
          effect.damage;
        if (!Number.isSafeInteger(incomingDamage))
          throw new RangeError(
            `aggregate trigger damage exceeds the safe-integer range (${effect.targetEntityId})`
          );
        incomingDamageByTarget.set(effect.targetEntityId, incomingDamage);
        decisions.push(
          Object.freeze({
            schemaVersion: 1,
            round,
            effectId: effect.effectId,
            ownerEntityId,
            targetEntityId: effect.targetEntityId,
            status: "executed",
            reason: "damage_applied",
            damage: effect.damage
          })
        );
      }
    }

    const nextDeathEntityIds: EntityId[] = [];
    for (const entityId of [...incomingDamageByTarget.keys()].sort(
      compareText
    )) {
      const combatant = mutableCombatants.get(entityId);
      if (combatant === undefined || combatant.lifecycleState !== "active")
        throw new Error("validated trigger target became unavailable");
      const incomingDamage = incomingDamageByTarget.get(entityId) as number;
      const appliedDamage = Math.min(combatant.currentHealth, incomingDamage);
      const healthAfter = combatant.currentHealth - appliedDamage;
      healthResolutions.push(
        Object.freeze({
          schemaVersion: 1,
          round,
          entityId,
          healthBefore: combatant.currentHealth,
          incomingDamage,
          appliedDamage,
          healthAfter
        })
      );
      const lifecycleAfter =
        healthAfter === 0
          ? combatant.kind === "dwarf"
            ? "downed"
            : "destroyed"
          : "active";
      mutableCombatants.set(
        entityId,
        freezeCombatant(combatant, healthAfter, lifecycleAfter)
      );
      if (lifecycleAfter !== "active") {
        nextDeathEntityIds.push(entityId);
        lifecycleTransitions.push(
          Object.freeze({
            schemaVersion: 1,
            round,
            entityId,
            lifecycleBefore: "active",
            lifecycleAfter
          })
        );
      }
    }

    pendingDeathEntityIds = nextDeathEntityIds;
    completedRounds = round;
  }

  const status =
    pendingDeathEntityIds.length === 0 ? "complete" : "safety_limit_reached";
  return Object.freeze({
    combatants: Object.freeze(
      combatants.map((combatant) =>
        freezeCombatant(
          mutableCombatants.get(combatant.entityId) as CombatantLifecycle
        )
      )
    ),
    decisions: Object.freeze(decisions),
    healthResolutions: Object.freeze(healthResolutions),
    lifecycleTransitions: Object.freeze(lifecycleTransitions),
    completedRounds,
    status,
    pendingDeathEntityIds: Object.freeze([...pendingDeathEntityIds])
  });
}
