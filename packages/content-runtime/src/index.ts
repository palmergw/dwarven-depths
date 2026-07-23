import {
  ContentValidationError,
  validateContentBundle,
  validateScenario
} from "@dwarven-depths/content-schema";
import type { ScenarioDefinition } from "@dwarven-depths/contracts";
import {
  type ContentBundle,
  type ContentDefinition,
  canonicalHash,
  type LevelDefinition,
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

function freezeDefinition(definition: ContentDefinition): ContentDefinition {
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
  for (const definition of definitions) {
    if (definition.kind === "level") levels.set(definition.id, definition);
    else waves.set(definition.id, definition);
  }

  return {
    bundle,
    manifestHash: await canonicalHash(bundle),
    levels: Object.freeze(new ReadonlyMapView(levels)),
    waves: Object.freeze(new ReadonlyMapView(waves))
  };
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
