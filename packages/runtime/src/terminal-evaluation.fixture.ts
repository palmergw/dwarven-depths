import type {
  EntityId,
  PendingSpawn,
  WaveScheduleRequest
} from "@dwarven-depths/contracts";
import {
  evaluateTerminalState,
  type TerminalEvaluationRequest
} from "./terminal-evaluation.js";

const level = Object.freeze({
  kind: "level" as const,
  id: "level.shuttergate" as never,
  waveIds: Object.freeze(["wave.first", "wave.final"] as never[])
});

const waves = Object.freeze([
  Object.freeze({
    kind: "wave" as const,
    id: "wave.first" as never,
    startAtTick: 0,
    durationTicks: 5,
    spawnEvents: Object.freeze([
      Object.freeze({
        id: "spawn.cutter" as never,
        authoredOrder: 0,
        atTick: 1,
        entityId: "entity.enemy.cutter" as never,
        enemyDefinitionId: "enemy.goblin_cutter" as never,
        entranceId: "entrance.west" as never
      })
    ])
  }),
  Object.freeze({
    kind: "wave" as const,
    id: "wave.final" as never,
    startAtTick: 5,
    durationTicks: 5,
    spawnEvents: Object.freeze([
      Object.freeze({
        id: "spawn.captain" as never,
        authoredOrder: 1,
        atTick: 6,
        entityId: "entity.enemy.captain" as never,
        enemyDefinitionId: "enemy.gatebreaker_captain" as never,
        entranceId: "entrance.west" as never
      })
    ])
  })
]);

const captainPending = Object.freeze({
  id: "spawn.captain" as never,
  authoredOrder: 1,
  entityId: "entity.enemy.captain" as never,
  enemyDefinitionId: "enemy.gatebreaker_captain" as never,
  entranceId: "entrance.west" as never
}) satisfies PendingSpawn;

function waveSchedule(
  currentTick: number,
  pendingSpawns: readonly PendingSpawn[] = []
): WaveScheduleRequest {
  return {
    schemaVersion: 1,
    currentTick,
    level,
    waves,
    startedWaveIds:
      currentTick < 5
        ? (["wave.first"] as never[])
        : (["wave.first", "wave.final"] as never[]),
    firedSpawnIds:
      currentTick < 6
        ? (["spawn.cutter"] as never[])
        : (["spawn.cutter", "spawn.captain"] as never[]),
    pendingSpawns
  };
}

export function terminalEvaluationRequest(
  overrides: Partial<
    Pick<
      TerminalEvaluationRequest,
      | "waveSchedule"
      | "livingDwarfIds"
      | "livingHostileEnemyIds"
      | "livingHostileDeployableIds"
    >
  > = {}
): TerminalEvaluationRequest {
  return {
    schemaVersion: 1,
    waveSchedule: waveSchedule(10),
    livingDwarfIds: ["entity.dwarf.warden" as EntityId],
    livingHostileEnemyIds: [],
    livingHostileDeployableIds: [],
    ...overrides
  };
}

/** Shared terminal-boundary evidence executed unchanged by Node and browsers. */
export function terminalEvaluationParityEvidence() {
  return Object.freeze([
    evaluateTerminalState(
      terminalEvaluationRequest({ waveSchedule: waveSchedule(9) })
    ),
    evaluateTerminalState(
      terminalEvaluationRequest({
        waveSchedule: waveSchedule(10, [captainPending])
      })
    ),
    evaluateTerminalState(
      terminalEvaluationRequest({
        livingHostileEnemyIds: ["entity.enemy.captain" as EntityId]
      })
    ),
    evaluateTerminalState(
      terminalEvaluationRequest({
        livingHostileDeployableIds: ["entity.deployable.totem" as EntityId]
      })
    ),
    evaluateTerminalState(terminalEvaluationRequest()),
    evaluateTerminalState(terminalEvaluationRequest({ livingDwarfIds: [] }))
  ]);
}
