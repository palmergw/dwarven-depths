import { findShortestRoute } from "@dwarven-depths/content-runtime";
import type {
  BattlefieldMapDefinition,
  BattlefieldState,
  NavigationNodeId
} from "@dwarven-depths/contracts";

export type BattlefieldRenderLayer = "map" | "occupancy" | "path";
export type BattlefieldRenderFormat = "text" | "svg";

export interface BattlefieldRouteSelection {
  readonly fromNodeId: NavigationNodeId;
  readonly toNodeId: NavigationNodeId;
}

export interface BattlefieldRenderRequest {
  readonly map: BattlefieldMapDefinition;
  readonly state: BattlefieldState;
  readonly layers: readonly BattlefieldRenderLayer[];
  readonly route?: BattlefieldRouteSelection;
}

interface PreparedRender {
  readonly map: BattlefieldMapDefinition;
  readonly state: BattlefieldState;
  readonly layers: ReadonlySet<BattlefieldRenderLayer>;
  readonly route:
    | {
        readonly fromNodeId: NavigationNodeId;
        readonly toNodeId: NavigationNodeId;
        readonly nodeIds: readonly NavigationNodeId[];
        readonly totalCost: number;
      }
    | undefined;
  readonly xValues: readonly number[];
  readonly yValues: readonly number[];
}

const layerOrder: readonly BattlefieldRenderLayer[] = [
  "map",
  "occupancy",
  "path"
];

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function prepare(request: BattlefieldRenderRequest): PreparedRender {
  const layers = new Set(request.layers);
  if (layers.size !== request.layers.length)
    throw new RangeError("battlefield render layers must be unique");
  if (!layers.has("map"))
    throw new RangeError("battlefield render requires the map layer");
  for (const layer of layers) {
    if (!layerOrder.includes(layer))
      throw new RangeError(`unsupported battlefield render layer (${layer})`);
  }
  if (request.map.id !== request.state.mapId)
    throw new RangeError(
      `battlefield state map ID ${request.state.mapId} does not match map ${request.map.id}`
    );
  if (layers.has("path") !== (request.route !== undefined))
    throw new RangeError(
      "battlefield path layer requires exactly one route selection"
    );

  const nodes = new Set(request.map.nodes.map((node) => node.id));
  const occupiedNodes = new Set<NavigationNodeId>();
  for (const occupant of request.state.occupancy) {
    if (!nodes.has(occupant.nodeId))
      throw new RangeError(
        `battlefield occupancy references unknown navigation node ID (${occupant.nodeId})`
      );
    if (occupiedNodes.has(occupant.nodeId))
      throw new RangeError(
        `battlefield occupancy contains duplicate navigation node ID (${occupant.nodeId})`
      );
    occupiedNodes.add(occupant.nodeId);
  }

  let route: PreparedRender["route"];
  if (request.route !== undefined) {
    const resolved = findShortestRoute(
      request.map,
      request.route.fromNodeId,
      request.route.toNodeId
    );
    if (resolved === undefined)
      throw new RangeError(
        `no authored route exists from ${request.route.fromNodeId} to ${request.route.toNodeId}`
      );
    route = Object.freeze({
      ...request.route,
      nodeIds: resolved.nodeIds,
      totalCost: resolved.totalCost
    });
  }

  return {
    map: request.map,
    state: request.state,
    layers,
    route,
    xValues: [...new Set(request.map.nodes.map((node) => node.x))].sort(
      (left, right) => left - right
    ),
    yValues: [...new Set(request.map.nodes.map((node) => node.y))].sort(
      (left, right) => left - right
    )
  };
}

function marker(value: {
  readonly entrance: boolean;
  readonly placement: boolean;
  readonly occupant: boolean;
  readonly path: boolean;
}): string {
  return `${value.entrance ? "E" : "."}${value.placement ? "P" : "."}${value.occupant ? "O" : "."}${value.path ? "*" : "."}`;
}

export function renderBattlefieldText(
  request: BattlefieldRenderRequest
): string {
  const prepared = prepare(request);
  const { map, state, layers, route } = prepared;
  const entrancesByNode = new Map(
    map.enemyEntrances.map((entrance) => [entrance.nodeId, entrance.id])
  );
  const placementsByNode = new Map(
    map.placementPoints.map((point) => [point.nodeId, point.id])
  );
  const occupantsByNode = new Map(
    state.occupancy.map((occupant) => [occupant.nodeId, occupant.entityId])
  );
  const routeIndexes = new Map(
    route?.nodeIds.map((nodeId, index) => [nodeId, index]) ?? []
  );
  const nodesByCoordinate = new Map(
    map.nodes.map((node) => [`${node.x}\u0000${node.y}`, node])
  );
  const lines = [
    `battlefield ${map.id}`,
    `layers ${layerOrder.filter((layer) => layers.has(layer)).join(",")}`,
    "legend E=entrance P=placement O=occupied *=route"
  ];
  if (route !== undefined) {
    lines.push(
      `route ${route.fromNodeId} -> ${route.toNodeId} cost=${route.totalCost} nodes=${route.nodeIds.join(",")}`
    );
  }
  lines.push("grid");
  for (const y of prepared.yValues) {
    const cells = prepared.xValues.map((x) => {
      const node = nodesByCoordinate.get(`${x}\u0000${y}`);
      if (node === undefined) return "[    ]";
      return `[${marker({
        entrance: entrancesByNode.has(node.id),
        placement: placementsByNode.has(node.id),
        occupant: layers.has("occupancy") && occupantsByNode.has(node.id),
        path: layers.has("path") && routeIndexes.has(node.id)
      })}]`;
    });
    lines.push(`y=${y} ${cells.join("-")}`);
  }
  lines.push("nodes");
  for (const node of [...map.nodes].sort((left, right) =>
    compareText(left.id, right.id)
  )) {
    const details = [`coord=${node.x},${node.y}`];
    const entrance = entrancesByNode.get(node.id);
    const placement = placementsByNode.get(node.id);
    const occupant = layers.has("occupancy")
      ? occupantsByNode.get(node.id)
      : undefined;
    const routeIndex = layers.has("path")
      ? routeIndexes.get(node.id)
      : undefined;
    if (entrance !== undefined) details.push(`entrance=${entrance}`);
    if (placement !== undefined) details.push(`placement=${placement}`);
    if (occupant !== undefined) details.push(`occupant=${occupant}`);
    if (routeIndex !== undefined) details.push(`routeIndex=${routeIndex}`);
    lines.push(`- ${node.id} ${details.join(" ")}`);
  }
  lines.push("connections");
  for (const connection of [...map.connections].sort((left, right) =>
    compareText(left.id, right.id)
  )) {
    lines.push(
      `- ${connection.id} ${connection.nodeIds[0]} <-> ${connection.nodeIds[1]} cost=${connection.cost}`
    );
  }
  if (layers.has("occupancy")) {
    lines.push("queued-spawns");
    for (const spawn of [...state.pendingSpawns].sort(
      (left, right) =>
        left.authoredOrder - right.authoredOrder ||
        compareText(left.id, right.id)
    )) {
      lines.push(
        `- order=${spawn.authoredOrder} ${spawn.id} entity=${spawn.entityId} entrance=${spawn.entranceId}`
      );
    }
    if (state.pendingSpawns.length === 0) lines.push("- none");
  }
  return `${lines.join("\n")}\n`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function renderBattlefieldSvg(
  request: BattlefieldRenderRequest
): string {
  const prepared = prepare(request);
  const { map, state, layers, route } = prepared;
  const xRanks = new Map(
    prepared.xValues.map((value, index) => [value, index])
  );
  const yRanks = new Map(
    prepared.yValues.map((value, index) => [value, index])
  );
  const position = new Map(
    map.nodes.map((node) => [
      node.id,
      {
        x: 80 + (xRanks.get(node.x) ?? 0) * 160,
        y: 80 + (yRanks.get(node.y) ?? 0) * 140
      }
    ])
  );
  const width = Math.max(240, prepared.xValues.length * 160);
  const height = Math.max(220, prepared.yValues.length * 140 + 80);
  const routeEdges = new Set<string>();
  if (route !== undefined) {
    for (let index = 1; index < route.nodeIds.length; index += 1) {
      const left = route.nodeIds[index - 1];
      const right = route.nodeIds[index];
      if (left !== undefined && right !== undefined)
        routeEdges.add([left, right].sort().join("\u0000"));
    }
  }
  const entrances = new Map(
    map.enemyEntrances.map((entrance) => [entrance.nodeId, entrance.id])
  );
  const placements = new Map(
    map.placementPoints.map((point) => [point.nodeId, point.id])
  );
  const occupants = new Map(
    state.occupancy.map((occupant) => [occupant.nodeId, occupant.entityId])
  );
  const routeNodes = new Set(route?.nodeIds ?? []);
  const queueSummary = [...state.pendingSpawns]
    .sort(
      (left, right) =>
        left.authoredOrder - right.authoredOrder ||
        compareText(left.id, right.id)
    )
    .map(
      (spawn) =>
        `${spawn.authoredOrder}:${spawn.id}:${spawn.entityId}:${spawn.entranceId}`
    )
    .join(",");
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="battlefield-title battlefield-description">`,
    `<title id="battlefield-title">Battlefield ${escapeXml(map.id)}</title>`,
    `<desc id="battlefield-description">Layers ${layerOrder.filter((layer) => layers.has(layer)).join(",")}; ${state.occupancy.length} occupied nodes; ${state.pendingSpawns.length} queued spawns${route === undefined ? "" : `; route ${escapeXml(route.fromNodeId)} to ${escapeXml(route.toNodeId)} cost ${route.totalCost}`}</desc>`,
    `<metadata data-map-id="${escapeXml(map.id)}" data-queued-spawns="${escapeXml(queueSummary)}"/>`,
    '<g fill="none" stroke="#64748b" stroke-width="4">'
  ];
  for (const connection of [...map.connections].sort((left, right) =>
    compareText(left.id, right.id)
  )) {
    const start = position.get(connection.nodeIds[0]);
    const end = position.get(connection.nodeIds[1]);
    if (start === undefined || end === undefined)
      throw new RangeError(
        `connection ${connection.id} references an unknown navigation node`
      );
    const key = [...connection.nodeIds].sort().join("\u0000");
    lines.push(
      `<line data-connection-id="${escapeXml(connection.id)}" x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}"${layers.has("path") && routeEdges.has(key) ? ' class="route" stroke="#f59e0b" stroke-width="10"' : ""}/>`
    );
  }
  lines.push("</g>", '<g font-family="monospace" font-size="12">');
  for (const node of [...map.nodes].sort((left, right) =>
    compareText(left.id, right.id)
  )) {
    const point = position.get(node.id);
    if (point === undefined)
      throw new RangeError(`missing node position (${node.id})`);
    const occupant = layers.has("occupancy")
      ? occupants.get(node.id)
      : undefined;
    const classes = [
      "node",
      entrances.has(node.id) ? "entrance" : undefined,
      placements.has(node.id) ? "placement" : undefined,
      occupant !== undefined ? "occupied" : undefined,
      layers.has("path") && routeNodes.has(node.id) ? "route" : undefined
    ]
      .filter((value): value is string => value !== undefined)
      .join(" ");
    lines.push(
      `<g data-node-id="${escapeXml(node.id)}" class="${classes}">`,
      `<circle cx="${point.x}" cy="${point.y}" r="24" fill="${occupant === undefined ? "#f8fafc" : "#0f766e"}" stroke="${routeNodes.has(node.id) && layers.has("path") ? "#f59e0b" : "#0f172a"}" stroke-width="4"/>`,
      `<text x="${point.x}" y="${point.y + 42}" text-anchor="middle">${escapeXml(node.id)}</text>`
    );
    const evidence = [
      entrances.has(node.id) ? `entrance:${entrances.get(node.id)}` : undefined,
      placements.has(node.id)
        ? `placement:${placements.get(node.id)}`
        : undefined,
      occupant === undefined ? undefined : `occupant:${occupant}`
    ].filter((value): value is string => value !== undefined);
    if (evidence.length > 0)
      lines.push(
        `<text x="${point.x}" y="${point.y - 34}" text-anchor="middle">${escapeXml(evidence.join(" "))}</text>`
      );
    lines.push("</g>");
  }
  lines.push("</g>", "</svg>");
  return `${lines.join("\n")}\n`;
}
