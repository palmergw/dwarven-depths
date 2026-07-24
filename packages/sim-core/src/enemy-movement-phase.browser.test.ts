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
      "057ef3257a1871a0cb155870e41e448711b29a64c3812a38f82df7542403c835"
    );
  });
});
