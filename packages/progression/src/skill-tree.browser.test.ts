import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { characterSkillTreeParityEvidence } from "./skill-tree.fixture.js";

const checksum =
  "fb9ab3f8b4c914715ae71401f87dcec4a1318577c977b2ceac1568bcfe12724b";

describe("character skill-tree browser parity", () => {
  it("matches the literal Node evidence checksum", async () => {
    expect(await canonicalHash(characterSkillTreeParityEvidence())).toBe(
      checksum
    );
  });
});
