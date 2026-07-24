import type {
  BattlefieldEnemyCombatant,
  EnemyMovementPlanningDecision,
  EnemyMovementPlanningEntry,
  EnemyMovementPlanningRequest,
  EnemyMovementPlanningResolution,
  EnemyTargetCandidate,
  EntityId,
  MovementProposal,
  NavigationNodeId,
  NavigationOccupant
} from "@dwarven-depths/contracts";
import { planEnemyRoute } from "./enemy-route-planning.js";
import { resolveEnemyTargetLock } from "./target-locks.js";

const entityIdPattern = /^entity\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

interface ParsedDataRecord extends Record<string, unknown> {
  readonly schemaVersion?: unknown;
  readonly entityId?: unknown;
  readonly nodeId?: unknown;
  readonly basicAttack?: unknown;
  readonly actionState?: unknown;
  readonly lifecycleState?: unknown;
  readonly currentHealth?: unknown;
  readonly maximumHealth?: unknown;
  readonly range?: unknown;
  readonly nextMovementAtTick?: unknown;
  readonly requiresLineOfSight?: unknown;
  readonly currentTargetEntityId?: unknown;
  readonly solidBlockerEntityIds?: unknown;
  readonly candidates?: unknown;
  readonly enemyEntityId?: unknown;
  readonly currentTick?: unknown;
  readonly battlefield?: unknown;
  readonly map?: unknown;
  readonly mapId?: unknown;
  readonly occupancy?: unknown;
  readonly enemyCombatants?: unknown;
  readonly entries?: unknown;
}

function requireRecord(
  value: unknown,
  keys: readonly string[],
  description: string
): ParsedDataRecord {
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
  const result: ParsedDataRecord = {};
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

function requireArray(value: unknown, description: string): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    throw new TypeError(`${description} must be a standard array`);
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
        `${description}[${index}] must be own enumerable data`
      );
    result.push(descriptor.value);
  }
  return result;
}

function requireEntityId(value: unknown, description: string): EntityId {
  if (typeof value !== "string" || !entityIdPattern.test(value))
    throw new RangeError(`${description} must be an entity.* stable ID`);
  return value as EntityId;
}

function requireNonNegativeInteger(
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

function normalizeOccupancy(value: unknown): readonly NavigationOccupant[] {
  const seenEntities = new Set<EntityId>();
  const seenNodes = new Set<NavigationNodeId>();
  return requireArray(value, "battlefield occupancy").map((item, index) => {
    const data = requireRecord(
      item,
      ["entityId", "nodeId"],
      `occupancy ${index}`
    );
    const entityId = requireEntityId(
      data.entityId,
      `occupancy ${index} entityId`
    );
    const nodeId = data.nodeId;
    if (typeof nodeId !== "string" || !nodeId.startsWith("node."))
      throw new RangeError(`occupancy ${index} nodeId must be node.*`);
    if (seenEntities.has(entityId) || seenNodes.has(nodeId as NavigationNodeId))
      throw new RangeError("battlefield occupancy contains duplicate identity");
    seenEntities.add(entityId);
    seenNodes.add(nodeId as NavigationNodeId);
    return Object.freeze({
      entityId,
      nodeId: nodeId as NavigationNodeId
    });
  });
}

function normalizeCombatants(
  value: unknown
): readonly BattlefieldEnemyCombatant[] {
  const seen = new Set<EntityId>();
  return requireArray(value, "battlefield enemy combatants").map(
    (item, index) => {
      const description = `enemy combatant ${index}`;
      const data = requireRecord(
        item,
        [
          "schemaVersion",
          "entityId",
          "enemyDefinitionId",
          "classification",
          "currentHealth",
          "maximumHealth",
          "armor",
          "movementIntervalTicks",
          "admittedAtTick",
          "lifecycleState",
          "basicAttack",
          "actionState"
        ],
        description
      );
      const attack = requireRecord(
        data.basicAttack,
        [
          "id",
          "windupTicks",
          "impactDelayTicks",
          "cooldownTicks",
          "damage",
          "range",
          "requiresLineOfSight"
        ],
        `${description} basicAttack`
      );
      const action = requireRecord(
        data.actionState,
        [
          "schemaVersion",
          "nextMovementAtTick",
          "currentTargetEntityId",
          "activeBasicAttack",
          "cooldownCompleteAtTick"
        ],
        `${description} actionState`
      );
      const entityId = requireEntityId(
        data.entityId,
        `${description} entityId`
      );
      if (seen.has(entityId))
        throw new RangeError(`duplicate enemy combatant (${entityId})`);
      seen.add(entityId);
      if (data.schemaVersion !== 1 || action.schemaVersion !== 1)
        throw new RangeError(`${description} has unsupported schemaVersion`);
      if (
        data.lifecycleState !== "active" &&
        data.lifecycleState !== "destroyed"
      )
        throw new RangeError(`${description} has invalid lifecycleState`);
      requireNonNegativeInteger(
        data.currentHealth,
        `${description} currentHealth`
      );
      requireNonNegativeInteger(
        data.maximumHealth,
        `${description} maximumHealth`
      );
      requireNonNegativeInteger(attack.range, `${description} range`);
      requireNonNegativeInteger(
        action.nextMovementAtTick,
        `${description} nextMovementAtTick`
      );
      if (typeof attack.requiresLineOfSight !== "boolean")
        throw new TypeError(
          `${description} requiresLineOfSight must be boolean`
        );
      if (action.currentTargetEntityId !== null)
        requireEntityId(
          action.currentTargetEntityId,
          `${description} currentTargetEntityId`
        );
      return Object.freeze({
        ...(data as unknown as BattlefieldEnemyCombatant),
        basicAttack: Object.freeze({
          ...(attack as unknown as BattlefieldEnemyCombatant["basicAttack"])
        }),
        actionState: Object.freeze({
          ...(action as unknown as BattlefieldEnemyCombatant["actionState"])
        })
      });
    }
  );
}

function normalizeEntry(
  value: unknown,
  index: number
): EnemyMovementPlanningEntry {
  const data = requireRecord(
    value,
    ["schemaVersion", "enemyEntityId", "candidates", "solidBlockerEntityIds"],
    `movement planning entry ${index}`
  );
  if (data.schemaVersion !== 1)
    throw new RangeError(
      `movement planning entry ${index} has unsupported schemaVersion`
    );
  const blockers = requireArray(
    data.solidBlockerEntityIds,
    `movement planning entry ${index} solid blockers`
  ).map((id, blockerIndex) =>
    requireEntityId(
      id,
      `movement planning entry ${index} solid blocker ${blockerIndex}`
    )
  );
  if (new Set(blockers).size !== blockers.length)
    throw new RangeError(
      `movement planning entry ${index} has duplicate solid blocker`
    );
  const candidates = requireArray(
    data.candidates,
    `movement planning entry ${index} candidates`
  ) as readonly EnemyTargetCandidate[];
  resolveEnemyTargetLock({ currentTargetEntityId: null, candidates });
  return Object.freeze({
    schemaVersion: 1,
    enemyEntityId: requireEntityId(
      data.enemyEntityId,
      `movement planning entry ${index} enemyEntityId`
    ),
    candidates: Object.freeze([...candidates]),
    solidBlockerEntityIds: Object.freeze(blockers)
  });
}

/** Generates contention-ready proposals from authoritative enemy occupancy. */
export function planEnemyMovement(
  request: EnemyMovementPlanningRequest
): EnemyMovementPlanningResolution {
  const input = requireRecord(
    request,
    ["schemaVersion", "currentTick", "map", "battlefield", "entries"],
    "enemy movement planning request"
  );
  if (input.schemaVersion !== 1)
    throw new RangeError(
      "enemy movement planning request has unsupported schemaVersion"
    );
  const currentTick = requireNonNegativeInteger(
    input.currentTick,
    "enemy movement planning currentTick"
  );
  const battlefield = requireRecord(
    input.battlefield,
    [
      "schemaVersion",
      "mapId",
      "startedWaveIds",
      "firedSpawnIds",
      "occupancy",
      "pendingSpawns",
      "enemyAdmissions",
      "enemyCombatants"
    ],
    "battlefield"
  );
  if (battlefield.schemaVersion !== 1)
    throw new RangeError("battlefield has unsupported schemaVersion");
  const map = input.map as EnemyMovementPlanningRequest["map"];
  if (typeof map !== "object" || map === null || battlefield.mapId !== map.id)
    throw new RangeError(
      "battlefield map does not match movement planning map"
    );
  const occupancy = normalizeOccupancy(battlefield.occupancy);
  const combatants = normalizeCombatants(battlefield.enemyCombatants);
  const entries = requireArray(input.entries, "movement planning entries").map(
    normalizeEntry
  );
  const entriesByEnemy = new Map<EntityId, EnemyMovementPlanningEntry>();
  for (const entry of entries) {
    if (entriesByEnemy.has(entry.enemyEntityId))
      throw new RangeError(
        `duplicate movement planning enemy (${entry.enemyEntityId})`
      );
    entriesByEnemy.set(entry.enemyEntityId, entry);
  }
  const occupancyByEntity = new Map(
    occupancy.map((item) => [item.entityId, item] as const)
  );
  const enemyIds = new Set(combatants.map((combatant) => combatant.entityId));
  for (const combatant of combatants) {
    const occupied = occupancyByEntity.has(combatant.entityId);
    if (combatant.lifecycleState === "active" && !occupied)
      throw new RangeError(
        `active enemy is not occupied (${combatant.entityId})`
      );
    if (combatant.lifecycleState === "destroyed" && occupied)
      throw new RangeError(
        `destroyed enemy remains occupied (${combatant.entityId})`
      );
    if (
      combatant.lifecycleState === "active" &&
      !entriesByEnemy.has(combatant.entityId)
    )
      throw new RangeError(
        `active enemy is missing movement planning entry (${combatant.entityId})`
      );
  }
  for (const entry of entries) {
    const combatant = combatants.find(
      (item) => item.entityId === entry.enemyEntityId
    );
    if (combatant === undefined || combatant.lifecycleState !== "active")
      throw new RangeError(
        `movement planning entry does not identify an active enemy (${entry.enemyEntityId})`
      );
  }
  const placements = new Map(
    map.placementPoints.map((placement) => [placement.id, placement] as const)
  );
  const decisions: EnemyMovementPlanningDecision[] = [];
  const proposals: MovementProposal[] = [];
  const activeCombatants = combatants
    .filter((item) => item.lifecycleState === "active")
    .sort((left, right) => compareText(left.entityId, right.entityId));
  for (const combatant of activeCombatants) {
    const entry = entriesByEnemy.get(
      combatant.entityId
    ) as EnemyMovementPlanningEntry;
    for (const candidate of entry.candidates) {
      const placement = placements.get(candidate.placementPointId);
      if (placement === undefined)
        throw new RangeError(
          `target candidate references unknown placement (${candidate.placementPointId})`
        );
      const occupant = occupancyByEntity.get(candidate.entityId);
      if (
        (candidate.isAlive && occupant?.nodeId !== placement.nodeId) ||
        (!candidate.isAlive && occupant !== undefined)
      )
        throw new RangeError(
          `target candidate occupancy does not match placement (${candidate.entityId})`
        );
    }
    const blockedNodeIds: NavigationNodeId[] = [];
    for (const blockerId of entry.solidBlockerEntityIds) {
      if (enemyIds.has(blockerId))
        throw new RangeError(
          `moving enemy cannot be a solid route blocker (${blockerId})`
        );
      const blocker = occupancyByEntity.get(blockerId);
      if (blocker === undefined)
        throw new RangeError(
          `solid route blocker is not occupied (${blockerId})`
        );
      blockedNodeIds.push(blocker.nodeId);
    }
    const targetLock = resolveEnemyTargetLock({
      currentTargetEntityId: combatant.actionState.currentTargetEntityId,
      candidates: entry.candidates
    });
    if (currentTick < combatant.actionState.nextMovementAtTick) {
      decisions.push(
        Object.freeze({
          schemaVersion: 1,
          enemyEntityId: combatant.entityId,
          status: "not_due",
          reason: "movement_not_due",
          targetLock
        })
      );
      continue;
    }
    if (targetLock.targetEntityId === undefined) {
      decisions.push(
        Object.freeze({
          schemaVersion: 1,
          enemyEntityId: combatant.entityId,
          status: "stationary",
          reason: "no_eligible_target",
          targetLock
        })
      );
      continue;
    }
    const target = entry.candidates.find(
      (candidate) => candidate.entityId === targetLock.targetEntityId
    );
    if (target === undefined)
      throw new Error("selected movement target is missing");
    const source = occupancyByEntity.get(
      combatant.entityId
    ) as NavigationOccupant;
    const route = planEnemyRoute({
      schemaVersion: 1,
      map,
      sourceNodeId: source.nodeId,
      targetPlacementPointId: target.placementPointId,
      range: combatant.basicAttack.range,
      requiresLineOfSight: combatant.basicAttack.requiresLineOfSight,
      blockedNodeIds
    });
    if (route.status !== "route_found" || route.nextNodeId === null) {
      decisions.push(
        Object.freeze({
          schemaVersion: 1,
          enemyEntityId: combatant.entityId,
          status: "stationary",
          reason:
            route.status === "attack_position_reached"
              ? "already_attack_valid"
              : "no_attack_position_reachable",
          targetLock,
          route
        })
      );
      continue;
    }
    const proposal = Object.freeze({
      id: `movement.auto.${combatant.entityId.slice("entity.".length)}` as MovementProposal["id"],
      entityId: combatant.entityId,
      fromNodeId: source.nodeId,
      toNodeId: route.nextNodeId
    });
    proposals.push(proposal);
    decisions.push(
      Object.freeze({
        schemaVersion: 1,
        enemyEntityId: combatant.entityId,
        status: "proposed",
        reason: "route_next_node_selected",
        targetLock,
        route,
        proposal
      })
    );
  }
  return Object.freeze({
    schemaVersion: 1,
    proposals: Object.freeze(proposals),
    decisions: Object.freeze(decisions)
  });
}
