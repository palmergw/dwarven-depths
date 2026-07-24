import type { EntityId, StableId } from "@dwarven-depths/contracts";

/** Injective stable ID for one authored attack, source entity, and start tick. */
export function createAttackInstanceId(
  authoredAttackId: StableId,
  sourceEntityId: EntityId,
  startedAtTick: number
): StableId {
  const sourceSuffix = sourceEntityId.slice("entity.".length);
  return `${authoredAttackId}.${sourceSuffix}.source_length_${sourceSuffix.length}.tick_${startedAtTick}` as StableId;
}
