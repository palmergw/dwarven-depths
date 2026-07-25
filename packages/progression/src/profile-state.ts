import type { StableId } from "@dwarven-depths/contracts";
import type { CharacterExperienceState } from "./character-experience.js";

export interface ProfileState {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly forgeOre: number;
  readonly unlockedCharacterIds: readonly StableId[];
  readonly claimedRewardIds: readonly StableId[];
  readonly characterExperienceStates: readonly CharacterExperienceState[];
  readonly claimedExperienceRewardEvents: readonly ClaimedExperienceRewardEvent[];
  readonly selectedSkillNodes: readonly SelectedSkillNode[];
}

export interface SelectedSkillNode {
  readonly schemaVersion: 1;
  readonly characterId: StableId;
  readonly nodeId: StableId;
  readonly spentSkillPointLevel: number;
}

export interface ClaimedExperienceRewardEvent {
  readonly schemaVersion: 1;
  readonly eventId: StableId;
  readonly characterId: StableId;
  readonly experience: number;
}

export const maximumProfileRecords = 100_000;
export const characterIdPattern =
  /^character\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
export const rewardIdPattern = /^reward\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
export const experienceRewardEventIdPattern =
  /^event\.reward\.xp\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
export const skillNodeIdPattern =
  /^skill\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

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

function normalizeClaimedExperienceRewardEvent(
  value: unknown,
  index: number
): ClaimedExperienceRewardEvent {
  const description = `profile claimedExperienceRewardEvents[${index}]`;
  const source = requireProfileRecord(
    value,
    ["schemaVersion", "eventId", "characterId", "experience"],
    description
  );
  if (source.schemaVersion !== 1)
    throw new RangeError(`${description} has unsupported schemaVersion`);
  return Object.freeze({
    schemaVersion: 1,
    eventId: requireProfileId(
      source.eventId,
      experienceRewardEventIdPattern,
      `${description} eventId`
    ),
    characterId: requireProfileId(
      source.characterId,
      characterIdPattern,
      `${description} characterId`
    ),
    experience: requireProfileUnsigned(
      source.experience,
      `${description} experience`
    )
  });
}

function normalizeSelectedSkillNode(
  value: unknown,
  index: number
): SelectedSkillNode {
  const description = `profile selectedSkillNodes[${index}]`;
  const source = requireProfileRecord(
    value,
    ["schemaVersion", "characterId", "nodeId", "spentSkillPointLevel"],
    description
  );
  if (source.schemaVersion !== 1)
    throw new RangeError(`${description} has unsupported schemaVersion`);
  const spentSkillPointLevel = requireProfileUnsigned(
    source.spentSkillPointLevel,
    `${description} spentSkillPointLevel`
  );
  if (spentSkillPointLevel < 2)
    throw new RangeError(
      `${description} spentSkillPointLevel must be at least 2`
    );
  return Object.freeze({
    schemaVersion: 1,
    characterId: requireProfileId(
      source.characterId,
      characterIdPattern,
      `${description} characterId`
    ),
    nodeId: requireProfileId(
      source.nodeId,
      skillNodeIdPattern,
      `${description} nodeId`
    ),
    spentSkillPointLevel
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
      "claimedExperienceRewardEvents",
      "selectedSkillNodes"
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
  const claimedExperienceRewardEvents = requireProfileArray(
    source.claimedExperienceRewardEvents,
    "profile claimedExperienceRewardEvents"
  ).map(normalizeClaimedExperienceRewardEvent);
  const selectedSkillNodes = requireProfileArray(
    source.selectedSkillNodes,
    "profile selectedSkillNodes"
  ).map(normalizeSelectedSkillNode);
  for (const [description, values] of [
    ["unlocked character IDs", unlockedCharacterIds],
    ["claimed reward IDs", claimedRewardIds],
    [
      "character experience state IDs",
      characterExperienceStates.map((state) => state.characterId)
    ],
    [
      "claimed experience reward event IDs",
      claimedExperienceRewardEvents.map((event) => event.eventId)
    ],
    ["selected skill node IDs", selectedSkillNodes.map((entry) => entry.nodeId)]
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
  if (
    claimedExperienceRewardEvents.some(
      (event) => !unlocked.has(event.characterId)
    )
  )
    throw new RangeError(
      "profile claimed experience reward must belong to an unlocked character"
    );
  if (selectedSkillNodes.some((entry) => !unlocked.has(entry.characterId)))
    throw new RangeError(
      "profile selected skill node must belong to an unlocked character"
    );
  const experienceByCharacter = new Map(
    characterExperienceStates.map((state) => [state.characterId, state])
  );
  const spentPointKeys = new Set<string>();
  for (const entry of selectedSkillNodes) {
    const experienceState = experienceByCharacter.get(entry.characterId);
    if (
      experienceState === undefined ||
      entry.spentSkillPointLevel > experienceState.level
    )
      throw new RangeError(
        "profile selected skill node must spend an earned character level"
      );
    if (
      experienceState.pendingSkillPointLevels.includes(
        entry.spentSkillPointLevel
      )
    )
      throw new RangeError(
        "profile skill point level cannot be both pending and selected"
      );
    const pointKey = `${entry.characterId}\u0000${entry.spentSkillPointLevel}`;
    if (spentPointKeys.has(pointKey))
      throw new RangeError(
        "profile contains duplicate spent skill point levels"
      );
    spentPointKeys.add(pointKey);
  }
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
    claimedExperienceRewardEvents: Object.freeze(
      [...claimedExperienceRewardEvents].sort((left, right) =>
        compareText(left.eventId, right.eventId)
      )
    ),
    selectedSkillNodes: Object.freeze(
      [...selectedSkillNodes].sort(
        (left, right) =>
          compareText(left.characterId, right.characterId) ||
          left.spentSkillPointLevel - right.spentSkillPointLevel ||
          compareText(left.nodeId, right.nodeId)
      )
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
    claimedExperienceRewardEvents: Object.freeze([]),
    selectedSkillNodes: Object.freeze([])
  });
}
