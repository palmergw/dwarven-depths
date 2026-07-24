import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { runExplanationFixture } from "./run-explanation.fixture.js";
import { createRunExplanation } from "./run-explanation.js";

describe("run explanation browser parity", () => {
  it("matches the pinned explanation checksum", async () => {
    expect(
      await canonicalHash(createRunExplanation(runExplanationFixture))
    ).toBe("a0190c4ad18684a217162e359c403437303c8b47fe47e447566d959ceb5a53b3");
  });
});
