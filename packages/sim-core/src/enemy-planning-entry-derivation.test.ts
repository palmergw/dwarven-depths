import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { enemyPlanningEntryDerivationParityEvidence } from "./enemy-planning-entry-derivation.fixture.js";

const EXPECTED_CHECKSUM =
  "13572164b73f1f4f53aad8ce7abbe477e4c8c2aec7c7324c6b5c5c1d3a29e0a1";

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
      [true, true]
    );
    expect(entry?.candidates.map((candidate) => candidate.pathCost)).toEqual([
      90, 60
    ]);
    expect(entry?.solidBlockerEntityIds).toEqual([
      "entity.dwarf.warden_keep",
      "entity.dwarf.warden_north"
    ]);
    expect(evidence.actionDecisions[0]).toMatchObject({
      status: "tracking",
      reason: "target_acquired_for_movement"
    });
    expect(evidence.movementDecisions[0]).toMatchObject({
      status: "proposed",
      reason: "route_next_node_selected",
      proposal: {
        fromNodeId: "node.shuttergate_west_entry",
        toNodeId: "node.shuttergate_west_hall"
      }
    });
    expect(evidence.afterDwarfDowned.entries[0]?.candidates).toEqual([]);
    expect(evidence.afterDwarfDowned.entries[0]?.solidBlockerEntityIds).toEqual(
      []
    );
    expect(Object.isFrozen(evidence.derived.entries)).toBe(true);
    expect(Object.isFrozen(entry?.candidates)).toBe(true);
    expect(await canonicalHash(evidence)).toBe(EXPECTED_CHECKSUM);
  });
});
