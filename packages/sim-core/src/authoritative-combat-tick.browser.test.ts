import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { authoritativeCombatTickParityEvidence } from "./authoritative-combat-tick.fixture.js";

const EXPECTED_CHECKSUM =
  "867f7e72390cf770c9e553fe460558981c2f876d86861114be5d642a62a8f1d9";

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
