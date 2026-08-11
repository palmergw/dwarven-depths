import { describe, expect, it, vi } from "vitest";
import {
  type CombatAudioContext,
  createCombatSoundPlayer,
  deriveCombatFeedback,
  shouldAdvanceCombatFeedbackBaseline
} from "./combat-feedback.js";
import type { RenderSnapshot } from "./render-snapshot.js";

function snapshot(
  tick: number,
  phase: RenderSnapshot["phase"],
  entityIds: readonly string[]
): RenderSnapshot {
  return {
    schemaVersion: 1,
    levelId: "level.shuttergate_hall",
    mapId: "map.shuttergate_hall",
    tick,
    phase,
    nodes: [{ id: "node.gate", x: 0, y: 0 }],
    connections: [],
    entities: entityIds.map((id) => ({
      id,
      nodeId: "node.gate",
      faction: id.includes("enemy") ? "enemy" : "dwarf"
    }))
  };
}

describe("combat presentation feedback", () => {
  it("derives canonical snapshot changes without initial or replay feedback", () => {
    const initial = snapshot(1, "running", ["entity.dwarf.zed"]);
    const changed = snapshot(2, "running", [
      "entity.enemy.zed",
      "entity.enemy.alpha"
    ]);
    expect(deriveCombatFeedback(undefined, initial)).toBeUndefined();
    expect(deriveCombatFeedback(initial, initial)).toBeUndefined();
    expect(deriveCombatFeedback(changed, initial)).toBeUndefined();

    const feedback = deriveCombatFeedback(initial, changed);
    expect(feedback).toEqual({
      tick: 2,
      arrivals: [
        {
          id: "entity.enemy.alpha",
          nodeId: "node.gate",
          faction: "enemy"
        },
        {
          id: "entity.enemy.zed",
          nodeId: "node.gate",
          faction: "enemy"
        }
      ],
      cues: ["wave", "departure"],
      departures: [
        {
          id: "entity.dwarf.zed",
          nodeId: "node.gate",
          faction: "dwarf"
        }
      ],
      terminal: false,
      summary:
        "Combat update at tick 2: 2 combatants arrived; 1 combatant departed."
    });
  });

  it("binds terminal feedback to monotonic phase progression", () => {
    const running = snapshot(3, "running", []);
    const terminal = snapshot(3, "terminal", []);
    expect(deriveCombatFeedback(running, terminal)?.summary).toBe(
      "Combat update at tick 3: combat resolved."
    );
    expect(deriveCombatFeedback(terminal, running)).toBeUndefined();
    expect(
      deriveCombatFeedback(running, {
        ...terminal,
        levelId: "level.foreign"
      })
    ).toBeUndefined();
  });

  it("rebases one skipped v2 snapshot so later feedback resumes", () => {
    const base = {
      schemaVersion: 2,
      scenarioId: "scenario.gap",
      levelId: "level.shuttergate_hall",
      mapId: "map.shuttergate_hall",
      tick: 10,
      previousTick: 9,
      phase: "running",
      nodes: [],
      connections: [],
      entities: [],
      entityTransitions: [],
      encounter: {
        startedWaveIds: [],
        activeWaveId: null,
        pendingSpawnCount: 0,
        livingHostileCount: 0,
        terminalResult: null
      }
    } as const satisfies RenderSnapshot;
    const skipped = { ...base, tick: 12, previousTick: 11 } as const;
    const resumed = { ...base, tick: 13, previousTick: 12 } as const;
    expect(deriveCombatFeedback(base, skipped)).toBeUndefined();
    expect(shouldAdvanceCombatFeedbackBaseline(base, skipped)).toBe(true);
    expect(shouldAdvanceCombatFeedbackBaseline(skipped, resumed)).toBe(true);
    expect(
      shouldAdvanceCombatFeedbackBaseline(skipped, {
        ...resumed,
        scenarioId: "scenario.foreign"
      })
    ).toBe(false);
    expect(shouldAdvanceCombatFeedbackBaseline(resumed, skipped)).toBe(false);
  });

  it("presents authored v2 deployment arrivals on the first mounted snapshot", () => {
    const entity = {
      id: "entity.dwarf.warden",
      nodeId: "node.gate",
      faction: "dwarf",
      visualId: "character.iron_warden",
      archetype: "character",
      position: { nodeId: "node.gate", x: 0, y: 0 },
      previousPosition: null,
      currentHealth: 10,
      maximumHealth: 10,
      facing: "east",
      action: { kind: "idle", phase: "idle", abilityId: null },
      targetEntityId: null,
      statuses: [],
      transition: "spawned",
      elite: false,
      boss: false
    } as const;
    const initial = {
      schemaVersion: 2,
      scenarioId: "scenario.deployment",
      levelId: "level.shuttergate_hall",
      mapId: "map.shuttergate_hall",
      tick: 1,
      previousTick: null,
      phase: "running",
      nodes: [{ id: "node.gate", x: 0, y: 0 }],
      connections: [],
      entities: [entity],
      entityTransitions: [{ entityId: entity.id, kind: "spawned", atTick: 1 }],
      encounter: {
        startedWaveIds: [],
        activeWaveId: null,
        pendingSpawnCount: 0,
        livingHostileCount: 0,
        terminalResult: null
      }
    } as const satisfies RenderSnapshot;
    expect(deriveCombatFeedback(undefined, initial)).toMatchObject({
      arrivals: [entity],
      departures: [],
      terminal: false
    });
  });

  it("derives bounded action, impact, damage, and status cues from consecutive authoritative ticks", () => {
    const entity = {
      id: "entity.dwarf.warden",
      nodeId: "node.gate",
      faction: "dwarf",
      visualId: "character.iron_warden",
      archetype: "character",
      position: { nodeId: "node.gate", x: 0, y: 0 },
      previousPosition: { nodeId: "node.gate", x: 0, y: 0 },
      currentHealth: 10,
      maximumHealth: 10,
      facing: "east",
      action: { kind: "idle", phase: "idle", abilityId: null },
      targetEntityId: "entity.enemy.raider",
      statuses: [],
      transition: "active",
      elite: false,
      boss: false
    } as const;
    const hostile = {
      ...entity,
      id: "entity.enemy.raider",
      faction: "enemy",
      visualId: "enemy.goblin_slinger",
      archetype: "basic",
      facing: "west",
      targetEntityId: entity.id
    } as const;
    const base = {
      schemaVersion: 2,
      scenarioId: "scenario.feedback",
      levelId: "level.shuttergate_hall",
      mapId: "map.shuttergate_hall",
      tick: 20,
      previousTick: 19,
      phase: "running",
      nodes: [],
      connections: [],
      entities: [entity, hostile],
      entityTransitions: [],
      encounter: {
        startedWaveIds: ["wave.one"],
        activeWaveId: "wave.one",
        pendingSpawnCount: 0,
        livingHostileCount: 1,
        terminalResult: null
      }
    } as const satisfies RenderSnapshot;
    const changed = {
      ...base,
      tick: 21,
      previousTick: 20,
      entities: [
        {
          ...entity,
          action: {
            kind: "ability",
            phase: "impact",
            abilityId: "ability.iron_warden.shield_slam"
          }
        },
        {
          ...hostile,
          currentHealth: 7,
          action: { kind: "basic_attack", phase: "committed", abilityId: null },
          statuses: [
            {
              id: "status.staggered",
              appliedAtTick: 21,
              expiresAtTick: 25,
              magnitude: 1
            }
          ]
        }
      ]
    } as const satisfies RenderSnapshot;

    expect(deriveCombatFeedback(base, changed)).toMatchObject({
      tick: 21,
      cues: ["ranged_attack", "shield_slam_impact", "damage", "status"]
    });
    expect(deriveCombatFeedback(changed, changed)).toBeUndefined();
  });

  it("fails soft when audio creation is blocked", () => {
    const player = createCombatSoundPlayer(() => {
      throw new DOMException("blocked", "NotAllowedError");
    });
    const feedback = deriveCombatFeedback(
      snapshot(1, "running", []),
      snapshot(2, "terminal", [])
    );
    expect(feedback).toBeDefined();
    if (feedback === undefined) throw new Error("expected terminal feedback");
    expect(() => player.play(feedback)).not.toThrow();
    player.close();
  });

  it("schedules bounded cues and closes its audio context once", () => {
    const setValueAtTime = vi.fn();
    const exponentialRampToValueAtTime = vi.fn();
    const start = vi.fn();
    const stop = vi.fn();
    const close = vi.fn(() => Promise.resolve());
    const context: CombatAudioContext = {
      currentTime: 4,
      destination: {},
      state: "running",
      createOscillator: () => ({
        frequency: { setValueAtTime, exponentialRampToValueAtTime },
        type: "sine",
        connect: vi.fn(),
        start,
        stop
      }),
      createGain: () => ({
        gain: { setValueAtTime, exponentialRampToValueAtTime },
        connect: vi.fn()
      }),
      resume: vi.fn(() => Promise.resolve()),
      close
    };
    const player = createCombatSoundPlayer(() => context, 0.5);
    const feedback = deriveCombatFeedback(
      snapshot(1, "running", ["entity.dwarf.one"]),
      snapshot(2, "terminal", ["entity.enemy.one"])
    );
    expect(feedback).toBeDefined();
    if (feedback === undefined) throw new Error("expected transition feedback");
    player.play(feedback);
    expect(start).toHaveBeenCalledTimes(3);
    expect(stop).toHaveBeenCalledTimes(3);
    expect(setValueAtTime).toHaveBeenCalledWith(0.0175, 4);
    player.close();
    player.close();
    expect(close).toHaveBeenCalledOnce();
  });

  it("does not schedule a suspended cue after cleanup", async () => {
    let resolveResume: (() => void) | undefined;
    const createOscillator = vi.fn();
    const context: CombatAudioContext = {
      currentTime: 4,
      destination: {},
      state: "suspended",
      createOscillator,
      createGain: vi.fn(),
      resume: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveResume = resolve;
          })
      ),
      close: vi.fn(() => Promise.resolve())
    };
    const player = createCombatSoundPlayer(() => context);
    const feedback = deriveCombatFeedback(
      snapshot(1, "running", []),
      snapshot(2, "terminal", [])
    );
    expect(feedback).toBeDefined();
    if (feedback === undefined) throw new Error("expected terminal feedback");
    player.play(feedback);
    player.close();
    resolveResume?.();
    await Promise.resolve();
    expect(createOscillator).not.toHaveBeenCalled();
  });
});
