import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { bossRewardCheckpointParityEvidence } from "./boss-reward-checkpoint.fixture.js";

const checksum =
  "651af89baf6ebefdb0f41ef08054d354b4b43255cfd97c59cc4129280a7f9b3f";

describe("boss reward checkpoint browser parity", () => {
  it("matches literal simultaneous-death Node evidence", async () => {
    const evidence = bossRewardCheckpointParityEvidence();
    expect(evidence.terminalResult).toBe("defeat");
    expect(evidence.bossRewards.profile.unlockedCharacterIds).toContain(
      "character.deep_ranger"
    );
    expect(await canonicalHash(evidence)).toBe(checksum);
  });
});
