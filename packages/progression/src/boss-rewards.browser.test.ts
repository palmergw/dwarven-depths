import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { bossRewardParityEvidence } from "./boss-rewards.fixture.js";

const checksum =
  "af51a876546e10ddc1c7e6bf065d5061b7de0a4e8ca9f9f965b0d408344ea457";

describe("boss reward browser parity", () => {
  it("matches the literal Node evidence checksum", async () => {
    const evidence = bossRewardParityEvidence();
    expect(
      evidence.committed.decisions.map((decision) => decision.status)
    ).toEqual(["claimed", "claimed"]);
    expect(evidence.replayed.decisions[0]?.status).toBe("already_claimed");
    expect(await canonicalHash(evidence)).toBe(checksum);
  });
});
