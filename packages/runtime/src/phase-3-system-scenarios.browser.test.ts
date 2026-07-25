import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { createPhase3SystemScenarioEvidence } from "./phase-3-system-scenarios.js";

const expectedChecksum =
  "8e2f202ea441fa03573fa5ebd7c14b5e559d82667ea5528895289fe0047d807b";

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
