import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { waveScheduleParityEvidence } from "./wave-schedule.fixture.js";

describe("authored wave schedule browser parity", () => {
  it("matches the literal Node evidence checksum", async () => {
    const evidence = waveScheduleParityEvidence();
    expect(evidence[1]?.startedWaveIds).toEqual(["wave.first", "wave.second"]);
    expect(await canonicalHash(evidence)).toBe(
      "3a9da8e4f0b55e71995a39a79999f05f0dc86826b694a896330ed4873fc42ef3"
    );
  });
});
