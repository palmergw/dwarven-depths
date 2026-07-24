import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { waveScheduleParityEvidence } from "./wave-schedule.fixture.js";

describe("authored wave schedule browser parity", () => {
  it("matches the literal Node evidence checksum", async () => {
    const evidence = waveScheduleParityEvidence();
    expect(evidence[1]?.startedWaveIds).toEqual(["wave.first", "wave.second"]);
    expect(await canonicalHash(evidence)).toBe(
      "c660f897c9dd1d239f9e821211c64e7597bb8f582d773b0bbea1d512c7c7ba19"
    );
  });
});
