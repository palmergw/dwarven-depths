import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { enemyMovementPlanningParityEvidence } from "./enemy-movement-planning.fixture.js";

describe("enemy movement planning browser parity", () => {
  it("matches literal Node movement-planning evidence", async () => {
    const evidence = await enemyMovementPlanningParityEvidence();
    expect(evidence.proposed.proposals[0]?.toNodeId).toBe("node.south");
    expect(evidence.alreadyValid.decisions[0]?.reason).toBe(
      "already_attack_valid"
    );
    expect(await canonicalHash(evidence)).toBe(
      "be96a4265f2adbe8376cd12e2308ac50d68ed4966b288d648fafa0f025a89ab6"
    );
  });
});
