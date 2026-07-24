import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { bossRewardParityEvidence } from "./boss-rewards.fixture.js";

const checksum =
  "9250512b00c69b2b478af521a95fa4076b294613214bdc96774a13a4f3ddce9f";

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
