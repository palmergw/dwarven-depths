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
      "adeade2f4e28a693f17fe519ccb055fe2654e631de1e04254d777e72b01f58d1"
    );
  });
});
