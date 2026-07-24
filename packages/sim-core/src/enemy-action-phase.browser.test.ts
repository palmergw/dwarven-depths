import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { enemyActionPhaseParityEvidence } from "./enemy-action-phase.fixture.js";

describe("enemy action phase browser parity", () => {
  it("matches literal Node target-lock and windup evidence", async () => {
    const evidence = await enemyActionPhaseParityEvidence();
    expect(evidence.tracking.decisions[0]?.reason).toBe(
      "target_acquired_for_movement"
    );
    expect(evidence.committed.committedAttacks[0]?.attackId).toBe(
      "attack.goblin_cutter_basic.enemy.already.source_length_13.tick_6"
    );
    expect(await canonicalHash(evidence)).toBe(
      "9b5b114b37d22c60307dc5c8d7c7d2112e9e1f08fc6b9f9b2f2ad9fc13e9cbf6"
    );
  });
});
