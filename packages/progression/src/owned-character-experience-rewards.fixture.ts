import { characterLevelThresholds } from "./character-experience.fixture.js";
import {
  createInitialProfile,
  resolveOwnedCharacterExperienceRewards
} from "./index.js";

export const ownedExperienceThresholdSets = Object.freeze([
  Object.freeze({
    schemaVersion: 1 as const,
    characterId: "character.iron_warden" as never,
    thresholds: characterLevelThresholds
  })
]);

export const ownedExperienceEvents = Object.freeze([
  Object.freeze({
    schemaVersion: 1 as const,
    eventId: "event.reward.xp.wave_2" as never,
    characterId: "character.iron_warden" as never,
    experience: 170
  }),
  Object.freeze({
    schemaVersion: 1 as const,
    eventId: "event.reward.xp.wave_1" as never,
    characterId: "character.iron_warden" as never,
    experience: 90
  })
] as const);

/** Shared nonempty evidence executed unchanged by Node and browsers. */
export function ownedCharacterExperienceRewardParityEvidence() {
  const initial = createInitialProfile("character.iron_warden" as never);
  const committed = resolveOwnedCharacterExperienceRewards({
    schemaVersion: 1,
    profile: initial,
    events: ownedExperienceEvents,
    thresholdSets: ownedExperienceThresholdSets
  });
  const replayed = resolveOwnedCharacterExperienceRewards({
    schemaVersion: 1,
    profile: committed.profile,
    events: [ownedExperienceEvents[0]],
    thresholdSets: ownedExperienceThresholdSets
  });
  let conflictingReplayError = "";
  try {
    resolveOwnedCharacterExperienceRewards({
      schemaVersion: 1,
      profile: committed.profile,
      events: [{ ...ownedExperienceEvents[0], experience: 171 }],
      thresholdSets: ownedExperienceThresholdSets
    });
  } catch (error) {
    conflictingReplayError =
      error instanceof Error ? error.message : "unknown replay error";
  }
  return Object.freeze({ committed, replayed, conflictingReplayError });
}
