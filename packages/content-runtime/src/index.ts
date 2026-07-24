import {
  ContentValidationError,
  validateContentBundle,
  validateReplay,
  validateScenario
} from "@dwarven-depths/content-schema";
import type {
  ReplayDefinition,
  ScenarioDefinition
} from "@dwarven-depths/contracts";
import {
  type BattlefieldMapDefinition,
  type ContentBundle,
  type ContentDefinition,
  canonicalHash,
  type EnemyEntranceId,
  type LevelDefinition,
  type NavigationNodeDefinition,
  type NavigationNodeId,
  type PlacementPointDefinition,
  type PlacementPointId,
  type StableId,
  type StaticDwarfPlacement,
  type StaticPlacementIssue,
  type StaticPlacementValidation,
  type WaveDefinition
} from "@dwarven-depths/contracts";

export { ContentValidationError } from "@dwarven-depths/content-schema";

class ReadonlyMapView<Key, Value> implements ReadonlyMap<Key, Value> {
  readonly #source: Map<Key, Value>;

  constructor(source: Map<Key, Value>) {
    this.#source = source;
  }

  get size(): number {
    return this.#source.size;
  }

  get(key: Key): Value | undefined {
    return this.#source.get(key);
  }

  has(key: Key): boolean {
    return this.#source.has(key);
  }

  entries(): MapIterator<[Key, Value]> {
    return this.#source.entries();
  }

  keys(): MapIterator<Key> {
    return this.#source.keys();
  }

  values(): MapIterator<Value> {
    return this.#source.values();
  }

  forEach(
    callback: (value: Value, key: Key, map: ReadonlyMap<Key, Value>) => void,
    thisArg?: unknown
  ): void {
    for (const [key, value] of this.#source) {
      callback.call(thisArg, value, key, this);
    }
  }

  [Symbol.iterator](): MapIterator<[Key, Value]> {
    return this.entries();
  }
}

function compareIds(
  left: { readonly id: string },
  right: { readonly id: string }
): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function freezeMap(
  definition: BattlefieldMapDefinition
): BattlefieldMapDefinition {
  return Object.freeze({
    kind: "map",
    id: definition.id,
    nodes: Object.freeze(
      definition.nodes
        .map((node) =>
          Object.freeze({
            ...node,
            neighborNodeIds: Object.freeze([...node.neighborNodeIds])
          })
        )
        .sort(compareIds)
    ),
    connections: Object.freeze(
      definition.connections
        .map((connection) => {
          const nodeIds = [...connection.nodeIds].sort() as [
            NavigationNodeId,
            NavigationNodeId
          ];
          return Object.freeze({
            ...connection,
            nodeIds: Object.freeze(nodeIds)
          });
        })
        .sort(compareIds)
    ),
    placementPoints: Object.freeze(
      definition.placementPoints
        .map((point) =>
          Object.freeze({
            ...point,
            adjacentPlacementPointIds: Object.freeze(
              [...point.adjacentPlacementPointIds].sort()
            )
          })
        )
        .sort(compareIds)
    ),
    enemyEntrances: Object.freeze(
      definition.enemyEntrances
        .map((entrance) => Object.freeze({ ...entrance }))
        .sort(compareIds)
    ),
    aimPoints: Object.freeze(
      definition.aimPoints
        .map((point) => Object.freeze({ ...point }))
        .sort(compareIds)
    ),
    opaqueRegions: Object.freeze(
      definition.opaqueRegions
        .map((region) => Object.freeze({ ...region }))
        .sort(compareIds)
    )
  });
}

function freezeDefinition(definition: ContentDefinition): ContentDefinition {
  if (definition.kind === "map") return freezeMap(definition);
  return definition.kind === "level"
    ? Object.freeze({
        ...definition,
        waveIds: Object.freeze([...definition.waveIds])
      })
    : Object.freeze({
        ...definition,
        spawnEvents: Object.freeze(
          definition.spawnEvents
            .map((event) => Object.freeze({ ...event }))
            .sort(
              (left, right) =>
                left.authoredOrder - right.authoredOrder ||
                compareIds(left, right)
            )
        )
      });
}

export interface CompiledContent {
  readonly bundle: ContentBundle;
  readonly manifestHash: string;
  readonly levels: ReadonlyMap<StableId, LevelDefinition>;
  readonly waves: ReadonlyMap<StableId, WaveDefinition>;
  readonly maps: ReadonlyMap<StableId, BattlefieldMapDefinition>;
}

export interface NavigationRoute {
  readonly nodeIds: readonly NavigationNodeId[];
  readonly totalCost: number;
}

export interface NavigationRouteOptions {
  /** Nodes that cannot be entered while evaluating this route. */
  readonly blockedNodeIds?: readonly NavigationNodeId[];
}

export interface StaticAttackRoute {
  readonly entityId: StaticDwarfPlacement["entityId"];
  readonly placementPointId: StaticDwarfPlacement["placementPointId"];
  readonly approachNodeId: NavigationNodeId;
  readonly route: NavigationRoute;
}

function connectionKey(
  leftId: NavigationNodeId,
  rightId: NavigationNodeId
): string {
  return leftId < rightId
    ? `${leftId}\u0000${rightId}`
    : `${rightId}\u0000${leftId}`;
}

function indexMap(map: BattlefieldMapDefinition): {
  readonly nodes: ReadonlyMap<NavigationNodeId, NavigationNodeDefinition>;
  readonly connectionCosts: ReadonlyMap<string, number>;
} {
  return {
    nodes: new Map(map.nodes.map((node) => [node.id, node])),
    connectionCosts: new Map(
      map.connections.map((connection) => [
        connectionKey(connection.nodeIds[0], connection.nodeIds[1]),
        connection.cost
      ])
    )
  };
}

function addRouteCost(total: number, cost: number): number {
  const result = total + cost;
  if (!Number.isSafeInteger(result))
    throw new RangeError("route cost exceeds the safe-integer range");
  return result;
}

function compareRoutePriority(
  left: readonly number[],
  right: readonly number[]
): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftRank = left[index];
    const rightRank = right[index];
    if (leftRank !== rightRank)
      return (
        (leftRank ?? Number.MAX_SAFE_INTEGER) -
        (rightRank ?? Number.MAX_SAFE_INTEGER)
      );
  }
  return left.length - right.length;
}

export function calculateRouteCost(
  map: BattlefieldMapDefinition,
  nodeIds: readonly NavigationNodeId[]
): number {
  const { nodes, connectionCosts } = indexMap(map);
  for (const nodeId of nodeIds) {
    if (!nodes.has(nodeId))
      throw new RangeError(
        `route references unknown navigation node ID (${nodeId})`
      );
  }

  let totalCost = 0;
  for (let index = 1; index < nodeIds.length; index += 1) {
    const previousId = nodeIds[index - 1];
    const nodeId = nodeIds[index];
    if (previousId === undefined || nodeId === undefined)
      throw new RangeError("route contains a missing navigation node ID");
    const cost = connectionCosts.get(connectionKey(previousId, nodeId));
    if (cost === undefined)
      throw new RangeError(
        `route step ${previousId} -> ${nodeId} has no authored connection`
      );
    totalCost = addRouteCost(totalCost, cost);
  }
  return totalCost;
}

/**
 * Finds a minimum-cost route through an authored undirected graph. Equal-cost
 * candidates retain first discovery order, which is derived exclusively from
 * each node's authored neighbor order.
 */
export function findShortestRoute(
  map: BattlefieldMapDefinition,
  startNodeId: NavigationNodeId,
  goalNodeId: NavigationNodeId,
  options: NavigationRouteOptions = {}
): NavigationRoute | undefined {
  const { nodes, connectionCosts } = indexMap(map);
  if (!nodes.has(startNodeId))
    throw new RangeError(`unknown start navigation node ID (${startNodeId})`);
  if (!nodes.has(goalNodeId))
    throw new RangeError(`unknown goal navigation node ID (${goalNodeId})`);

  const blockedNodeIds = new Set<NavigationNodeId>();
  for (const blockedNodeId of options.blockedNodeIds ?? []) {
    if (!nodes.has(blockedNodeId)) {
      throw new RangeError(
        `blocked route references unknown navigation node ID (${blockedNodeId})`
      );
    }
    blockedNodeIds.add(blockedNodeId);
  }
  if (blockedNodeIds.has(startNodeId) || blockedNodeIds.has(goalNodeId)) {
    return undefined;
  }

  const distances = new Map<NavigationNodeId, number>([[startNodeId, 0]]);
  const startRoutePriority: readonly number[] = [];
  const routePriorities = new Map<NavigationNodeId, readonly number[]>([
    [startNodeId, startRoutePriority]
  ]);
  const previous = new Map<NavigationNodeId, NavigationNodeId>();
  const pending: Array<{
    readonly nodeId: NavigationNodeId;
    readonly cost: number;
    readonly routePriority: readonly number[];
  }> = [{ nodeId: startNodeId, cost: 0, routePriority: startRoutePriority }];

  while (pending.length > 0) {
    let selectedIndex = 0;
    for (let index = 1; index < pending.length; index += 1) {
      const candidate = pending[index];
      const selected = pending[selectedIndex];
      if (
        candidate !== undefined &&
        selected !== undefined &&
        (candidate.cost < selected.cost ||
          (candidate.cost === selected.cost &&
            compareRoutePriority(
              candidate.routePriority,
              selected.routePriority
            ) < 0))
      )
        selectedIndex = index;
    }
    const [current] = pending.splice(selectedIndex, 1);
    if (current === undefined) break;
    if (
      distances.get(current.nodeId) !== current.cost ||
      routePriorities.get(current.nodeId) !== current.routePriority
    )
      continue;

    if (current.nodeId === goalNodeId) {
      const route = [goalNodeId];
      let cursor = goalNodeId;
      while (cursor !== startNodeId) {
        const predecessor = previous.get(cursor);
        if (predecessor === undefined)
          throw new Error("shortest-route predecessor chain is incomplete");
        route.push(predecessor);
        cursor = predecessor;
      }
      route.reverse();
      return Object.freeze({
        nodeIds: Object.freeze(route),
        totalCost: current.cost
      });
    }

    const node = nodes.get(current.nodeId);
    if (node === undefined) continue;
    node.neighborNodeIds.forEach((neighborNodeId, neighborIndex) => {
      if (blockedNodeIds.has(neighborNodeId)) return;
      const edgeCost = connectionCosts.get(
        connectionKey(current.nodeId, neighborNodeId)
      );
      if (edgeCost === undefined)
        throw new RangeError(
          `neighbor step ${current.nodeId} -> ${neighborNodeId} has no authored connection`
        );
      if (current.cost > Number.MAX_SAFE_INTEGER - edgeCost) return;
      const candidateCost = current.cost + edgeCost;
      const candidatePriority = [...current.routePriority, neighborIndex];
      const knownCost = distances.get(neighborNodeId);
      const knownPriority = routePriorities.get(neighborNodeId);
      if (
        knownCost !== undefined &&
        (candidateCost > knownCost ||
          (candidateCost === knownCost &&
            knownPriority !== undefined &&
            compareRoutePriority(candidatePriority, knownPriority) >= 0))
      )
        return;
      distances.set(neighborNodeId, candidateCost);
      routePriorities.set(neighborNodeId, candidatePriority);
      previous.set(neighborNodeId, current.nodeId);
      pending.push({
        nodeId: neighborNodeId,
        cost: candidateCost,
        routePriority: candidatePriority
      });
    });
  }

  return undefined;
}

function freezePlacementValidation(
  issues: readonly StaticPlacementIssue[]
): StaticPlacementValidation {
  const frozenIssues = Object.freeze(
    issues.map((issue) =>
      Object.freeze({
        ...issue,
        ...(issue.relatedPaths === undefined
          ? {}
          : { relatedPaths: Object.freeze([...issue.relatedPaths]) })
      })
    )
  );
  return Object.freeze({
    valid: frozenIssues.length === 0,
    issues: frozenIssues
  });
}

function entranceHasAttackRoute(
  entranceNodeId: NavigationNodeId,
  occupiedNodeIds: ReadonlySet<NavigationNodeId>,
  nodes: ReadonlyMap<NavigationNodeId, NavigationNodeDefinition>
): boolean {
  if (occupiedNodeIds.has(entranceNodeId)) return false;
  const visited = new Set<NavigationNodeId>([entranceNodeId]);
  const pending: NavigationNodeId[] = [entranceNodeId];
  let cursor = 0;

  while (cursor < pending.length) {
    const nodeId = pending[cursor];
    cursor += 1;
    if (nodeId === undefined) continue;
    const node = nodes.get(nodeId);
    if (node === undefined) continue;
    for (const neighborNodeId of node.neighborNodeIds) {
      if (occupiedNodeIds.has(neighborNodeId)) return true;
      if (visited.has(neighborNodeId)) continue;
      visited.add(neighborNodeId);
      pending.push(neighborNodeId);
    }
  }

  return false;
}

/**
 * Checks preparation occupancy against immutable authored map connectivity.
 * Placed dwarves block their navigation nodes; an entrance is legal when it can
 * reach an unoccupied node directly connected to at least one placed dwarf.
 */
export function validateStaticPlacement(
  map: BattlefieldMapDefinition,
  placements: readonly StaticDwarfPlacement[]
): StaticPlacementValidation {
  const issues: StaticPlacementIssue[] = [];
  const placementPoints = new Map<PlacementPointId, PlacementPointDefinition>(
    map.placementPoints.map((point) => [point.id, point])
  );
  const firstDwarfIndex = new Map<string, number>();
  const placementIndexes = new Map<PlacementPointId, number[]>();

  placements.forEach((placement, index) => {
    const previousDwarfIndex = firstDwarfIndex.get(placement.entityId);
    if (previousDwarfIndex === undefined)
      firstDwarfIndex.set(placement.entityId, index);
    else
      issues.push({
        path: `$/placements/${index}/entityId`,
        code: "duplicate_dwarf",
        message: `dwarf entity ${placement.entityId} is placed more than once`,
        relatedPaths: [`$/placements/${previousDwarfIndex}/entityId`]
      });

    const point = placementPoints.get(placement.placementPointId);
    if (point === undefined) {
      issues.push({
        path: `$/placements/${index}/placementPointId`,
        code: "unknown_placement_point",
        message: `references unknown placement point ID (${placement.placementPointId})`
      });
      return;
    }

    const indexes = placementIndexes.get(point.id) ?? [];
    if (indexes.length >= point.capacity)
      issues.push({
        path: `$/placements/${index}/placementPointId`,
        code: "placement_capacity_exceeded",
        message: `placement point ${point.id} exceeds capacity ${point.capacity}`,
        relatedPaths: indexes.map(
          (previousIndex) => `$/placements/${previousIndex}/placementPointId`
        )
      });
    indexes.push(index);
    placementIndexes.set(point.id, indexes);
  });

  const occupiedNodeIds = new Set<NavigationNodeId>();
  for (const pointId of placementIndexes.keys()) {
    const point = placementPoints.get(pointId);
    if (point !== undefined) occupiedNodeIds.add(point.nodeId);
  }
  const nodes = new Map(map.nodes.map((node) => [node.id, node]));
  map.enemyEntrances.forEach((entrance, index) => {
    if (!entranceHasAttackRoute(entrance.nodeId, occupiedNodeIds, nodes))
      issues.push({
        path: `$/enemyEntrances/${index}`,
        code: "entrance_has_no_attack_route",
        message: `entrance ${entrance.id} has no static attack route to a placed dwarf`
      });
  });

  return freezePlacementValidation(issues);
}

/**
 * Selects the minimum-cost route from an entrance to an unoccupied node that
 * is directly adjacent to a placed dwarf. Placed dwarves block their authored
 * navigation nodes; equal-cost targets use stable placement and entity IDs.
 */
export function findShortestAttackRoute(
  map: BattlefieldMapDefinition,
  entranceId: EnemyEntranceId,
  placements: readonly StaticDwarfPlacement[]
): StaticAttackRoute | undefined {
  if (!validateStaticPlacement(map, placements).valid) {
    throw new RangeError(
      "static placements must be valid before attack routing"
    );
  }
  const entrance = map.enemyEntrances.find(
    (candidate) => candidate.id === entranceId
  );
  if (entrance === undefined) {
    throw new RangeError(`unknown enemy entrance ID (${entranceId})`);
  }

  const nodes = new Map(map.nodes.map((node) => [node.id, node]));
  const points = new Map(map.placementPoints.map((point) => [point.id, point]));
  const blockedNodeIds = placements.map((placement) => {
    const point = points.get(placement.placementPointId);
    if (point === undefined)
      throw new Error("validated placement point is missing");
    return point.nodeId;
  });
  const candidates: Array<
    StaticAttackRoute & { readonly approachOrder: number }
  > = [];

  for (const placement of placements) {
    const point = points.get(placement.placementPointId);
    if (point === undefined)
      throw new Error("validated placement point is missing");
    const node = nodes.get(point.nodeId);
    if (node === undefined)
      throw new Error("validated placement node is missing");
    node.neighborNodeIds.forEach((approachNodeId, approachOrder) => {
      if (blockedNodeIds.includes(approachNodeId)) return;
      const route = findShortestRoute(map, entrance.nodeId, approachNodeId, {
        blockedNodeIds
      });
      if (route === undefined) return;
      candidates.push({
        entityId: placement.entityId,
        placementPointId: placement.placementPointId,
        approachNodeId,
        route,
        approachOrder
      });
    });
  }

  candidates.sort(
    (left, right) =>
      left.route.totalCost - right.route.totalCost ||
      (left.placementPointId < right.placementPointId
        ? -1
        : left.placementPointId > right.placementPointId
          ? 1
          : 0) ||
      (left.entityId < right.entityId
        ? -1
        : left.entityId > right.entityId
          ? 1
          : 0) ||
      left.approachOrder - right.approachOrder
  );
  const selected = candidates[0];
  if (selected === undefined) return undefined;
  return Object.freeze({
    entityId: selected.entityId,
    placementPointId: selected.placementPointId,
    approachNodeId: selected.approachNodeId,
    route: selected.route
  });
}

export async function compileContent(input: unknown): Promise<CompiledContent> {
  const validated = validateContentBundle(input);
  const definitions = Object.freeze(
    validated.definitions
      .map(freezeDefinition)
      .sort((left, right) =>
        left.id < right.id ? -1 : left.id > right.id ? 1 : 0
      )
  );
  const bundle: ContentBundle = Object.freeze({
    schemaVersion: 1,
    contentVersion: validated.contentVersion,
    definitions
  });
  const levels = new Map<StableId, LevelDefinition>();
  const waves = new Map<StableId, WaveDefinition>();
  const maps = new Map<StableId, BattlefieldMapDefinition>();
  for (const definition of definitions) {
    if (definition.kind === "level") levels.set(definition.id, definition);
    else if (definition.kind === "wave") waves.set(definition.id, definition);
    else maps.set(definition.id, definition);
  }

  return Object.freeze({
    bundle,
    manifestHash: await canonicalHash(bundle),
    levels: Object.freeze(new ReadonlyMapView(levels)),
    waves: Object.freeze(new ReadonlyMapView(waves)),
    maps: Object.freeze(new ReadonlyMapView(maps))
  });
}

export function compileScenario(
  input: unknown,
  content: CompiledContent
): ScenarioDefinition {
  const validated = validateScenario(input);
  const scenario: ScenarioDefinition = Object.freeze({
    ...validated,
    commands: Object.freeze(
      validated.commands.map((command) => Object.freeze({ ...command }))
    )
  });
  if (!content.levels.has(scenario.levelId)) {
    throw new ContentValidationError([
      {
        path: "$/levelId",
        code: "unknown_reference",
        message: `references unknown level ID (${scenario.levelId})`
      }
    ]);
  }
  return scenario;
}

export function compileReplay(input: unknown): ReplayDefinition {
  const validated = validateReplay(input);
  return Object.freeze({
    ...validated,
    commands: Object.freeze(
      validated.commands.map((envelope) =>
        Object.freeze({
          ...envelope,
          command: Object.freeze({ ...envelope.command })
        })
      )
    ),
    checkpoints: Object.freeze(
      validated.checkpoints.map((checkpoint) =>
        Object.freeze({ ...checkpoint })
      )
    )
  });
}
