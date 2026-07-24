import type {
  CombatantKind,
  CombatantLifecycle,
  CombatantLifecycleState,
  NavigationOccupant,
  ZeroHealthLifecycleDecision,
  ZeroHealthLifecycleReason,
  ZeroHealthLifecycleRequest,
  ZeroHealthLifecycleResolution
} from "@dwarven-depths/contracts";

const entityIdPattern = /^entity\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const nodeIdPattern = /^node\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const combatantKinds = new Set<CombatantKind>(["dwarf", "enemy", "deployable"]);
const lifecycleStates = new Set<CombatantLifecycleState>([
  "active",
  "downed",
  "destroyed"
]);

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

function requireId(
  value: unknown,
  pattern: RegExp,
  description: string
): string {
  if (typeof value !== "string" || !pattern.test(value))
    throw new RangeError(`${description} must be a valid stable ID`);
  return value;
}

function requireCurrentHealth(value: unknown, description: string): number {
  if (
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    (value as number) < 0
  )
    throw new RangeError(`${description} must be a non-negative safe integer`);
  return value as number;
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
  const entityId = requireId(
    record.entityId,
    entityIdPattern,
    `${description} entityId`
  ) as CombatantLifecycle["entityId"];
  if (!combatantKinds.has(record.kind as CombatantKind))
    throw new RangeError(`${description} kind is invalid`);
  const kind = record.kind as CombatantKind;
  const currentHealth = requireCurrentHealth(
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

function validateOccupant(value: unknown, index: number): NavigationOccupant {
  const description = `occupant ${index}`;
  const record = requireDataRecord(value, ["entityId", "nodeId"], description);
  return Object.freeze({
    entityId: requireId(
      record.entityId,
      entityIdPattern,
      `${description} entityId`
    ) as NavigationOccupant["entityId"],
    nodeId: requireId(
      record.nodeId,
      nodeIdPattern,
      `${description} nodeId`
    ) as NavigationOccupant["nodeId"]
  });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function nextLifecycle(combatant: CombatantLifecycle): {
  readonly lifecycleState: CombatantLifecycleState;
  readonly reason: ZeroHealthLifecycleReason;
} {
  if (combatant.lifecycleState !== "active")
    return {
      lifecycleState: combatant.lifecycleState,
      reason: "already_resolved"
    };
  if (combatant.currentHealth > 0)
    return { lifecycleState: "active", reason: "living" };
  if (combatant.kind === "dwarf")
    return { lifecycleState: "downed", reason: "dwarf_downed" };
  return {
    lifecycleState: "destroyed",
    reason:
      combatant.kind === "enemy" ? "enemy_destroyed" : "deployable_destroyed"
  };
}

/**
 * Marks every zero-health combatant from one shared pre-resolution snapshot, then
 * removes all downed and destroyed entities from navigation occupancy.
 */
export function resolveZeroHealthLifecycles(
  request: ZeroHealthLifecycleRequest
): ZeroHealthLifecycleResolution {
  const record = requireDataRecord(
    request,
    ["combatants", "occupancy"],
    "zero-health lifecycle request"
  );
  const combatantsById = new Map<
    CombatantLifecycle["entityId"],
    CombatantLifecycle
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

  const occupiedEntities = new Set<NavigationOccupant["entityId"]>();
  const occupiedNodes = new Set<NavigationOccupant["nodeId"]>();
  const occupancy = requireDenseDataArray(record.occupancy, "occupancy")
    .map((value, index) => {
      const occupant = validateOccupant(value, index);
      if (!combatantsById.has(occupant.entityId))
        throw new RangeError(
          `occupancy references unknown combatant (${occupant.entityId})`
        );
      if (occupiedEntities.has(occupant.entityId))
        throw new RangeError(
          `duplicate occupied entity ID (${occupant.entityId})`
        );
      if (occupiedNodes.has(occupant.nodeId))
        throw new RangeError(`duplicate occupied node ID (${occupant.nodeId})`);
      occupiedEntities.add(occupant.entityId);
      occupiedNodes.add(occupant.nodeId);
      return occupant;
    })
    .sort((left, right) => compareText(left.entityId, right.entityId));

  const decisions: ZeroHealthLifecycleDecision[] = [];
  const resolvedCombatants = combatants.map((combatant): CombatantLifecycle => {
    const resolved = nextLifecycle(combatant);
    decisions.push(
      Object.freeze({
        schemaVersion: 1,
        entityId: combatant.entityId,
        kind: combatant.kind,
        lifecycleBefore: combatant.lifecycleState,
        lifecycleAfter: resolved.lifecycleState,
        status:
          resolved.lifecycleState === combatant.lifecycleState
            ? "unchanged"
            : "transitioned",
        reason: resolved.reason
      })
    );
    return Object.freeze({
      schemaVersion: 1,
      entityId: combatant.entityId,
      kind: combatant.kind,
      currentHealth: combatant.currentHealth,
      lifecycleState: resolved.lifecycleState
    });
  });
  const activeEntityIds = new Set(
    resolvedCombatants
      .filter((combatant) => combatant.lifecycleState === "active")
      .map((combatant) => combatant.entityId)
  );
  const resolvedOccupancy = occupancy.filter((occupant) =>
    activeEntityIds.has(occupant.entityId)
  );

  return Object.freeze({
    combatants: Object.freeze(resolvedCombatants),
    occupancy: Object.freeze(resolvedOccupancy),
    decisions: Object.freeze(decisions)
  });
}
