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
      "97ab711681105d8f16dc4016b0c0d78435da095da15b62f0c5836d068080273a"
    );
  });
});
