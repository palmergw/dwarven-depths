import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { battlefieldAttackImpactParityEvidence } from "./battlefield-attack-impact.fixture.js";
import { normalizeBattlefieldDwarves } from "./index.js";

const parityChecksum =
  "82a80d8276389748345755011c945e09e9f8bbae2243d11a0b59ae8c7ea94854";

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
    const { content, deployments, committed } =
      await battlefieldAttackImpactParityEvidence();
    expect(() =>
      normalizeBattlefieldDwarves(
        committed.dwarfCombatants.map((dwarf) => ({
          ...dwarf,
          characterDefinitionId: "character.substitute",
          currentHealth: 999,
          maximumHealth: 999
        })),
        deployments,
        content,
        committed.mapId,
        committed.occupancy
      )
    ).toThrow("authored deployment evidence");
  });
});
