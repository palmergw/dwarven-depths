import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { dwarfActionPhaseParityEvidence } from "./dwarf-action-phase.fixture.js";

const checksum =
  "311c25a76be19e3b6cd920a66c884e14436cbc76c7c109c90612f80523ccc486";

describe("dwarf action phase browser parity", () => {
  it("matches literal Node action evidence", async () => {
    const evidence = await dwarfActionPhaseParityEvidence();
    expect(evidence.started.decisions[0]?.reason).toBe("basic_attack_started");
    expect(evidence.committed.decisions[0]?.reason).toBe(
      "basic_attack_committed"
    );
    expect(evidence.sourceDowned[0]?.impactAtTick).toBe(16);
    expect(
      evidence.enemyPhase.battlefield.pendingCommittedAttacks.find(
        (attack) => attack.sourceEntityId === "entity.dwarf.warden"
      )?.sourceEntityId
    ).toBe("entity.dwarf.warden");
    expect(
      evidence.scheduledPhase.state.battlefield?.pendingCommittedAttacks.find(
        (attack) => attack.sourceEntityId === "entity.dwarf.warden"
      )?.sourceEntityId
    ).toBe("entity.dwarf.warden");
    expect(
      evidence.impacted.battlefield.enemyCombatants[0]?.lifecycleState
    ).toBe("destroyed");
    expect(evidence.substitutionError).toContain(
      "do not match authoritative pending attacks"
    );
    expect(await canonicalHash(evidence)).toBe(checksum);
  });
});
