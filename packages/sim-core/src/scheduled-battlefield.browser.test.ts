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
      "99c041bd09947025a43ee9523a11dafd6d5d1f396ba825bd97aa023b4c72f2a1"
    );
  });
});
