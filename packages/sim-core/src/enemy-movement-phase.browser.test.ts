import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { enemyMovementPhaseParityEvidence } from "./enemy-movement-phase.fixture.js";

describe("enemy movement phase browser parity", () => {
  it("matches literal Node reservation and cadence evidence", async () => {
    const evidence = await enemyMovementPhaseParityEvidence();
    expect(evidence.contention.reservations.decisions[0]?.reason).toBe("moved");
    expect(evidence.contention.reservations.decisions[1]?.reason).toBe(
      "destination_reserved"
    );
    expect(await canonicalHash(evidence)).toBe(
      "ec56f1e8ec27f154249a07a4005297309ae8ee23dee1a6264cd72bd0518bc223"
    );
  });
});
