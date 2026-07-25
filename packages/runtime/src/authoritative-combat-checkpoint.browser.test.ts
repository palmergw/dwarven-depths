import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { authoritativeCombatCheckpointParityEvidence } from "./authoritative-combat-checkpoint.fixture.js";

const EXPECTED_CHECKSUM =
  "f62b5729813d6c83f83ea06484fbf0ca662616e68d13e98a800a485d80682b04";

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
