import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { ownedCharacterExperienceRewardParityEvidence } from "./owned-character-experience-rewards.fixture.js";

const checksum =
  "664e0a909ba322e5094940eecd3cecc2759d22ad9ea63c346bb9a43247594483";

describe("owned character experience reward browser parity", () => {
  it("matches literal Node persistent reward evidence", async () => {
    const evidence = ownedCharacterExperienceRewardParityEvidence();
    expect(
      evidence.committed.profile.characterExperienceStates[0]
    ).toMatchObject({
      experience: 260,
      level: 3,
      pendingSkillPointLevels: [2, 3]
    });
    expect(evidence.replayed.decisions[0]?.reason).toBe(
      "experience_reward_previously_claimed"
    );
    expect(evidence.conflictingReplayError).toContain(
      "conflicts with claimed ownership"
    );
    expect(await canonicalHash(evidence)).toBe(checksum);
  });
});
