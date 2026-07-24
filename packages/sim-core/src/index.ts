import type { CompiledContent } from "@dwarven-depths/content-runtime";

export * from "./attack-commitment.js";
export * from "./combat-timers.js";
export * from "./committed-attack-impact.js";
export * from "./committed-combat-effects.js";
export * from "./death-resolution.js";
export * from "./death-trigger-resolution.js";
export * from "./dwarf-attack-targeting.js";
export * from "./enemy-attack-targeting.js";
export * from "./enemy-movement-planning.js";
export * from "./enemy-route-planning.js";
export * from "./enemy-target-acquisition.js";
export * from "./range-line-of-sight.js";
export * from "./stable-tables.js";
export * from "./target-locks.js";
export * from "./target-selection.js";
export * from "./wave-schedule.js";

import {
  type BattlefieldEnemyAdmission,
  type BattlefieldEnemyCombatant,
  type BattlefieldMapDefinition,
  type BattlefieldState,
  type CommandEnvelope,
  canonicalHash,
  type EnemyEntranceId,
  type EntityId,
  type LifecycleSimulationEvent,
  type MovementDecision,
  type MovementProposal,
  type MovementReservationResolution,
  type NavigationNodeId,
  type NavigationOccupant,
  type PendingSpawn,
  type SimulationEvent,
  type SimulationState,
  type SpawnAdmissionDecision,
  type SpawnAdmissionLimits,
  type SpawnAdmissionResolution,
  type WaveDefinition,
  type WaveSpawnEvent
} from "@dwarven-depths/contracts";
import { resolveWaveSchedule } from "./wave-schedule.js";

export interface StepResult {
  readonly state: SimulationState;
  readonly events: readonly SimulationEvent[];
}

function freezeBattlefieldState(
  mapId: BattlefieldState["mapId"],
  occupancy: readonly NavigationOccupant[],
  pendingSpawns: readonly PendingSpawn[],
  startedWaveIds: BattlefieldState["startedWaveIds"] = [],
  firedSpawnIds: BattlefieldState["firedSpawnIds"] = [],
  enemyCombatants: BattlefieldState["enemyCombatants"] = [],
  enemyAdmissions: BattlefieldState["enemyAdmissions"] = []
): BattlefieldState {
  return Object.freeze({
    schemaVersion: 1,
    mapId,
    startedWaveIds: Object.freeze([...startedWaveIds]),
    firedSpawnIds: Object.freeze([...firedSpawnIds]),
    occupancy: Object.freeze(
      occupancy.map((occupant) => Object.freeze({ ...occupant }))
    ),
    pendingSpawns: Object.freeze(
      pendingSpawns.map((spawn) => Object.freeze({ ...spawn }))
    ),
    enemyAdmissions: Object.freeze(
      enemyAdmissions.map((admission) => Object.freeze({ ...admission }))
    ),
    enemyCombatants: Object.freeze(
      enemyCombatants.map((combatant) =>
        Object.freeze({
          ...combatant,
          basicAttack: Object.freeze({ ...combatant.basicAttack }),
          actionState: Object.freeze({
            ...combatant.actionState,
            activeBasicAttack:
              combatant.actionState.activeBasicAttack === null
                ? null
                : Object.freeze({ ...combatant.actionState.activeBasicAttack })
          })
        })
      )
    )
  });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const stableIdPattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

function isDomainStableId(value: unknown, domain?: string): value is string {
  return (
    typeof value === "string" &&
    stableIdPattern.test(value) &&
    (domain === undefined || value.startsWith(`${domain}.`))
  );
}

function comparePendingSpawns(left: PendingSpawn, right: PendingSpawn): number {
  return (
    left.authoredOrder - right.authoredOrder ||
    compareText(left.id, right.id) ||
    compareText(left.entityId, right.entityId)
  );
}

function freezeSpawnDecision(
  spawn: PendingSpawn,
  status: SpawnAdmissionDecision["status"],
  reason: SpawnAdmissionDecision["reason"]
): SpawnAdmissionDecision {
  return Object.freeze({
    spawnId: spawn.id,
    entityId: spawn.entityId,
    enemyDefinitionId: spawn.enemyDefinitionId,
    entranceId: spawn.entranceId,
    status,
    reason
  });
}

function requireDenseDataArray(value: unknown, description: string): unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  ) {
    throw new TypeError(`${description} must be a standard array`);
  }
  if (Reflect.ownKeys(value).length !== value.length + 1) {
    throw new TypeError(`${description} contains unsupported array properties`);
  }
  const items: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      throw new TypeError(`${description} item ${index} must be own data`);
    }
    items.push(descriptor.value);
  }
  return items;
}

function requireExactDataRecord(
  value: unknown,
  keys: readonly string[],
  description: string
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw new TypeError(`${description} must be a plain object`);
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError(`${description} contains unsupported symbol keys`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actualKeys = Object.keys(descriptors).sort();
  const expectedKeys = [...keys].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new TypeError(
      `${description} must contain exactly the expected keys`
    );
  }
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      throw new TypeError(`${description}.${key} must be own enumerable data`);
    }
  }
  return value as Record<string, unknown>;
}

function normalizePendingSpawns(
  value: unknown,
  description: string
): readonly PendingSpawn[] {
  return Object.freeze(
    requireDenseDataArray(value, description).map((item, index) => {
      const record = requireExactDataRecord(
        item,
        ["id", "authoredOrder", "entityId", "enemyDefinitionId", "entranceId"],
        `${description} item ${index}`
      );
      const id = record["id"];
      const authoredOrder = record["authoredOrder"];
      const entityId = record["entityId"];
      const enemyDefinitionId = record["enemyDefinitionId"];
      const entranceId = record["entranceId"];
      if (!isDomainStableId(id))
        throw new RangeError(`${description} item ${index} id must be stable`);
      if (
        !Number.isSafeInteger(authoredOrder) ||
        (authoredOrder as number) < 0
      ) {
        throw new RangeError(
          `${description} item ${index} authoredOrder must be a non-negative safe integer`
        );
      }
      if (!isDomainStableId(entityId, "entity")) {
        throw new RangeError(
          `${description} item ${index} entityId must be an entity.* stable ID`
        );
      }
      if (!isDomainStableId(enemyDefinitionId, "enemy")) {
        throw new RangeError(
          `${description} item ${index} enemyDefinitionId must be an enemy.* stable ID`
        );
      }
      if (!isDomainStableId(entranceId, "entrance")) {
        throw new RangeError(
          `${description} item ${index} entranceId must be an entrance.* stable ID`
        );
      }
      return Object.freeze({
        id,
        authoredOrder: authoredOrder as number,
        entityId,
        enemyDefinitionId,
        entranceId
      }) as PendingSpawn;
    })
  );
}

function normalizeOccupancy(
  value: unknown,
  description: string
): readonly NavigationOccupant[] {
  return Object.freeze(
    requireDenseDataArray(value, description).map((item, index) => {
      const record = requireExactDataRecord(
        item,
        ["entityId", "nodeId"],
        `${description} item ${index}`
      );
      const entityId = record["entityId"];
      const nodeId = record["nodeId"];
      if (!isDomainStableId(entityId, "entity")) {
        throw new RangeError(
          `${description} item ${index} entityId must be an entity.* stable ID`
        );
      }
      if (!isDomainStableId(nodeId, "node")) {
        throw new RangeError(
          `${description} item ${index} nodeId must be a node.* stable ID`
        );
      }
      return Object.freeze({ entityId, nodeId }) as NavigationOccupant;
    })
  );
}

function normalizeSpawnAdmissionLimits(
  value: unknown
): SpawnAdmissionLimits | undefined {
  if (value === undefined) return undefined;
  const record = requireExactDataRecord(
    value,
    ["liveEnemyCap", "currentLiveEnemies"],
    "spawn admission limits"
  );
  const liveEnemyCap = record["liveEnemyCap"];
  const currentLiveEnemies = record["currentLiveEnemies"];
  if (!Number.isSafeInteger(liveEnemyCap) || (liveEnemyCap as number) <= 0) {
    throw new RangeError("live-enemy cap must be a positive safe integer");
  }
  if (
    !Number.isSafeInteger(currentLiveEnemies) ||
    (currentLiveEnemies as number) < 0
  ) {
    throw new RangeError(
      "current live-enemy count must be a non-negative safe integer"
    );
  }
  return Object.freeze({
    liveEnemyCap: liveEnemyCap as number,
    currentLiveEnemies: currentLiveEnemies as number
  });
}

function normalizeStableIdArray(
  value: unknown,
  description: string
): readonly string[] {
  return Object.freeze(
    requireDenseDataArray(value, description).map((item, index) => {
      if (!isDomainStableId(item)) {
        throw new RangeError(
          `${description} item ${index} must be a stable ID`
        );
      }
      return item;
    })
  );
}

function normalizeEnemyAdmissions(
  value: unknown,
  currentTick: number
): readonly BattlefieldEnemyAdmission[] {
  const seenEntities = new Set<string>();
  const seenSpawns = new Set<string>();
  return Object.freeze(
    requireDenseDataArray(value, "battlefield enemy admissions")
      .map((item, index) => {
        const record = requireExactDataRecord(
          item,
          [
            "schemaVersion",
            "spawnId",
            "entityId",
            "enemyDefinitionId",
            "admittedAtTick"
          ],
          `battlefield enemy admission ${index}`
        );
        const schemaVersion = record["schemaVersion"];
        const spawnId = record["spawnId"];
        const entityId = record["entityId"];
        const enemyDefinitionId = record["enemyDefinitionId"];
        const admittedAtTick = record["admittedAtTick"];
        if (schemaVersion !== 1)
          throw new RangeError(
            "battlefield enemy admission has unsupported schemaVersion"
          );
        if (!isDomainStableId(spawnId, "spawn"))
          throw new RangeError(
            "battlefield enemy admission spawnId must be spawn.*"
          );
        if (!isDomainStableId(entityId, "entity"))
          throw new RangeError(
            "battlefield enemy admission entityId must be entity.*"
          );
        if (!isDomainStableId(enemyDefinitionId, "enemy"))
          throw new RangeError(
            "battlefield enemy admission enemyDefinitionId must be enemy.*"
          );
        if (
          !Number.isSafeInteger(admittedAtTick) ||
          Object.is(admittedAtTick, -0) ||
          (admittedAtTick as number) < 0 ||
          (admittedAtTick as number) > currentTick
        ) {
          throw new RangeError("battlefield enemy admission tick is invalid");
        }
        if (seenSpawns.has(spawnId) || seenEntities.has(entityId))
          throw new RangeError(
            "duplicate battlefield enemy admission identity"
          );
        seenSpawns.add(spawnId);
        seenEntities.add(entityId);
        return Object.freeze({
          schemaVersion: 1,
          spawnId,
          entityId,
          enemyDefinitionId,
          admittedAtTick: admittedAtTick as number
        }) as BattlefieldEnemyAdmission;
      })
      .sort((left, right) => compareText(left.entityId, right.entityId))
  );
}

function initializeAdmittedEnemyCombatants(
  content: CompiledContent,
  existingCombatants: readonly BattlefieldEnemyCombatant[],
  decisions: readonly SpawnAdmissionDecision[],
  currentTick: number,
  authoritativeAdmissions: ReadonlyMap<EntityId, BattlefieldEnemyAdmission>,
  expectedDefinitions?: ReadonlyMap<
    EntityId,
    BattlefieldEnemyCombatant["enemyDefinitionId"]
  >
): readonly BattlefieldEnemyCombatant[] {
  if (
    !Number.isSafeInteger(currentTick) ||
    Object.is(currentTick, -0) ||
    currentTick < 0
  ) {
    throw new RangeError(
      "battlefield current tick must be a non-negative safe integer"
    );
  }
  const combatantsByEntity = new Map<EntityId, BattlefieldEnemyCombatant>();
  const existingValues = requireDenseDataArray(
    existingCombatants,
    "battlefield enemy combatants"
  );
  for (const [index, value] of existingValues.entries()) {
    const record = requireExactDataRecord(
      value,
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
      `battlefield enemy combatant ${index}`
    );
    const attack = requireExactDataRecord(
      record["basicAttack"],
      [
        "id",
        "windupTicks",
        "impactDelayTicks",
        "cooldownTicks",
        "damage",
        "range",
        "requiresLineOfSight"
      ],
      `battlefield enemy combatant ${index} basic attack`
    );
    const actionState = requireExactDataRecord(
      record["actionState"],
      [
        "schemaVersion",
        "nextMovementAtTick",
        "currentTargetEntityId",
        "activeBasicAttack",
        "cooldownCompleteAtTick"
      ],
      `battlefield enemy combatant ${index} action state`
    );
    const activeAttackRecord =
      actionState["activeBasicAttack"] === null
        ? null
        : requireExactDataRecord(
            actionState["activeBasicAttack"],
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
            `battlefield enemy combatant ${index} active basic attack`
          );
    if (!isDomainStableId(record["entityId"], "entity")) {
      throw new RangeError(
        `battlefield enemy combatant ${index} entityId must be an entity.* stable ID`
      );
    }
    if (!isDomainStableId(record["enemyDefinitionId"], "enemy")) {
      throw new RangeError(
        `battlefield enemy combatant ${index} enemyDefinitionId must be an enemy.* stable ID`
      );
    }
    if (!isDomainStableId(attack["id"], "attack")) {
      throw new RangeError(
        `battlefield enemy combatant ${index} attack id must be an attack.* stable ID`
      );
    }
    const combatant = {
      schemaVersion: record["schemaVersion"],
      entityId: record["entityId"],
      enemyDefinitionId: record["enemyDefinitionId"],
      classification: record["classification"],
      currentHealth: record["currentHealth"],
      maximumHealth: record["maximumHealth"],
      armor: record["armor"],
      movementIntervalTicks: record["movementIntervalTicks"],
      admittedAtTick: record["admittedAtTick"],
      lifecycleState: record["lifecycleState"],
      basicAttack: {
        id: attack["id"],
        windupTicks: attack["windupTicks"],
        impactDelayTicks: attack["impactDelayTicks"],
        cooldownTicks: attack["cooldownTicks"],
        damage: attack["damage"],
        range: attack["range"],
        requiresLineOfSight: attack["requiresLineOfSight"]
      },
      actionState: {
        schemaVersion: actionState["schemaVersion"],
        nextMovementAtTick: actionState["nextMovementAtTick"],
        currentTargetEntityId: actionState["currentTargetEntityId"],
        activeBasicAttack:
          activeAttackRecord === null
            ? null
            : {
                schemaVersion: activeAttackRecord["schemaVersion"],
                attackId: activeAttackRecord["attackId"],
                sourceEntityId: activeAttackRecord["sourceEntityId"],
                targetEntityId: activeAttackRecord["targetEntityId"],
                startedAtTick: activeAttackRecord["startedAtTick"],
                commitAtTick: activeAttackRecord["commitAtTick"],
                impactAtTick: activeAttackRecord["impactAtTick"],
                cooldownDurationTicks:
                  activeAttackRecord["cooldownDurationTicks"],
                damage: activeAttackRecord["damage"],
                range: activeAttackRecord["range"],
                targetIsValid: activeAttackRecord["targetIsValid"]
              },
        cooldownCompleteAtTick: actionState["cooldownCompleteAtTick"]
      }
    } as BattlefieldEnemyCombatant;
    if (combatantsByEntity.has(combatant.entityId)) {
      throw new RangeError(
        `duplicate battlefield enemy combatant entity ID (${combatant.entityId})`
      );
    }
    const definition = content.enemies.get(combatant.enemyDefinitionId);
    if (definition === undefined) {
      throw new RangeError(
        `battlefield enemy ${combatant.entityId} references unknown enemy definition (${combatant.enemyDefinitionId})`
      );
    }
    const expectedDefinitionId = expectedDefinitions?.get(combatant.entityId);
    if (
      expectedDefinitions !== undefined &&
      expectedDefinitionId !== combatant.enemyDefinitionId
    ) {
      throw new RangeError(
        `battlefield enemy combatant definition does not match authored spawn identity (${combatant.entityId})`
      );
    }
    const admission = authoritativeAdmissions.get(combatant.entityId);
    if (
      admission === undefined ||
      admission.admittedAtTick !== combatant.admittedAtTick ||
      admission.enemyDefinitionId !== combatant.enemyDefinitionId
    ) {
      throw new RangeError(
        `battlefield enemy ${combatant.entityId} does not match authoritative admission timing`
      );
    }
    if (
      combatant.schemaVersion !== 1 ||
      combatant.classification !== definition.classification ||
      combatant.maximumHealth !== definition.maximumHealth ||
      combatant.armor !== definition.armor ||
      combatant.movementIntervalTicks !== definition.movementIntervalTicks ||
      combatant.basicAttack.id !== definition.basicAttack.id ||
      combatant.basicAttack.windupTicks !==
        definition.basicAttack.windupTicks ||
      combatant.basicAttack.impactDelayTicks !==
        definition.basicAttack.impactDelayTicks ||
      combatant.basicAttack.cooldownTicks !==
        definition.basicAttack.cooldownTicks ||
      combatant.basicAttack.damage !== definition.basicAttack.damage ||
      combatant.basicAttack.range !== definition.basicAttack.range ||
      combatant.basicAttack.requiresLineOfSight !==
        definition.basicAttack.requiresLineOfSight
    ) {
      throw new RangeError(
        `battlefield enemy ${combatant.entityId} does not match compiled enemy definition (${combatant.enemyDefinitionId})`
      );
    }
    if (
      !Number.isSafeInteger(combatant.currentHealth) ||
      combatant.currentHealth < 0 ||
      combatant.currentHealth > combatant.maximumHealth
    ) {
      throw new RangeError(
        `battlefield enemy ${combatant.entityId} has invalid current health`
      );
    }
    const action = combatant.actionState;
    if (
      action.schemaVersion !== 1 ||
      !Number.isSafeInteger(combatant.admittedAtTick) ||
      Object.is(combatant.admittedAtTick, -0) ||
      combatant.admittedAtTick < 0 ||
      combatant.admittedAtTick > currentTick ||
      !Number.isSafeInteger(action.nextMovementAtTick) ||
      Object.is(action.nextMovementAtTick, -0) ||
      action.nextMovementAtTick < combatant.admittedAtTick ||
      action.nextMovementAtTick - combatant.admittedAtTick <
        combatant.movementIntervalTicks ||
      (action.nextMovementAtTick - combatant.admittedAtTick) %
        combatant.movementIntervalTicks !==
        0 ||
      (action.currentTargetEntityId !== null &&
        !isDomainStableId(action.currentTargetEntityId, "entity")) ||
      (action.cooldownCompleteAtTick !== null &&
        (!Number.isSafeInteger(action.cooldownCompleteAtTick) ||
          Object.is(action.cooldownCompleteAtTick, -0) ||
          (action.cooldownCompleteAtTick as number) < currentTick ||
          !Number.isSafeInteger(
            (action.cooldownCompleteAtTick as number) -
              combatant.basicAttack.cooldownTicks
          ) ||
          (action.cooldownCompleteAtTick as number) -
            combatant.basicAttack.cooldownTicks <
            combatant.admittedAtTick ||
          (action.cooldownCompleteAtTick as number) -
            combatant.basicAttack.cooldownTicks >
            currentTick))
    ) {
      throw new RangeError(
        `battlefield enemy ${combatant.entityId} has invalid action state`
      );
    }
    const activeAttack = action.activeBasicAttack;
    if (
      activeAttack !== null &&
      (activeAttack.schemaVersion !== 1 ||
        !isDomainStableId(activeAttack.attackId, "attack") ||
        activeAttack.attackId !== combatant.basicAttack.id ||
        activeAttack.sourceEntityId !== combatant.entityId ||
        !isDomainStableId(activeAttack.targetEntityId, "entity") ||
        activeAttack.targetEntityId !== action.currentTargetEntityId ||
        !Number.isSafeInteger(activeAttack.startedAtTick) ||
        Object.is(activeAttack.startedAtTick, -0) ||
        activeAttack.startedAtTick < combatant.admittedAtTick ||
        activeAttack.startedAtTick > currentTick ||
        !Number.isSafeInteger(activeAttack.commitAtTick) ||
        Object.is(activeAttack.commitAtTick, -0) ||
        !Number.isSafeInteger(
          activeAttack.startedAtTick + combatant.basicAttack.windupTicks
        ) ||
        activeAttack.commitAtTick !==
          activeAttack.startedAtTick + combatant.basicAttack.windupTicks ||
        activeAttack.commitAtTick < currentTick ||
        !Number.isSafeInteger(activeAttack.impactAtTick) ||
        Object.is(activeAttack.impactAtTick, -0) ||
        !Number.isSafeInteger(
          activeAttack.commitAtTick + combatant.basicAttack.impactDelayTicks
        ) ||
        activeAttack.impactAtTick !==
          activeAttack.commitAtTick + combatant.basicAttack.impactDelayTicks ||
        !Number.isSafeInteger(activeAttack.cooldownDurationTicks) ||
        activeAttack.cooldownDurationTicks <= 0 ||
        activeAttack.cooldownDurationTicks !==
          combatant.basicAttack.cooldownTicks ||
        !Number.isSafeInteger(
          activeAttack.commitAtTick + activeAttack.cooldownDurationTicks
        ) ||
        !Number.isSafeInteger(activeAttack.damage) ||
        activeAttack.damage < 0 ||
        activeAttack.damage !== combatant.basicAttack.damage ||
        !Number.isSafeInteger(activeAttack.range) ||
        activeAttack.range < 0 ||
        activeAttack.range !== combatant.basicAttack.range ||
        typeof activeAttack.targetIsValid !== "boolean")
    ) {
      throw new RangeError(
        `battlefield enemy ${combatant.entityId} has invalid active basic attack`
      );
    }
    if (
      (action.currentTargetEntityId === null && activeAttack !== null) ||
      (activeAttack !== null && action.cooldownCompleteAtTick !== null)
    ) {
      throw new RangeError(
        `battlefield enemy ${combatant.entityId} has incoherent action state`
      );
    }
    if (
      combatant.lifecycleState !== "active" &&
      combatant.lifecycleState !== "destroyed"
    ) {
      throw new RangeError(
        `battlefield enemy ${combatant.entityId} has invalid lifecycle state`
      );
    }
    if (
      (combatant.lifecycleState === "active" &&
        combatant.currentHealth === 0) ||
      (combatant.lifecycleState === "destroyed" &&
        combatant.currentHealth !== 0)
    ) {
      throw new RangeError(
        `battlefield enemy ${combatant.entityId} has health inconsistent with its lifecycle state`
      );
    }
    combatantsByEntity.set(combatant.entityId, combatant);
  }

  for (const decision of decisions) {
    if (decision.status !== "admitted") continue;
    if (combatantsByEntity.has(decision.entityId)) {
      throw new RangeError(
        `admitted spawn entity already has battlefield enemy combatant state (${decision.entityId})`
      );
    }
    const definition = content.enemies.get(decision.enemyDefinitionId);
    if (definition === undefined) {
      throw new RangeError(
        `admitted spawn references unknown enemy definition (${decision.enemyDefinitionId})`
      );
    }
    const admission = authoritativeAdmissions.get(decision.entityId);
    if (
      admission === undefined ||
      admission.spawnId !== decision.spawnId ||
      admission.admittedAtTick !== currentTick
    ) {
      throw new RangeError(
        `admitted spawn does not match authoritative admission timing (${decision.entityId})`
      );
    }
    const nextMovementAtTick = currentTick + definition.movementIntervalTicks;
    if (!Number.isSafeInteger(nextMovementAtTick)) {
      throw new RangeError(
        `admitted spawn movement schedule exceeds safe integer bounds (${decision.entityId})`
      );
    }
    combatantsByEntity.set(
      decision.entityId,
      Object.freeze({
        schemaVersion: 1,
        entityId: decision.entityId,
        enemyDefinitionId: definition.id,
        classification: definition.classification,
        currentHealth: definition.maximumHealth,
        maximumHealth: definition.maximumHealth,
        armor: definition.armor,
        movementIntervalTicks: definition.movementIntervalTicks,
        admittedAtTick: currentTick,
        lifecycleState: "active",
        basicAttack: Object.freeze({ ...definition.basicAttack }),
        actionState: Object.freeze({
          schemaVersion: 1,
          nextMovementAtTick,
          currentTargetEntityId: null,
          activeBasicAttack: null,
          cooldownCompleteAtTick: null
        })
      })
    );
  }

  return Object.freeze(
    [...combatantsByEntity.values()]
      .sort((left, right) => compareText(left.entityId, right.entityId))
      .map((combatant) =>
        Object.freeze({
          ...combatant,
          basicAttack: Object.freeze({ ...combatant.basicAttack }),
          actionState: Object.freeze({
            ...combatant.actionState,
            activeBasicAttack:
              combatant.actionState.activeBasicAttack === null
                ? null
                : Object.freeze({ ...combatant.actionState.activeBasicAttack })
          })
        })
      )
  );
}

function validateEnemyMovementProposals(
  currentTick: number,
  combatants: readonly BattlefieldEnemyCombatant[],
  proposals: readonly MovementProposal[],
  hasAuthoredAdmissionEvidence: boolean
): void {
  const combatantsByEntity = new Map(
    combatants.map((combatant) => [combatant.entityId, combatant] as const)
  );
  const proposedEnemyIds = new Set<EntityId>();
  for (const proposal of proposals) {
    const combatant = combatantsByEntity.get(proposal.entityId);
    if (combatant === undefined) continue;
    if (!hasAuthoredAdmissionEvidence) {
      throw new RangeError(
        `battlefield enemy movement requires authored admission evidence (${proposal.entityId})`
      );
    }
    if (combatant.lifecycleState !== "active") {
      throw new RangeError(
        `destroyed battlefield enemy cannot propose movement (${proposal.entityId})`
      );
    }
    if (proposedEnemyIds.has(proposal.entityId)) {
      throw new RangeError(
        `battlefield enemy has duplicate movement proposals (${proposal.entityId})`
      );
    }
    if (currentTick < combatant.actionState.nextMovementAtTick) {
      throw new RangeError(
        `battlefield enemy movement is not due (${proposal.entityId})`
      );
    }
    proposedEnemyIds.add(proposal.entityId);
  }
}

function advanceEnemyMovementCadence(
  currentTick: number,
  combatants: readonly BattlefieldEnemyCombatant[],
  decisions: readonly MovementDecision[]
): readonly BattlefieldEnemyCombatant[] {
  const consumedEntityIds = new Set(
    decisions
      .filter(
        (decision) =>
          decision.status === "moved" || decision.status === "waited"
      )
      .map((decision) => decision.entityId)
  );
  return Object.freeze(
    combatants.map((combatant) => {
      if (!consumedEntityIds.has(combatant.entityId)) return combatant;
      const completedIntervals =
        Math.floor(
          (currentTick - combatant.admittedAtTick) /
            combatant.movementIntervalTicks
        ) + 1;
      const nextMovementAtTick =
        combatant.admittedAtTick +
        completedIntervals * combatant.movementIntervalTicks;
      if (!Number.isSafeInteger(nextMovementAtTick)) {
        throw new RangeError(
          `battlefield enemy movement schedule exceeds safe integer bounds (${combatant.entityId})`
        );
      }
      return Object.freeze({
        ...combatant,
        actionState: Object.freeze({
          ...combatant.actionState,
          nextMovementAtTick
        })
      });
    })
  );
}

/**
 * Admits one deterministic spawn phase. Each authored entrance admits at most
 * its oldest pending enemy; occupied entrances and a full live-enemy cap retain
 * enemies off-map in canonical queue order.
 */
export function admitQueuedSpawns(
  map: BattlefieldMapDefinition,
  occupancy: readonly NavigationOccupant[],
  pendingSpawns: readonly PendingSpawn[],
  limits?: SpawnAdmissionLimits
): SpawnAdmissionResolution {
  if (
    limits !== undefined &&
    (!Number.isSafeInteger(limits.liveEnemyCap) || limits.liveEnemyCap <= 0)
  ) {
    throw new RangeError("live-enemy cap must be a positive safe integer");
  }
  if (
    limits !== undefined &&
    (!Number.isSafeInteger(limits.currentLiveEnemies) ||
      limits.currentLiveEnemies < 0)
  ) {
    throw new RangeError(
      "current live-enemy count must be a non-negative safe integer"
    );
  }

  const nodes = new Set(map.nodes.map((node) => node.id));
  const entrances = new Map(
    map.enemyEntrances.map((entrance) => [entrance.id, entrance])
  );
  const occupantsByEntity = new Map<EntityId, NavigationOccupant>();
  const occupantsByNode = new Map<NavigationNodeId, NavigationOccupant>();
  for (const occupant of occupancy) {
    if (!isDomainStableId(occupant.entityId, "entity")) {
      throw new RangeError("occupancy entityId must be an entity.* stable ID");
    }
    if (!nodes.has(occupant.nodeId)) {
      throw new RangeError(
        `occupancy references unknown navigation node ID (${occupant.nodeId})`
      );
    }
    if (occupantsByEntity.has(occupant.entityId)) {
      throw new RangeError(
        `duplicate occupied entity ID (${occupant.entityId})`
      );
    }
    if (occupantsByNode.has(occupant.nodeId)) {
      throw new RangeError(
        `duplicate occupied navigation node ID (${occupant.nodeId})`
      );
    }
    occupantsByEntity.set(occupant.entityId, occupant);
    occupantsByNode.set(occupant.nodeId, occupant);
  }
  if (limits !== undefined && limits.currentLiveEnemies > occupancy.length) {
    throw new RangeError(
      "current live-enemy count cannot exceed occupied entity count"
    );
  }
  if (limits !== undefined && limits.currentLiveEnemies > limits.liveEnemyCap) {
    throw new RangeError("current live-enemy count exceeds live-enemy cap");
  }

  const spawnIds = new Set<string>();
  const spawnEntityIds = new Set<EntityId>();
  for (const spawn of pendingSpawns) {
    if (!isDomainStableId(spawn.id)) {
      throw new RangeError("pending spawn id must be a stable ID");
    }
    if (spawnIds.has(spawn.id)) {
      throw new RangeError(`duplicate pending spawn ID (${spawn.id})`);
    }
    spawnIds.add(spawn.id);
    if (!isDomainStableId(spawn.entityId, "entity")) {
      throw new RangeError(
        `pending spawn entityId must be an entity.* stable ID (${spawn.id})`
      );
    }
    if (spawnEntityIds.has(spawn.entityId)) {
      throw new RangeError(
        `duplicate pending spawn entity ID (${spawn.entityId})`
      );
    }
    spawnEntityIds.add(spawn.entityId);
    if (!isDomainStableId(spawn.enemyDefinitionId, "enemy")) {
      throw new RangeError(
        `pending spawn enemyDefinitionId must be an enemy.* stable ID (${spawn.id})`
      );
    }
    if (occupantsByEntity.has(spawn.entityId)) {
      throw new RangeError(
        `pending spawn entity is already occupied (${spawn.entityId})`
      );
    }
    if (!Number.isSafeInteger(spawn.authoredOrder) || spawn.authoredOrder < 0) {
      throw new RangeError(
        `pending spawn authoredOrder must be a non-negative safe integer (${spawn.id})`
      );
    }
    if (!entrances.has(spawn.entranceId)) {
      throw new RangeError(`unknown enemy entrance ID (${spawn.entranceId})`);
    }
  }

  const orderedSpawns = [...pendingSpawns].sort(comparePendingSpawns);
  const handledEntrances = new Set<EnemyEntranceId>();
  const admittedOccupants: NavigationOccupant[] = [];
  const remainingSpawns: PendingSpawn[] = [];
  const decisions: SpawnAdmissionDecision[] = [];

  for (const spawn of orderedSpawns) {
    const entrance = entrances.get(spawn.entranceId);
    if (entrance === undefined)
      throw new Error("validated entrance is missing");

    if (
      limits !== undefined &&
      limits.currentLiveEnemies + admittedOccupants.length >=
        limits.liveEnemyCap
    ) {
      remainingSpawns.push(Object.freeze({ ...spawn }));
      decisions.push(
        freezeSpawnDecision(spawn, "queued", "live_enemy_cap_reached")
      );
      handledEntrances.add(spawn.entranceId);
      continue;
    }
    if (handledEntrances.has(spawn.entranceId)) {
      remainingSpawns.push(Object.freeze({ ...spawn }));
      decisions.push(
        freezeSpawnDecision(spawn, "queued", "earlier_spawn_pending")
      );
      continue;
    }
    handledEntrances.add(spawn.entranceId);
    if (occupantsByNode.has(entrance.nodeId)) {
      remainingSpawns.push(Object.freeze({ ...spawn }));
      decisions.push(freezeSpawnDecision(spawn, "queued", "entrance_occupied"));
      continue;
    }

    const admitted = Object.freeze({
      entityId: spawn.entityId,
      nodeId: entrance.nodeId
    });
    admittedOccupants.push(admitted);
    occupantsByNode.set(entrance.nodeId, admitted);
    decisions.push(freezeSpawnDecision(spawn, "admitted", "admitted"));
  }

  const resolvedOccupancy = [...occupancy, ...admittedOccupants]
    .sort((left, right) => compareText(left.entityId, right.entityId))
    .map((occupant) => Object.freeze({ ...occupant }));

  return Object.freeze({
    occupancy: Object.freeze(resolvedOccupancy),
    pendingSpawns: Object.freeze(remainingSpawns),
    decisions: Object.freeze(decisions)
  });
}

function freezeDecision(
  proposal: MovementProposal,
  status: MovementDecision["status"],
  reason: MovementDecision["reason"]
): MovementDecision {
  return Object.freeze({
    proposalId: proposal.id,
    entityId: proposal.entityId,
    fromNodeId: proposal.fromNodeId,
    toNodeId: proposal.toNodeId,
    status,
    reason
  });
}

/**
 * Resolves one simultaneous movement-reservation phase against snapshot
 * occupancy. An occupied node remains unavailable for the entire phase, so a
 * proposal cannot follow, swap with, pass through, or push another occupant.
 */
export function resolveMovementReservations(
  map: BattlefieldMapDefinition,
  occupancy: readonly NavigationOccupant[],
  proposals: readonly MovementProposal[]
): MovementReservationResolution {
  const nodes = new Map(map.nodes.map((node) => [node.id, node]));
  const occupantsByEntity = new Map<EntityId, NavigationOccupant>();
  const occupantsByNode = new Map<NavigationNodeId, NavigationOccupant>();

  for (const occupant of occupancy) {
    if (!nodes.has(occupant.nodeId))
      throw new RangeError(
        `occupancy references unknown navigation node ID (${occupant.nodeId})`
      );
    if (occupantsByEntity.has(occupant.entityId))
      throw new RangeError(
        `duplicate occupied entity ID (${occupant.entityId})`
      );
    if (occupantsByNode.has(occupant.nodeId))
      throw new RangeError(
        `duplicate occupied navigation node ID (${occupant.nodeId})`
      );
    occupantsByEntity.set(occupant.entityId, occupant);
    occupantsByNode.set(occupant.nodeId, occupant);
  }

  const proposalIds = new Set<string>();
  const proposalCountByEntity = new Map<EntityId, number>();
  for (const proposal of proposals) {
    if (proposalIds.has(proposal.id))
      throw new RangeError(`duplicate movement proposal ID (${proposal.id})`);
    proposalIds.add(proposal.id);
    proposalCountByEntity.set(
      proposal.entityId,
      (proposalCountByEntity.get(proposal.entityId) ?? 0) + 1
    );
  }

  const orderedProposals = [...proposals].sort(
    (left, right) =>
      compareText(left.entityId, right.entityId) ||
      compareText(left.id, right.id)
  );
  const decisions = new Map<MovementProposal, MovementDecision>();
  const candidatesByDestination = new Map<
    NavigationNodeId,
    MovementProposal[]
  >();

  for (const proposal of orderedProposals) {
    if ((proposalCountByEntity.get(proposal.entityId) ?? 0) > 1) {
      decisions.set(
        proposal,
        freezeDecision(proposal, "rejected", "duplicate_entity_proposal")
      );
      continue;
    }
    const occupant = occupantsByEntity.get(proposal.entityId);
    if (occupant === undefined) {
      decisions.set(
        proposal,
        freezeDecision(proposal, "rejected", "entity_not_occupied")
      );
      continue;
    }
    if (occupant.nodeId !== proposal.fromNodeId) {
      decisions.set(
        proposal,
        freezeDecision(proposal, "rejected", "source_mismatch")
      );
      continue;
    }
    const fromNode = nodes.get(proposal.fromNodeId);
    if (fromNode === undefined || !nodes.has(proposal.toNodeId)) {
      decisions.set(
        proposal,
        freezeDecision(proposal, "rejected", "unknown_node")
      );
      continue;
    }
    if (proposal.fromNodeId === proposal.toNodeId) {
      decisions.set(
        proposal,
        freezeDecision(proposal, "rejected", "same_node")
      );
      continue;
    }
    if (!fromNode.neighborNodeIds.includes(proposal.toNodeId)) {
      decisions.set(
        proposal,
        freezeDecision(proposal, "rejected", "nodes_not_connected")
      );
      continue;
    }
    if (occupantsByNode.has(proposal.toNodeId)) {
      decisions.set(
        proposal,
        freezeDecision(proposal, "waited", "destination_occupied")
      );
      continue;
    }
    const candidates = candidatesByDestination.get(proposal.toNodeId) ?? [];
    candidates.push(proposal);
    candidatesByDestination.set(proposal.toNodeId, candidates);
  }

  const movedNodeByEntity = new Map<EntityId, NavigationNodeId>();
  for (const candidates of candidatesByDestination.values()) {
    candidates.sort(
      (left, right) =>
        compareText(left.entityId, right.entityId) ||
        compareText(left.id, right.id)
    );
    candidates.forEach((proposal, index) => {
      if (index === 0) {
        movedNodeByEntity.set(proposal.entityId, proposal.toNodeId);
        decisions.set(proposal, freezeDecision(proposal, "moved", "moved"));
      } else {
        decisions.set(
          proposal,
          freezeDecision(proposal, "waited", "destination_reserved")
        );
      }
    });
  }

  const resolvedOccupancy = [...occupantsByEntity.values()]
    .sort((left, right) => compareText(left.entityId, right.entityId))
    .map((occupant) =>
      Object.freeze({
        entityId: occupant.entityId,
        nodeId: movedNodeByEntity.get(occupant.entityId) ?? occupant.nodeId
      })
    );
  const resolvedDecisions = orderedProposals.map((proposal) => {
    const decision = decisions.get(proposal);
    if (decision === undefined)
      throw new Error(`movement proposal ${proposal.id} was not resolved`);
    return decision;
  });

  return Object.freeze({
    occupancy: Object.freeze(resolvedOccupancy),
    decisions: Object.freeze(resolvedDecisions)
  });
}

export function seedToUint32(seed: string): number {
  if (seed.length > 10 || !/^[1-9]\d*$/.test(seed)) {
    throw new RangeError(
      "seed must be a canonical integer between 1 and 4294967295"
    );
  }
  const value = BigInt(seed);
  if (value > 0xffff_ffffn) {
    throw new RangeError(
      "seed must be a canonical integer between 1 and 4294967295"
    );
  }
  return Number(value);
}

export function nextUint32(state: number): number {
  let value = state >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

export function createInitialState(
  content: CompiledContent,
  levelId: SimulationState["levelId"],
  seed: string
): SimulationState {
  const level = content.levels.get(levelId);
  if (level === undefined) throw new Error(`Unknown level ID: ${levelId}`);
  const battlefield =
    level.mapId === undefined
      ? undefined
      : freezeBattlefieldState(level.mapId, [], []);
  return Object.freeze({
    schemaVersion: 1,
    contentVersion: content.bundle.contentVersion,
    tick: 0,
    seed,
    rngState: seedToUint32(seed),
    levelId,
    phase: "PREPARATION",
    eventSequence: 0,
    ...(battlefield === undefined ? {} : { battlefield })
  });
}

/**
 * Resolves the battlefield portions of one simulation step in the fixed rule
 * order: enqueue scheduled spawns, admit queues, then arbitrate movement.
 */
export function resolveBattlefieldPhase(
  state: SimulationState,
  content: CompiledContent,
  scheduledSpawns: readonly PendingSpawn[],
  proposals: readonly MovementProposal[],
  limits?: SpawnAdmissionLimits
): StepResult {
  const level = content.levels.get(state.levelId);
  if (level === undefined)
    throw new Error(`Unknown level ID: ${state.levelId}`);
  if (state.battlefield === undefined)
    throw new Error(`level ${state.levelId} does not have battlefield state`);
  if (level.mapId === undefined || state.battlefield.mapId !== level.mapId) {
    throw new Error(
      `battlefield map ${state.battlefield.mapId} does not match level map`
    );
  }
  const map = content.maps.get(level.mapId);
  if (map === undefined) throw new Error(`Unknown map ID: ${level.mapId}`);
  const admissionLimits = normalizeSpawnAdmissionLimits(limits);
  const persistedPendingSpawns = normalizePendingSpawns(
    state.battlefield.pendingSpawns,
    "persisted pending spawns"
  );
  const dueScheduledSpawns = normalizePendingSpawns(
    scheduledSpawns,
    "scheduled spawns"
  );
  const persistedOccupancy = normalizeOccupancy(
    state.battlefield.occupancy,
    "persisted occupancy"
  );
  const persistedEnemyAdmissions = normalizeEnemyAdmissions(
    state.battlefield.enemyAdmissions,
    state.tick
  );
  const enemyAdmissionsByEntity = new Map(
    persistedEnemyAdmissions.map(
      (admission) => [admission.entityId, admission] as const
    )
  );
  const allPendingSpawns = Object.freeze([
    ...persistedPendingSpawns,
    ...dueScheduledSpawns
  ]);
  const startedWaveIds = normalizeStableIdArray(
    state.battlefield.startedWaveIds,
    "started wave IDs"
  );
  const firedSpawnIds = normalizeStableIdArray(
    state.battlefield.firedSpawnIds,
    "fired spawn IDs"
  );

  const authoredWaves = new Map<string, WaveDefinition>();
  const authoredSpawns = new Map<string, WaveSpawnEvent>();
  const waveIdBySpawnId = new Map<string, string>();
  for (const waveId of level.waveIds) {
    const wave = content.waves.get(waveId);
    if (wave === undefined) throw new Error(`Unknown wave ID: ${waveId}`);
    authoredWaves.set(waveId, wave);
    for (const spawn of wave.spawnEvents) {
      authoredSpawns.set(spawn.id, spawn);
      waveIdBySpawnId.set(spawn.id, waveId);
    }
  }
  if (level.waveIds.length > 0) {
    const startedWaveIdSet = new Set<string>();
    for (const waveId of startedWaveIds) {
      if (!isDomainStableId(waveId, "wave")) {
        throw new RangeError("started wave IDs must contain wave.* stable IDs");
      }
      if (startedWaveIdSet.has(waveId)) {
        throw new RangeError(
          `started wave IDs contains duplicate ID (${waveId})`
        );
      }
      const wave = authoredWaves.get(waveId);
      if (wave === undefined) {
        throw new RangeError(`unknown started wave ID (${waveId})`);
      }
      if (wave.startAtTick > state.tick) {
        throw new RangeError(`started wave ${waveId} is in the future`);
      }
      startedWaveIdSet.add(waveId);
    }

    const firedSpawnIdSet = new Set<string>();
    for (const spawnId of firedSpawnIds) {
      if (!isDomainStableId(spawnId, "spawn")) {
        throw new RangeError("fired spawn IDs must contain spawn.* stable IDs");
      }
      if (firedSpawnIdSet.has(spawnId)) {
        throw new RangeError(
          `fired spawn IDs contains duplicate ID (${spawnId})`
        );
      }
      const spawn = authoredSpawns.get(spawnId);
      if (spawn === undefined) {
        throw new RangeError(`fired spawn ID is not authored (${spawnId})`);
      }
      if (spawn.atTick > state.tick) {
        throw new RangeError(`fired spawn ${spawnId} is in the future`);
      }
      const waveId = waveIdBySpawnId.get(spawnId);
      if (waveId === undefined || !startedWaveIdSet.has(waveId)) {
        throw new RangeError(
          `fired spawn ${spawnId} belongs to a wave that is not marked started`
        );
      }
      firedSpawnIdSet.add(spawnId);
    }

    for (const spawn of allPendingSpawns) {
      const authored = authoredSpawns.get(spawn.id);
      if (
        authored === undefined ||
        authored.authoredOrder !== spawn.authoredOrder ||
        authored.entityId !== spawn.entityId ||
        authored.enemyDefinitionId !== spawn.enemyDefinitionId ||
        authored.entranceId !== spawn.entranceId
      ) {
        throw new RangeError(
          `pending spawn ${spawn.id} does not match authored schedule`
        );
      }
      if (!firedSpawnIdSet.has(spawn.id)) {
        throw new RangeError(`pending spawn ${spawn.id} is not marked fired`);
      }
    }
  }

  const pendingSpawnIds = new Set(allPendingSpawns.map((spawn) => spawn.id));
  const admittedDefinitions = new Map<
    EntityId,
    BattlefieldEnemyCombatant["enemyDefinitionId"]
  >();
  if (level.waveIds.length > 0) {
    for (const firedSpawnId of firedSpawnIds) {
      const authored = authoredSpawns.get(firedSpawnId as never);
      if (authored === undefined) {
        throw new RangeError(
          `fired spawn ID is not authored (${firedSpawnId})`
        );
      }
      if (!pendingSpawnIds.has(firedSpawnId as never)) {
        admittedDefinitions.set(authored.entityId, authored.enemyDefinitionId);
        const admission = enemyAdmissionsByEntity.get(authored.entityId);
        if (
          admission === undefined ||
          admission.spawnId !== authored.id ||
          admission.entityId !== authored.entityId ||
          admission.admittedAtTick < authored.atTick
        ) {
          throw new RangeError(
            `authored spawn does not match authoritative admission evidence (${authored.id})`
          );
        }
      }
    }
    if (enemyAdmissionsByEntity.size !== admittedDefinitions.size) {
      throw new RangeError(
        "battlefield enemy admissions do not match admitted authored spawns"
      );
    }
  }

  const existingEnemyCombatants = initializeAdmittedEnemyCombatants(
    content,
    state.battlefield.enemyCombatants,
    [],
    state.tick,
    enemyAdmissionsByEntity,
    level.waveIds.length > 0 ? admittedDefinitions : undefined
  );
  const existingEnemyEntityIds = new Set(
    existingEnemyCombatants.map((combatant) => combatant.entityId)
  );
  if (level.waveIds.length > 0) {
    for (const entityId of admittedDefinitions.keys()) {
      if (!existingEnemyEntityIds.has(entityId)) {
        throw new RangeError(
          `admitted authored spawn is missing battlefield enemy combatant state (${entityId})`
        );
      }
    }
  }
  if (admissionLimits !== undefined) {
    const activeEnemyCount = existingEnemyCombatants.filter(
      (combatant) => combatant.lifecycleState === "active"
    ).length;
    if (admissionLimits.currentLiveEnemies !== activeEnemyCount) {
      throw new RangeError(
        `current live-enemy count ${admissionLimits.currentLiveEnemies} does not match authoritative active combatants ${activeEnemyCount}`
      );
    }
  }
  for (const spawn of allPendingSpawns) {
    if (!content.enemies.has(spawn.enemyDefinitionId)) {
      throw new RangeError(
        `pending spawn references unknown enemy definition (${spawn.enemyDefinitionId})`
      );
    }
    if (existingEnemyEntityIds.has(spawn.entityId)) {
      throw new RangeError(
        `pending spawn entity already has battlefield enemy combatant state (${spawn.entityId})`
      );
    }
  }

  const admitted = admitQueuedSpawns(
    map,
    persistedOccupancy,
    allPendingSpawns,
    admissionLimits
  );
  for (const decision of admitted.decisions) {
    if (decision.status !== "admitted") continue;
    if (enemyAdmissionsByEntity.has(decision.entityId)) {
      throw new RangeError(
        `admitted enemy already has authoritative admission timing (${decision.entityId})`
      );
    }
    enemyAdmissionsByEntity.set(
      decision.entityId,
      Object.freeze({
        schemaVersion: 1,
        spawnId: decision.spawnId,
        entityId: decision.entityId,
        enemyDefinitionId: decision.enemyDefinitionId,
        admittedAtTick: state.tick
      })
    );
  }
  const enemyAdmissions = Object.freeze(
    [...enemyAdmissionsByEntity.values()].sort((left, right) =>
      compareText(left.entityId, right.entityId)
    )
  );
  const occupiedEntityIds = new Set(
    admitted.occupancy.map((occupant) => occupant.entityId)
  );
  for (const combatant of existingEnemyCombatants) {
    const isOccupied = occupiedEntityIds.has(combatant.entityId);
    if (combatant.lifecycleState === "active" && !isOccupied) {
      throw new RangeError(
        `active battlefield enemy combatant is not occupied (${combatant.entityId})`
      );
    }
    if (combatant.lifecycleState === "destroyed" && isOccupied) {
      throw new RangeError(
        `destroyed battlefield enemy combatant remains occupied (${combatant.entityId})`
      );
    }
  }
  const enemyCombatants = initializeAdmittedEnemyCombatants(
    content,
    existingEnemyCombatants,
    admitted.decisions,
    state.tick,
    enemyAdmissionsByEntity,
    level.waveIds.length > 0 ? admittedDefinitions : undefined
  );
  const combatantEntityIds = new Set(
    enemyCombatants.map((combatant) => combatant.entityId)
  );
  for (const admittedEntityId of enemyAdmissionsByEntity.keys()) {
    if (!combatantEntityIds.has(admittedEntityId)) {
      throw new RangeError(
        `admitted battlefield enemy is missing combatant state (${admittedEntityId})`
      );
    }
  }
  validateEnemyMovementProposals(
    state.tick,
    enemyCombatants,
    proposals,
    level.waveIds.length > 0
  );
  const moved = resolveMovementReservations(map, admitted.occupancy, proposals);
  const movedEnemyCombatants = advanceEnemyMovementCadence(
    state.tick,
    enemyCombatants,
    moved.decisions
  );
  const events: SimulationEvent[] = [];

  for (const decision of admitted.decisions) {
    const sequence = state.eventSequence + events.length;
    events.push(
      Object.freeze({
        id: `event.${String(sequence).padStart(6, "0")}`,
        tick: state.tick,
        sequence,
        type:
          decision.status === "admitted" ? "spawn.admitted" : "spawn.queued",
        ruleId: "SIM-SPAWN-ADMISSION-001",
        spawnId: decision.spawnId,
        entityId: decision.entityId,
        enemyDefinitionId: decision.enemyDefinitionId,
        entranceId: decision.entranceId,
        reasonCode: decision.reason
      })
    );
  }
  for (const decision of moved.decisions) {
    const sequence = state.eventSequence + events.length;
    events.push(
      Object.freeze({
        id: `event.${String(sequence).padStart(6, "0")}`,
        tick: state.tick,
        sequence,
        type:
          decision.status === "moved"
            ? "movement.moved"
            : decision.status === "waited"
              ? "movement.waited"
              : "movement.rejected",
        ruleId: "SIM-MOVEMENT-RESERVATION-001",
        proposalId: decision.proposalId,
        entityId: decision.entityId,
        fromNodeId: decision.fromNodeId,
        toNodeId: decision.toNodeId,
        reasonCode: decision.reason
      })
    );
  }

  return Object.freeze({
    state: Object.freeze({
      ...state,
      eventSequence: state.eventSequence + events.length,
      battlefield: freezeBattlefieldState(
        level.mapId,
        moved.occupancy,
        admitted.pendingSpawns,
        startedWaveIds as BattlefieldState["startedWaveIds"],
        firedSpawnIds as BattlefieldState["firedSpawnIds"],
        movedEnemyCombatants,
        enemyAdmissions
      )
    }),
    events: Object.freeze(events)
  });
}

/**
 * Resolves fixed-step phase 2 from authored wave timestamps through spawn
 * admission and movement. Schedule progress lives in battlefield state, so due
 * events are emitted exactly once while queued spawns remain retryable.
 */
export function resolveScheduledBattlefieldPhase(
  state: SimulationState,
  content: CompiledContent,
  proposals: readonly MovementProposal[],
  limits?: SpawnAdmissionLimits
): StepResult {
  const level = content.levels.get(state.levelId);
  if (level === undefined)
    throw new Error(`Unknown level ID: ${state.levelId}`);
  if (state.battlefield === undefined)
    throw new Error(`level ${state.levelId} does not have battlefield state`);
  if (level.mapId === undefined || state.battlefield.mapId !== level.mapId) {
    throw new Error(
      `battlefield map ${state.battlefield.mapId} does not match level map`
    );
  }

  const waves = level.waveIds.map((waveId) => {
    const wave = content.waves.get(waveId);
    if (wave === undefined) throw new Error(`Unknown wave ID: ${waveId}`);
    return wave;
  });
  const authoredSpawns = new Map(
    waves.flatMap((wave) =>
      wave.spawnEvents.map((spawn) => [spawn.id, spawn] as const)
    )
  );
  const persistedPendingSpawns = normalizePendingSpawns(
    state.battlefield.pendingSpawns,
    "persisted pending spawns"
  );
  const persistedOccupancy = normalizeOccupancy(
    state.battlefield.occupancy,
    "persisted occupancy"
  );
  const persistedEnemyAdmissions = normalizeEnemyAdmissions(
    state.battlefield.enemyAdmissions,
    state.tick
  );
  const enemyAdmissionsByEntity = new Map(
    persistedEnemyAdmissions.map(
      (admission) => [admission.entityId, admission] as const
    )
  );
  const startedWaveIds = normalizeStableIdArray(
    state.battlefield.startedWaveIds,
    "started wave IDs"
  );
  const firedSpawnIds = normalizeStableIdArray(
    state.battlefield.firedSpawnIds,
    "fired spawn IDs"
  );
  const pendingSpawnIds = new Set(
    persistedPendingSpawns.map((spawn) => spawn.id)
  );
  const admittedDefinitions = new Map<
    EntityId,
    BattlefieldEnemyCombatant["enemyDefinitionId"]
  >();
  for (const firedSpawnId of firedSpawnIds) {
    const authored = authoredSpawns.get(firedSpawnId as never);
    if (authored === undefined) {
      throw new RangeError(`fired spawn ID is not authored (${firedSpawnId})`);
    }
    if (!pendingSpawnIds.has(firedSpawnId as never)) {
      admittedDefinitions.set(authored.entityId, authored.enemyDefinitionId);
      const admission = enemyAdmissionsByEntity.get(authored.entityId);
      if (
        admission === undefined ||
        admission.spawnId !== authored.id ||
        admission.entityId !== authored.entityId ||
        admission.admittedAtTick < authored.atTick
      ) {
        throw new RangeError(
          `authored spawn does not match authoritative admission evidence (${authored.id})`
        );
      }
    }
  }
  if (enemyAdmissionsByEntity.size !== admittedDefinitions.size) {
    throw new RangeError(
      "battlefield enemy admissions do not match admitted authored spawns"
    );
  }
  const persistedEnemyCombatants = initializeAdmittedEnemyCombatants(
    content,
    state.battlefield.enemyCombatants,
    [],
    state.tick,
    enemyAdmissionsByEntity,
    level.waveIds.length > 0 ? admittedDefinitions : undefined
  );
  const scheduled = resolveWaveSchedule({
    schemaVersion: 1,
    currentTick: state.tick,
    level,
    waves,
    startedWaveIds: startedWaveIds as BattlefieldState["startedWaveIds"],
    firedSpawnIds: firedSpawnIds as BattlefieldState["firedSpawnIds"],
    pendingSpawns: persistedPendingSpawns
  });

  const scheduleEvents: SimulationEvent[] = scheduled.decisions.map(
    (decision, offset) => {
      const sequence = state.eventSequence + offset;
      const base = {
        id: `event.${String(sequence).padStart(6, "0")}`,
        tick: state.tick,
        sequence,
        ruleId: "SIM-WAVE-SCHEDULE-001",
        authoredAtTick: decision.authoredAtTick,
        waveId: decision.waveId
      } as const;
      if (decision.eventKind === "wave_started") {
        return Object.freeze({
          ...base,
          type: "wave.started" as const,
          reasonCode: "authored_wave_start_reached" as const
        });
      }
      if (
        decision.entityId === undefined ||
        decision.enemyDefinitionId === undefined ||
        decision.entranceId === undefined
      ) {
        throw new Error(
          `spawn schedule decision ${decision.eventId} is incomplete`
        );
      }
      return Object.freeze({
        ...base,
        type: "spawn.enqueued" as const,
        reasonCode: "authored_spawn_tick_reached" as const,
        spawnId: decision.eventId,
        entityId: decision.entityId,
        enemyDefinitionId: decision.enemyDefinitionId,
        entranceId: decision.entranceId
      });
    }
  );

  const admissionState: SimulationState = Object.freeze({
    ...state,
    eventSequence: state.eventSequence + scheduleEvents.length,
    battlefield: freezeBattlefieldState(
      level.mapId,
      persistedOccupancy,
      [],
      scheduled.startedWaveIds,
      scheduled.firedSpawnIds,
      persistedEnemyCombatants,
      persistedEnemyAdmissions
    )
  });
  const battlefield = resolveBattlefieldPhase(
    admissionState,
    content,
    scheduled.pendingSpawns,
    proposals,
    limits
  );
  if (battlefield.state.battlefield === undefined)
    throw new Error("resolved battlefield state is missing");

  return Object.freeze({
    state: Object.freeze({
      ...battlefield.state,
      battlefield: freezeBattlefieldState(
        level.mapId,
        battlefield.state.battlefield.occupancy,
        battlefield.state.battlefield.pendingSpawns,
        scheduled.startedWaveIds,
        scheduled.firedSpawnIds,
        battlefield.state.battlefield.enemyCombatants,
        battlefield.state.battlefield.enemyAdmissions
      )
    }),
    events: Object.freeze([...scheduleEvents, ...battlefield.events])
  });
}

function event(
  state: SimulationState,
  offset: number,
  type: LifecycleSimulationEvent["type"],
  ruleId: string
): LifecycleSimulationEvent {
  const sequence = state.eventSequence + offset;
  return {
    id: `event.${String(sequence).padStart(6, "0")}`,
    tick: state.tick,
    sequence,
    type,
    ruleId
  };
}

export function stepSimulation(
  state: SimulationState,
  commands: readonly CommandEnvelope[],
  content: CompiledContent
): StepResult {
  if (state.phase === "TERMINAL") return { state, events: [] };

  const accepted = commands
    .filter(
      (envelope) =>
        envelope.tick === state.tick &&
        envelope.command.atTick === envelope.tick &&
        envelope.command.type === "confirmPreparation"
    )
    .sort((left, right) => left.sequence - right.sequence);

  if (state.phase === "PREPARATION" && accepted.length > 0) {
    const level = content.levels.get(state.levelId);
    if (!level) throw new Error(`Unknown level ID: ${state.levelId}`);

    const events: SimulationEvent[] = [
      event(state, 0, "round.started", "SIM-LIFECYCLE-001")
    ];
    if (level.waveIds.length === 0) {
      events.push(
        event(state, 1, "final_cleanup.entered", "SIM-FINAL-CLEANUP-001")
      );
      events.push(event(state, 2, "round.victory", "SIM-VICTORY-001"));
      return {
        state: {
          ...state,
          phase: "TERMINAL",
          terminalResult: "victory",
          eventSequence: state.eventSequence + events.length
        },
        events
      };
    }

    return {
      state: {
        ...state,
        tick: state.tick + 1,
        phase: "COMBAT_RUNNING",
        eventSequence: state.eventSequence + events.length
      },
      events
    };
  }

  if (state.phase === "PREPARATION") return { state, events: [] };

  return {
    state: {
      ...state,
      tick: state.tick + 1
    },
    events: []
  };
}

export async function stateChecksum(state: SimulationState): Promise<string> {
  return canonicalHash(state);
}
