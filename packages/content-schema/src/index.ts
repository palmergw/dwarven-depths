import type {
  AimPointId,
  BattlefieldMapDefinition,
  ContentBundle,
  EnemyEntranceId,
  EntityId,
  NavigationConnectionId,
  NavigationNodeId,
  OpaqueRegionId,
  PlacementPointId,
  ReplayDefinition,
  ScenarioDefinition,
  StableId
} from "@dwarven-depths/contracts";
import { z } from "zod";

const stableIdSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/,
    "must be a stable nonlocalized ID"
  );

function domainIdSchema(domain: string) {
  return stableIdSchema.refine(
    (value) => value.startsWith(`${domain}.`),
    `must be a ${domain}.* stable ID`
  );
}

const navigationNodeIdSchema = domainIdSchema("node");
const navigationConnectionIdSchema = domainIdSchema("connection");
const placementPointIdSchema = domainIdSchema("placement");
const enemyEntranceIdSchema = domainIdSchema("entrance");
const entityIdSchema = domainIdSchema("entity");
const enemyDefinitionIdSchema = domainIdSchema("enemy");
const spawnIdSchema = domainIdSchema("spawn");
const aimPointIdSchema = domainIdSchema("aim");
const opaqueRegionIdSchema = domainIdSchema("opaque");
const authoredCoordinateSchema = z
  .int()
  .min(-1_000_000)
  .max(1_000_000)
  .refine((value) => !Object.is(value, -0), "must not be negative zero");

const checksumSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "must be a lowercase SHA-256 checksum");

const seedSchema = z
  .string()
  .max(10)
  .regex(/^[1-9]\d*$/, "must be a canonical positive decimal integer")
  .refine((value) => {
    if (value.length > 10 || !/^[1-9]\d*$/.test(value)) return false;
    const parsed = BigInt(value);
    return parsed >= 1n && parsed <= 0xffff_ffffn;
  }, "must be between 1 and 4294967295");

const levelDefinitionSchema = z
  .object({
    kind: z.literal("level"),
    id: stableIdSchema,
    waveIds: z.array(stableIdSchema),
    mapId: stableIdSchema.optional()
  })
  .strict();

const waveDefinitionSchema = z
  .object({
    kind: z.literal("wave"),
    id: stableIdSchema,
    startAtTick: z.int().nonnegative().max(10_000_000),
    durationTicks: z.int().positive().max(10_000_000),
    spawnEvents: z.array(
      z
        .object({
          id: spawnIdSchema,
          authoredOrder: z.int().nonnegative().max(10_000_000),
          atTick: z.int().nonnegative().max(10_000_000),
          entityId: entityIdSchema,
          enemyDefinitionId: enemyDefinitionIdSchema,
          entranceId: enemyEntranceIdSchema
        })
        .strict()
    )
  })
  .strict();

const navigationNodeSchema = z
  .object({
    id: navigationNodeIdSchema,
    x: authoredCoordinateSchema,
    y: authoredCoordinateSchema,
    aimPointId: aimPointIdSchema,
    neighborNodeIds: z.array(navigationNodeIdSchema)
  })
  .strict();

const navigationConnectionSchema = z
  .object({
    id: navigationConnectionIdSchema,
    nodeIds: z.tuple([navigationNodeIdSchema, navigationNodeIdSchema]),
    cost: z.int().positive()
  })
  .strict();

const placementPointSchema = z
  .object({
    id: placementPointIdSchema,
    nodeId: navigationNodeIdSchema,
    capacity: z.literal(1),
    adjacentPlacementPointIds: z.array(placementPointIdSchema)
  })
  .strict();

const enemyEntranceSchema = z
  .object({ id: enemyEntranceIdSchema, nodeId: navigationNodeIdSchema })
  .strict();

const aimPointSchema = z
  .object({
    id: aimPointIdSchema,
    x: authoredCoordinateSchema,
    y: authoredCoordinateSchema
  })
  .strict();

const opaqueRegionSchema = z
  .object({
    id: opaqueRegionIdSchema,
    minimumX: authoredCoordinateSchema,
    minimumY: authoredCoordinateSchema,
    maximumX: authoredCoordinateSchema,
    maximumY: authoredCoordinateSchema
  })
  .strict();

const battlefieldMapSchema = z
  .object({
    kind: z.literal("map"),
    id: stableIdSchema,
    nodes: z.array(navigationNodeSchema),
    connections: z.array(navigationConnectionSchema),
    placementPoints: z.array(placementPointSchema),
    enemyEntrances: z.array(enemyEntranceSchema),
    aimPoints: z.array(aimPointSchema),
    opaqueRegions: z.array(opaqueRegionSchema)
  })
  .strict();

const contentDefinitionSchema = z.discriminatedUnion("kind", [
  levelDefinitionSchema,
  waveDefinitionSchema,
  battlefieldMapSchema
]);

const contentBundleSchema = z
  .object({
    schemaVersion: z.literal(1),
    contentVersion: z.string().min(1),
    definitions: z.array(contentDefinitionSchema)
  })
  .strict();

const scenarioCommandSchema = z
  .object({
    atTick: z.int().nonnegative(),
    type: z.literal("confirmPreparation")
  })
  .strict();

const scenarioDefinitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: stableIdSchema,
    levelId: stableIdSchema,
    seed: seedSchema,
    maximumTicks: z.int().positive().max(10_000_000),
    commands: z.array(scenarioCommandSchema),
    expectedTerminalResult: z.enum(["victory", "defeat"]).optional()
  })
  .strict();

const commandEnvelopeSchema = z
  .object({
    tick: z.int().nonnegative(),
    sequence: z.int().nonnegative(),
    command: scenarioCommandSchema
  })
  .strict();

const replayCheckpointSchema = z
  .object({
    tick: z.int().nonnegative(),
    stateChecksum: checksumSchema,
    eventStreamChecksum: checksumSchema
  })
  .strict();

const replayDefinitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    simulationSchemaVersion: z.literal(1),
    contentVersion: z.string().min(1),
    contentManifestHash: checksumSchema,
    scenarioId: stableIdSchema,
    scenarioHash: checksumSchema,
    levelId: stableIdSchema,
    seed: seedSchema,
    rngAlgorithm: z.literal("xorshift32-v1"),
    commands: z.array(commandEnvelopeSchema),
    checkpoints: z
      .array(replayCheckpointSchema)
      .length(1, "version 1 requires exactly one terminal checkpoint"),
    expectedTerminalResult: z.enum(["victory", "defeat"]),
    expectedTerminalTick: z.int().nonnegative()
  })
  .strict();

export interface ValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
  readonly relatedPaths?: readonly string[];
}

export class ContentValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
    this.name = "ContentValidationError";
    this.issues = Object.freeze(
      issues.map((issue) =>
        Object.freeze({
          ...issue,
          ...(issue.relatedPaths === undefined
            ? {}
            : { relatedPaths: Object.freeze([...issue.relatedPaths]) })
        })
      )
    );
  }
}

function formatZodIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length === 0 ? "$" : `$/${issue.path.join("/")}`,
    code: issue.code,
    message: issue.message
  }));
}

type ParsedMap = z.infer<typeof battlefieldMapSchema>;

function recordUniqueIds(
  records: readonly { readonly id: string }[],
  basePath: string,
  issues: ValidationIssue[],
  globalPaths?: Map<string, string>
): Map<string, number> {
  const seen = new Map<string, number>();
  records.forEach((record, index) => {
    const previous = seen.get(record.id);
    if (previous === undefined) {
      seen.set(record.id, index);
      const path = `${basePath}/${index}/id`;
      const globalPath = globalPaths?.get(record.id);
      if (globalPath === undefined) globalPaths?.set(record.id, path);
      else
        issues.push({
          path,
          code: "duplicate_stable_id",
          message: `duplicates ${record.id}`,
          relatedPaths: [globalPath]
        });
    } else
      issues.push({
        path: `${basePath}/${index}/id`,
        code: "duplicate_stable_id",
        message: `duplicates ${record.id}`,
        relatedPaths: [`${basePath}/${previous}/id`]
      });
  });
  return seen;
}

function validateUniqueReferences(
  values: readonly string[],
  basePath: string,
  issues: ValidationIssue[]
): void {
  const seen = new Map<string, number>();
  values.forEach((value, index) => {
    const previous = seen.get(value);
    if (previous === undefined) seen.set(value, index);
    else
      issues.push({
        path: `${basePath}/${index}`,
        code: "duplicate_reference",
        message: `duplicates ${value}`,
        relatedPaths: [`${basePath}/${previous}`]
      });
  });
}

function validateBattlefieldMap(
  map: ParsedMap,
  definitionIndex: number,
  issues: ValidationIssue[],
  globalIds: {
    readonly nodes: Map<string, string>;
    readonly connections: Map<string, string>;
    readonly placements: Map<string, string>;
    readonly entrances: Map<string, string>;
    readonly aimPoints: Map<string, string>;
    readonly opaqueRegions: Map<string, string>;
  }
): void {
  const base = `$/definitions/${definitionIndex}`;
  const nodes = recordUniqueIds(
    map.nodes,
    `${base}/nodes`,
    issues,
    globalIds.nodes
  );
  recordUniqueIds(
    map.connections,
    `${base}/connections`,
    issues,
    globalIds.connections
  );
  const placements = recordUniqueIds(
    map.placementPoints,
    `${base}/placementPoints`,
    issues,
    globalIds.placements
  );
  recordUniqueIds(
    map.enemyEntrances,
    `${base}/enemyEntrances`,
    issues,
    globalIds.entrances
  );
  const aimPoints = recordUniqueIds(
    map.aimPoints,
    `${base}/aimPoints`,
    issues,
    globalIds.aimPoints
  );
  recordUniqueIds(
    map.opaqueRegions,
    `${base}/opaqueRegions`,
    issues,
    globalIds.opaqueRegions
  );

  map.opaqueRegions.forEach((region, regionIndex) => {
    const regionPath = `${base}/opaqueRegions/${regionIndex}`;
    if (region.minimumX >= region.maximumX)
      issues.push({
        path: `${regionPath}/maximumX`,
        code: "invalid_geometry",
        message: "must be greater than minimumX"
      });
    if (region.minimumY >= region.maximumY)
      issues.push({
        path: `${regionPath}/maximumY`,
        code: "invalid_geometry",
        message: "must be greater than minimumY"
      });
  });

  const connectionPairs = new Map<string, number>();
  map.connections.forEach((connection, connectionIndex) => {
    const connectionPath = `${base}/connections/${connectionIndex}`;
    const [leftId, rightId] = connection.nodeIds;
    if (leftId === rightId) {
      issues.push({
        path: `${connectionPath}/nodeIds/1`,
        code: "self_reference",
        message: "connection endpoints must be different"
      });
    }
    connection.nodeIds.forEach((nodeId, endpointIndex) => {
      if (!nodes.has(nodeId))
        issues.push({
          path: `${connectionPath}/nodeIds/${endpointIndex}`,
          code: "unknown_reference",
          message: `references unknown navigation node ID (${nodeId})`
        });
    });
    const pair =
      leftId < rightId
        ? `${leftId}\u0000${rightId}`
        : `${rightId}\u0000${leftId}`;
    const previousPair = connectionPairs.get(pair);
    if (previousPair === undefined) connectionPairs.set(pair, connectionIndex);
    else
      issues.push({
        path: `${connectionPath}/nodeIds`,
        code: "duplicate_connection",
        message: `duplicates the connection between ${leftId} and ${rightId}`,
        relatedPaths: [`${base}/connections/${previousPair}/nodeIds`]
      });

    const leftIndex = nodes.get(leftId);
    const rightIndex = nodes.get(rightId);
    if (leftIndex !== undefined && rightIndex !== undefined) {
      const left = map.nodes[leftIndex];
      const right = map.nodes[rightIndex];
      if (
        left !== undefined &&
        right !== undefined &&
        (left.x === right.x) === (left.y === right.y)
      ) {
        issues.push({
          path: `${connectionPath}/nodeIds`,
          code: "non_orthogonal_connection",
          message: "connected nodes must differ on exactly one coordinate"
        });
      }
    }
  });

  map.nodes.forEach((node, nodeIndex) => {
    if (!aimPoints.has(node.aimPointId))
      issues.push({
        path: `${base}/nodes/${nodeIndex}/aimPointId`,
        code: "unknown_reference",
        message: `references unknown aim point ID (${node.aimPointId})`
      });
    const neighborPath = `${base}/nodes/${nodeIndex}/neighborNodeIds`;
    validateUniqueReferences(node.neighborNodeIds, neighborPath, issues);
    node.neighborNodeIds.forEach((neighborId, neighborIndex) => {
      if (neighborId === node.id)
        issues.push({
          path: `${neighborPath}/${neighborIndex}`,
          code: "self_reference",
          message: "a node cannot be its own neighbor"
        });
      if (!nodes.has(neighborId))
        issues.push({
          path: `${neighborPath}/${neighborIndex}`,
          code: "unknown_reference",
          message: `references unknown navigation node ID (${neighborId})`
        });
      const pair =
        node.id < neighborId
          ? `${node.id}\u0000${neighborId}`
          : `${neighborId}\u0000${node.id}`;
      if (!connectionPairs.has(pair))
        issues.push({
          path: `${neighborPath}/${neighborIndex}`,
          code: "missing_connection",
          message: `has no authored connection to ${neighborId}`
        });
    });
  });

  map.connections.forEach((connection, connectionIndex) => {
    const [leftId, rightId] = connection.nodeIds;
    for (const [nodeId, neighborId] of [
      [leftId, rightId],
      [rightId, leftId]
    ] as const) {
      const nodeIndex = nodes.get(nodeId);
      if (
        nodeIndex !== undefined &&
        !map.nodes[nodeIndex]?.neighborNodeIds.includes(neighborId)
      )
        issues.push({
          path: `${base}/connections/${connectionIndex}/nodeIds`,
          code: "missing_neighbor_order",
          message: `${nodeId} must explicitly order neighbor ${neighborId}`,
          relatedPaths: [`${base}/nodes/${nodeIndex}/neighborNodeIds`]
        });
    }
  });

  map.placementPoints.forEach((point, pointIndex) => {
    const pointPath = `${base}/placementPoints/${pointIndex}`;
    if (!nodes.has(point.nodeId))
      issues.push({
        path: `${pointPath}/nodeId`,
        code: "unknown_reference",
        message: `references unknown navigation node ID (${point.nodeId})`
      });
    validateUniqueReferences(
      point.adjacentPlacementPointIds,
      `${pointPath}/adjacentPlacementPointIds`,
      issues
    );
    point.adjacentPlacementPointIds.forEach((adjacentId, adjacentIndex) => {
      if (adjacentId === point.id)
        issues.push({
          path: `${pointPath}/adjacentPlacementPointIds/${adjacentIndex}`,
          code: "self_reference",
          message: "a placement point cannot be adjacent to itself"
        });
      if (!placements.has(adjacentId))
        issues.push({
          path: `${pointPath}/adjacentPlacementPointIds/${adjacentIndex}`,
          code: "unknown_reference",
          message: `references unknown placement point ID (${adjacentId})`
        });
    });
  });

  map.enemyEntrances.forEach((entrance, entranceIndex) => {
    if (!nodes.has(entrance.nodeId))
      issues.push({
        path: `${base}/enemyEntrances/${entranceIndex}/nodeId`,
        code: "unknown_reference",
        message: `references unknown navigation node ID (${entrance.nodeId})`
      });
  });
}

export function validateContentBundle(input: unknown): ContentBundle {
  const parsed = contentBundleSchema.safeParse(input);
  if (!parsed.success)
    throw new ContentValidationError(formatZodIssues(parsed.error));

  const seen = new Map<
    string,
    { readonly index: number; readonly kind: "level" | "wave" | "map" }
  >();
  const issues: ValidationIssue[] = [];
  const globalMapIds = {
    nodes: new Map<string, string>(),
    connections: new Map<string, string>(),
    placements: new Map<string, string>(),
    entrances: new Map<string, string>(),
    aimPoints: new Map<string, string>(),
    opaqueRegions: new Map<string, string>()
  };
  parsed.data.definitions.forEach((definition, index) => {
    const previous = seen.get(definition.id);
    if (previous !== undefined) {
      issues.push({
        path: `$/definitions/${index}/id`,
        code: "duplicate_stable_id",
        message: `duplicates ${definition.id}`,
        relatedPaths: [`$/definitions/${previous.index}/id`]
      });
    } else {
      seen.set(definition.id, { index, kind: definition.kind });
    }
  });

  parsed.data.definitions.forEach((definition, definitionIndex) => {
    if (definition.kind === "map") {
      validateBattlefieldMap(definition, definitionIndex, issues, globalMapIds);
      return;
    }
    if (definition.kind !== "level") return;
    validateUniqueReferences(
      definition.waveIds,
      `$/definitions/${definitionIndex}/waveIds`,
      issues
    );
    definition.waveIds.forEach((waveId, waveIndex) => {
      const target = seen.get(waveId);
      if (target === undefined) {
        issues.push({
          path: `$/definitions/${definitionIndex}/waveIds/${waveIndex}`,
          code: "unknown_reference",
          message: `references unknown wave ID (${waveId})`
        });
      } else if (target.kind !== "wave") {
        issues.push({
          path: `$/definitions/${definitionIndex}/waveIds/${waveIndex}`,
          code: "wrong_reference_kind",
          message: `references ${target.kind}; expected wave`,
          relatedPaths: [`$/definitions/${target.index}/id`]
        });
      }
    });
    if (definition.mapId !== undefined) {
      const target = seen.get(definition.mapId);
      if (target === undefined)
        issues.push({
          path: `$/definitions/${definitionIndex}/mapId`,
          code: "unknown_reference",
          message: `references unknown map ID (${definition.mapId})`
        });
      else if (target.kind !== "map")
        issues.push({
          path: `$/definitions/${definitionIndex}/mapId`,
          code: "wrong_reference_kind",
          message: `references ${target.kind}; expected map`,
          relatedPaths: [`$/definitions/${target.index}/id`]
        });
    }
  });

  const waves = new Map(
    parsed.data.definitions
      .filter((definition) => definition.kind === "wave")
      .map((wave) => [wave.id, wave])
  );
  const globalSpawnIds = new Map<string, string>();
  const globalSpawnEntityIds = new Map<string, string>();
  parsed.data.definitions.forEach((definition, definitionIndex) => {
    if (definition.kind !== "wave") return;
    const waveEnd = definition.startAtTick + definition.durationTicks;
    if (!Number.isSafeInteger(waveEnd) || waveEnd > 10_000_000)
      issues.push({
        path: `$/definitions/${definitionIndex}/durationTicks`,
        code: "wave_end_out_of_range",
        message: "startAtTick + durationTicks must not exceed 10000000"
      });
    definition.spawnEvents.forEach((event, eventIndex) => {
      const eventPath = `$/definitions/${definitionIndex}/spawnEvents/${eventIndex}`;
      if (event.atTick < definition.startAtTick || event.atTick >= waveEnd)
        issues.push({
          path: `${eventPath}/atTick`,
          code: "spawn_outside_wave",
          message: `must be within wave interval [${definition.startAtTick}, ${waveEnd})`
        });
      for (const [value, path, seenValues, code] of [
        [event.id, `${eventPath}/id`, globalSpawnIds, "duplicate_spawn_id"],
        [
          event.entityId,
          `${eventPath}/entityId`,
          globalSpawnEntityIds,
          "duplicate_spawn_entity"
        ]
      ] as const) {
        const previousPath = seenValues.get(value);
        if (previousPath === undefined) seenValues.set(value, path);
        else
          issues.push({
            path,
            code,
            message: `duplicates ${value}`,
            relatedPaths: [previousPath]
          });
      }
    });
  });

  parsed.data.definitions.forEach((definition, definitionIndex) => {
    if (definition.kind !== "level") return;
    const map =
      definition.mapId === undefined
        ? undefined
        : parsed.data.definitions.find(
            (candidate) =>
              candidate.kind === "map" && candidate.id === definition.mapId
          );
    const entranceIds = new Set(
      map?.kind === "map"
        ? map.enemyEntrances.map((entrance) => entrance.id)
        : []
    );
    const authoredOrders = new Map<number, string>();
    definition.waveIds.forEach((waveId, waveIndex) => {
      const wave = waves.get(waveId);
      wave?.spawnEvents.forEach((event, eventIndex) => {
        const waveDefinitionIndex = seen.get(waveId)?.index;
        if (waveDefinitionIndex === undefined) return;
        const eventPath = `$/definitions/${waveDefinitionIndex}/spawnEvents/${eventIndex}`;
        const previousPath = authoredOrders.get(event.authoredOrder);
        if (previousPath === undefined)
          authoredOrders.set(event.authoredOrder, `${eventPath}/authoredOrder`);
        else
          issues.push({
            path: `${eventPath}/authoredOrder`,
            code: "duplicate_spawn_order",
            message: `duplicates authored order ${event.authoredOrder} in level ${definition.id}`,
            relatedPaths: [previousPath]
          });
        if (!entranceIds.has(event.entranceId))
          issues.push({
            path: `${eventPath}/entranceId`,
            code: "unknown_reference",
            message: `references entrance ${event.entranceId} not authored by level map`,
            relatedPaths: [
              `$/definitions/${definitionIndex}/waveIds/${waveIndex}`
            ]
          });
      });
    });
  });

  if (issues.length > 0) throw new ContentValidationError(issues);
  return {
    schemaVersion: 1,
    contentVersion: parsed.data.contentVersion,
    definitions: parsed.data.definitions.map((definition) => {
      if (definition.kind === "level")
        return {
          kind: "level",
          id: definition.id as StableId,
          waveIds: definition.waveIds.map((waveId) => waveId as StableId),
          ...(definition.mapId === undefined
            ? {}
            : { mapId: definition.mapId as StableId })
        };
      if (definition.kind === "wave")
        return {
          kind: "wave",
          id: definition.id as StableId,
          startAtTick: definition.startAtTick,
          durationTicks: definition.durationTicks,
          spawnEvents: definition.spawnEvents.map((event) => ({
            ...event,
            id: event.id as StableId,
            entityId: event.entityId as EntityId,
            enemyDefinitionId: event.enemyDefinitionId as StableId,
            entranceId: event.entranceId as EnemyEntranceId
          }))
        };
      return {
        kind: "map",
        id: definition.id as StableId,
        nodes: definition.nodes.map((node) => ({
          id: node.id as NavigationNodeId,
          x: node.x,
          y: node.y,
          aimPointId: node.aimPointId as AimPointId,
          neighborNodeIds: node.neighborNodeIds.map(
            (neighborId) => neighborId as NavigationNodeId
          )
        })),
        connections: definition.connections.map((connection) => ({
          id: connection.id as NavigationConnectionId,
          nodeIds: connection.nodeIds.map(
            (nodeId) => nodeId as NavigationNodeId
          ) as [NavigationNodeId, NavigationNodeId],
          cost: connection.cost
        })),
        placementPoints: definition.placementPoints.map((point) => ({
          id: point.id as PlacementPointId,
          nodeId: point.nodeId as NavigationNodeId,
          capacity: point.capacity,
          adjacentPlacementPointIds: point.adjacentPlacementPointIds.map(
            (adjacentId) => adjacentId as PlacementPointId
          )
        })),
        enemyEntrances: definition.enemyEntrances.map((entrance) => ({
          id: entrance.id as EnemyEntranceId,
          nodeId: entrance.nodeId as NavigationNodeId
        })),
        aimPoints: definition.aimPoints.map((point) => ({
          id: point.id as AimPointId,
          x: point.x,
          y: point.y
        })),
        opaqueRegions: definition.opaqueRegions.map((region) => ({
          id: region.id as OpaqueRegionId,
          minimumX: region.minimumX,
          minimumY: region.minimumY,
          maximumX: region.maximumX,
          maximumY: region.maximumY
        }))
      } satisfies BattlefieldMapDefinition;
    })
  };
}

export function validateScenario(input: unknown): ScenarioDefinition {
  const parsed = scenarioDefinitionSchema.safeParse(input);
  if (!parsed.success)
    throw new ContentValidationError(formatZodIssues(parsed.error));

  const issues: ValidationIssue[] = [];
  const commands = new Set<string>();
  let previousCommandTick = -1;
  parsed.data.commands.forEach((command, index) => {
    if (command.atTick < previousCommandTick) {
      issues.push({
        path: `$/commands/${index}/atTick`,
        code: "commands_out_of_order",
        message: "must not precede the previous command tick"
      });
    }
    previousCommandTick = command.atTick;
    if (command.type === "confirmPreparation" && command.atTick !== 0) {
      issues.push({
        path: `$/commands/${index}/atTick`,
        code: "invalid_preparation_tick",
        message: "confirmPreparation must be scheduled at gameplay tick 0"
      });
    }
    if (command.atTick >= parsed.data.maximumTicks) {
      issues.push({
        path: `$/commands/${index}/atTick`,
        code: "outside_tick_budget",
        message: `must be less than maximumTicks (${parsed.data.maximumTicks})`
      });
    }
    const key = `${command.atTick}:${command.type}`;
    if (commands.has(key)) {
      issues.push({
        path: `$/commands/${index}`,
        code: "duplicate_command",
        message: `duplicates an earlier ${command.type} command at tick ${command.atTick}`
      });
    }
    commands.add(key);
  });
  if (issues.length > 0) throw new ContentValidationError(issues);

  return {
    schemaVersion: 1,
    id: parsed.data.id as StableId,
    levelId: parsed.data.levelId as StableId,
    seed: parsed.data.seed,
    maximumTicks: parsed.data.maximumTicks,
    commands: parsed.data.commands,
    ...(parsed.data.expectedTerminalResult === undefined
      ? {}
      : { expectedTerminalResult: parsed.data.expectedTerminalResult })
  };
}

export function validateReplay(input: unknown): ReplayDefinition {
  const parsed = replayDefinitionSchema.safeParse(input);
  if (!parsed.success)
    throw new ContentValidationError(formatZodIssues(parsed.error));

  const issues: ValidationIssue[] = [];
  let previousCommandTick = -1;
  parsed.data.commands.forEach((envelope, index) => {
    if (envelope.sequence !== index) {
      issues.push({
        path: `$/commands/${index}/sequence`,
        code: "invalid_command_sequence",
        message: `must equal its ordered replay index (${index})`
      });
    }
    if (envelope.tick !== envelope.command.atTick) {
      issues.push({
        path: `$/commands/${index}/tick`,
        code: "command_tick_mismatch",
        message: "must match command.atTick"
      });
    }
    if (envelope.tick > parsed.data.expectedTerminalTick) {
      issues.push({
        path: `$/commands/${index}/tick`,
        code: "command_after_terminal",
        message: "accepted replay command cannot occur after the terminal tick"
      });
    }
    if (envelope.tick < previousCommandTick) {
      issues.push({
        path: `$/commands/${index}/tick`,
        code: "commands_out_of_order",
        message: "must not precede the previous command tick"
      });
    }
    if (envelope.command.type === "confirmPreparation" && envelope.tick !== 0) {
      issues.push({
        path: `$/commands/${index}/tick`,
        code: "invalid_preparation_tick",
        message: "confirmPreparation must be recorded at gameplay tick 0"
      });
    }
    previousCommandTick = envelope.tick;
  });

  let previousCheckpointTick = -1;
  parsed.data.checkpoints.forEach((checkpoint, index) => {
    if (checkpoint.tick <= previousCheckpointTick) {
      issues.push({
        path: `$/checkpoints/${index}/tick`,
        code: "checkpoints_out_of_order",
        message: "must be strictly greater than the previous checkpoint tick"
      });
    }
    previousCheckpointTick = checkpoint.tick;
  });
  const finalCheckpoint = parsed.data.checkpoints.at(-1);
  if (finalCheckpoint?.tick !== parsed.data.expectedTerminalTick) {
    issues.push({
      path: "$/expectedTerminalTick",
      code: "terminal_checkpoint_mismatch",
      message: "must match the final checkpoint tick"
    });
  }

  if (issues.length > 0) throw new ContentValidationError(issues);
  return {
    ...parsed.data,
    scenarioId: parsed.data.scenarioId as StableId,
    levelId: parsed.data.levelId as StableId,
    commands: parsed.data.commands,
    checkpoints: parsed.data.checkpoints
  };
}

export function asStableId(value: string): StableId {
  const parsed = stableIdSchema.safeParse(value);
  if (!parsed.success)
    throw new ContentValidationError(formatZodIssues(parsed.error));
  return parsed.data as StableId;
}
