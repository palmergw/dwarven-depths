import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { enemyPlanningEntryDerivationParityEvidence } from "./enemy-planning-entry-derivation.fixture.js";

const EXPECTED_CHECKSUM =
  "469fe0ef9ebf1452a21fc565d4d25bd574a0ab7a6b4ce204501aa7446790eb33";

describe("authoritative enemy planning-entry derivation", () => {
  it("derives Shuttergate dwarf routes that feed the existing action and movement phases", async () => {
    const evidence = await enemyPlanningEntryDerivationParityEvidence();
    const entry = evidence.derived.entries[0];
    expect(entry?.enemyEntityId).toBe("entity.enemy.shuttergate_001");
    expect(entry?.candidates.map((candidate) => candidate.entityId)).toEqual([
      "entity.dwarf.warden_keep",
      "entity.dwarf.warden_north"
    ]);
    expect(entry?.candidates.map((candidate) => candidate.isReachable)).toEqual(
      [false, false]
    );
    expect(entry?.solidBlockerEntityIds).toEqual([
      "entity.dwarf.warden_keep",
      "entity.dwarf.warden_north"
    ]);
    expect(evidence.actionDecisions[0]).toMatchObject({
      status: "unlocked",
      reason: "no_eligible_target"
    });
    expect(evidence.movementDecisions[0]?.reason).toBe("movement_not_due");
    expect(evidence.afterDwarfDowned.entries[0]?.candidates).toEqual([]);
    expect(evidence.afterDwarfDowned.entries[0]?.solidBlockerEntityIds).toEqual(
      []
    );
    expect(Object.isFrozen(evidence.derived.entries)).toBe(true);
    expect(Object.isFrozen(entry?.candidates)).toBe(true);
    expect(await canonicalHash(evidence)).toBe(EXPECTED_CHECKSUM);
  });
});
