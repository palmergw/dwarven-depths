import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { battlefieldAttackImpactParityEvidence } from "./battlefield-attack-impact.fixture.js";
import { normalizeBattlefieldDwarves } from "./index.js";

const parityChecksum =
  "0167bc16246d6fa4a2f6bad8ed6daad9e794bb756ee99a1802d5e97e64c2e0d5";

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
