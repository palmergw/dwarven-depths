import { applyCharacterExperienceAward } from "./character-experience.js";

export const characterLevelThresholds = Object.freeze([
  Object.freeze({
    schemaVersion: 1 as const,
    level: 4,
    cumulativeExperience: 600
  }),
  Object.freeze({
    schemaVersion: 1 as const,
    level: 2,
    cumulativeExperience: 100
  }),
  Object.freeze({
    schemaVersion: 1 as const,
    level: 1,
    cumulativeExperience: 0
  }),
  Object.freeze({
    schemaVersion: 1 as const,
    level: 3,
    cumulativeExperience: 250
  })
]);

/** Shared nonempty evidence executed unchanged by Node and browsers. */
export function characterExperienceParityEvidence() {
  const initial = Object.freeze({
    schemaVersion: 1 as const,
    characterId: "character.iron_warden" as never,
    experience: 90,
    level: 1,
    pendingSkillPointLevels: Object.freeze([])
  });
  const first = applyCharacterExperienceAward({
    schemaVersion: 1,
    state: initial,
    experienceAward: 170,
    thresholds: characterLevelThresholds
  });
  const deferred = applyCharacterExperienceAward({
    schemaVersion: 1,
    state: first.state,
    experienceAward: 340,
    thresholds: characterLevelThresholds
  });
  const zero = applyCharacterExperienceAward({
    schemaVersion: 1,
    state: deferred.state,
    experienceAward: 0,
    thresholds: characterLevelThresholds
  });
  return Object.freeze({ first, deferred, zero });
}
