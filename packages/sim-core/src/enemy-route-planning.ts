import type {
  BattlefieldMapDefinition,
  EnemyRoutePlanningDecision,
  EnemyRoutePlanningRequest,
  NavigationNodeDefinition,
  NavigationNodeId
} from "@dwarven-depths/contracts";
import { hasLineOfSight, isAimPointInRange } from "./range-line-of-sight.js";

const nodeIdPattern = /^node\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const placementIdPattern = /^placement\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

interface ParsedRequest {
  readonly schemaVersion: unknown;
  readonly map: unknown;
  readonly sourceNodeId: unknown;
  readonly targetPlacementPointId: unknown;
  readonly range: unknown;
  readonly requiresLineOfSight: unknown;
  readonly blockedNodeIds: unknown;
}

function requireRequest(value: unknown): ParsedRequest {
  if (
    value === null ||
    typeof value !== "object" ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    throw new TypeError("enemy route request must be a plain object");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const expected = [
    "schemaVersion",
    "map",
    "sourceNodeId",
    "targetPlacementPointId",
    "range",
    "requiresLineOfSight",
    "blockedNodeIds"
  ].sort();
  const actual = Reflect.ownKeys(value);
  if (
    actual.some((key) => typeof key !== "string") ||
    actual.length !== expected.length ||
    actual
      .map(String)
      .sort()
      .some((key, index) => key !== expected[index])
  )
    throw new TypeError(
      "enemy route request must contain exactly the expected keys"
    );
  const result: Record<string, unknown> = {};
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    )
      throw new TypeError(
        `enemy route request.${key} must be own enumerable data`
      );
    result[key] = descriptor.value;
  }
  return result as unknown as ParsedRequest;
}

function requireBlockedNodes(value: unknown): readonly NavigationNodeId[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    throw new TypeError("blockedNodeIds must be a standard array");
  if (Reflect.ownKeys(value).length !== value.length + 1)
    throw new TypeError("blockedNodeIds must be a dense data array");
  const result: NavigationNodeId[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "string" ||
      !nodeIdPattern.test(descriptor.value)
    )
      throw new RangeError(
        `blockedNodeIds[${index}] must be a node.* stable ID`
      );
    result.push(descriptor.value as NavigationNodeId);
  }
  return result;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareOrder(
  left: readonly number[],
  right: readonly number[]
): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] as number) - (right[index] as number);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

interface RouteLabel {
  readonly nodeId: NavigationNodeId;
  readonly cost: number;
  readonly authoredOrder: readonly number[];
  readonly path: readonly NavigationNodeId[];
}

function compareLabels(left: RouteLabel, right: RouteLabel): number {
  return (
    left.cost - right.cost ||
    compareOrder(left.authoredOrder, right.authoredOrder) ||
    compareText(left.nodeId, right.nodeId)
  );
}

function connectionKey(
  left: NavigationNodeId,
  right: NavigationNodeId
): string {
  return left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;
}

function freezeDecision(
  status: EnemyRoutePlanningDecision["status"],
  reason: EnemyRoutePlanningDecision["reason"],
  sourceNodeId: NavigationNodeId,
  targetPlacementPointId: EnemyRoutePlanningDecision["targetPlacementPointId"],
  label?: RouteLabel
): EnemyRoutePlanningDecision {
  const path = label === undefined ? [] : [...label.path];
  return Object.freeze({
    schemaVersion: 1,
    status,
    reason,
    sourceNodeId,
    targetPlacementPointId,
    pathCost: label?.cost ?? null,
    pathNodeIds: Object.freeze(path),
    nextNodeId: path[1] ?? null,
    attackPositionNodeId: label?.nodeId ?? null
  });
}

/**
 * Finds one minimum-cost route to an attack-valid node. Solid blockers and the
 * target's own placement node are never traversed; enemy congestion is left to
 * the movement-reservation phase.
 */
export function planEnemyRoute(
  request: EnemyRoutePlanningRequest
): EnemyRoutePlanningDecision {
  const record = requireRequest(request);
  if (record.schemaVersion !== 1)
    throw new RangeError("enemy route request has unsupported schemaVersion");
  const map = record.map as BattlefieldMapDefinition;
  if (typeof map !== "object" || map === null)
    throw new TypeError("enemy route request map must be an authored map");
  const sourceNodeId = record.sourceNodeId;
  if (typeof sourceNodeId !== "string" || !nodeIdPattern.test(sourceNodeId))
    throw new RangeError("enemy route sourceNodeId must be a node.* stable ID");
  const targetPlacementPointId = record.targetPlacementPointId;
  if (
    typeof targetPlacementPointId !== "string" ||
    !placementIdPattern.test(targetPlacementPointId)
  )
    throw new RangeError(
      "enemy route targetPlacementPointId must be a placement.* stable ID"
    );
  if (typeof record.requiresLineOfSight !== "boolean")
    throw new TypeError("enemy route requiresLineOfSight must be boolean");

  const nodes = new Map<NavigationNodeId, NavigationNodeDefinition>();
  for (let index = 0; index < map.nodes.length; index += 1) {
    const node = map.nodes[index];
    if (node !== undefined) nodes.set(node.id, node);
  }
  const source = nodes.get(sourceNodeId as NavigationNodeId);
  if (source === undefined)
    throw new RangeError(`unknown enemy route source node (${sourceNodeId})`);
  let targetPlacement:
    | BattlefieldMapDefinition["placementPoints"][number]
    | undefined;
  for (let index = 0; index < map.placementPoints.length; index += 1) {
    const placement = map.placementPoints[index];
    if (placement?.id === targetPlacementPointId) targetPlacement = placement;
  }
  if (targetPlacement === undefined)
    throw new RangeError(
      `unknown enemy route target placement (${targetPlacementPointId})`
    );
  const targetNode = nodes.get(targetPlacement.nodeId);
  if (targetNode === undefined)
    throw new RangeError(
      "enemy route target placement references an unknown node"
    );

  const blockedList = requireBlockedNodes(record.blockedNodeIds);
  const blocked = new Set<NavigationNodeId>();
  for (const nodeId of blockedList) {
    if (!nodes.has(nodeId))
      throw new RangeError(`unknown blocked navigation node (${nodeId})`);
    if (blocked.has(nodeId))
      throw new RangeError(`duplicate blocked navigation node (${nodeId})`);
    blocked.add(nodeId);
  }
  if (blocked.has(source.id))
    throw new RangeError("enemy route source node cannot be blocked");
  blocked.add(targetNode.id);

  const costs = new Map<string, number>();
  for (let index = 0; index < map.connections.length; index += 1) {
    const connection = map.connections[index];
    if (connection === undefined) continue;
    costs.set(
      connectionKey(connection.nodeIds[0], connection.nodeIds[1]),
      connection.cost
    );
  }
  const attackPositions = new Set<NavigationNodeId>();
  for (const node of nodes.values()) {
    if (blocked.has(node.id)) continue;
    if (
      isAimPointInRange(
        map,
        node.aimPointId,
        targetNode.aimPointId,
        record.range as number
      ) &&
      (!record.requiresLineOfSight ||
        hasLineOfSight(map, node.aimPointId, targetNode.aimPointId))
    )
      attackPositions.add(node.id);
  }

  const initial: RouteLabel = Object.freeze({
    nodeId: source.id,
    cost: 0,
    authoredOrder: Object.freeze([]),
    path: Object.freeze([source.id])
  });
  const best = new Map<NavigationNodeId, RouteLabel>([[source.id, initial]]);
  const frontier: RouteLabel[] = [initial];
  while (frontier.length > 0) {
    frontier.sort(compareLabels);
    const current = frontier.shift() as RouteLabel;
    if (best.get(current.nodeId) !== current) continue;
    if (attackPositions.has(current.nodeId)) {
      return freezeDecision(
        current.path.length === 1 ? "attack_position_reached" : "route_found",
        current.path.length === 1
          ? "already_attack_valid"
          : "minimum_cost_route",
        source.id,
        targetPlacement.id,
        current
      );
    }
    const node = nodes.get(current.nodeId) as NavigationNodeDefinition;
    for (let index = 0; index < node.neighborNodeIds.length; index += 1) {
      const neighborId = node.neighborNodeIds[index] as NavigationNodeId;
      if (blocked.has(neighborId)) continue;
      const edgeCost = costs.get(connectionKey(node.id, neighborId));
      if (edgeCost === undefined)
        throw new RangeError(
          `enemy route is missing authored connection cost (${node.id}, ${neighborId})`
        );
      const cost = current.cost + edgeCost;
      if (!Number.isSafeInteger(cost))
        throw new RangeError(
          "enemy route path cost exceeds safe integer bounds"
        );
      const candidate: RouteLabel = Object.freeze({
        nodeId: neighborId,
        cost,
        authoredOrder: Object.freeze([...current.authoredOrder, index]),
        path: Object.freeze([...current.path, neighborId])
      });
      const existing = best.get(neighborId);
      if (existing === undefined || compareLabels(candidate, existing) < 0) {
        best.set(neighborId, candidate);
        frontier.push(candidate);
      }
    }
  }
  return freezeDecision(
    "unreachable",
    "no_attack_position_reachable",
    source.id,
    targetPlacement.id
  );
}
