import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { authoritativeCombatTickParityEvidence } from "./authoritative-combat-tick.fixture.js";

const EXPECTED_CHECKSUM =
  "b0584d6a23df0ecede8f310d444e8b325aa0db9f53c40e5e3c4276532eb9ed79";

describe("authoritative combat tick browser parity", () => {
  it("matches the literal Node Shuttergate tick-sequence checksum", async () => {
    const evidence = await authoritativeCombatTickParityEvidence();
    expect(evidence.reversed).toEqual(evidence.forward);
    expect(
      evidence.forward.state.battlefield?.enemyCombatants[0]?.currentHealth
    ).toBe(32);
    expect(await canonicalHash(evidence)).toBe(EXPECTED_CHECKSUM);
  });
});
