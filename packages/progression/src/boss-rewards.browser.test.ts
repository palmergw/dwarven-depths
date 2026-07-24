import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { bossRewardParityEvidence } from "./boss-rewards.fixture.js";

const checksum =
  "c9fc9b96c08093059ab54dc529d4a38aae744aac461b7ed818c2b6689e53bcac";

describe("boss reward browser parity", () => {
  it("matches the literal Node evidence checksum", async () => {
    const evidence = bossRewardParityEvidence();
    expect(
      evidence.committed.decisions.map((decision) => decision.status)
    ).toEqual(["claimed", "claimed"]);
    expect(evidence.replayed.decisions[0]?.status).toBe("already_claimed");
    expect(evidence.simultaneousTerminalOutcome.terminalResult).toBe("defeat");
    expect(await canonicalHash(evidence)).toBe(checksum);
  });
});
