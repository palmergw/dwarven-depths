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
      "22616017f9c2478df01596fe93d732cf21649b228e11a12bdc420c78f134321a"
    );
  });
});
