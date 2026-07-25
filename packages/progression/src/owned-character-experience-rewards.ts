import type { StableId } from "@dwarven-depths/contracts";
import {
  applyCharacterExperienceAward,
  type CharacterExperienceAwardDecision,
  type CharacterLevelThreshold
} from "./character-experience.js";
import {
  characterIdPattern,
  compareText,
  experienceRewardEventIdPattern,
  maximumProfileRecords,
  normalizeProfileState,
  type ProfileState,
  requireProfileArray,
  requireProfileId,
  requireProfileRecord,
  requireProfileUnsigned
} from "./profile-state.js";

export interface OwnedCharacterExperienceRewardEvent {
  readonly schemaVersion: 1;
  readonly eventId: StableId;
  readonly characterId: StableId;
  readonly experience: number;
}

export interface CharacterThresholdSet {
  readonly schemaVersion: 1;
  readonly characterId: StableId;
  readonly thresholds: readonly CharacterLevelThreshold[];
}

export interface OwnedCharacterExperienceRewardDecision {
  readonly schemaVersion: 1;
  readonly eventId: StableId;
  readonly characterId: StableId;
  readonly experience: number;
  readonly status: "claimed" | "already_claimed";
  readonly reason:
    | "experience_reward_committed"
    | "experience_reward_previously_claimed";
  readonly experienceDecision: CharacterExperienceAwardDecision | null;
}

export interface OwnedCharacterExperienceRewardRequest {
  readonly schemaVersion: 1;
  readonly profile: ProfileState;
  readonly events: readonly OwnedCharacterExperienceRewardEvent[];
  readonly thresholdSets: readonly CharacterThresholdSet[];
}

export interface OwnedCharacterExperienceRewardResolution {
  readonly schemaVersion: 1;
  readonly profile: ProfileState;
  readonly decisions: readonly OwnedCharacterExperienceRewardDecision[];
}

interface NormalizedThresholdSet {
  readonly characterId: StableId;
  readonly thresholds: readonly CharacterLevelThreshold[];
}

function normalizeThresholdSets(
  value: unknown
): readonly NormalizedThresholdSet[] {
  const characterIds = new Set<StableId>();
  return Object.freeze(
    requireProfileArray(value, "character threshold sets").map(
      (entry, index) => {
        const source = requireProfileRecord(
          entry,
          ["schemaVersion", "characterId", "thresholds"],
          `character threshold set ${index}`
        );
        if (source.schemaVersion !== 1)
          throw new RangeError(
            `character threshold set ${index} has unsupported schemaVersion`
          );
        const characterId = requireProfileId(
          source.characterId,
          characterIdPattern,
          `character threshold set ${index} characterId`
        );
        if (characterIds.has(characterId))
          throw new RangeError(
            `duplicate character threshold owner (${characterId})`
          );
        characterIds.add(characterId);
        const thresholds = requireProfileArray(
          source.thresholds,
          `character threshold set ${index} thresholds`
        ) as readonly CharacterLevelThreshold[];
        applyCharacterExperienceAward({
          schemaVersion: 1,
          state: {
            schemaVersion: 1,
            characterId,
            experience: 0,
            level: 1,
            pendingSkillPointLevels: []
          },
          experienceAward: 0,
          thresholds
        });
        return Object.freeze({ characterId, thresholds });
      }
    )
  );
}

/** Commits replay-safe, authoritative character-XP ownership into one profile. */
export function resolveOwnedCharacterExperienceRewards(
  request: OwnedCharacterExperienceRewardRequest
): OwnedCharacterExperienceRewardResolution {
  const source = requireProfileRecord(
    request,
    ["schemaVersion", "profile", "events", "thresholdSets"],
    "owned character experience reward request"
  );
  if (source.schemaVersion !== 1)
    throw new RangeError(
      "owned character experience reward request has unsupported schemaVersion"
    );
  const profile = normalizeProfileState(source.profile);
  const thresholdSets = normalizeThresholdSets(source.thresholdSets);
  const thresholdsByCharacter = new Map(
    thresholdSets.map((entry) => [entry.characterId, entry.thresholds])
  );
  const states = new Map(
    profile.characterExperienceStates.map((state) => [state.characterId, state])
  );

  // Validate every persisted state against its authored threshold owner before
  // considering any claim, including a replay-only or empty batch.
  for (const state of profile.characterExperienceStates) {
    const thresholds = thresholdsByCharacter.get(state.characterId);
    if (thresholds === undefined)
      throw new RangeError(
        `character experience state has no authored thresholds (${state.characterId})`
      );
    applyCharacterExperienceAward({
      schemaVersion: 1,
      state,
      experienceAward: 0,
      thresholds
    });
  }

  const eventIds = new Set<StableId>();
  const events = requireProfileArray(
    source.events,
    "owned character experience reward events"
  )
    .map((entry, index) => {
      const eventSource = requireProfileRecord(
        entry,
        ["schemaVersion", "eventId", "characterId", "experience"],
        `owned character experience reward event ${index}`
      );
      if (eventSource.schemaVersion !== 1)
        throw new RangeError(
          `owned character experience reward event ${index} has unsupported schemaVersion`
        );
      const eventId = requireProfileId(
        eventSource.eventId,
        experienceRewardEventIdPattern,
        `owned character experience reward event ${index} eventId`
      );
      if (eventIds.has(eventId))
        throw new RangeError(
          `duplicate experience reward event ID (${eventId})`
        );
      eventIds.add(eventId);
      return Object.freeze({
        schemaVersion: 1 as const,
        eventId,
        characterId: requireProfileId(
          eventSource.characterId,
          characterIdPattern,
          `owned character experience reward event ${index} characterId`
        ),
        experience: requireProfileUnsigned(
          eventSource.experience,
          `owned character experience reward event ${index} experience`
        )
      });
    })
    .sort((left, right) => compareText(left.eventId, right.eventId));

  for (const event of events) {
    if (!states.has(event.characterId))
      throw new RangeError(
        `experience reward character has no persistent state (${event.characterId})`
      );
    if (!thresholdsByCharacter.has(event.characterId))
      throw new RangeError(
        `experience reward character has no authored thresholds (${event.characterId})`
      );
  }

  const claimed = new Map(
    profile.claimedExperienceRewardEvents.map((event) => [event.eventId, event])
  );
  for (const event of events) {
    const existing = claimed.get(event.eventId);
    if (
      existing !== undefined &&
      (existing.characterId !== event.characterId ||
        existing.experience !== event.experience)
    )
      throw new RangeError(
        `experience reward event conflicts with claimed ownership (${event.eventId})`
      );
  }
  const newClaimCount = events.reduce(
    (count, event) => count + (claimed.has(event.eventId) ? 0 : 1),
    0
  );
  if (claimed.size + newClaimCount > maximumProfileRecords)
    throw new RangeError(
      `resolved claimedExperienceRewardEvents cannot exceed ${maximumProfileRecords} items`
    );
  if (newClaimCount > 0 && profile.revision === Number.MAX_SAFE_INTEGER)
    throw new RangeError("profile revision exceeds safe integer range");

  const decisions: OwnedCharacterExperienceRewardDecision[] = [];
  for (const event of events) {
    if (claimed.has(event.eventId)) {
      decisions.push(
        Object.freeze({
          schemaVersion: 1,
          eventId: event.eventId,
          characterId: event.characterId,
          experience: 0,
          status: "already_claimed",
          reason: "experience_reward_previously_claimed",
          experienceDecision: null
        })
      );
      continue;
    }
    const state = states.get(event.characterId);
    const thresholds = thresholdsByCharacter.get(event.characterId);
    if (state === undefined || thresholds === undefined)
      throw new Error("unreachable validated character experience owner");
    const applied = applyCharacterExperienceAward({
      schemaVersion: 1,
      state,
      experienceAward: event.experience,
      thresholds
    });
    states.set(event.characterId, applied.state);
    claimed.set(event.eventId, event);
    decisions.push(
      Object.freeze({
        schemaVersion: 1,
        eventId: event.eventId,
        characterId: event.characterId,
        experience: event.experience,
        status: "claimed",
        reason: "experience_reward_committed",
        experienceDecision: applied.decision
      })
    );
  }

  const resolvedProfile = Object.freeze({
    schemaVersion: 1 as const,
    revision: profile.revision + (newClaimCount > 0 ? 1 : 0),
    forgeOre: profile.forgeOre,
    unlockedCharacterIds: profile.unlockedCharacterIds,
    claimedRewardIds: profile.claimedRewardIds,
    characterExperienceStates: Object.freeze(
      [...states.values()].sort((left, right) =>
        compareText(left.characterId, right.characterId)
      )
    ),
    claimedExperienceRewardEvents: Object.freeze(
      [...claimed.values()].sort((left, right) =>
        compareText(left.eventId, right.eventId)
      )
    ),
    selectedSkillNodes: profile.selectedSkillNodes
  });
  return Object.freeze({
    schemaVersion: 1,
    profile: resolvedProfile,
    decisions: Object.freeze(decisions)
  });
}
