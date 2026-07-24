import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { dwarfAttackTargetingParityEvidence } from "./dwarf-attack-targeting.fixture.js";

describe("dwarf attack targeting browser parity", () => {
  it("matches the pinned Node integration evidence", async () => {
    const evidence = dwarfAttackTargetingParityEvidence();
    expect(evidence.retained.decisions[0]?.commitment.status).toBe("committed");
    expect(evidence.reacquired.decisions[0]?.commitment.status).toBe(
      "cancelled"
    );
    expect(evidence.unlocked.decisions[0]?.targetLock.status).toBe("unlocked");
    expect(await canonicalHash(evidence)).toBe(
      "9ab71c2dff51e19bfabc925e174697f6dd68b0e0a731815393e072632b477437"
    );
  });
});
