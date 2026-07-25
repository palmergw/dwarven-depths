import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { characterSkillTreeParityEvidence } from "./skill-tree.fixture.js";

const checksum =
  "bac5ee49d37108256ea90eef0df6a5de59790730034944841b966eaf39dd7ba6";

describe("character skill-tree browser parity", () => {
  it("matches the literal Node evidence checksum", async () => {
    expect(await canonicalHash(characterSkillTreeParityEvidence())).toBe(
      checksum
    );
  });
});
