import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { authoritativeCombatCheckpointParityEvidence } from "./authoritative-combat-checkpoint.fixture.js";

const EXPECTED_CHECKSUM =
  "99973646d2ca6c694f36bf57c60dec71788cf7d9a056f607609fb0ebc33c80f9";

describe("authoritative combat checkpoint browser parity", () => {
  it("matches literal Node reward and terminal evidence", async () => {
    const evidence = await authoritativeCombatCheckpointParityEvidence();
    expect(evidence.simultaneous.tick1.terminalEvaluation.terminalResult).toBe(
      "defeat"
    );
    expect(evidence.simultaneous.tick1.bossRewards.decisions[0]?.status).toBe(
      "claimed"
    );
    expect(await canonicalHash(evidence)).toBe(EXPECTED_CHECKSUM);
  });
});
