import { createInitialProfile } from "@dwarven-depths/progression";
import { resolveBossRewardCheckpoint } from "./boss-reward-checkpoint.js";
import { terminalEvaluationRequest } from "./terminal-evaluation.fixture.js";

/** Shared simultaneous-death evidence executed unchanged by Node and browsers. */
export function bossRewardCheckpointParityEvidence() {
  return resolveBossRewardCheckpoint({
    schemaVersion: 1,
    terminalEvaluation: terminalEvaluationRequest({ livingDwarfIds: [] }),
    bossRewards: {
      schemaVersion: 1,
      profile: createInitialProfile("character.iron_warden" as never),
      bossDeaths: [
        {
          schemaVersion: 1,
          eventId: "death.gatebreaker_captain" as never,
          bossEntityId: "entity.enemy.boss.gatebreaker_captain" as never
        }
      ],
      rewards: [
        {
          schemaVersion: 1,
          rewardId: "reward.boss.gatebreaker_captain" as never,
          bossEntityId: "entity.enemy.boss.gatebreaker_captain" as never,
          characterUnlockId: "character.deep_ranger" as never,
          forgeOre: 20
        }
      ]
    }
  });
}
