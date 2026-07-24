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
      "0756ae1c17e7548dbac80e3f043af10c6985cc3fe7df7ab01d9a63e1acd93866"
    );
  });
});
