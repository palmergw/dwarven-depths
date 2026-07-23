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
  it("uses a repeatable integer PRNG sequence", () => {
    const first = nextUint32(seedToUint32("1"));
    expect(first).toBe(nextUint32(seedToUint32("1")));
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
