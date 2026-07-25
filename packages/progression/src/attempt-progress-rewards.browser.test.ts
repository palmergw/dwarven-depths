import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { attemptProgressRewardParityEvidence } from "./attempt-progress-rewards.fixture.js";

const checksum =
  "ed32af16d6ac5e39fc57c2ca58e2ed8970d1d2b8d959d212e82ef3c985d4fe95";

describe("attempt progress reward browser parity", () => {
  it("matches literal Node persistent reward evidence", async () => {
    const evidence = attemptProgressRewardParityEvidence();
    expect(evidence.committed.profile.forgeOre).toBe(13);
    expect(evidence.committed.ledger.claims).toHaveLength(2);
    expect(evidence.replayed.decisions[0]?.reason).toBe(
      "attempt_progress_reward_previously_claimed"
    );
    expect(evidence.conflictingReplayError).toContain(
      "conflicts with claimed attempt evidence"
    );
    expect(await canonicalHash(evidence)).toBe(checksum);
  });
});
