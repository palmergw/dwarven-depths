import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { ownedCharacterExperienceRewardParityEvidence } from "./owned-character-experience-rewards.fixture.js";

const checksum =
  "92c1e1a8b574ea6a3379850104f777d9d9c10c30ad256d5ffd78e1aab1e8fb09";

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
