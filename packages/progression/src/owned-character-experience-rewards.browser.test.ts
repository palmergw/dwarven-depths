import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { ownedCharacterExperienceRewardParityEvidence } from "./owned-character-experience-rewards.fixture.js";

const checksum =
  "3c91b112e6702e7020cde016524958e5d120e4abfd642fb662e225bbf394b3e7";

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
