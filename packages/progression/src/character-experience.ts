import type { StableId } from "@dwarven-depths/contracts";

export interface CharacterExperienceState {
  readonly schemaVersion: 1;
  readonly characterId: StableId;
  readonly experience: number;
  readonly level: number;
  readonly pendingSkillPointLevels: readonly number[];
}

export interface CharacterLevelThreshold {
  readonly schemaVersion: 1;
  readonly level: number;
  readonly cumulativeExperience: number;
}

export interface CharacterExperienceAwardRequest {
  readonly schemaVersion: 1;
  readonly state: CharacterExperienceState;
  readonly experienceAward: number;
  readonly thresholds: readonly CharacterLevelThreshold[];
}

export interface CharacterExperienceAwardDecision {
  readonly schemaVersion: 1;
  readonly characterId: StableId;
  readonly experienceAward: number;
  readonly previousExperience: number;
  readonly resultingExperience: number;
  readonly previousLevel: number;
  readonly resultingLevel: number;
  readonly gainedSkillPointLevels: readonly number[];
  readonly reason:
    | "no_experience_awarded"
    | "experience_awarded"
    | "experience_awarded_at_maximum_level"
    | "level_thresholds_crossed";
}

export interface CharacterExperienceAwardResult {
  readonly schemaVersion: 1;
  readonly state: CharacterExperienceState;
  readonly decision: CharacterExperienceAwardDecision;
}

const maximumRecords = 100_000;
const characterIdPattern = /^character\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

function requireRecord<const Keys extends readonly string[]>(
  value: unknown,
  expectedKeys: Keys,
  description: string
): Readonly<Record<Keys[number], unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError(`${description} must be a plain object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`${description} must be a plain object`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(value);
  if (
    keys.some((key) => typeof key !== "string") ||
    keys.length !== expectedKeys.length ||
    !expectedKeys.every((key) => Object.hasOwn(descriptors, key))
  )
    throw new TypeError(
      `${description} must contain exactly ${expectedKeys.join(", ")}`
    );
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    )
      throw new TypeError(
        `${description}.${key} must be an enumerable data property`
      );
  }
  return Object.fromEntries(
    expectedKeys.map((key) => [key, descriptors[key]?.value])
  ) as Record<Keys[number], unknown>;
}

function requireArray(value: unknown, description: string): readonly unknown[] {
  if (!Array.isArray(value))
    throw new TypeError(`${description} must be an array`);
  if (value.length > maximumRecords)
    throw new RangeError(
      `${description} cannot exceed ${maximumRecords} items`
    );
  if (Reflect.ownKeys(value).length !== value.length + 1)
    throw new TypeError(`${description} must be a dense data array`);
  const items: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    )
      throw new TypeError(
        `${description}[${index}] must be an enumerable data item`
      );
    items.push(descriptor.value);
  }
  return items;
}

function requireUnsigned(value: unknown, description: string): number {
  if (
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    (value as number) < 0
  )
    throw new RangeError(`${description} must be a non-negative safe integer`);
  return value as number;
}

function requirePositive(value: unknown, description: string): number {
  const normalized = requireUnsigned(value, description);
  if (normalized === 0)
    throw new RangeError(`${description} must be a positive safe integer`);
  return normalized;
}

function normalizeThresholds(
  value: unknown
): readonly CharacterLevelThreshold[] {
  const thresholds = requireArray(value, "character level thresholds").map(
    (entry, index) => {
      const source = requireRecord(
        entry,
        ["schemaVersion", "level", "cumulativeExperience"],
        `character level threshold ${index}`
      );
      if (source.schemaVersion !== 1)
        throw new RangeError(
          `character level threshold ${index} has unsupported schemaVersion`
        );
      return Object.freeze({
        schemaVersion: 1 as const,
        level: requirePositive(
          source.level,
          `character level threshold ${index} level`
        ),
        cumulativeExperience: requireUnsigned(
          source.cumulativeExperience,
          `character level threshold ${index} cumulativeExperience`
        )
      });
    }
  );
  if (thresholds.length === 0)
    throw new RangeError("character level thresholds cannot be empty");
  const ordered = [...thresholds].sort(
    (left, right) => left.level - right.level
  );
  for (let index = 0; index < ordered.length; index += 1) {
    const threshold = ordered[index];
    if (threshold === undefined) throw new Error("unreachable threshold index");
    const expectedLevel = index + 1;
    if (threshold.level !== expectedLevel)
      throw new RangeError(
        "character level thresholds must contain contiguous levels beginning at 1"
      );
    if (index === 0 && threshold.cumulativeExperience !== 0)
      throw new RangeError("character level 1 must require zero experience");
    const previous = ordered[index - 1];
    if (
      previous !== undefined &&
      threshold.cumulativeExperience <= previous.cumulativeExperience
    )
      throw new RangeError(
        "character level thresholds must have strictly increasing cumulative experience"
      );
  }
  return Object.freeze(ordered);
}

function levelForExperience(
  experience: number,
  thresholds: readonly CharacterLevelThreshold[]
): number {
  let level = 1;
  for (let index = 1; index < thresholds.length; index += 1) {
    const threshold = thresholds[index];
    if (threshold === undefined || threshold.cumulativeExperience > experience)
      break;
    level = threshold.level;
  }
  return level;
}

function normalizeState(
  value: unknown,
  thresholds: readonly CharacterLevelThreshold[]
): CharacterExperienceState {
  const source = requireRecord(
    value,
    [
      "schemaVersion",
      "characterId",
      "experience",
      "level",
      "pendingSkillPointLevels"
    ],
    "character experience state"
  );
  if (source.schemaVersion !== 1)
    throw new RangeError(
      "character experience state has unsupported schemaVersion"
    );
  if (
    typeof source.characterId !== "string" ||
    !characterIdPattern.test(source.characterId)
  )
    throw new RangeError(
      "character experience state characterId must be a valid character ID"
    );
  const experience = requireUnsigned(
    source.experience,
    "character experience state experience"
  );
  const level = requirePositive(
    source.level,
    "character experience state level"
  );
  if (level > thresholds.length)
    throw new RangeError(
      "character experience state level exceeds authored thresholds"
    );
  if (levelForExperience(experience, thresholds) !== level)
    throw new RangeError(
      "character experience state level does not match authored thresholds"
    );
  const pending = requireArray(
    source.pendingSkillPointLevels,
    "character experience state pendingSkillPointLevels"
  )
    .map((entry, index) =>
      requirePositive(
        entry,
        `character experience state pendingSkillPointLevels[${index}]`
      )
    )
    .sort((left, right) => left - right);
  if (new Set(pending).size !== pending.length)
    throw new RangeError(
      "character experience state contains duplicate pending skill point levels"
    );
  if (pending.some((pendingLevel) => pendingLevel < 2 || pendingLevel > level))
    throw new RangeError(
      "character experience state pending skill point level is not earned"
    );
  return Object.freeze({
    schemaVersion: 1,
    characterId: source.characterId as StableId,
    experience,
    level,
    pendingSkillPointLevels: Object.freeze(pending)
  });
}

/** Applies one owned character-XP award and materializes every crossed threshold. */
export function applyCharacterExperienceAward(
  request: CharacterExperienceAwardRequest
): CharacterExperienceAwardResult {
  const source = requireRecord(
    request,
    ["schemaVersion", "state", "experienceAward", "thresholds"],
    "character experience award request"
  );
  if (source.schemaVersion !== 1)
    throw new RangeError(
      "character experience award request has unsupported schemaVersion"
    );
  const thresholds = normalizeThresholds(source.thresholds);
  const state = normalizeState(source.state, thresholds);
  const experienceAward = requireUnsigned(
    source.experienceAward,
    "character experience award"
  );
  if (!Number.isSafeInteger(state.experience + experienceAward))
    throw new RangeError(
      "character experience total exceeds safe integer range"
    );
  const resultingExperience = state.experience + experienceAward;
  const resultingLevel = levelForExperience(resultingExperience, thresholds);
  const gainedSkillPointLevels = Object.freeze(
    thresholds
      .filter(
        (threshold) =>
          threshold.level > state.level && threshold.level <= resultingLevel
      )
      .map((threshold) => threshold.level)
  );
  const pendingSkillPointLevels = Object.freeze([
    ...state.pendingSkillPointLevels,
    ...gainedSkillPointLevels
  ]);
  const resultingState = Object.freeze({
    schemaVersion: 1 as const,
    characterId: state.characterId,
    experience: resultingExperience,
    level: resultingLevel,
    pendingSkillPointLevels
  });
  const decision = Object.freeze({
    schemaVersion: 1 as const,
    characterId: state.characterId,
    experienceAward,
    previousExperience: state.experience,
    resultingExperience,
    previousLevel: state.level,
    resultingLevel,
    gainedSkillPointLevels,
    reason:
      experienceAward === 0
        ? ("no_experience_awarded" as const)
        : gainedSkillPointLevels.length > 0
          ? ("level_thresholds_crossed" as const)
          : state.level === thresholds.length
            ? ("experience_awarded_at_maximum_level" as const)
            : ("experience_awarded" as const)
  });
  return Object.freeze({
    schemaVersion: 1,
    state: resultingState,
    decision
  });
}
