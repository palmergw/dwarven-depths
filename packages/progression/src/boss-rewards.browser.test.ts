import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { bossRewardParityEvidence } from "./boss-rewards.fixture.js";

const checksum =
  "5bd2cd17fa2ec0cc17285a9abdb861c99dc3d822ebc8ccd425c92ff4719f77fa";

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
