import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { attemptProgressRewardParityEvidence } from "./attempt-progress-rewards.fixture.js";

const checksum =
  "a054d7ab58d97532058c520ec567b5168788ce1f3c103f514994d36790d9d4a7";

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
