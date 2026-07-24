import type {
  LevelDefinition,
  WaveDefinition,
  WaveScheduleResolution
} from "@dwarven-depths/contracts";
import { resolveWaveSchedule } from "./wave-schedule.js";

export const waveScheduleLevel = Object.freeze({
  kind: "level",
  id: "level.shuttergate",
  waveIds: Object.freeze(["wave.first", "wave.second"]),
  mapId: "map.shuttergate"
}) as LevelDefinition;

export const waveScheduleWaves = Object.freeze([
  Object.freeze({
    kind: "wave",
    id: "wave.first",
    startAtTick: 0,
    durationTicks: 10,
    spawnEvents: Object.freeze([
      Object.freeze({
        id: "spawn.cutter",
        authoredOrder: 0,
        atTick: 0,
        entityId: "entity.enemy.cutter",
        enemyDefinitionId: "enemy.goblin_cutter",
        entranceId: "entrance.west"
      }),
      Object.freeze({
        id: "spawn.bulwark",
        authoredOrder: 2,
        atTick: 6,
        entityId: "entity.enemy.bulwark",
        enemyDefinitionId: "enemy.goblin_bulwark",
        entranceId: "entrance.west"
      })
    ])
  }),
  Object.freeze({
    kind: "wave",
    id: "wave.second",
    startAtTick: 5,
    durationTicks: 10,
    spawnEvents: Object.freeze([
      Object.freeze({
        id: "spawn.slinger",
        authoredOrder: 1,
        atTick: 5,
        entityId: "entity.enemy.slinger",
        enemyDefinitionId: "enemy.goblin_slinger",
        entranceId: "entrance.west"
      })
    ])
  })
]) as readonly WaveDefinition[];

export function waveScheduleParityEvidence(): readonly WaveScheduleResolution[] {
  const atZero = resolveWaveSchedule({
    schemaVersion: 1,
    currentTick: 0,
    level: waveScheduleLevel,
    waves: [...waveScheduleWaves].reverse(),
    startedWaveIds: [],
    firedSpawnIds: [],
    pendingSpawns: []
  });
  const atFive = resolveWaveSchedule({
    schemaVersion: 1,
    currentTick: 5,
    level: waveScheduleLevel,
    waves: waveScheduleWaves,
    startedWaveIds: atZero.startedWaveIds,
    firedSpawnIds: atZero.firedSpawnIds,
    pendingSpawns: atZero.pendingSpawns
  });
  const atSix = resolveWaveSchedule({
    schemaVersion: 1,
    currentTick: 6,
    level: waveScheduleLevel,
    waves: waveScheduleWaves,
    startedWaveIds: atFive.startedWaveIds,
    firedSpawnIds: atFive.firedSpawnIds,
    pendingSpawns: atFive.pendingSpawns
  });
  return Object.freeze([atZero, atFive, atSix]);
}
