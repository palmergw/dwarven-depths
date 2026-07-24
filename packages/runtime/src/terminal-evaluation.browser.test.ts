import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { terminalEvaluationParityEvidence } from "./terminal-evaluation.fixture.js";

const checksum =
  "f3ee3bb0fe3efc44782374517d9abb6c1c050dc157daf2bb6eb909a735cde5e9";

describe("terminal evaluation browser parity", () => {
  it("matches literal final-cleanup and terminal Node evidence", async () => {
    const evidence = terminalEvaluationParityEvidence();
    expect(evidence.at(-2)?.terminalResult).toBe("victory");
    expect(evidence.at(-1)?.terminalResult).toBe("defeat");
    expect(await canonicalHash(evidence)).toBe(checksum);
  });
});
