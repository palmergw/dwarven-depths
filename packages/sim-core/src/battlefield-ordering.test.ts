import type { StableId, WaveDefinition } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { orderFiredSpawnIds } from "./battlefield-ordering.js";

function wave(
  id: StableId,
  spawns: readonly { readonly id: StableId; readonly authoredOrder: number }[]
): WaveDefinition {
  return {
    kind: "wave",
    id,
    startAtTick: 0,
    durationTicks: 100,
    spawnEvents: spawns.map((spawn) => ({
      ...spawn,
      atTick: 0,
      entityId: `entity.${spawn.id}` as never,
      enemyDefinitionId: "enemy.reference" as never,
      entranceId: "entrance.reference" as never
    }))
  };
}

describe("battlefield schedule ordering", () => {
  it("orders fired spawns by level-global authored order across overlapping waves", () => {
    const earlierWave = wave("wave.earlier" as StableId, [
      { id: "spawn.order_3" as StableId, authoredOrder: 3 }
    ]);
    const laterWave = wave("wave.later" as StableId, [
      { id: "spawn.order_1" as StableId, authoredOrder: 1 },
      { id: "spawn.order_2" as StableId, authoredOrder: 2 }
    ]);
    const fired = new Set<StableId>([
      "spawn.order_3" as StableId,
      "spawn.order_1" as StableId,
      "spawn.order_2" as StableId
    ]);

    expect(orderFiredSpawnIds([earlierWave, laterWave], fired)).toEqual([
      "spawn.order_1",
      "spawn.order_2",
      "spawn.order_3"
    ]);
    expect(orderFiredSpawnIds([laterWave, earlierWave], fired)).toEqual([
      "spawn.order_1",
      "spawn.order_2",
      "spawn.order_3"
    ]);
  });
});
