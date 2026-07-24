import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { dwarfActionPhaseParityEvidence } from "./dwarf-action-phase.fixture.js";

const checksum =
  "acb9b6c9bd0a43adbf589bebcd84f17328bbccc24899e495862c69556578018d";

describe("dwarf action phase browser parity", () => {
  it("matches literal Node action evidence", async () => {
    const evidence = await dwarfActionPhaseParityEvidence();
    expect(evidence.started.decisions[0]?.reason).toBe("basic_attack_started");
    expect(evidence.committed.decisions[0]?.reason).toBe(
      "basic_attack_committed"
    );
    expect(evidence.sourceDowned[0]?.impactAtTick).toBe(16);
    expect(await canonicalHash(evidence)).toBe(checksum);
  });
});
