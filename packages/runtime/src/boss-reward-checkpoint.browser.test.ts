import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { bossRewardCheckpointParityEvidence } from "./boss-reward-checkpoint.fixture.js";

const checksum =
  "7e6ec29ed6af78fb54b486dc017874304779fdb55f4c27e4cb1b5c6317e6b28e";

describe("boss reward checkpoint browser parity", () => {
  it("matches literal simultaneous-death Node evidence", async () => {
    const evidence = bossRewardCheckpointParityEvidence();
    expect(evidence.terminalEvaluation.terminalResult).toBe("defeat");
    expect(evidence.bossRewards.profile.unlockedCharacterIds).toContain(
      "character.deep_ranger"
    );
    expect(await canonicalHash(evidence)).toBe(checksum);
  });
});
