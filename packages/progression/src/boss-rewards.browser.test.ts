import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { bossRewardParityEvidence } from "./boss-rewards.fixture.js";

const checksum =
  "dcc724393a93956edd3c2b7cac5c1bae7292e2f4fb1644663cf94a3038ebdbda";

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
