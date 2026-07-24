import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import {
  waveScheduleLevel,
  waveScheduleParityEvidence,
  waveScheduleWaves
} from "./wave-schedule.fixture.js";
import { resolveWaveSchedule } from "./wave-schedule.js";

function initialRequest() {
  return {
    schemaVersion: 1 as const,
    currentTick: 5,
    level: waveScheduleLevel,
    waves: waveScheduleWaves,
    startedWaveIds: [],
    firedSpawnIds: [],
    pendingSpawns: []
  };
}

describe("authored wave scheduling", () => {
  it("starts overlapping waves and enqueues due spawns in authored order", () => {
    const result = resolveWaveSchedule(initialRequest());
    expect(result.startedWaveIds).toEqual(["wave.first", "wave.second"]);
    expect(result.firedSpawnIds).toEqual(["spawn.cutter", "spawn.slinger"]);
    expect(result.pendingSpawns.map((spawn) => spawn.id)).toEqual([
      "spawn.cutter",
      "spawn.slinger"
    ]);
    expect(
      result.pendingSpawns.map((spawn) => spawn.enemyDefinitionId)
    ).toEqual(["enemy.goblin_cutter", "enemy.goblin_slinger"]);
    expect(result.decisions.map((decision) => decision.reason)).toEqual([
      "authored_wave_start_reached",
      "authored_wave_start_reached",
      "authored_spawn_tick_reached",
      "authored_spawn_tick_reached"
    ]);
  });

  it("fires each event once and leaves future events untouched", () => {
    const first = resolveWaveSchedule(initialRequest());
    const repeated = resolveWaveSchedule({
      ...initialRequest(),
      startedWaveIds: first.startedWaveIds,
      firedSpawnIds: first.firedSpawnIds,
      pendingSpawns: first.pendingSpawns
    });
    expect(repeated.decisions).toEqual([]);
    expect(repeated).toMatchObject({
      startedWaveIds: first.startedWaveIds,
      firedSpawnIds: first.firedSpawnIds,
      pendingSpawns: first.pendingSpawns
    });
    expect(repeated.firedSpawnIds).not.toContain("spawn.bulwark");
  });

  it("uses level wave IDs and authored spawn order instead of array order", () => {
    const forward = resolveWaveSchedule(initialRequest());
    const reversed = resolveWaveSchedule({
      ...initialRequest(),
      waves: [...waveScheduleWaves].reverse().map((wave) => ({
        ...wave,
        spawnEvents: [...wave.spawnEvents].reverse()
      }))
    });
    expect(reversed).toEqual(forward);
  });

  it("returns detached deeply immutable evidence", () => {
    const request = initialRequest();
    const before = structuredClone(request);
    const result = resolveWaveSchedule(request);
    expect(request).toEqual(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.startedWaveIds)).toBe(true);
    expect(Object.isFrozen(result.pendingSpawns)).toBe(true);
    expect(Object.isFrozen(result.pendingSpawns[0])).toBe(true);
    expect(Object.isFrozen(result.decisions)).toBe(true);
    expect(Object.isFrozen(result.decisions[0])).toBe(true);
  });

  it("rejects malformed schedules and inconsistent progress", () => {
    expect(() =>
      resolveWaveSchedule({ ...initialRequest(), currentTick: -1 })
    ).toThrow("non-negative safe integer");
    expect(() =>
      resolveWaveSchedule({
        ...initialRequest(),
        waves: [waveScheduleWaves[0] as never, waveScheduleWaves[0] as never]
      })
    ).toThrow("duplicate wave definition ID");
    expect(() =>
      resolveWaveSchedule({
        ...initialRequest(),
        waves: waveScheduleWaves.map((wave, index) =>
          index === 0 ? ({ ...wave, kind: "level" } as never) : wave
        )
      })
    ).toThrow("kind must be wave");
    expect(() =>
      resolveWaveSchedule({
        ...initialRequest(),
        waves: waveScheduleWaves.map((wave, index) =>
          index === 1
            ? {
                ...wave,
                spawnEvents: wave.spawnEvents.map((event) => ({
                  ...event,
                  authoredOrder: 0
                }))
              }
            : wave
        )
      })
    ).toThrow("duplicate authored spawn order");
    expect(() =>
      resolveWaveSchedule({
        ...initialRequest(),
        startedWaveIds: ["wave.second" as never],
        currentTick: 4
      })
    ).toThrow("is in the future");
    expect(() =>
      resolveWaveSchedule({
        ...initialRequest(),
        firedSpawnIds: ["spawn.missing" as never]
      })
    ).toThrow("unknown fired spawn ID");
    expect(() =>
      resolveWaveSchedule({
        ...initialRequest(),
        firedSpawnIds: ["spawn.cutter" as never]
      })
    ).toThrow("wave that is not marked started");
    const scheduled = resolveWaveSchedule(initialRequest());
    expect(() =>
      resolveWaveSchedule({
        ...initialRequest(),
        startedWaveIds: scheduled.startedWaveIds,
        firedSpawnIds: scheduled.firedSpawnIds,
        pendingSpawns: scheduled.pendingSpawns.map((spawn, index) =>
          index === 0
            ? { ...spawn, enemyDefinitionId: "enemy.tampered" as never }
            : spawn
        )
      })
    ).toThrow("does not match authored schedule");
  });

  it("pins the overlapping-wave Node evidence checksum", async () => {
    expect(await canonicalHash(waveScheduleParityEvidence())).toBe(
      "c660f897c9dd1d239f9e821211c64e7597bb8f582d773b0bbea1d512c7c7ba19"
    );
  });
});
