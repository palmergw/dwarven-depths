import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { battlefieldAttackImpactParityEvidence } from "./battlefield-attack-impact.fixture.js";
import { propagateBattlefieldRoundLineage } from "./battlefield-round-lineage.js";
import {
  createBattlefieldDwarfDeploymentAuthority,
  createInitialState,
  deployBattlefieldDwarves,
  normalizeBattlefieldDwarves,
  resolveBattlefieldAttackImpacts
} from "./index.js";

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
    const candidate = {
      ...committed,
      dwarfCombatants: committed.dwarfCombatants.map((dwarf) => ({
        ...dwarf,
        characterDefinitionId: "character.substitute",
        currentHealth: 999,
        maximumHealth: 999
      }))
    } as unknown as typeof committed;
    propagateBattlefieldRoundLineage(committed, candidate);
    expect(() =>
      normalizeBattlefieldDwarves(candidate, deploymentAuthority, content)
    ).toThrow("authored deployment evidence");
  });

  it("rejects valid alternate-round deployment authority", async () => {
    const { content, committed } =
      await battlefieldAttackImpactParityEvidence();
    const preparation = createInitialState(
      content,
      "level.conformance_map" as never,
      "2"
    ).battlefield;
    if (preparation === undefined) throw new Error("missing other round");
    const authority = createBattlefieldDwarfDeploymentAuthority(
      [
        {
          entityId: "entity.dwarf.warden" as never,
          characterDefinitionId: "character.substitute" as never,
          placementPointId: "placement.goal" as never
        }
      ],
      preparation,
      content
    );
    const other = deployBattlefieldDwarves(preparation, authority, content);
    const redirected = {
      ...committed,
      dwarfCombatants: other.dwarfCombatants
    };
    propagateBattlefieldRoundLineage(committed, redirected);
    expect(() =>
      resolveBattlefieldAttackImpacts(
        {
          schemaVersion: 1,
          currentTick: 7,
          levelId: "level.conformance_map" as never,
          battlefield: redirected
        },
        content,
        authority
      )
    ).toThrow("accepted preparation round");
  });
});
