import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { authoritativeCombatTickParityEvidence } from "./authoritative-combat-tick.fixture.js";

const EXPECTED_CHECKSUM =
  "0a8893e62ea55fbc75c376206c9201ec08170d91d7912f7c1a373b001a118387";

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
