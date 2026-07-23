import {
  validateContentBundle,
  validateScenario
} from "@dwarven-depths/content-schema";
import type { ScenarioDefinition } from "@dwarven-depths/contracts";
import {
  type ContentBundle,
  canonicalHash,
  type LevelDefinition,
  type StableId
} from "@dwarven-depths/contracts";

export interface CompiledContent {
  readonly bundle: ContentBundle;
  readonly manifestHash: string;
  readonly levels: ReadonlyMap<StableId, LevelDefinition>;
}

export async function compileContent(input: unknown): Promise<CompiledContent> {
  const validated = validateContentBundle(input);
  const definitions = [...validated.definitions].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  );
  const bundle: ContentBundle = {
    schemaVersion: 1,
    contentVersion: validated.contentVersion,
    definitions
  };
  const levels = new Map<StableId, LevelDefinition>();
  for (const definition of definitions) levels.set(definition.id, definition);

  return {
    bundle,
    manifestHash: await canonicalHash(bundle),
    levels
  };
}

export function compileScenario(
  input: unknown,
  content: CompiledContent
): ScenarioDefinition {
  const scenario = validateScenario(input);
  if (!content.levels.has(scenario.levelId)) {
    throw new Error(`$/levelId: unknown level ID (${scenario.levelId})`);
  }
  return scenario;
}
