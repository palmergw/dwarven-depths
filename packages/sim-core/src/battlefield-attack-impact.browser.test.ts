import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { battlefieldAttackImpactParityEvidence } from "./battlefield-attack-impact.fixture.js";
import { normalizeBattlefieldDwarves } from "./index.js";

const parityChecksum =
  "c197de6feed2dac3630389e508c546425960b544a1de23572e3a7912a9aa4895";

describe("battlefield attack impact browser parity", () => {
  it("matches the Node evidence checksum", async () => {
    const evidence = await battlefieldAttackImpactParityEvidence();
    expect(
      await canonicalHash({
        pending: evidence.pending,
        resolved: evidence.resolved
      })
    ).toBe(parityChecksum);
  });

  it("rejects a paired persisted definition and health substitution", async () => {
    const { content, deploymentAuthority, committed } =
      await battlefieldAttackImpactParityEvidence();
    expect(() =>
      normalizeBattlefieldDwarves(
        committed.dwarfCombatants.map((dwarf) => ({
          ...dwarf,
          characterDefinitionId: "character.substitute",
          currentHealth: 999,
          maximumHealth: 999
        })),
        deploymentAuthority,
        content,
        committed.mapId,
        committed.occupancy
      )
    ).toThrow("authored deployment evidence");
  });
});
