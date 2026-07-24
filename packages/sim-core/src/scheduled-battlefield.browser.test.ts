import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { scheduledBattlefieldParityEvidence } from "./scheduled-battlefield.fixture.js";

describe("scheduled battlefield browser parity", () => {
  it("matches the literal Node evidence checksum", async () => {
    const evidence = await scheduledBattlefieldParityEvidence();
    expect(evidence[0]?.events.map((event) => event.type)).toEqual([
      "wave.started",
      "wave.started",
      "spawn.enqueued",
      "spawn.enqueued",
      "spawn.admitted",
      "spawn.queued"
    ]);
    expect(await canonicalHash(evidence)).toBe(
      "dc1bfb6b39733d418d853a98eb762d73e5c53b1f7696a100683bfcfe81d528dc"
    );
  });
});
