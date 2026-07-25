import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { authoritativeCombatCheckpointParityEvidence } from "./authoritative-combat-checkpoint.fixture.js";

const EXPECTED_CHECKSUM =
  "73af8322d8725bb02be620b9a7818612670609bc0e0730a4da6c7389130b85fb";

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
