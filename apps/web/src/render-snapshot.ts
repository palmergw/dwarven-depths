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

export interface RenderSnapshot {
  readonly schemaVersion: 1;
  readonly levelId: string;
  readonly mapId: string | null;
  readonly tick: number;
  readonly phase: RenderPhase;
  readonly nodes: readonly RenderNode[];
  readonly connections: readonly RenderConnection[];
  readonly entities: readonly RenderEntity[];
}

export function compareRenderIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

type UnknownRecord = {
  schemaVersion?: unknown;
  levelId?: unknown;
  mapId?: unknown;
  tick?: unknown;
  phase?: unknown;
  nodes?: unknown;
  connections?: unknown;
  entities?: unknown;
  id?: unknown;
  x?: unknown;
  y?: unknown;
  fromNodeId?: unknown;
  toNodeId?: unknown;
  nodeId?: unknown;
  faction?: unknown;
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

export function parseRenderSnapshot(
  value: unknown
): RenderSnapshot | undefined {
  if (
    !isRecord(value) ||
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
    !Number.isSafeInteger(value.tick) ||
    (value.tick as number) < 0 ||
    (value.phase !== "preparation" &&
      value.phase !== "running" &&
      value.phase !== "terminal") ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.connections) ||
    !Array.isArray(value.entities)
  )
    return undefined;

  const nodes: RenderNode[] = [];
  for (const node of value.nodes) {
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
  if (!hasCanonicalUniqueIds(nodes)) return undefined;
  const nodeIds = new Set(nodes.map((node) => node.id));

  const connections: RenderConnection[] = [];
  for (const connection of value.connections) {
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
  if (!hasCanonicalUniqueIds(connections)) return undefined;

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
    tick: value.tick as number,
    phase: value.phase,
    nodes,
    connections,
    entities
  };
}
