import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { authoritativeCombatCheckpointParityEvidence } from "./authoritative-combat-checkpoint.fixture.js";

const EXPECTED_CHECKSUM =
  "33a31f517946ab64cbe9dad59026644b7c136375ae50d411718a9f51a23d47ca";

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
