import { compileContent } from "@dwarven-depths/content-runtime";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  nextUint32,
  seedToUint32,
  stateChecksum,
  stepSimulation
} from "./index.js";

const bundle = {
  schemaVersion: 1,
  contentVersion: "milestone-0",
  definitions: [{ kind: "level", id: "level.empty", waveIds: [] }]
};

describe("deterministic kernel", () => {
  it("uses golden repeatable integer PRNG sequences", () => {
    let state = seedToUint32("1");
    const sequence: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      state = nextUint32(state);
      sequence.push(state);
    }
    expect(sequence).toEqual([270369, 67634689, 2647435461, 307599695]);
    expect(() => seedToUint32("0")).toThrow(/between 1 and 4294967295/);
    expect(() => seedToUint32("4294967296")).toThrow(
      /between 1 and 4294967295/
    );
  });

  it("advances past a preparation command exactly once", async () => {
    const content = await compileContent({
      schemaVersion: 1,
      contentVersion: "milestone-0",
      definitions: [
        { kind: "level", id: "level.wave", waveIds: ["wave.first"] },
        { kind: "wave", id: "wave.first", durationTicks: 30 }
      ]
    });
    const state = createInitialState(content, "level.wave" as never, "1");
    const command = {
      tick: 0,
      sequence: 0,
      command: { atTick: 0, type: "confirmPreparation" as const }
    };

    const result = stepSimulation(state, [command], content);
    expect(result.state.phase).toBe("COMBAT_RUNNING");
    expect(result.state.tick).toBe(1);
    expect(result.state.rngState).toBe(state.rngState);
    expect(result.events.map((event) => event.type)).toEqual(["round.started"]);
  });

  it("terminates an empty level deterministically", async () => {
    const content = await compileContent(bundle);
    const state = createInitialState(content, "level.empty" as never, "1");
    const command = {
      tick: 0,
      sequence: 0,
      command: { atTick: 0, type: "confirmPreparation" as const }
    };
    const first = stepSimulation(state, [command], content);
    const second = stepSimulation(state, [command], content);

    expect(first.state.terminalResult).toBe("victory");
    expect(first.events).toEqual(second.events);
    await expect(stateChecksum(first.state)).resolves.toBe(
      await stateChecksum(second.state)
    );
  });
});
