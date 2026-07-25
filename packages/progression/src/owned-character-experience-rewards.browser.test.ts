import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { ownedCharacterExperienceRewardParityEvidence } from "./owned-character-experience-rewards.fixture.js";

const checksum =
  "c1f05c412daf480f35cfe5c0bbd982a9c56f7957be03a334cc37d143f308306a";

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
    expect(await canonicalHash(evidence)).toBe(checksum);
  });
});
