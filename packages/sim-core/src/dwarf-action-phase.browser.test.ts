import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { dwarfActionPhaseParityEvidence } from "./dwarf-action-phase.fixture.js";

const checksum =
  "6c6bbe2fc79b809a88dc32dd2bd166e52e39c96c633c3e0a24bc8dd286c40832";

describe("dwarf action phase browser parity", () => {
  it("matches literal Node action evidence", async () => {
    const evidence = await dwarfActionPhaseParityEvidence();
    expect(evidence.started.decisions[0]?.reason).toBe("basic_attack_started");
    expect(evidence.committed.decisions[0]?.reason).toBe(
      "basic_attack_committed"
    );
    expect(evidence.sourceDowned[0]?.impactAtTick).toBe(16);
    expect(
      evidence.enemyPhase.battlefield.pendingCommittedAttacks[0]?.sourceEntityId
    ).toBe("entity.dwarf.warden");
    expect(
      evidence.scheduledPhase.state.battlefield?.pendingCommittedAttacks[0]
        ?.sourceEntityId
    ).toBe("entity.dwarf.warden");
    expect(evidence.substitutionError).toContain(
      "do not match authoritative pending attacks"
    );
    expect(await canonicalHash(evidence)).toBe(checksum);
  });
});
