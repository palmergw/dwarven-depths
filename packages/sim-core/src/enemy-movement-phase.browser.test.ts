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
      "1d7bb42da40ae6f45424b7691a06761653a59a524cedb33c2559dacada0a3087"
    );
  });
});
