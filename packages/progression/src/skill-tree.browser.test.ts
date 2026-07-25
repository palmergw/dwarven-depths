import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { characterSkillTreeParityEvidence } from "./skill-tree.fixture.js";

const checksum =
  "d57e377abef2fd808d0a7a35eec4b6e6765df31f70f0573a89778486578b571a";

describe("character skill-tree browser parity", () => {
  it("matches the literal Node evidence checksum", async () => {
    expect(await canonicalHash(characterSkillTreeParityEvidence())).toBe(
      checksum
    );
  });
});
