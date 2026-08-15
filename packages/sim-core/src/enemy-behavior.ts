import type {
  AuthoredEnemyBehaviorDefinition,
  EnemyBehaviorAllyCandidate,
  EnemyBehaviorIntentDecision,
  EnemyBehaviorIntentRequest,
  EnemyBehaviorTargetCandidate,
  EntityId,
  StableId
} from "@dwarven-depths/contracts";

const stableIdPattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const entityIdPattern = /^entity\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const strategies = new Set<AuthoredEnemyBehaviorDefinition["strategy"]>([
  "advance",
  "hold_range",
  "guard",
  "command",
  "skirmish",
  "disrupt",
  "support",
  "priority_hunt"
]);
const mechanics = new Set<AuthoredEnemyBehaviorDefinition["mechanic"]>([
  "direct_pressure",
  "standoff_fire",
  "ally_guard",
  "formation_command",
  "flank_reposition",
  "armor_sunder",
  "attack_slow",
  "ally_haste",
  "target_mark"
]);

function requireRecord<const Keys extends readonly string[]>(
  value: unknown,
  keys: Keys,
  description: string
): Readonly<Record<Keys[number], unknown>> {
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
  const result: Record<string, unknown> = {};
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
  return result as Record<Keys[number], unknown>;
}

function requireArray(value: unknown, description: string): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    throw new TypeError(`${description} must be a standard array`);
  if (Reflect.ownKeys(value).length !== value.length + 1)
    throw new TypeError(`${description} must be a dense data array`);
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    )
      throw new TypeError(
        `${description}[${index}] must be own enumerable data`
      );
    return descriptor.value;
  });
}

function requireInteger(
  value: unknown,
  minimum: number,
  description: string
): number {
  if (
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    (value as number) < minimum
  )
    throw new RangeError(`${description} must be a safe integer >= ${minimum}`);
  return value as number;
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

function normalizeBehavior(value: unknown): AuthoredEnemyBehaviorDefinition {
  const data = requireRecord(
    value,
    [
      "schemaVersion",
      "roleId",
      "strategy",
      "tellId",
      "tellTicks",
      "purposeId",
      "counterplayId",
      "mechanic",
      "effectId",
      "effectMagnitude",
      "effectDurationTicks",
      "effectCooldownTicks"
    ],
    "enemy behavior"
  );
  if (data.schemaVersion !== 1)
    throw new RangeError("enemy behavior has unsupported schemaVersion");
  if (!strategies.has(data.strategy as never))
    throw new RangeError("enemy behavior has unknown strategy");
  if (!mechanics.has(data.mechanic as never))
    throw new RangeError("enemy behavior has unknown mechanic");
  return Object.freeze({
    schemaVersion: 1,
    roleId: requireId(data.roleId, stableIdPattern, "roleId") as StableId,
    strategy: data.strategy as AuthoredEnemyBehaviorDefinition["strategy"],
    tellId: requireId(data.tellId, stableIdPattern, "tellId") as StableId,
    tellTicks: requireInteger(data.tellTicks, 1, "tellTicks"),
    purposeId: requireId(
      data.purposeId,
      stableIdPattern,
      "purposeId"
    ) as StableId,
    counterplayId: requireId(
      data.counterplayId,
      stableIdPattern,
      "counterplayId"
    ) as StableId,
    mechanic: data.mechanic as AuthoredEnemyBehaviorDefinition["mechanic"],
    effectId: requireId(data.effectId, stableIdPattern, "effectId") as StableId,
    effectMagnitude: requireInteger(data.effectMagnitude, 1, "effectMagnitude"),
    effectDurationTicks: requireInteger(
      data.effectDurationTicks,
      1,
      "effectDurationTicks"
    ),
    effectCooldownTicks: requireInteger(
      data.effectCooldownTicks,
      1,
      "effectCooldownTicks"
    )
  });
}

function normalizeCandidates<T extends EnemyBehaviorTargetCandidate>(
  value: unknown,
  description: string
): readonly T[] {
  const seen = new Set<EntityId>();
  return Object.freeze(
    requireArray(value, description)
      .map((candidate, index) => {
        const data = requireRecord(
          candidate,
          ["entityId", "currentHealth", "maximumHealth", "pathCost"],
          `${description}[${index}]`
        );
        const entityId = requireId(
          data.entityId,
          entityIdPattern,
          `${description}[${index}].entityId`
        ) as EntityId;
        const currentHealth = requireInteger(
          data.currentHealth,
          0,
          `${description}[${index}].currentHealth`
        );
        const maximumHealth = requireInteger(
          data.maximumHealth,
          1,
          `${description}[${index}].maximumHealth`
        );
        if (currentHealth > maximumHealth)
          throw new RangeError(
            `${description}[${index}] health exceeds maximum`
          );
        if (seen.has(entityId))
          throw new RangeError(`${description} contains duplicate entityId`);
        seen.add(entityId);
        return Object.freeze({
          entityId,
          currentHealth,
          maximumHealth,
          pathCost: requireInteger(
            data.pathCost,
            0,
            `${description}[${index}].pathCost`
          )
        }) as T;
      })
      .filter(({ currentHealth }) => currentHealth > 0)
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function nearest<T extends EnemyBehaviorTargetCandidate>(
  candidates: readonly T[]
): T | undefined {
  return [...candidates].sort(
    (left, right) =>
      left.pathCost - right.pathCost ||
      compareText(left.entityId, right.entityId)
  )[0];
}

function lowestHealth<T extends EnemyBehaviorTargetCandidate>(
  candidates: readonly T[]
): T | undefined {
  return [...candidates].sort(
    (left, right) =>
      left.currentHealth * right.maximumHealth -
        right.currentHealth * left.maximumHealth ||
      left.pathCost - right.pathCost ||
      compareText(left.entityId, right.entityId)
  )[0];
}

/** Resolves one authored role's deterministic tell/effect cadence and recipient. */
export function resolveEnemyBehaviorIntent(
  request: EnemyBehaviorIntentRequest
): EnemyBehaviorIntentDecision {
  const data = requireRecord(
    request,
    [
      "schemaVersion",
      "currentTick",
      "admittedAtTick",
      "enemyEntityId",
      "lockedTargetEntityId",
      "behavior",
      "targets",
      "allies"
    ],
    "enemy behavior intent request"
  );
  if (data.schemaVersion !== 1)
    throw new RangeError(
      "enemy behavior intent request has unsupported schemaVersion"
    );
  const currentTick = requireInteger(data.currentTick, 0, "currentTick");
  const admittedAtTick = requireInteger(
    data.admittedAtTick,
    0,
    "admittedAtTick"
  );
  if (currentTick < admittedAtTick)
    throw new RangeError("currentTick must not precede admittedAtTick");
  const enemyEntityId = requireId(
    data.enemyEntityId,
    entityIdPattern,
    "enemyEntityId"
  ) as EntityId;
  const lockedTargetEntityId =
    data.lockedTargetEntityId === null
      ? null
      : (requireId(
          data.lockedTargetEntityId,
          entityIdPattern,
          "lockedTargetEntityId"
        ) as EntityId);
  const behavior = normalizeBehavior(data.behavior);
  const targets = normalizeCandidates<EnemyBehaviorTargetCandidate>(
    data.targets,
    "targets"
  );
  const allies = normalizeCandidates<EnemyBehaviorAllyCandidate>(
    data.allies,
    "allies"
  ).filter(({ entityId }) => entityId !== enemyEntityId);
  const cycleTicks =
    behavior.tellTicks +
    behavior.effectDurationTicks +
    behavior.effectCooldownTicks;
  if (!Number.isSafeInteger(cycleTicks))
    throw new RangeError("enemy behavior cycle exceeds safe integer bounds");
  const cycleStartedAtTick =
    admittedAtTick +
    Math.floor((currentTick - admittedAtTick) / cycleTicks) * cycleTicks;
  const cycleOffset = currentTick - cycleStartedAtTick;
  const phase =
    cycleOffset < behavior.tellTicks
      ? "telling"
      : cycleOffset < behavior.tellTicks + behavior.effectDurationTicks
        ? "active"
        : "cooldown";
  const phaseStartedAtTick =
    phase === "telling"
      ? cycleStartedAtTick
      : phase === "active"
        ? cycleStartedAtTick + behavior.tellTicks
        : cycleStartedAtTick +
          behavior.tellTicks +
          behavior.effectDurationTicks;
  const phaseCompletesAtTick =
    phase === "telling"
      ? cycleStartedAtTick + behavior.tellTicks
      : phase === "active"
        ? cycleStartedAtTick + behavior.tellTicks + behavior.effectDurationTicks
        : cycleStartedAtTick + cycleTicks;
  const isAllyMechanic =
    behavior.mechanic === "ally_haste" ||
    behavior.mechanic === "formation_command";
  const unlockedRecipient = isAllyMechanic
    ? behavior.mechanic === "formation_command"
      ? nearest(allies)
      : lowestHealth(allies)
    : behavior.strategy === "priority_hunt"
      ? lowestHealth(targets)
      : nearest(targets);
  const recipient =
    !isAllyMechanic && phase !== "telling" && lockedTargetEntityId !== null
      ? targets.find(
          (candidate) =>
            candidate.entityId === lockedTargetEntityId &&
            candidate.currentHealth > 0
        )
      : unlockedRecipient;
  const reason: EnemyBehaviorIntentDecision["reason"] =
    recipient === undefined
      ? "no_eligible_recipient"
      : behavior.mechanic === "formation_command"
        ? "stable_formation_anchor"
        : isAllyMechanic
          ? "lowest_health_ally"
          : behavior.strategy === "priority_hunt"
            ? "lowest_health_target"
            : "nearest_target";
  const effectStatus: EnemyBehaviorIntentDecision["effectStatus"] =
    recipient === undefined
      ? "cancelled"
      : phase === "telling"
        ? "telling"
        : phase === "active"
          ? "committed"
          : "cooling_down";
  return Object.freeze({
    schemaVersion: 1,
    enemyEntityId,
    roleId: behavior.roleId,
    strategy: behavior.strategy,
    mechanic: behavior.mechanic,
    purposeId: behavior.purposeId,
    counterplayId: behavior.counterplayId,
    tellId: behavior.tellId,
    effectId: behavior.effectId,
    phase,
    phaseStartedAtTick,
    phaseCompletesAtTick,
    ...(recipient === undefined ? {} : { targetEntityId: recipient.entityId }),
    reason,
    effectStatus,
    effectMagnitude: behavior.effectMagnitude
  });
}
