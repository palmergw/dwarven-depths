import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { authoritativeCombatTickParityEvidence } from "./authoritative-combat-tick.fixture.js";

const EXPECTED_CHECKSUM =
  "49a26373a49cb8d6cbb739cb7bf422d36b0f4a8c336af05b74d9e88c92ced0cf";

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
