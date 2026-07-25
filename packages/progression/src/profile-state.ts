import type { StableId } from "@dwarven-depths/contracts";
import type { CharacterExperienceState } from "./character-experience.js";

export interface ProfileState {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly forgeOre: number;
  readonly unlockedCharacterIds: readonly StableId[];
  readonly claimedRewardIds: readonly StableId[];
  readonly characterExperienceStates: readonly CharacterExperienceState[];
  readonly claimedExperienceRewardEventIds: readonly StableId[];
}

export const maximumProfileRecords = 100_000;
export const characterIdPattern =
  /^character\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
export const rewardIdPattern = /^reward\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
export const experienceRewardEventIdPattern =
  /^event\.reward\.xp\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function requireProfileRecord<const Keys extends readonly string[]>(
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

export function requireProfileArray(
  value: unknown,
  description: string
): readonly unknown[] {
  if (!Array.isArray(value))
    throw new TypeError(`${description} must be an array`);
  if (value.length > maximumProfileRecords)
    throw new RangeError(
      `${description} cannot exceed ${maximumProfileRecords} items`
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

export function requireProfileUnsigned(
  value: unknown,
  description: string
): number {
  if (
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    (value as number) < 0
  )
    throw new RangeError(`${description} must be a non-negative safe integer`);
  return value as number;
}

export function requireProfileId(
  value: unknown,
  pattern: RegExp,
  description: string
): StableId {
  if (typeof value !== "string" || !pattern.test(value))
    throw new RangeError(`${description} must be a valid stable ID`);
  return value as StableId;
}

function normalizeExperienceState(
  value: unknown,
  index: number
): CharacterExperienceState {
  const description = `profile characterExperienceStates[${index}]`;
  const source = requireProfileRecord(
    value,
    [
      "schemaVersion",
      "characterId",
      "experience",
      "level",
      "pendingSkillPointLevels"
    ],
    description
  );
  if (source.schemaVersion !== 1)
    throw new RangeError(`${description} has unsupported schemaVersion`);
  const level = requireProfileUnsigned(source.level, `${description} level`);
  if (level === 0)
    throw new RangeError(
      `${description} level must be a positive safe integer`
    );
  const pending = requireProfileArray(
    source.pendingSkillPointLevels,
    `${description} pendingSkillPointLevels`
  )
    .map((entry, pendingIndex) => {
      const pendingLevel = requireProfileUnsigned(
        entry,
        `${description} pendingSkillPointLevels[${pendingIndex}]`
      );
      if (pendingLevel < 2 || pendingLevel > level)
        throw new RangeError(
          `${description} contains an unearned pending skill point level`
        );
      return pendingLevel;
    })
    .sort((left, right) => left - right);
  if (new Set(pending).size !== pending.length)
    throw new RangeError(`${description} contains duplicate pending levels`);
  return Object.freeze({
    schemaVersion: 1,
    characterId: requireProfileId(
      source.characterId,
      characterIdPattern,
      `${description} characterId`
    ),
    experience: requireProfileUnsigned(
      source.experience,
      `${description} experience`
    ),
    level,
    pendingSkillPointLevels: Object.freeze(pending)
  });
}

export function normalizeProfileState(value: unknown): ProfileState {
  const source = requireProfileRecord(
    value,
    [
      "schemaVersion",
      "revision",
      "forgeOre",
      "unlockedCharacterIds",
      "claimedRewardIds",
      "characterExperienceStates",
      "claimedExperienceRewardEventIds"
    ],
    "profile"
  );
  if (source.schemaVersion !== 1)
    throw new RangeError("profile has unsupported schemaVersion");
  const unlockedCharacterIds = requireProfileArray(
    source.unlockedCharacterIds,
    "profile unlockedCharacterIds"
  ).map((entry, index) =>
    requireProfileId(
      entry,
      characterIdPattern,
      `profile unlockedCharacterIds[${index}]`
    )
  );
  const claimedRewardIds = requireProfileArray(
    source.claimedRewardIds,
    "profile claimedRewardIds"
  ).map((entry, index) =>
    requireProfileId(
      entry,
      rewardIdPattern,
      `profile claimedRewardIds[${index}]`
    )
  );
  const characterExperienceStates = requireProfileArray(
    source.characterExperienceStates,
    "profile characterExperienceStates"
  ).map(normalizeExperienceState);
  const claimedExperienceRewardEventIds = requireProfileArray(
    source.claimedExperienceRewardEventIds,
    "profile claimedExperienceRewardEventIds"
  ).map((entry, index) =>
    requireProfileId(
      entry,
      experienceRewardEventIdPattern,
      `profile claimedExperienceRewardEventIds[${index}]`
    )
  );
  for (const [description, values] of [
    ["unlocked character IDs", unlockedCharacterIds],
    ["claimed reward IDs", claimedRewardIds],
    [
      "character experience state IDs",
      characterExperienceStates.map((state) => state.characterId)
    ],
    ["claimed experience reward event IDs", claimedExperienceRewardEventIds]
  ] as const) {
    if (new Set(values).size !== values.length)
      throw new RangeError(`profile contains duplicate ${description}`);
  }
  const unlocked = new Set(unlockedCharacterIds);
  if (
    characterExperienceStates.some((state) => !unlocked.has(state.characterId))
  )
    throw new RangeError(
      "profile character experience state must belong to an unlocked character"
    );
  return Object.freeze({
    schemaVersion: 1,
    revision: requireProfileUnsigned(source.revision, "profile revision"),
    forgeOre: requireProfileUnsigned(source.forgeOre, "profile forgeOre"),
    unlockedCharacterIds: Object.freeze(
      [...unlockedCharacterIds].sort(compareText)
    ),
    claimedRewardIds: Object.freeze([...claimedRewardIds].sort(compareText)),
    characterExperienceStates: Object.freeze(
      [...characterExperienceStates].sort((left, right) =>
        compareText(left.characterId, right.characterId)
      )
    ),
    claimedExperienceRewardEventIds: Object.freeze(
      [...claimedExperienceRewardEventIds].sort(compareText)
    )
  });
}

export function createInitialProfile(ironWardenId: StableId): ProfileState {
  const characterId = requireProfileId(
    ironWardenId,
    characterIdPattern,
    "initial profile character ID"
  );
  return Object.freeze({
    schemaVersion: 1,
    revision: 0,
    forgeOre: 0,
    unlockedCharacterIds: Object.freeze([characterId]),
    claimedRewardIds: Object.freeze([]),
    characterExperienceStates: Object.freeze([
      Object.freeze({
        schemaVersion: 1,
        characterId,
        experience: 0,
        level: 1,
        pendingSkillPointLevels: Object.freeze([])
      })
    ]),
    claimedExperienceRewardEventIds: Object.freeze([])
  });
}
