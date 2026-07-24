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
      "5f0f4f98e100e38f4aab331cb9e1df00189b512c2f52b5af76bd0c0c3c5ad84f"
    );
  });
});
