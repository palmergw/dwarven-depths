import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import {
  terminalEvaluationParityEvidence,
  terminalEvaluationRequest
} from "./terminal-evaluation.fixture.js";
import { evaluateTerminalState } from "./terminal-evaluation.js";

const checksum =
  "f3ee3bb0fe3efc44782374517d9abb6c1c050dc157daf2bb6eb909a735cde5e9";

describe("final cleanup and terminal evaluation", () => {
  it("enters final cleanup only at the authored boundary and resolves blockers", async () => {
    const evidence = terminalEvaluationParityEvidence();
    expect(evidence.map((result) => result.reason)).toEqual([
      "final_wave_in_progress",
      "pending_spawns_queued",
      "living_hostile_enemies_remain",
      "living_hostile_deployables_remain",
      "victory_conditions_met",
      "all_dwarves_downed"
    ]);
    expect(evidence[0]).toMatchObject({
      state: "combat_running",
      finalCleanupEntered: false
    });
    expect(evidence[1]).toMatchObject({
      state: "final_cleanup",
      pendingSpawns: 1
    });
    expect(evidence[4]).toMatchObject({
      state: "terminal",
      terminalResult: "victory"
    });
    expect(evidence[5]).toMatchObject({
      state: "terminal",
      terminalResult: "defeat"
    });
    expect(
      evaluateTerminalState(
        terminalEvaluationRequest({
          waveSchedule: {
            ...terminalEvaluationRequest().waveSchedule,
            currentTick: 9
          },
          livingDwarfIds: []
        })
      )
    ).toMatchObject({
      finalCleanupEntered: false,
      terminalResult: "defeat",
      reason: "all_dwarves_downed"
    });
    expect(await canonicalHash(evidence)).toBe(checksum);
  });

  it("ignores caller ordering and returns frozen detached evidence", () => {
    const request = terminalEvaluationRequest({
      livingDwarfIds: [
        "entity.dwarf.ranger" as never,
        "entity.dwarf.warden" as never
      ],
      livingHostileEnemyIds: [
        "entity.enemy.slinger" as never,
        "entity.enemy.cutter" as never
      ]
    });
    const reversed = {
      ...request,
      livingDwarfIds: [...request.livingDwarfIds].reverse(),
      livingHostileEnemyIds: [...request.livingHostileEnemyIds].reverse(),
      waveSchedule: {
        ...request.waveSchedule,
        waves: [...request.waveSchedule.waves].reverse(),
        startedWaveIds: [...request.waveSchedule.startedWaveIds].reverse(),
        firedSpawnIds: [...request.waveSchedule.firedSpawnIds].reverse()
      }
    };
    const forward = evaluateTerminalState(request);
    const reordered = evaluateTerminalState(reversed);
    expect(reordered).toEqual(forward);
    expect(Object.isFrozen(reordered)).toBe(true);
    expect(reordered.livingDwarves).toBe(2);
  });

  it("strictly rejects malformed and unresolved authoritative state", () => {
    expect(() =>
      evaluateTerminalState({
        ...terminalEvaluationRequest(),
        schemaVersion: 2
      } as never)
    ).toThrow("schemaVersion must be 1");
    expect(() =>
      evaluateTerminalState({
        ...terminalEvaluationRequest(),
        livingDwarfIds: ["dwarf.warden" as never]
      })
    ).toThrow("entity.* stable IDs");
    expect(() =>
      evaluateTerminalState({
        ...terminalEvaluationRequest(),
        livingDwarfIds: [
          "entity.dwarf.warden" as never,
          "entity.dwarf.warden" as never
        ]
      })
    ).toThrow("duplicate ID");
    expect(() =>
      evaluateTerminalState({
        ...terminalEvaluationRequest(),
        waveSchedule: {
          ...terminalEvaluationRequest().waveSchedule,
          firedSpawnIds: ["spawn.cutter" as never]
        }
      })
    ).toThrow("must already be resolved through currentTick");

    const customPrototypeIds = ["entity.dwarf.warden" as never];
    Object.setPrototypeOf(customPrototypeIds, {
      [Symbol.iterator]() {
        return {
          next() {
            return { done: true, value: undefined };
          }
        };
      }
    });
    expect(() =>
      evaluateTerminalState({
        ...terminalEvaluationRequest(),
        livingDwarfIds: customPrototypeIds
      })
    ).toThrow("livingDwarfIds must be a standard array");

    const request = terminalEvaluationRequest();
    expect(() =>
      evaluateTerminalState({
        ...request,
        waveSchedule: {
          ...request.waveSchedule,
          level: { ...request.waveSchedule.level, unexpected: true }
        }
      } as never)
    ).toThrow("waveSchedule.level must contain exactly");

    expect(() =>
      evaluateTerminalState({
        ...request,
        waveSchedule: {
          ...request.waveSchedule,
          level: { ...request.waveSchedule.level, mapId: "not-a-map-id" }
        }
      } as never)
    ).toThrow("mapId must be a map.* stable ID");
  });
});
