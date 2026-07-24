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
      "404c87a118f81d050de22dd600ad292a33c003d43645092850f3740ac54fa628"
    );
  });
});
