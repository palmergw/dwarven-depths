import { createInitialProfile, resolveBossDeathRewards } from "./index.js";

export const bossRewards = Object.freeze([
  Object.freeze({
    schemaVersion: 1 as const,
    rewardId: "reward.boss.ancient" as never,
    bossEntityId: "entity.enemy.boss.ancient" as never,
    characterUnlockId: "character.rune_smith" as never,
    forgeOre: 30
  }),
  Object.freeze({
    schemaVersion: 1 as const,
    rewardId: "reward.boss.gatebreaker_captain" as never,
    bossEntityId: "entity.enemy.boss.gatebreaker_captain" as never,
    characterUnlockId: "character.deep_ranger" as never,
    forgeOre: 20
  })
] as const);

export const bossDeaths = Object.freeze([
  Object.freeze({
    schemaVersion: 1 as const,
    eventId: "death.gatebreaker_captain" as never,
    bossEntityId: "entity.enemy.boss.gatebreaker_captain" as never
  }),
  Object.freeze({
    schemaVersion: 1 as const,
    eventId: "death.ancient" as never,
    bossEntityId: "entity.enemy.boss.ancient" as never
  })
] as const);

/** Shared nonempty evidence executed unchanged by Node and browsers. */
export function bossRewardParityEvidence() {
  const initial = createInitialProfile("character.iron_warden" as never);
  const committed = resolveBossDeathRewards({
    schemaVersion: 1,
    profile: initial,
    bossDeaths,
    rewards: bossRewards
  });
  const replayed = resolveBossDeathRewards({
    schemaVersion: 1,
    profile: committed.profile,
    bossDeaths: [bossDeaths[0]],
    rewards: bossRewards
  });
  return Object.freeze({ committed, replayed });
}
