import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { targetLockParityEvidence } from "./target-locks.fixture.js";

describe("target-lock browser parity", () => {
  it("pins retained and reacquired dwarf/enemy locks to Node evidence", async () => {
    const evidence = targetLockParityEvidence();
    expect(evidence.reacquired.targetEntityId).toBe("entity.enemy.near");
    expect(evidence.enemy.targetEntityId).toBe("entity.deployable.route");
    expect(await canonicalHash(evidence)).toBe(
      "3db7f5f4523da2cfe56d3b39b0b1860867e729d61ce2fface23ff36070a55cc4"
    );
  });
});
