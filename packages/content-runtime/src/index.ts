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
  type LevelDefinition,
  type NavigationNodeId,
  type StableId,
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
    : Object.freeze({ ...definition });
}

export interface CompiledContent {
  readonly bundle: ContentBundle;
  readonly manifestHash: string;
  readonly levels: ReadonlyMap<StableId, LevelDefinition>;
  readonly waves: ReadonlyMap<StableId, WaveDefinition>;
  readonly maps: ReadonlyMap<StableId, BattlefieldMapDefinition>;
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
