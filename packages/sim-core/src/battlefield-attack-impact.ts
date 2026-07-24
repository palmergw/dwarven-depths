import type { CompiledContent } from "@dwarven-depths/content-runtime";
import type {
  BattlefieldAttackImpactRequest,
  BattlefieldAttackImpactResolution,
  BattlefieldDwarfCombatant,
  BattlefieldEnemyCombatant,
  BattlefieldState,
  DwarfDeployment,
  EntityId,
  NavigationOccupant,
  PlacementPointId,
  StableId
} from "@dwarven-depths/contracts";
import { resolveCommittedAttackImpacts } from "./committed-attack-impact.js";
import { resolveZeroHealthLifecycles } from "./death-resolution.js";
import { normalizeAuthoritativeBattlefieldEnemyState } from "./enemy-movement-planning.js";

const stableIdPattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export interface BattlefieldDwarfDeploymentAuthority {
  readonly schemaVersion: 1;
  readonly mapId: StableId;
  readonly deployments: readonly DwarfDeployment[];
}

const deploymentAuthorityMetadata = new WeakMap<
  BattlefieldDwarfDeploymentAuthority,
  { readonly content: CompiledContent }
>();

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function freezeBattlefield(
  battlefield: BattlefieldState,
  occupancy: readonly NavigationOccupant[],
  dwarfCombatants: readonly BattlefieldDwarfCombatant[],
  pendingCommittedAttacks: BattlefieldState["pendingCommittedAttacks"],
  enemyCombatants: readonly BattlefieldEnemyCombatant[] = battlefield.enemyCombatants
): BattlefieldState {
  return Object.freeze({
    schemaVersion: 1,
    mapId: battlefield.mapId,
    startedWaveIds: Object.freeze([...battlefield.startedWaveIds]),
    firedSpawnIds: Object.freeze([...battlefield.firedSpawnIds]),
    occupancy: Object.freeze(
      occupancy.map((item) => Object.freeze({ ...item }))
    ),
    pendingSpawns: Object.freeze(
      battlefield.pendingSpawns.map((item) => Object.freeze({ ...item }))
    ),
    enemyAdmissions: Object.freeze(
      battlefield.enemyAdmissions.map((item) => Object.freeze({ ...item }))
    ),
    enemyCombatants: Object.freeze(
      enemyCombatants.map((item) =>
        Object.freeze({
          ...item,
          basicAttack: Object.freeze({ ...item.basicAttack }),
          actionState: Object.freeze({
            ...item.actionState,
            activeBasicAttack:
              item.actionState.activeBasicAttack === null
                ? null
                : Object.freeze({ ...item.actionState.activeBasicAttack })
          })
        })
      )
    ),
    dwarfCombatants: Object.freeze(
      dwarfCombatants.map((item) => Object.freeze({ ...item }))
    ),
    pendingCommittedAttacks: Object.freeze(
      pendingCommittedAttacks.map((item) => Object.freeze({ ...item }))
    )
  });
}

function requireRecord(
  value: unknown,
  keys: readonly string[],
  description: string
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    throw new TypeError(`${description} must be a plain object`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actualKeys = Reflect.ownKeys(value);
  if (
    actualKeys.some((key) => typeof key !== "string") ||
    actualKeys.length !== keys.length ||
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
  return result;
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
        `${description} item ${index} must be own enumerable data`
      );
    return descriptor.value;
  });
}

function requireId(
  value: unknown,
  domain: string,
  description: string
): StableId {
  if (
    typeof value !== "string" ||
    !stableIdPattern.test(value) ||
    !value.startsWith(`${domain}.`)
  )
    throw new RangeError(`${description} must be a ${domain}.* stable ID`);
  return value as StableId;
}

function requireHealth(value: unknown, description: string): number {
  if (
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    (value as number) < 0
  )
    throw new RangeError(`${description} must be a non-negative safe integer`);
  return value as number;
}

/** Accepts a preparation choice once for use by later mutable phases. */
export function createBattlefieldDwarfDeploymentAuthority(
  value: readonly DwarfDeployment[],
  mapId: StableId,
  content: CompiledContent
): BattlefieldDwarfDeploymentAuthority {
  const map = content.maps.get(mapId);
  if (map === undefined)
    throw new RangeError(`unknown battlefield map (${mapId})`);
  const placements = new Set(map.placementPoints.map((point) => point.id));
  const entities = new Set<EntityId>();
  const placementIds = new Set<PlacementPointId>();
  const deployments = requireArray(value, "dwarf deployment authority").map(
    (item, index): DwarfDeployment => {
      const record = requireRecord(
        item,
        ["entityId", "characterDefinitionId", "placementPointId"],
        `dwarf deployment authority ${index}`
      );
      const entityId = requireId(
        record["entityId"],
        "entity",
        `dwarf deployment authority ${index} entityId`
      ) as EntityId;
      const characterDefinitionId = requireId(
        record["characterDefinitionId"],
        "character",
        `dwarf deployment authority ${index} characterDefinitionId`
      );
      const placementPointId = requireId(
        record["placementPointId"],
        "placement",
        `dwarf deployment authority ${index} placementPointId`
      ) as PlacementPointId;
      if (content.characters.get(characterDefinitionId) === undefined)
        throw new RangeError(
          `dwarf deployment authority ${index} references unknown character`
        );
      if (!placements.has(placementPointId))
        throw new RangeError(
          `dwarf deployment authority ${index} references unknown placement`
        );
      if (entities.has(entityId) || placementIds.has(placementPointId))
        throw new RangeError(
          "dwarf deployment authority duplicates an entity or placement"
        );
      entities.add(entityId);
      placementIds.add(placementPointId);
      return Object.freeze({
        entityId,
        characterDefinitionId,
        placementPointId
      });
    }
  );
  const authority = Object.freeze({
    schemaVersion: 1 as const,
    mapId,
    deployments: Object.freeze(
      deployments.sort((left, right) =>
        compareText(left.entityId, right.entityId)
      )
    )
  });
  deploymentAuthorityMetadata.set(authority, { content });
  return authority;
}

function requireDeploymentAuthority(
  authority: BattlefieldDwarfDeploymentAuthority,
  mapId: StableId,
  content: CompiledContent
): readonly DwarfDeployment[] {
  const metadata = deploymentAuthorityMetadata.get(authority);
  if (metadata?.content !== content || authority.mapId !== mapId)
    throw new RangeError(
      "dwarf deployment authority was not accepted for this content and map"
    );
  return authority.deployments;
}

function _normalizeOccupancy(
  value: unknown,
  content: CompiledContent,
  mapId: StableId
): readonly NavigationOccupant[] {
  const map = content.maps.get(mapId);
  if (map === undefined)
    throw new RangeError(`unknown battlefield map (${mapId})`);
  const knownNodes = new Set(map.nodes.map((node) => node.id));
  const seenEntities = new Set<EntityId>();
  const seenNodes = new Set<NavigationOccupant["nodeId"]>();
  const occupancy = requireArray(value, "battlefield occupancy").map(
    (item, index): NavigationOccupant => {
      const record = requireRecord(
        item,
        ["entityId", "nodeId"],
        `battlefield occupant ${index}`
      );
      const entityId = requireId(
        record["entityId"],
        "entity",
        `battlefield occupant ${index} entityId`
      ) as EntityId;
      const nodeId = requireId(
        record["nodeId"],
        "node",
        `battlefield occupant ${index} nodeId`
      ) as NavigationOccupant["nodeId"];
      if (!knownNodes.has(nodeId))
        throw new RangeError(
          `battlefield occupant ${index} references unknown node`
        );
      if (seenEntities.has(entityId) || seenNodes.has(nodeId))
        throw new RangeError(
          "battlefield occupancy contains a duplicate entity or node"
        );
      seenEntities.add(entityId);
      seenNodes.add(nodeId);
      return Object.freeze({ entityId, nodeId });
    }
  );
  return Object.freeze(
    occupancy.sort((left, right) => compareText(left.entityId, right.entityId))
  );
}

function _normalizeEnemyCombatants(
  battlefield: BattlefieldState,
  content: CompiledContent,
  levelId: StableId,
  currentTick: number
): readonly BattlefieldEnemyCombatant[] {
  const level = content.levels.get(levelId);
  if (level === undefined) throw new RangeError(`unknown level (${levelId})`);
  const authoredSpawns = new Map<
    EntityId,
    {
      readonly definitionId: StableId;
      readonly spawnId: StableId;
      readonly waveId: StableId;
      readonly atTick: number;
    }
  >();
  for (const waveId of level.waveIds) {
    const wave = content.waves.get(waveId);
    if (wave === undefined)
      throw new RangeError(`unknown level wave (${waveId})`);
    for (const spawn of wave.spawnEvents)
      authoredSpawns.set(spawn.entityId, {
        definitionId: spawn.enemyDefinitionId,
        spawnId: spawn.id,
        waveId,
        atTick: wave.startAtTick + spawn.atTick
      });
  }
  const startedWaveIds = new Set(
    requireArray(battlefield.startedWaveIds, "started wave IDs").map(
      (value, index) => requireId(value, "wave", `started wave ID ${index}`)
    )
  );
  const firedSpawnIds = new Set(
    requireArray(battlefield.firedSpawnIds, "fired spawn IDs").map(
      (value, index) => requireId(value, "spawn", `fired spawn ID ${index}`)
    )
  );
  const pendingSpawnIds = new Set(
    requireArray(battlefield.pendingSpawns, "pending spawns").map(
      (item, index) => {
        const record = requireRecord(
          item,
          [
            "id",
            "authoredOrder",
            "entityId",
            "enemyDefinitionId",
            "entranceId"
          ],
          `pending spawn ${index}`
        );
        return requireId(record["id"], "spawn", `pending spawn ${index} id`);
      }
    )
  );
  const admissions = new Map<
    EntityId,
    { definitionId: StableId; tick: number }
  >();
  for (const [index, item] of requireArray(
    battlefield.enemyAdmissions,
    "battlefield enemy admissions"
  ).entries()) {
    const record = requireRecord(
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
    if (record["schemaVersion"] !== 1)
      throw new RangeError("enemy admission has unsupported schemaVersion");
    const entityId = requireId(
      record["entityId"],
      "entity",
      `battlefield enemy admission ${index} entityId`
    ) as EntityId;
    const definitionId = requireId(
      record["enemyDefinitionId"],
      "enemy",
      `battlefield enemy admission ${index} enemyDefinitionId`
    );
    const admittedAtTick = requireHealth(
      record["admittedAtTick"],
      `battlefield enemy admission ${index} admittedAtTick`
    );
    const spawnId = requireId(
      record["spawnId"],
      "spawn",
      `battlefield enemy admission ${index} spawnId`
    );
    const authoredSpawn = authoredSpawns.get(entityId);
    if (
      admittedAtTick > currentTick ||
      authoredSpawn === undefined ||
      authoredSpawn.definitionId !== definitionId ||
      authoredSpawn.spawnId !== spawnId ||
      !startedWaveIds.has(authoredSpawn.waveId) ||
      !firedSpawnIds.has(spawnId) ||
      pendingSpawnIds.has(spawnId) ||
      authoredSpawn.atTick > admittedAtTick ||
      admissions.has(entityId)
    )
      throw new RangeError(
        "enemy admission does not match authored wave evidence"
      );
    admissions.set(entityId, { definitionId, tick: admittedAtTick });
  }
  const combatants = requireArray(
    battlefield.enemyCombatants,
    "battlefield enemy combatants"
  ).map((item, index): BattlefieldEnemyCombatant => {
    const description = `battlefield enemy combatant ${index}`;
    const record = requireRecord(
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
    if (record["schemaVersion"] !== 1)
      throw new RangeError(`${description} has unsupported schemaVersion`);
    const entityId = requireId(
      record["entityId"],
      "entity",
      `${description} entityId`
    ) as EntityId;
    const definitionId = requireId(
      record["enemyDefinitionId"],
      "enemy",
      `${description} enemyDefinitionId`
    );
    const definition = content.enemies.get(definitionId);
    const admission = admissions.get(entityId);
    if (
      definition === undefined ||
      admission === undefined ||
      admission.definitionId !== definitionId ||
      admission.tick !== record["admittedAtTick"]
    )
      throw new RangeError(`${description} does not match authored admission`);
    const currentHealth = requireHealth(
      record["currentHealth"],
      `${description} currentHealth`
    );
    const basicAttack = requireRecord(
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
      `${description} basicAttack`
    );
    for (const key of [
      "id",
      "windupTicks",
      "impactDelayTicks",
      "cooldownTicks",
      "damage",
      "range",
      "requiresLineOfSight"
    ] as const)
      if (basicAttack[key] !== definition.basicAttack[key])
        throw new RangeError(`${description} basicAttack is not authored`);
    if (
      record["classification"] !== definition.classification ||
      record["maximumHealth"] !== definition.maximumHealth ||
      record["armor"] !== definition.armor ||
      record["movementIntervalTicks"] !== definition.movementIntervalTicks ||
      currentHealth > definition.maximumHealth ||
      (record["lifecycleState"] !== "active" &&
        record["lifecycleState"] !== "destroyed") ||
      (record["lifecycleState"] === "active"
        ? currentHealth === 0
        : currentHealth !== 0)
    )
      throw new RangeError(
        `${description} does not match authored enemy state`
      );
    const actionState = requireRecord(
      record["actionState"],
      [
        "schemaVersion",
        "nextMovementAtTick",
        "currentTargetEntityId",
        "activeBasicAttack",
        "cooldownCompleteAtTick"
      ],
      `${description} actionState`
    );
    if (actionState["schemaVersion"] !== 1)
      throw new RangeError(`${description} actionState is not version 1`);
    const nextMovementAtTick = requireHealth(
      actionState["nextMovementAtTick"],
      `${description} nextMovementAtTick`
    );
    const targetValue = actionState["currentTargetEntityId"];
    const currentTargetEntityId =
      targetValue === null
        ? null
        : (requireId(
            targetValue,
            "entity",
            `${description} currentTargetEntityId`
          ) as EntityId);
    const cooldownValue = actionState["cooldownCompleteAtTick"];
    const cooldownCompleteAtTick =
      cooldownValue === null
        ? null
        : requireHealth(cooldownValue, `${description} cooldownCompleteAtTick`);
    const activeValue = actionState["activeBasicAttack"];
    let activeBasicAttack: BattlefieldEnemyCombatant["actionState"]["activeBasicAttack"] =
      null;
    if (activeValue !== null) {
      const active = requireRecord(
        activeValue,
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
        `${description} activeBasicAttack`
      );
      const startedAtTick = requireHealth(
        active["startedAtTick"],
        `${description} activeBasicAttack startedAtTick`
      );
      const commitAtTick = requireHealth(
        active["commitAtTick"],
        `${description} activeBasicAttack commitAtTick`
      );
      const impactAtTick = requireHealth(
        active["impactAtTick"],
        `${description} activeBasicAttack impactAtTick`
      );
      const targetEntityId = requireId(
        active["targetEntityId"],
        "entity",
        `${description} activeBasicAttack targetEntityId`
      ) as EntityId;
      if (
        active["schemaVersion"] !== 1 ||
        active["attackId"] !== definition.basicAttack.id ||
        active["sourceEntityId"] !== entityId ||
        startedAtTick < admission.tick ||
        commitAtTick !== startedAtTick + definition.basicAttack.windupTicks ||
        impactAtTick !==
          commitAtTick + definition.basicAttack.impactDelayTicks ||
        active["cooldownDurationTicks"] !==
          definition.basicAttack.cooldownTicks ||
        active["damage"] !== definition.basicAttack.damage ||
        active["range"] !== definition.basicAttack.range ||
        typeof active["targetIsValid"] !== "boolean"
      )
        throw new RangeError(
          `${description} activeBasicAttack is not authored`
        );
      activeBasicAttack = Object.freeze({
        schemaVersion: 1,
        attackId: active["attackId"] as StableId,
        sourceEntityId: entityId,
        targetEntityId,
        startedAtTick,
        commitAtTick,
        impactAtTick,
        cooldownDurationTicks: definition.basicAttack.cooldownTicks,
        damage: definition.basicAttack.damage,
        range: definition.basicAttack.range,
        targetIsValid: active["targetIsValid"] as boolean
      });
    }
    return Object.freeze({
      schemaVersion: 1,
      entityId,
      enemyDefinitionId: definitionId,
      classification: definition.classification,
      currentHealth,
      maximumHealth: definition.maximumHealth,
      armor: definition.armor,
      movementIntervalTicks: definition.movementIntervalTicks,
      admittedAtTick: admission.tick,
      lifecycleState: record["lifecycleState"] as "active" | "destroyed",
      basicAttack: Object.freeze({ ...definition.basicAttack }),
      actionState: Object.freeze({
        schemaVersion: 1,
        nextMovementAtTick,
        currentTargetEntityId,
        activeBasicAttack,
        cooldownCompleteAtTick
      })
    });
  });
  if (combatants.length !== admissions.size)
    throw new RangeError("enemy combatants do not match authored admissions");
  return Object.freeze(
    combatants.sort((left, right) => compareText(left.entityId, right.entityId))
  );
}

export function normalizeBattlefieldDwarves(
  value: unknown,
  authority: BattlefieldDwarfDeploymentAuthority,
  content: CompiledContent,
  mapId: StableId,
  occupancy: readonly NavigationOccupant[]
): readonly BattlefieldDwarfCombatant[] {
  const deployments = requireDeploymentAuthority(authority, mapId, content);
  const map = content.maps.get(mapId);
  if (map === undefined)
    throw new RangeError(`unknown battlefield map (${mapId})`);
  const placementNodes = new Map(
    map.placementPoints.map((placement) => [placement.id, placement.nodeId])
  );
  const occupiedNodes = new Map<
    EntityId,
    readonly NavigationOccupant["nodeId"][]
  >();
  for (const item of occupancy) {
    const nodes = occupiedNodes.get(item.entityId) ?? [];
    occupiedNodes.set(item.entityId, [...nodes, item.nodeId]);
  }
  const seenEntities = new Set<EntityId>();
  const seenPlacements = new Set<PlacementPointId>();
  const deploymentsByEntity = new Map<EntityId, DwarfDeployment>();
  for (const [index, item] of requireArray(
    deployments,
    "authored dwarf deployments"
  ).entries()) {
    const record = requireRecord(
      item,
      ["entityId", "characterDefinitionId", "placementPointId"],
      `authored dwarf deployment ${index}`
    );
    const deployment = Object.freeze({
      entityId: requireId(
        record["entityId"],
        "entity",
        `authored dwarf deployment ${index} entityId`
      ) as EntityId,
      characterDefinitionId: requireId(
        record["characterDefinitionId"],
        "character",
        `authored dwarf deployment ${index} characterDefinitionId`
      ),
      placementPointId: requireId(
        record["placementPointId"],
        "placement",
        `authored dwarf deployment ${index} placementPointId`
      ) as PlacementPointId
    });
    if (deploymentsByEntity.has(deployment.entityId))
      throw new RangeError("duplicate authored dwarf deployment entity ID");
    deploymentsByEntity.set(deployment.entityId, deployment);
  }
  const dwarves = requireArray(value, "battlefield dwarf combatants").map(
    (item, index): BattlefieldDwarfCombatant => {
      const description = `battlefield dwarf combatant ${index}`;
      const record = requireRecord(
        item,
        [
          "schemaVersion",
          "entityId",
          "characterDefinitionId",
          "placementPointId",
          "currentHealth",
          "maximumHealth",
          "lifecycleState"
        ],
        description
      );
      if (record["schemaVersion"] !== 1)
        throw new RangeError(`${description} has unsupported schemaVersion`);
      const entityId = requireId(
        record["entityId"],
        "entity",
        `${description} entityId`
      ) as EntityId;
      const characterDefinitionId = requireId(
        record["characterDefinitionId"],
        "character",
        `${description} characterDefinitionId`
      );
      const placementPointId = requireId(
        record["placementPointId"],
        "placement",
        `${description} placementPointId`
      ) as PlacementPointId;
      const character = content.characters.get(characterDefinitionId);
      if (character === undefined)
        throw new RangeError(
          `${description} references unknown character definition`
        );
      const deployment = deploymentsByEntity.get(entityId);
      if (
        deployment === undefined ||
        deployment.characterDefinitionId !== characterDefinitionId ||
        deployment.placementPointId !== placementPointId
      )
        throw new RangeError(
          `${description} does not match authored deployment evidence`
        );
      const currentHealth = requireHealth(
        record["currentHealth"],
        `${description} currentHealth`
      );
      const maximumHealth = requireHealth(
        record["maximumHealth"],
        `${description} maximumHealth`
      );
      if (
        maximumHealth !== character.maximumHealth ||
        currentHealth > maximumHealth
      )
        throw new RangeError(
          `${description} health does not match its authored character`
        );
      const lifecycleState = record["lifecycleState"];
      if (lifecycleState !== "active" && lifecycleState !== "downed")
        throw new RangeError(`${description} lifecycleState is invalid`);
      if (
        lifecycleState === "active" ? currentHealth === 0 : currentHealth !== 0
      )
        throw new RangeError(
          `${description} health and lifecycleState are inconsistent`
        );
      const expectedNode = placementNodes.get(placementPointId);
      if (expectedNode === undefined)
        throw new RangeError(
          `${description} references unknown placement point`
        );
      const entityOccupancy = occupiedNodes.get(entityId) ?? [];
      if (
        lifecycleState === "active" &&
        (entityOccupancy.length !== 1 || entityOccupancy[0] !== expectedNode)
      )
        throw new RangeError(
          `${description} active dwarf must occupy its authored placement`
        );
      if (lifecycleState === "downed" && entityOccupancy.length > 0)
        throw new RangeError(
          `${description} downed dwarf cannot occupy navigation`
        );
      if (seenEntities.has(entityId) || seenPlacements.has(placementPointId))
        throw new RangeError(
          `${description} duplicates a dwarf entity or placement`
        );
      seenEntities.add(entityId);
      seenPlacements.add(placementPointId);
      return Object.freeze({
        schemaVersion: 1,
        entityId,
        characterDefinitionId,
        placementPointId,
        currentHealth,
        maximumHealth,
        lifecycleState
      });
    }
  );
  if (dwarves.length !== deploymentsByEntity.size)
    throw new RangeError(
      "battlefield dwarves do not match authored deployments"
    );
  return Object.freeze(
    dwarves.sort((left, right) => compareText(left.entityId, right.entityId))
  );
}

export function deployBattlefieldDwarves(
  battlefield: BattlefieldState,
  authority: BattlefieldDwarfDeploymentAuthority,
  content: CompiledContent
): BattlefieldState {
  const deployments = requireDeploymentAuthority(
    authority,
    battlefield.mapId,
    content
  );
  if (battlefield.dwarfCombatants.length > 0)
    throw new RangeError("battlefield dwarves are already initialized");
  const map = content.maps.get(battlefield.mapId);
  if (map === undefined)
    throw new RangeError(`unknown battlefield map (${battlefield.mapId})`);
  const placements = new Map(
    map.placementPoints.map((point) => [point.id, point.nodeId])
  );
  const occupiedNodes = new Set(
    battlefield.occupancy.map((item) => item.nodeId)
  );
  const occupiedEntities = new Set(
    battlefield.occupancy.map((item) => item.entityId)
  );
  const dwarfCombatants: BattlefieldDwarfCombatant[] = [];
  const occupancy = battlefield.occupancy.map((item) =>
    Object.freeze({ ...item })
  );
  for (const [index, item] of requireArray(
    deployments,
    "dwarf deployments"
  ).entries()) {
    const record = requireRecord(
      item,
      ["entityId", "characterDefinitionId", "placementPointId"],
      `dwarf deployment ${index}`
    );
    const entityId = requireId(
      record["entityId"],
      "entity",
      `dwarf deployment ${index} entityId`
    ) as EntityId;
    const characterDefinitionId = requireId(
      record["characterDefinitionId"],
      "character",
      `dwarf deployment ${index} characterDefinitionId`
    );
    const placementPointId = requireId(
      record["placementPointId"],
      "placement",
      `dwarf deployment ${index} placementPointId`
    ) as PlacementPointId;
    const character = content.characters.get(characterDefinitionId);
    const nodeId = placements.get(placementPointId);
    if (character === undefined || nodeId === undefined)
      throw new RangeError(
        `dwarf deployment ${index} references unknown authored content`
      );
    if (occupiedNodes.has(nodeId) || occupiedEntities.has(entityId))
      throw new RangeError(`dwarf deployment ${index} placement is occupied`);
    occupiedNodes.add(nodeId);
    occupiedEntities.add(entityId);
    occupancy.push(Object.freeze({ entityId, nodeId }));
    dwarfCombatants.push(
      Object.freeze({
        schemaVersion: 1,
        entityId,
        characterDefinitionId,
        placementPointId,
        currentHealth: character.maximumHealth,
        maximumHealth: character.maximumHealth,
        lifecycleState: "active"
      })
    );
  }
  const normalized = normalizeBattlefieldDwarves(
    dwarfCombatants,
    authority,
    content,
    battlefield.mapId,
    occupancy
  );
  return freezeBattlefield(
    battlefield,
    occupancy.sort((left, right) => compareText(left.entityId, right.entityId)),
    normalized,
    battlefield.pendingCommittedAttacks
  );
}

export function resolveBattlefieldAttackImpacts(
  request: BattlefieldAttackImpactRequest,
  content: CompiledContent,
  authority: BattlefieldDwarfDeploymentAuthority
): BattlefieldAttackImpactResolution {
  const requestRecord = requireRecord(
    request,
    ["schemaVersion", "currentTick", "levelId", "battlefield"],
    "battlefield attack impact request"
  );
  if (requestRecord["schemaVersion"] !== 1)
    throw new RangeError(
      "battlefield attack impact request has unsupported schemaVersion"
    );
  const currentTick = requireHealth(
    requestRecord["currentTick"],
    "currentTick"
  );
  const levelId = requireId(requestRecord["levelId"], "level", "levelId");
  const level = content.levels.get(levelId);
  if (level === undefined) throw new RangeError(`unknown level (${levelId})`);
  const normalized = normalizeAuthoritativeBattlefieldEnemyState(
    requestRecord["battlefield"],
    levelId,
    currentTick,
    content
  );
  const battlefield = normalized.battlefield;
  if (battlefield.mapId !== level.mapId)
    throw new RangeError("battlefield map does not match level");
  const occupancy = normalized.occupancy;
  const dwarves = normalizeBattlefieldDwarves(
    battlefield.dwarfCombatants,
    authority,
    content,
    battlefield.mapId,
    occupancy
  );
  const enemyCombatants = normalized.enemyCombatants;
  const attacks = normalized.pendingCommittedAttacks;
  const impacts = resolveCommittedAttackImpacts({
    currentTick,
    attacks,
    combatants: dwarves.map((dwarf) => ({
      schemaVersion: 1,
      entityId: dwarf.entityId,
      currentHealth: dwarf.currentHealth,
      maximumHealth: dwarf.maximumHealth
    }))
  });
  const healthById = new Map(
    impacts.health.map((health) => [health.entityId, health])
  );
  const dwarfEntityIds = new Set(dwarves.map((dwarf) => dwarf.entityId));
  const lifecycle = resolveZeroHealthLifecycles({
    combatants: dwarves.map((dwarf) => ({
      schemaVersion: 1,
      entityId: dwarf.entityId,
      kind: "dwarf",
      currentHealth:
        healthById.get(dwarf.entityId)?.currentHealth ?? dwarf.currentHealth,
      lifecycleState: dwarf.lifecycleState
    })),
    occupancy: occupancy.filter((occupant) =>
      dwarfEntityIds.has(occupant.entityId)
    )
  });
  const lifecycleById = new Map(
    lifecycle.combatants.map((item) => [item.entityId, item])
  );
  const nextDwarves = Object.freeze(
    dwarves.map((dwarf) =>
      Object.freeze({
        ...dwarf,
        currentHealth:
          lifecycleById.get(dwarf.entityId)?.currentHealth ??
          dwarf.currentHealth,
        lifecycleState: (lifecycleById.get(dwarf.entityId)?.lifecycleState ??
          dwarf.lifecycleState) as "active" | "downed"
      })
    )
  );
  const activeDwarfIds = new Set(
    nextDwarves
      .filter((dwarf) => dwarf.lifecycleState === "active")
      .map((dwarf) => dwarf.entityId)
  );
  const nextOccupancy = Object.freeze(
    occupancy
      .filter(
        (occupant) =>
          !dwarfEntityIds.has(occupant.entityId) ||
          activeDwarfIds.has(occupant.entityId)
      )
      .map((occupant) => Object.freeze({ ...occupant }))
      .sort((left, right) => compareText(left.entityId, right.entityId))
  );
  const pendingAttackIds = new Set(
    impacts.decisions
      .filter((decision) => decision.status === "pending")
      .map((decision) => decision.attackId)
  );
  const pendingCommittedAttacks = Object.freeze(
    attacks
      .filter((attack) => pendingAttackIds.has(attack.attackId))
      .map((attack) => Object.freeze({ ...attack }))
  );
  const nextBattlefield = freezeBattlefield(
    battlefield,
    nextOccupancy,
    nextDwarves,
    pendingCommittedAttacks,
    enemyCombatants
  );
  normalizeBattlefieldDwarves(
    nextDwarves,
    authority,
    content,
    battlefield.mapId,
    nextOccupancy
  );
  return Object.freeze({
    schemaVersion: 1,
    battlefield: nextBattlefield,
    impactDecisions: impacts.decisions,
    healthResolutions: impacts.healthResolutions,
    lifecycleDecisions: lifecycle.decisions
  });
}
