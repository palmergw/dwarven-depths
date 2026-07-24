import type { StableId, WaveDefinition } from "@dwarven-depths/contracts";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Orders fired spawns by their level-global authored order. */
export function orderFiredSpawnIds(
  waves: readonly WaveDefinition[],
  firedSpawnIds: ReadonlySet<StableId>
): readonly StableId[] {
  return waves
    .flatMap((wave) => wave.spawnEvents)
    .filter((spawn) => firedSpawnIds.has(spawn.id))
    .sort(
      (left, right) =>
        left.authoredOrder - right.authoredOrder ||
        compareText(left.id, right.id)
    )
    .map((spawn) => spawn.id);
}
