import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { characterSkillTreeParityEvidence } from "./skill-tree.fixture.js";

const checksum =
  "fc724dccfbcad3c38ad038dd1a6bbd3a94ccab0ef9095efc7eed756e72083033";

describe("character skill-tree browser parity", () => {
  it("matches the literal Node evidence checksum", async () => {
    expect(await canonicalHash(characterSkillTreeParityEvidence())).toBe(
      checksum
    );
  });
});
