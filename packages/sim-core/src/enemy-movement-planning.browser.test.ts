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
      "e4a188281420c86eac8d0b2b4309236bd317cab8eb5160e76153066d12136055"
    );
  });
});
