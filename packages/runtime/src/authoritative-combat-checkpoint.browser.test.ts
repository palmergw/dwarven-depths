import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { authoritativeCombatCheckpointParityEvidence } from "./authoritative-combat-checkpoint.fixture.js";

const EXPECTED_CHECKSUM =
  "36513a43fc87a4eb88ccc54bc62903a828b1b303d0d667794ad2e09ae59c9a2b";

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
