import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { dwarfActionPhaseParityEvidence } from "./dwarf-action-phase.fixture.js";

const checksum =
  "19252f870ee9075d22c480920c7bbb78c75d8720ea0394cb26f48fc8ca632e17";

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
    expect(await canonicalHash(evidence)).toBe(checksum);
  });
});
