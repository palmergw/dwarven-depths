import { describe, expect, it, vi } from "vitest";
import {
  type CombatAudioContext,
  createCombatSoundPlayer,
  deriveCombatFeedback
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
    const player = createCombatSoundPlayer(() => context);
    const feedback = deriveCombatFeedback(
      snapshot(1, "running", ["entity.dwarf.one"]),
      snapshot(2, "terminal", ["entity.enemy.one"])
    );
    expect(feedback).toBeDefined();
    if (feedback === undefined) throw new Error("expected transition feedback");
    player.play(feedback);
    expect(start).toHaveBeenCalledTimes(3);
    expect(stop).toHaveBeenCalledTimes(3);
    player.close();
    player.close();
    expect(close).toHaveBeenCalledOnce();
  });
});
