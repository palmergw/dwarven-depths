import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { enemyPlanningEntryDerivationParityEvidence } from "./enemy-planning-entry-derivation.fixture.js";

const EXPECTED_CHECKSUM =
  "469fe0ef9ebf1452a21fc565d4d25bd574a0ab7a6b4ce204501aa7446790eb33";

describe("authoritative enemy planning-entry derivation browser parity", () => {
  it("matches the literal Node Shuttergate evidence checksum", async () => {
    const evidence = await enemyPlanningEntryDerivationParityEvidence();
    expect(evidence.derived.entries[0]?.candidates).toHaveLength(2);
    expect(evidence.afterDwarfDowned.entries[0]?.candidates).toEqual([]);
    expect(await canonicalHash(evidence)).toBe(EXPECTED_CHECKSUM);
  });
});
