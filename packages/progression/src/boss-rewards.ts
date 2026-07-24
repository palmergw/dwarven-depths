import type { EntityId, StableId } from "@dwarven-depths/contracts";
import type { ProfileState } from "./index.js";

export interface BossDeathEvent {
  readonly schemaVersion: 1;
  readonly eventId: StableId;
  readonly bossEntityId: EntityId;
}

export interface BossRewardDefinition {
  readonly schemaVersion: 1;
  readonly rewardId: StableId;
  readonly bossEntityId: EntityId;
  readonly characterUnlockId: StableId;
  readonly forgeOre: number;
}

export interface BossRewardDecision {
  readonly schemaVersion: 1;
  readonly eventId: StableId;
  readonly bossEntityId: EntityId;
  readonly rewardId: StableId;
  readonly characterUnlockId: StableId;
  readonly forgeOre: number;
  readonly status: "claimed" | "already_claimed";
  readonly reason: "boss_death_reward_committed" | "reward_previously_claimed";
}

export interface BossRewardResolutionRequest {
  readonly schemaVersion: 1;
  readonly profile: ProfileState;
  readonly bossDeaths: readonly BossDeathEvent[];
  readonly rewards: readonly BossRewardDefinition[];
}

export interface BossRewardResolution {
  readonly schemaVersion: 1;
  readonly profile: ProfileState;
  readonly decisions: readonly BossRewardDecision[];
}

const maximumRecords = 100_000;
const entityIdPattern = /^entity\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const eventIdPattern = /^death\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const rewardIdPattern = /^reward\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const characterIdPattern = /^character\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

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

function requireId(
  value: unknown,
  pattern: RegExp,
  description: string
): StableId {
  if (typeof value !== "string" || !pattern.test(value))
    throw new RangeError(`${description} must be a valid stable ID`);
  return value as StableId;
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

function validateProfile(value: unknown): ProfileState {
  const source = requireRecord(
    value,
    [
      "schemaVersion",
      "revision",
      "forgeOre",
      "unlockedCharacterIds",
      "claimedRewardIds"
    ],
    "profile"
  );
  if (source.schemaVersion !== 1)
    throw new RangeError("profile has unsupported schemaVersion");
  const unlocks = requireArray(
    source.unlockedCharacterIds,
    "profile unlockedCharacterIds"
  ).map((value, index) =>
    requireId(
      value,
      characterIdPattern,
      `profile unlockedCharacterIds[${index}]`
    )
  );
  const claims = requireArray(
    source.claimedRewardIds,
    "profile claimedRewardIds"
  ).map((value, index) =>
    requireId(value, rewardIdPattern, `profile claimedRewardIds[${index}]`)
  );
  if (new Set(unlocks).size !== unlocks.length)
    throw new RangeError("profile contains duplicate unlocked character IDs");
  if (new Set(claims).size !== claims.length)
    throw new RangeError("profile contains duplicate claimed reward IDs");
  return Object.freeze({
    schemaVersion: 1,
    revision: requireUnsigned(source.revision, "profile revision"),
    forgeOre: requireUnsigned(source.forgeOre, "profile forgeOre"),
    unlockedCharacterIds: Object.freeze([...unlocks].sort(compareText)),
    claimedRewardIds: Object.freeze([...claims].sort(compareText))
  });
}

/** Resolves phase-12 boss claims before any terminal-outcome evaluation. */
export function resolveBossDeathRewards(
  request: BossRewardResolutionRequest
): BossRewardResolution {
  const source = requireRecord(
    request,
    ["schemaVersion", "profile", "bossDeaths", "rewards"],
    "boss reward resolution request"
  );
  if (source.schemaVersion !== 1)
    throw new RangeError(
      "boss reward resolution request has unsupported schemaVersion"
    );
  const startingProfile = validateProfile(source.profile);

  const eventIds = new Set<StableId>();
  const defeatedBossIds = new Set<StableId>();
  const deaths = requireArray(source.bossDeaths, "boss deaths").map(
    (value, index) => {
      const death = requireRecord(
        value,
        ["schemaVersion", "eventId", "bossEntityId"],
        `boss death ${index}`
      );
      if (death.schemaVersion !== 1)
        throw new RangeError(
          `boss death ${index} has unsupported schemaVersion`
        );
      const eventId = requireId(
        death.eventId,
        eventIdPattern,
        `boss death ${index} eventId`
      );
      const bossEntityId = requireId(
        death.bossEntityId,
        entityIdPattern,
        `boss death ${index} bossEntityId`
      ) as EntityId;
      if (eventIds.has(eventId))
        throw new RangeError(`duplicate boss death event ID (${eventId})`);
      if (defeatedBossIds.has(bossEntityId))
        throw new RangeError(
          `duplicate defeated boss entity ID (${bossEntityId})`
        );
      eventIds.add(eventId);
      defeatedBossIds.add(bossEntityId);
      return Object.freeze({
        schemaVersion: 1 as const,
        eventId,
        bossEntityId
      });
    }
  );

  const rewardsByBoss = new Map<StableId, BossRewardDefinition>();
  const rewardIds = new Set<StableId>();
  const rewards = requireArray(source.rewards, "boss rewards");
  for (let index = 0; index < rewards.length; index += 1) {
    const reward = requireRecord(
      rewards[index],
      [
        "schemaVersion",
        "rewardId",
        "bossEntityId",
        "characterUnlockId",
        "forgeOre"
      ],
      `boss reward ${index}`
    );
    if (reward.schemaVersion !== 1)
      throw new RangeError(
        `boss reward ${index} has unsupported schemaVersion`
      );
    const definition = Object.freeze({
      schemaVersion: 1 as const,
      rewardId: requireId(
        reward.rewardId,
        rewardIdPattern,
        `boss reward ${index} rewardId`
      ),
      bossEntityId: requireId(
        reward.bossEntityId,
        entityIdPattern,
        `boss reward ${index} bossEntityId`
      ) as EntityId,
      characterUnlockId: requireId(
        reward.characterUnlockId,
        characterIdPattern,
        `boss reward ${index} characterUnlockId`
      ),
      forgeOre: requireUnsigned(
        reward.forgeOre,
        `boss reward ${index} forgeOre`
      )
    });
    if (rewardIds.has(definition.rewardId))
      throw new RangeError(`duplicate boss reward ID (${definition.rewardId})`);
    if (rewardsByBoss.has(definition.bossEntityId))
      throw new RangeError(
        `duplicate boss reward owner (${definition.bossEntityId})`
      );
    rewardIds.add(definition.rewardId);
    rewardsByBoss.set(definition.bossEntityId, definition);
  }

  const due = deaths
    .map((death) => {
      const reward = rewardsByBoss.get(death.bossEntityId);
      if (reward === undefined)
        throw new RangeError(
          `boss death has no configured reward (${death.bossEntityId})`
        );
      return { death, reward };
    })
    .sort(
      (left, right) =>
        compareText(left.death.bossEntityId, right.death.bossEntityId) ||
        compareText(left.reward.rewardId, right.reward.rewardId)
    );

  const claimed = new Set(startingProfile.claimedRewardIds);
  const unlocked = new Set(startingProfile.unlockedCharacterIds);
  let forgeOre = startingProfile.forgeOre;
  let changed = false;
  const decisions = due.map(({ death, reward }): BossRewardDecision => {
    const alreadyClaimed = claimed.has(reward.rewardId);
    if (!alreadyClaimed) {
      if (!Number.isSafeInteger(forgeOre + reward.forgeOre))
        throw new RangeError(
          "boss reward Forge Ore total exceeds safe integer range"
        );
      forgeOre += reward.forgeOre;
      claimed.add(reward.rewardId);
      unlocked.add(reward.characterUnlockId);
      changed = true;
    }
    return Object.freeze({
      schemaVersion: 1,
      eventId: death.eventId,
      bossEntityId: death.bossEntityId,
      rewardId: reward.rewardId,
      characterUnlockId: reward.characterUnlockId,
      forgeOre: alreadyClaimed ? 0 : reward.forgeOre,
      status: alreadyClaimed ? "already_claimed" : "claimed",
      reason: alreadyClaimed
        ? "reward_previously_claimed"
        : "boss_death_reward_committed"
    });
  });
  if (changed && startingProfile.revision === Number.MAX_SAFE_INTEGER)
    throw new RangeError("profile revision exceeds safe integer range");
  if (unlocked.size > maximumRecords)
    throw new RangeError(
      `resolved unlockedCharacterIds cannot exceed ${maximumRecords} items`
    );
  if (claimed.size > maximumRecords)
    throw new RangeError(
      `resolved claimedRewardIds cannot exceed ${maximumRecords} items`
    );
  const resolvedProfile = Object.freeze({
    schemaVersion: 1 as const,
    revision: startingProfile.revision + (changed ? 1 : 0),
    forgeOre,
    unlockedCharacterIds: Object.freeze([...unlocked].sort(compareText)),
    claimedRewardIds: Object.freeze([...claimed].sort(compareText))
  });
  return Object.freeze({
    schemaVersion: 1,
    profile: resolvedProfile,
    decisions: Object.freeze(decisions)
  });
}
