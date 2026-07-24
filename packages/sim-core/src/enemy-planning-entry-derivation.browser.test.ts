import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { enemyPlanningEntryDerivationParityEvidence } from "./enemy-planning-entry-derivation.fixture.js";

const EXPECTED_CHECKSUM =
  "13572164b73f1f4f53aad8ce7abbe477e4c8c2aec7c7324c6b5c5c1d3a29e0a1";

describe("authoritative enemy planning-entry derivation browser parity", () => {
  it("matches the literal Node Shuttergate evidence checksum", async () => {
    const evidence = await enemyPlanningEntryDerivationParityEvidence();
    expect(evidence.derived.entries[0]?.candidates).toHaveLength(2);
    expect(evidence.afterDwarfDowned.entries[0]?.candidates).toEqual([]);
    expect(await canonicalHash(evidence)).toBe(EXPECTED_CHECKSUM);
  });
});
