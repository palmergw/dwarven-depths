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
      "attack.goblin_cutter_basic.enemy.already.tick_6"
    );
    expect(await canonicalHash(evidence)).toBe(
      "3375f6faa4c212ee26bcaed8f9a8f856eee3a9ca1d87b1ab252a7bf375fb2fa7"
    );
  });
});
