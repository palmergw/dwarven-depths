import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { createPhase3SystemScenarioEvidence } from "./phase-3-system-scenarios.js";

const expectedChecksum =
  "41d406a0b441a55c09a221ebc39d6c4c53465b5ea436d8bff60457e69df3e507";

describe("Phase 3 combat system browser parity", () => {
  it("matches the literal Node system-evidence checksum", async () => {
    const evidence = createPhase3SystemScenarioEvidence();

    expect(evidence.bossPath.rewardAndVictory.terminalEvaluation).toMatchObject(
      {
        terminalResult: "victory",
        reason: "victory_conditions_met"
      }
    );
    expect(evidence.invalidatedWindup.decisions[0]?.commitment.reason).toBe(
      "target_invalid_before_commit"
    );
    expect(
      evidence.simultaneousDeath.lifecycles.decisions.map(
        (decision) => decision.reason
      )
    ).toEqual(["dwarf_downed", "enemy_destroyed"]);
    expect(await canonicalHash(evidence)).toBe(expectedChecksum);
  });
});
