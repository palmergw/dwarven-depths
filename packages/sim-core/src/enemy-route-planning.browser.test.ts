import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { enemyRouteParityEvidence } from "./enemy-route-planning.fixture.js";

describe("enemy route planning browser parity", () => {
  it("matches literal Node route evidence", async () => {
    const evidence = await enemyRouteParityEvidence();
    expect(evidence.captain.attackPositionNodeId).toBe("node.shuttergate_gate");
    expect(evidence.slinger.attackPositionNodeId).toBe(
      "node.shuttergate_east_hall"
    );
    expect(await canonicalHash(evidence)).toBe(
      "f03ac8641f630e6c7cce70ed90b4b498abbe001a6da0f70ad2cf89785b60f44e"
    );
  });
});
