import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { dwarfActionPhaseParityEvidence } from "./dwarf-action-phase.fixture.js";

const checksum =
  "a1989122047547229de4739cf815c3c5d6250733ba69eab83989cc1b0356513e";

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
      "target does not match accepted commitment evidence"
    );
    expect(await canonicalHash(evidence)).toBe(checksum);
  });
});
