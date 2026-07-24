import { compileContent } from "@dwarven-depths/content-runtime";
import type {
  ContentBundle,
  MovementProposal
} from "@dwarven-depths/contracts";
import mapContentInput from "../../../content/fixtures/conformance-map.json" with {
  type: "json"
};
import referenceCombatantsInput from "../../../content/fixtures/phase-3-reference-combatants.json" with {
  type: "json"
};
import {
  createInitialState,
  resolveScheduledBattlefieldPhase,
  type StepResult
} from "./index.js";

const mapDefinition = mapContentInput.definitions[1];
const enemyDefinitions = referenceCombatantsInput.definitions.filter(
  (definition) =>
    definition.id === "enemy.goblin_cutter" ||
    definition.id === "enemy.goblin_slinger"
);

export const scheduledBattlefieldContent = Object.freeze({
  schemaVersion: 1,
  contentVersion: "phase-3-scheduled-battlefield",
  definitions: Object.freeze([
    Object.freeze({
      kind: "level",
      id: "level.scheduled_battlefield",
      waveIds: Object.freeze(["wave.opening", "wave.overlap"]),
      mapId: "map.conformance_diamond"
    }),
    mapDefinition,
    Object.freeze({
      kind: "wave",
      id: "wave.opening",
      startAtTick: 0,
      durationTicks: 10,
      spawnEvents: Object.freeze([
        Object.freeze({
          id: "spawn.first",
          authoredOrder: 0,
          atTick: 0,
          entityId: "entity.enemy.first",
          enemyDefinitionId: "enemy.goblin_cutter",
          entranceId: "entrance.west"
        })
      ])
    }),
    Object.freeze({
      kind: "wave",
      id: "wave.overlap",
      startAtTick: 0,
      durationTicks: 10,
      spawnEvents: Object.freeze([
        Object.freeze({
          id: "spawn.second",
          authoredOrder: 1,
          atTick: 0,
          entityId: "entity.enemy.second",
          enemyDefinitionId: "enemy.goblin_slinger",
          entranceId: "entrance.west"
        })
      ])
    }),
    ...enemyDefinitions
  ])
}) as unknown as ContentBundle;

const moveFirst = Object.freeze({
  id: "movement.first",
  entityId: "entity.enemy.first",
  fromNodeId: "node.entry",
  toNodeId: "node.south"
}) as MovementProposal;

export async function scheduledBattlefieldParityEvidence(): Promise<
  readonly StepResult[]
> {
  const content = await compileContent(scheduledBattlefieldContent);
  const initial = createInitialState(
    content,
    "level.scheduled_battlefield" as never,
    "1"
  );
  const due = resolveScheduledBattlefieldPhase(initial, content, []);
  const moved = resolveScheduledBattlefieldPhase(due.state, content, [
    moveFirst
  ]);
  const admitted = resolveScheduledBattlefieldPhase(moved.state, content, []);
  return Object.freeze([due, moved, admitted]);
}
