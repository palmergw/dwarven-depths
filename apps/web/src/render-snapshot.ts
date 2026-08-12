export type RenderPhase = "preparation" | "running" | "terminal";

export interface RenderNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export interface RenderConnection {
  readonly id: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
}

export interface RenderEntity {
  readonly id: string;
  readonly nodeId: string;
  readonly faction: "dwarf" | "enemy" | "deployable";
}

export interface RenderSnapshotV1 {
  readonly schemaVersion: 1;
  readonly levelId: string;
  readonly mapId: string | null;
  readonly tick: number;
  readonly phase: RenderPhase;
  readonly nodes: readonly RenderNode[];
  readonly connections: readonly RenderConnection[];
  readonly entities: readonly RenderEntity[];
}

export interface RenderPosition {
  readonly nodeId: string;
  readonly x: number;
  readonly y: number;
}

export interface RenderStatus {
  readonly id: string;
  readonly appliedAtTick: number;
  readonly expiresAtTick: number;
  readonly magnitude: number;
}

export interface RenderEntityV2 extends RenderEntity {
  readonly visualId: string;
  readonly archetype: "character" | "basic" | "elite" | "boss" | "deployable";
  readonly position: RenderPosition;
  readonly previousPosition: RenderPosition | null;
  readonly currentHealth: number;
  readonly maximumHealth: number;
  readonly facing: "north" | "east" | "south" | "west";
  readonly action: {
    readonly kind: "idle" | "moving" | "basic_attack" | "ability";
    readonly phase:
      | "idle"
      | "windup"
      | "committed"
      | "impact"
      | "recoil"
      | "recovery";
    readonly abilityId: string | null;
    readonly impactTargetEntityIds?: readonly string[];
  };
  readonly targetEntityId: string | null;
  readonly statuses: readonly RenderStatus[];
  readonly transition: "spawned" | "active" | "moving";
  readonly elite: boolean;
  readonly boss: boolean;
}

export interface RenderEntityTransition {
  readonly entityId: string;
  readonly kind: "spawned" | "downed" | "destroyed";
  readonly atTick: number;
}

export interface RenderEncounter {
  readonly startedWaveIds: readonly string[];
  readonly activeWaveId: string | null;
  readonly pendingSpawnCount: number;
  readonly livingHostileCount: number;
  readonly terminalResult: "victory" | "defeat" | null;
}

export interface RenderSnapshotV2 {
  readonly schemaVersion: 2;
  readonly scenarioId: string;
  readonly levelId: string;
  readonly mapId: string | null;
  readonly tick: number;
  readonly previousTick: number | null;
  readonly phase: RenderPhase;
  readonly nodes: readonly RenderNode[];
  readonly connections: readonly RenderConnection[];
  readonly entities: readonly RenderEntityV2[];
  readonly entityTransitions: readonly RenderEntityTransition[];
  readonly encounter: RenderEncounter;
}

export type RenderSnapshot = RenderSnapshotV1 | RenderSnapshotV2;

export function compareRenderIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

type UnknownRecord = Record<string, unknown> & {
  schemaVersion?: unknown;
  scenarioId?: unknown;
  levelId?: unknown;
  mapId?: unknown;
  tick?: unknown;
  previousTick?: unknown;
  phase?: unknown;
  nodes?: unknown;
  connections?: unknown;
  entities?: unknown;
  entityTransitions?: unknown;
  encounter?: unknown;
  id?: unknown;
  entityId?: unknown;
  nodeId?: unknown;
  x?: unknown;
  y?: unknown;
  fromNodeId?: unknown;
  toNodeId?: unknown;
  faction?: unknown;
  visualId?: unknown;
  archetype?: unknown;
  position?: unknown;
  previousPosition?: unknown;
  currentHealth?: unknown;
  maximumHealth?: unknown;
  facing?: unknown;
  action?: unknown;
  kind?: unknown;
  abilityId?: unknown;
  targetEntityId?: unknown;
  statuses?: unknown;
  transition?: unknown;
  elite?: unknown;
  boss?: unknown;
  appliedAtTick?: unknown;
  expiresAtTick?: unknown;
  magnitude?: unknown;
  atTick?: unknown;
  activeWaveId?: unknown;
  startedWaveIds?: unknown;
  pendingSpawnCount?: unknown;
  livingHostileCount?: unknown;
  terminalResult?: unknown;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: UnknownRecord, keys: readonly string[]): boolean {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[a-z0-9][a-z0-9._:-]*$/.test(value)
  );
}

function isCoordinate(value: unknown): value is number {
  return Number.isSafeInteger(value) && Math.abs(value as number) <= 1_000_000;
}

function isTick(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isBoundedCount(value: unknown): value is number {
  return isTick(value) && value <= 10_000;
}

function hasCanonicalUniqueIds(
  values: readonly { readonly id: string }[]
): boolean {
  return values.every((value, index) => {
    const previous = values[index - 1];
    return (
      index === 0 ||
      (previous !== undefined && compareRenderIds(previous.id, value.id) < 0)
    );
  });
}

function parseNodes(value: unknown): readonly RenderNode[] | undefined {
  if (!Array.isArray(value) || value.length > 4096) return undefined;
  const nodes: RenderNode[] = [];
  for (const node of value) {
    if (
      !isRecord(node) ||
      !hasExactKeys(node, ["id", "x", "y"]) ||
      !isIdentifier(node.id) ||
      !isCoordinate(node.x) ||
      !isCoordinate(node.y)
    )
      return undefined;
    nodes.push({ id: node.id, x: node.x, y: node.y });
  }
  return hasCanonicalUniqueIds(nodes) ? nodes : undefined;
}

function parseConnections(
  value: unknown,
  nodeIds: ReadonlySet<string>
): readonly RenderConnection[] | undefined {
  if (!Array.isArray(value) || value.length > 8192) return undefined;
  const connections: RenderConnection[] = [];
  for (const connection of value) {
    if (
      !isRecord(connection) ||
      !hasExactKeys(connection, ["fromNodeId", "id", "toNodeId"]) ||
      !isIdentifier(connection.id) ||
      !isIdentifier(connection.fromNodeId) ||
      !isIdentifier(connection.toNodeId) ||
      !nodeIds.has(connection.fromNodeId) ||
      !nodeIds.has(connection.toNodeId) ||
      connection.fromNodeId === connection.toNodeId
    )
      return undefined;
    connections.push({
      id: connection.id,
      fromNodeId: connection.fromNodeId,
      toNodeId: connection.toNodeId
    });
  }
  return hasCanonicalUniqueIds(connections) ? connections : undefined;
}

function parseV1(value: UnknownRecord): RenderSnapshotV1 | undefined {
  if (
    !hasExactKeys(value, [
      "connections",
      "entities",
      "levelId",
      "mapId",
      "nodes",
      "phase",
      "schemaVersion",
      "tick"
    ]) ||
    value.schemaVersion !== 1 ||
    !isIdentifier(value.levelId) ||
    (value.mapId !== null && !isIdentifier(value.mapId)) ||
    !isTick(value.tick) ||
    (value.phase !== "preparation" &&
      value.phase !== "running" &&
      value.phase !== "terminal")
  )
    return undefined;
  const nodes = parseNodes(value.nodes);
  if (nodes === undefined) return undefined;
  const nodeIds = new Set(nodes.map((node) => node.id));
  const connections = parseConnections(value.connections, nodeIds);
  if (
    connections === undefined ||
    !Array.isArray(value.entities) ||
    value.entities.length > 4096
  )
    return undefined;
  const entities: RenderEntity[] = [];
  for (const entity of value.entities) {
    if (
      !isRecord(entity) ||
      !hasExactKeys(entity, ["faction", "id", "nodeId"]) ||
      !isIdentifier(entity.id) ||
      !isIdentifier(entity.nodeId) ||
      !nodeIds.has(entity.nodeId) ||
      (entity.faction !== "dwarf" &&
        entity.faction !== "enemy" &&
        entity.faction !== "deployable")
    )
      return undefined;
    entities.push({
      id: entity.id,
      nodeId: entity.nodeId,
      faction: entity.faction
    });
  }
  if (!hasCanonicalUniqueIds(entities)) return undefined;
  return {
    schemaVersion: 1,
    levelId: value.levelId,
    mapId: value.mapId,
    tick: value.tick,
    phase: value.phase,
    nodes,
    connections,
    entities
  };
}

function parsePosition(value: unknown): RenderPosition | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["nodeId", "x", "y"]) ||
    !isIdentifier(value.nodeId) ||
    !isCoordinate(value.x) ||
    !isCoordinate(value.y)
  )
    return undefined;
  return { nodeId: value.nodeId, x: value.x, y: value.y };
}

function parseStatuses(value: unknown): readonly RenderStatus[] | undefined {
  if (!Array.isArray(value) || value.length > 128) return undefined;
  const statuses: RenderStatus[] = [];
  for (const status of value) {
    if (
      !isRecord(status) ||
      !hasExactKeys(status, [
        "appliedAtTick",
        "expiresAtTick",
        "id",
        "magnitude"
      ]) ||
      !isIdentifier(status.id) ||
      !isTick(status.appliedAtTick) ||
      !isTick(status.expiresAtTick) ||
      status.expiresAtTick < status.appliedAtTick ||
      !Number.isSafeInteger(status.magnitude)
    )
      return undefined;
    statuses.push({
      id: status.id,
      appliedAtTick: status.appliedAtTick,
      expiresAtTick: status.expiresAtTick,
      magnitude: status.magnitude as number
    });
  }
  return hasCanonicalUniqueIds(statuses) ? statuses : undefined;
}

function parseV2Entity(
  value: unknown,
  nodesById: ReadonlyMap<string, RenderNode>,
  tick: number
): RenderEntityV2 | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "action",
      "archetype",
      "boss",
      "currentHealth",
      "elite",
      "facing",
      "faction",
      "id",
      "maximumHealth",
      "nodeId",
      "position",
      "previousPosition",
      "statuses",
      "targetEntityId",
      "transition",
      "visualId"
    ]) ||
    !isIdentifier(value.id) ||
    !isIdentifier(value.nodeId) ||
    !nodesById.has(value.nodeId) ||
    (value.faction !== "dwarf" &&
      value.faction !== "enemy" &&
      value.faction !== "deployable") ||
    !isIdentifier(value.visualId) ||
    (value.archetype !== "character" &&
      value.archetype !== "basic" &&
      value.archetype !== "elite" &&
      value.archetype !== "boss" &&
      value.archetype !== "deployable") ||
    !isTick(value.currentHealth) ||
    !isTick(value.maximumHealth) ||
    value.currentHealth > value.maximumHealth ||
    (value.facing !== "north" &&
      value.facing !== "east" &&
      value.facing !== "south" &&
      value.facing !== "west") ||
    (value.transition !== "spawned" &&
      value.transition !== "active" &&
      value.transition !== "moving") ||
    typeof value.elite !== "boolean" ||
    typeof value.boss !== "boolean" ||
    (value.targetEntityId !== null && !isIdentifier(value.targetEntityId))
  )
    return undefined;
  const position = parsePosition(value.position);
  const previousPosition =
    value.previousPosition === null
      ? null
      : parsePosition(value.previousPosition);
  const statuses = parseStatuses(value.statuses);
  const authoredPosition = nodesById.get(value.nodeId);
  const authoredPreviousPosition =
    previousPosition === null || previousPosition === undefined
      ? undefined
      : nodesById.get(previousPosition.nodeId);
  if (
    position === undefined ||
    position.nodeId !== value.nodeId ||
    previousPosition === undefined ||
    statuses === undefined ||
    authoredPosition === undefined ||
    position.x !== authoredPosition.x ||
    position.y !== authoredPosition.y ||
    (previousPosition !== null &&
      (authoredPreviousPosition === undefined ||
        previousPosition.x !== authoredPreviousPosition.x ||
        previousPosition.y !== authoredPreviousPosition.y)) ||
    statuses.some(
      (status) => status.appliedAtTick > tick || status.expiresAtTick < tick
    ) ||
    !isRecord(value.action) ||
    (!hasExactKeys(value.action, ["abilityId", "kind", "phase"]) &&
      !hasExactKeys(value.action, [
        "abilityId",
        "impactTargetEntityIds",
        "kind",
        "phase"
      ])) ||
    (value.action.kind !== "idle" &&
      value.action.kind !== "moving" &&
      value.action.kind !== "basic_attack" &&
      value.action.kind !== "ability") ||
    (value.action.phase !== "idle" &&
      value.action.phase !== "windup" &&
      value.action.phase !== "committed" &&
      value.action.phase !== "impact" &&
      value.action.phase !== "recoil" &&
      value.action.phase !== "recovery") ||
    (value.action.abilityId !== null &&
      !isIdentifier(value.action.abilityId)) ||
    (value.action["impactTargetEntityIds"] !== undefined &&
      !Array.isArray(value.action["impactTargetEntityIds"])) ||
    (Array.isArray(value.action["impactTargetEntityIds"]) &&
      value.action["impactTargetEntityIds"].length > 4096) ||
    (Array.isArray(value.action["impactTargetEntityIds"]) &&
      !value.action["impactTargetEntityIds"].every(isIdentifier)) ||
    !hasCanonicalUniqueIds(
      (Array.isArray(value.action["impactTargetEntityIds"])
        ? value.action["impactTargetEntityIds"]
        : []
      ).map((id) => ({ id }))
    )
  )
    return undefined;
  const moved =
    previousPosition !== null && previousPosition.nodeId !== position.nodeId;
  if (
    (value.faction === "dwarf" &&
      (value.archetype !== "character" || value.elite || value.boss)) ||
    (value.faction === "enemy" &&
      (value.archetype === "character" || value.archetype === "deployable")) ||
    (value.faction === "deployable" && value.archetype !== "deployable") ||
    value.elite !== (value.archetype === "elite") ||
    value.boss !== (value.archetype === "boss") ||
    (value.action.kind === "ability") !== (value.action.abilityId !== null) ||
    ((value.action.kind === "idle" || value.action.kind === "moving") &&
      value.action.phase !== "idle") ||
    ((value.action.kind === "basic_attack" ||
      value.action.kind === "ability") &&
      value.action.phase === "idle") ||
    (value.action.phase !== "impact" &&
      Array.isArray(value.action["impactTargetEntityIds"]) &&
      value.action["impactTargetEntityIds"].length > 0) ||
    (value.transition === "spawned") !== (previousPosition === null) ||
    (value.transition === "moving") !== moved ||
    (value.transition === "active" && (previousPosition === null || moved))
  )
    return undefined;
  return {
    id: value.id,
    nodeId: value.nodeId,
    faction: value.faction,
    visualId: value.visualId,
    archetype: value.archetype,
    position,
    previousPosition,
    currentHealth: value.currentHealth,
    maximumHealth: value.maximumHealth,
    facing: value.facing,
    action: {
      kind: value.action.kind,
      phase: value.action.phase,
      abilityId: value.action.abilityId,
      ...(Array.isArray(value.action["impactTargetEntityIds"])
        ? {
            impactTargetEntityIds: value.action[
              "impactTargetEntityIds"
            ] as string[]
          }
        : {})
    },
    targetEntityId: value.targetEntityId,
    statuses,
    transition: value.transition,
    elite: value.elite,
    boss: value.boss
  };
}

function parseTransitions(
  value: unknown,
  tick: number
): readonly RenderEntityTransition[] | undefined {
  if (!Array.isArray(value) || value.length > 4096) return undefined;
  const transitions: RenderEntityTransition[] = [];
  for (const transition of value) {
    if (
      !isRecord(transition) ||
      !hasExactKeys(transition, ["atTick", "entityId", "kind"]) ||
      !isIdentifier(transition.entityId) ||
      (transition.kind !== "spawned" &&
        transition.kind !== "downed" &&
        transition.kind !== "destroyed") ||
      transition.atTick !== tick
    )
      return undefined;
    transitions.push({
      entityId: transition.entityId,
      kind: transition.kind,
      atTick: tick
    });
  }
  return hasCanonicalUniqueIds(
    transitions.map((transition) => ({ id: transition.entityId }))
  )
    ? transitions
    : undefined;
}

function parseEncounter(value: unknown): RenderEncounter | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "activeWaveId",
      "livingHostileCount",
      "pendingSpawnCount",
      "startedWaveIds",
      "terminalResult"
    ]) ||
    !Array.isArray(value.startedWaveIds) ||
    value.startedWaveIds.length > 1024 ||
    !value.startedWaveIds.every(isIdentifier) ||
    !hasCanonicalUniqueIds(value.startedWaveIds.map((id) => ({ id }))) ||
    (value.activeWaveId !== null && !isIdentifier(value.activeWaveId)) ||
    (value.activeWaveId !== null &&
      !value.startedWaveIds.includes(value.activeWaveId)) ||
    !isBoundedCount(value.pendingSpawnCount) ||
    !isBoundedCount(value.livingHostileCount) ||
    (value.terminalResult !== null &&
      value.terminalResult !== "victory" &&
      value.terminalResult !== "defeat")
  )
    return undefined;
  return {
    startedWaveIds: value.startedWaveIds as string[],
    activeWaveId: value.activeWaveId,
    pendingSpawnCount: value.pendingSpawnCount,
    livingHostileCount: value.livingHostileCount,
    terminalResult: value.terminalResult
  };
}

function parseV2(value: UnknownRecord): RenderSnapshotV2 | undefined {
  if (
    !hasExactKeys(value, [
      "connections",
      "encounter",
      "entities",
      "entityTransitions",
      "levelId",
      "mapId",
      "nodes",
      "phase",
      "previousTick",
      "scenarioId",
      "schemaVersion",
      "tick"
    ]) ||
    value.schemaVersion !== 2 ||
    !isIdentifier(value.scenarioId) ||
    !isIdentifier(value.levelId) ||
    (value.mapId !== null && !isIdentifier(value.mapId)) ||
    !isTick(value.tick) ||
    (value.previousTick !== null && !isTick(value.previousTick)) ||
    (typeof value.previousTick === "number" &&
      value.previousTick >= value.tick) ||
    (value.phase !== "preparation" &&
      value.phase !== "running" &&
      value.phase !== "terminal")
  )
    return undefined;
  const nodes = parseNodes(value.nodes);
  if (nodes === undefined) return undefined;
  const nodeIds = new Set(nodes.map((node) => node.id));
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const connections = parseConnections(value.connections, nodeIds);
  if (
    connections === undefined ||
    !Array.isArray(value.entities) ||
    value.entities.length > 4096
  )
    return undefined;
  const entities: RenderEntityV2[] = [];
  for (const candidate of value.entities) {
    const entity = parseV2Entity(candidate, nodesById, value.tick);
    if (entity === undefined) return undefined;
    entities.push(entity);
  }
  const transitions = parseTransitions(value.entityTransitions, value.tick);
  const encounter = parseEncounter(value.encounter);
  if (
    !hasCanonicalUniqueIds(entities) ||
    transitions === undefined ||
    encounter === undefined
  )
    return undefined;
  const entityIds = new Set(entities.map((entity) => entity.id));
  const enemyEntityIds = new Set(
    entities.filter((entity) => entity.faction === "enemy").map(({ id }) => id)
  );
  const departedEntityIds = new Set(
    transitions
      .filter(
        (transition) =>
          transition.kind === "downed" || transition.kind === "destroyed"
      )
      .map(({ entityId }) => entityId)
  );
  if (
    entities.some(
      (entity) =>
        entity.targetEntityId !== null &&
        (entity.targetEntityId === entity.id ||
          !entityIds.has(entity.targetEntityId))
    ) ||
    entities.some((entity) => {
      const impactTargetEntityIds = entity.action.impactTargetEntityIds ?? [];
      return (
        impactTargetEntityIds.length > 0 &&
        (entity.faction !== "dwarf" ||
          entity.action.kind !== "ability" ||
          entity.action.abilityId !== "ability.iron_warden.shield_slam" ||
          entity.action.phase !== "impact" ||
          impactTargetEntityIds.some(
            (id) =>
              !enemyEntityIds.has(id) &&
              (!departedEntityIds.has(id) || !id.startsWith("entity.enemy."))
          ))
      );
    }) ||
    transitions.some((transition) =>
      transition.kind === "spawned"
        ? !entityIds.has(transition.entityId) ||
          entities.find((entity) => entity.id === transition.entityId)
            ?.transition !== "spawned"
        : entityIds.has(transition.entityId)
    ) ||
    entities.some(
      (entity) =>
        entity.transition === "spawned" &&
        !transitions.some(
          (transition) =>
            transition.entityId === entity.id && transition.kind === "spawned"
        )
    ) ||
    (value.previousTick === null &&
      entities.some((entity) => entity.previousPosition !== null)) ||
    encounter.livingHostileCount !==
      entities.filter((entity) => entity.faction === "enemy").length ||
    (encounter.startedWaveIds.length === 0) !==
      (encounter.activeWaveId === null) ||
    (value.phase !== "terminal" && encounter.terminalResult !== null) ||
    (value.phase === "terminal" && encounter.terminalResult === null)
  )
    return undefined;
  return {
    schemaVersion: 2,
    scenarioId: value.scenarioId,
    levelId: value.levelId,
    mapId: value.mapId,
    tick: value.tick,
    previousTick: value.previousTick,
    phase: value.phase,
    nodes,
    connections,
    entities,
    entityTransitions: transitions,
    encounter
  };
}

export function parseRenderSnapshot(
  value: unknown
): RenderSnapshot | undefined {
  if (!isRecord(value)) return undefined;
  if (value.schemaVersion === 1) return parseV1(value);
  if (value.schemaVersion === 2) return parseV2(value);
  return undefined;
}
