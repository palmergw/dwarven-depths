import type { StableId } from "@dwarven-depths/contracts";
import { resolveAttemptProgressRewards } from "./attempt-progress-rewards.js";
import {
  type AttemptProgressRewardPolicy,
  type CompletedAttemptRewardEvent,
  createInitialAttemptRewardLedger,
  createInitialProfile
} from "./index.js";

export const shuttergateAttemptRewardPolicy = Object.freeze({
  schemaVersion: 1,
  policyId: "policy.attempt_reward.shuttergate.v1" as StableId,
  levelId: "level.shuttergate_hall" as StableId,
  waveIds: Object.freeze([
    "wave.shuttergate_1" as StableId,
    "wave.shuttergate_2" as StableId,
    "wave.shuttergate_3" as StableId,
    "wave.shuttergate_4" as StableId,
    "wave.shuttergate_5" as StableId
  ]),
  forgeOrePerDefeatedEnemy: 1,
  waveMilestoneRewards: Object.freeze(
    [1, 2, 3, 4, 5].map((wave) =>
      Object.freeze({
        schemaVersion: 1 as const,
        waveId: `wave.shuttergate_${wave}` as StableId,
        forgeOre: 1
      })
    )
  )
} satisfies AttemptProgressRewardPolicy);

export const shuttergateAttemptRewardEvents = Object.freeze([
  Object.freeze({
    schemaVersion: 1,
    rewardId: "reward.attempt.shuttergate.a0001" as StableId,
    attemptId: "attempt.shuttergate.a0001" as StableId,
    levelId: "level.shuttergate_hall" as StableId,
    terminalResult: "defeat" as const,
    defeatedEnemies: 4,
    startedWaveIds: Object.freeze([
      "wave.shuttergate_1" as StableId,
      "wave.shuttergate_2" as StableId
    ])
  }),
  Object.freeze({
    schemaVersion: 1,
    rewardId: "reward.attempt.shuttergate.a0002" as StableId,
    attemptId: "attempt.shuttergate.a0002" as StableId,
    levelId: "level.shuttergate_hall" as StableId,
    terminalResult: "defeat" as const,
    defeatedEnemies: 5,
    startedWaveIds: Object.freeze([
      "wave.shuttergate_1" as StableId,
      "wave.shuttergate_2" as StableId
    ])
  })
] as const satisfies readonly CompletedAttemptRewardEvent[]);

export function attemptProgressRewardParityEvidence() {
  const initialProfile = createInitialProfile(
    "character.iron_warden" as StableId
  );
  const initialLedger = createInitialAttemptRewardLedger();
  const committed = resolveAttemptProgressRewards({
    schemaVersion: 1,
    profile: initialProfile,
    ledger: initialLedger,
    policy: shuttergateAttemptRewardPolicy,
    events: [...shuttergateAttemptRewardEvents].reverse()
  });
  const replayed = resolveAttemptProgressRewards({
    schemaVersion: 1,
    profile: committed.profile,
    ledger: committed.ledger,
    policy: shuttergateAttemptRewardPolicy,
    events: [shuttergateAttemptRewardEvents[1]]
  });
  let conflictingReplayError = "";
  try {
    resolveAttemptProgressRewards({
      schemaVersion: 1,
      profile: committed.profile,
      ledger: committed.ledger,
      policy: shuttergateAttemptRewardPolicy,
      events: [
        {
          ...shuttergateAttemptRewardEvents[1],
          defeatedEnemies: 4
        }
      ]
    });
  } catch (error) {
    conflictingReplayError =
      error instanceof Error ? error.message : String(error);
  }
  return Object.freeze({ committed, replayed, conflictingReplayError });
}
