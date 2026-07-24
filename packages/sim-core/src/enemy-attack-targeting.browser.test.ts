import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { enemyAttackTargetingParityEvidence } from "./enemy-attack-targeting.fixture.js";

describe("enemy attack targeting browser parity", () => {
  it("matches the pinned Node integration evidence", async () => {
    const evidence = enemyAttackTargetingParityEvidence();
    expect(evidence.retainedDwarf.decisions[0]?.commitment.status).toBe(
      "committed"
    );
    expect(evidence.retainedBlocker.decisions[0]?.targetLock.status).toBe(
      "retained"
    );
    expect(evidence.reacquired.decisions[0]?.commitment.status).toBe(
      "cancelled"
    );
    expect(evidence.unlocked.decisions[0]?.targetLock.status).toBe("unlocked");
    expect(await canonicalHash(evidence)).toBe(
      "3aa7bfc0ef7da7612a49a37ccd03107daa7ee315932b93a412085df162ab0e7a"
    );
  });
});
