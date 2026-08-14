import type { CompiledContent } from "@dwarven-depths/content-runtime";
import type {
  CharacterDefinition,
  ScenarioDefinition,
  SimulationState,
  StableId
} from "@dwarven-depths/contracts";
import {
  deriveIronWardenActiveAbilityIds,
  ironWardenSkillTree,
  normalizeProfileState,
  type ProfileState,
  purchasedUpgradeCatalog,
  resolveBossDeathRewards
} from "@dwarven-depths/progression";
import {
  type BattlefieldDwarfDeploymentAuthority,
  createBattlefieldDwarfDeploymentAuthority,
  createInitialState
} from "@dwarven-depths/sim-core";
import { deployBattlefieldDwarvesWithPurchasedUpgradeEffects } from "./battlefield-purchased-upgrade-effects.js";

const levelId = "level.shuttergate_hall" as StableId;
const characterId = "character.iron_warden" as StableId;
const entityId = "entity.dwarf.warden" as StableId;
const placementPointId = "placement.shuttergate_north_guard" as StableId;
const attemptIdPattern = /^attempt\.shuttergate\.web_[0-9]{6}$/;
const authoredWaveIds = Object.freeze(
  [1, 2, 3, 4, 5].map((wave) => `wave.shuttergate_${wave}` as StableId)
);
const authoredWaveStartTicks = Object.freeze([0, 900, 1800, 2700, 3600]);
const authoredSpawnIds = Object.freeze(
  Array.from(
    { length: 18 },
    (_, index) =>
      `spawn.shuttergate_${(index + 1).toString().padStart(3, "0")}` as StableId
  )
);
const authoredEnemyEntityIds = Object.freeze(
  Array.from(
    { length: 18 },
    (_, index) =>
      `entity.enemy.shuttergate_${(index + 1)
        .toString()
        .padStart(3, "0")}` as StableId
  )
);
const authoredEnemyDefinitions = Object.freeze([
  "enemy.goblin_cutter",
  "enemy.goblin_cutter",
  "enemy.goblin_cutter",
  "enemy.goblin_cutter",
  "enemy.goblin_cutter",
  "enemy.goblin_slinger",
  "enemy.goblin_bulwark",
  "enemy.goblin_cutter",
  "enemy.goblin_slinger",
  "enemy.gatebreaker_captain",
  "enemy.goblin_cutter",
  "enemy.goblin_slinger",
  "enemy.goblin_bulwark",
  "enemy.goblin_cutter",
  "enemy.goblin_cutter",
  "enemy.goblin_slinger",
  "enemy.goblin_cutter",
  "enemy.goblin_bulwark"
] as const);
const authoredAdmissionTicks = Object.freeze([
  1, 300, 600, 900, 1200, 1500, 1800, 1950, 2250, 2700, 2820, 3000, 3180, 3600,
  3750, 3900, 4050, 4200
]);
const authoredSpawnTicks = Object.freeze([
  0,
  ...authoredAdmissionTicks.slice(1)
]);

class ReadonlyCharacterMap
  implements ReadonlyMap<StableId, CharacterDefinition>
{
  readonly #source: Map<StableId, CharacterDefinition>;

  constructor(entries: Iterable<readonly [StableId, CharacterDefinition]>) {
    this.#source = new Map(entries);
    Object.freeze(this);
  }

  get size(): number {
    return this.#source.size;
  }

  get(key: StableId): CharacterDefinition | undefined {
    return this.#source.get(key);
  }

  has(key: StableId): boolean {
    return this.#source.has(key);
  }

  entries(): MapIterator<[StableId, CharacterDefinition]> {
    return this.#source.entries();
  }

  keys(): MapIterator<StableId> {
    return this.#source.keys();
  }

  values(): MapIterator<CharacterDefinition> {
    return this.#source.values();
  }

  forEach(
    callback: (
      value: CharacterDefinition,
      key: StableId,
      map: ReadonlyMap<StableId, CharacterDefinition>
    ) => void,
    thisArg?: unknown
  ): void {
    for (const [key, value] of this.#source)
      callback.call(thisArg, value, key, this);
  }

  [Symbol.iterator](): MapIterator<[StableId, CharacterDefinition]> {
    return this.entries();
  }
}

export interface ShuttergateWebRunConfiguration {
  readonly schemaVersion: 1;
  readonly attemptId: StableId;
  readonly seed: string;
  readonly placementPointId: StableId;
  readonly profile: ProfileState;
}

export interface ShuttergateWebRewardResolution {
  readonly schemaVersion: 1;
  readonly attemptId: StableId;
  readonly rewardId: StableId;
  readonly forgeOreAwarded: number;
  readonly profile: ProfileState;
}

/** Binds authored active abilities to the persisted profile's skill loadout. */
export function createShuttergateWebRunContent(
  content: CompiledContent,
  configuration: ShuttergateWebRunConfiguration
): CompiledContent {
  const run = requireConfiguration(configuration);
  const character = content.characters.get(characterId);
  if (character === undefined || character.activeAbilities === undefined)
    throw new Error("Shuttergate web content is missing Iron Warden abilities");
  const abilityIds = deriveIronWardenActiveAbilityIds(run.profile);
  const activeAbilities = Object.freeze(
    character.activeAbilities.filter((ability) =>
      abilityIds.includes(ability.id)
    )
  );
  if (activeAbilities.length !== abilityIds.length)
    throw new RangeError(
      "Shuttergate web loadout references an unauthored active ability"
    );
  const characters = new ReadonlyCharacterMap(
    [...content.characters].map(
      ([id, definition]) =>
        [
          id,
          id === characterId
            ? Object.freeze({ ...character, activeAbilities })
            : definition
        ] as const
    )
  );
  return Object.freeze({ ...content, characters });
}

/** Derives the exact bounded scenario used by configured browser attempts. */
export function createShuttergateWebScenario(
  scenario: ScenarioDefinition,
  configuration: ShuttergateWebRunConfiguration
): ScenarioDefinition {
  const run = requireConfiguration(configuration);
  if (scenario.levelId !== levelId)
    throw new RangeError("Shuttergate web run configuration has invalid level");
  const { expectedTerminalResult: _authoredExpectation, ...campaignScenario } =
    scenario;
  return Object.freeze({
    ...campaignScenario,
    seed: run.seed,
    maximumTicks: 6000
  });
}

function requireConfiguration(
  value: ShuttergateWebRunConfiguration
): ShuttergateWebRunConfiguration {
  const expectedKeys = [
    "attemptId",
    "placementPointId",
    "profile",
    "schemaVersion",
    "seed"
  ] as const;
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    throw new TypeError(
      "Shuttergate web run configuration has an invalid shape"
    );
  const ownKeys = Reflect.ownKeys(value);
  const actualKeys = ownKeys
    .filter((key): key is string => typeof key === "string")
    .sort();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    actualKeys.length !== ownKeys.length ||
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== [...expectedKeys].sort()[index]) ||
    expectedKeys.some((key) => {
      const descriptor = descriptors[key];
      return descriptor?.enumerable !== true || !("value" in descriptor);
    })
  )
    throw new TypeError(
      "Shuttergate web run configuration has an invalid shape"
    );
  const configuration = Object.fromEntries(
    expectedKeys.map((key) => [key, descriptors[key]?.value])
  ) as unknown as ShuttergateWebRunConfiguration;
  if (configuration.schemaVersion !== 1)
    throw new RangeError(
      "Shuttergate web run configuration has unsupported schemaVersion"
    );
  if (!attemptIdPattern.test(configuration.attemptId))
    throw new RangeError(
      "Shuttergate web run configuration has invalid attemptId"
    );
  if (
    !/^[1-9]\d{0,9}$/.test(configuration.seed) ||
    BigInt(configuration.seed) > 0xffff_ffffn
  )
    throw new RangeError("Shuttergate web run configuration has invalid seed");
  if (configuration.placementPointId !== placementPointId)
    throw new RangeError(
      "Shuttergate tutorial deployment must use the north guard"
    );
  const profile = normalizeProfileState(configuration.profile);
  const webRewardPrefix = "reward.attempt.shuttergate.web_";
  const claimedAttemptNumbers = profile.claimedRewardIds
    .filter((rewardId) => rewardId.startsWith(webRewardPrefix))
    .map((rewardId) => Number(rewardId.slice(webRewardPrefix.length)));
  if (
    claimedAttemptNumbers.some(
      (attemptNumber, index) => attemptNumber !== index + 1
    )
  )
    throw new RangeError(
      "Shuttergate web run configuration requires contiguous campaign rewards"
    );
  if (
    profile.claimedRewardIds.includes(
      "reward.campaign.shuttergate.victory" as StableId
    )
  )
    throw new RangeError("Shuttergate web campaign already ended in victory");
  const expectedAttemptNumber = claimedAttemptNumbers.length + 1;
  const expectedAttemptId = `attempt.shuttergate.web_${expectedAttemptNumber
    .toString()
    .padStart(6, "0")}`;
  if (
    configuration.attemptId !== expectedAttemptId ||
    configuration.seed !== String(expectedAttemptNumber)
  )
    throw new RangeError(
      "Shuttergate web run configuration attempt and seed must follow profile history"
    );
  return Object.freeze({
    schemaVersion: 1,
    attemptId: configuration.attemptId,
    seed: configuration.seed,
    placementPointId,
    profile
  });
}

/** Creates an immutable, profile-derived tutorial deployment for one live run. */
export function createShuttergateWebPreparationAuthority(
  content: CompiledContent,
  scenario: ScenarioDefinition,
  configuration: ShuttergateWebRunConfiguration
): {
  readonly state: SimulationState;
  readonly authority: BattlefieldDwarfDeploymentAuthority;
} {
  const run = requireConfiguration(configuration);
  if (scenario.levelId !== levelId)
    throw new RangeError("Shuttergate web run configuration has invalid level");
  const character = content.characters.get(characterId);
  if (character === undefined)
    throw new Error("Shuttergate web content is missing the Iron Warden");
  const initial = createInitialState(content, scenario.levelId, run.seed);
  if (initial.battlefield === undefined)
    throw new Error("Shuttergate web scenario has no battlefield state");
  const deploymentAuthority = createBattlefieldDwarfDeploymentAuthority(
    [
      {
        entityId: entityId as never,
        characterDefinitionId: characterId,
        placementPointId: placementPointId as never
      }
    ],
    initial.battlefield,
    content
  );
  const deployed = deployBattlefieldDwarvesWithPurchasedUpgradeEffects(
    {
      schemaVersion: 1,
      battlefield: initial.battlefield,
      profile: run.profile,
      catalog: purchasedUpgradeCatalog,
      skillTrees: [ironWardenSkillTree]
    },
    content,
    deploymentAuthority
  );
  return Object.freeze({
    state: Object.freeze({ ...initial, battlefield: deployed.battlefield }),
    authority: deploymentAuthority
  });
}

/** Creates an immutable, profile-derived tutorial deployment for one live run. */
export function createShuttergateWebPreparationState(
  content: CompiledContent,
  scenario: ScenarioDefinition,
  configuration: ShuttergateWebRunConfiguration
): SimulationState {
  return createShuttergateWebPreparationAuthority(
    content,
    scenario,
    configuration
  ).state;
}

/** Resolves exactly one terminal attempt reward from authoritative final state. */
export function resolveShuttergateWebAttemptReward(input: {
  readonly schemaVersion: 1;
  readonly configuration: ShuttergateWebRunConfiguration;
  readonly terminalResult: "victory" | "defeat";
  readonly finalState: SimulationState;
}): ShuttergateWebRewardResolution {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).sort().join("\u0000") !==
      ["configuration", "finalState", "schemaVersion", "terminalResult"]
        .sort()
        .join("\u0000") ||
    input.schemaVersion !== 1
  )
    throw new TypeError("Shuttergate web reward request has an invalid shape");
  const run = requireConfiguration(input.configuration);
  const state = input.finalState;
  if (
    state.phase !== "TERMINAL" ||
    state.terminalResult !== input.terminalResult ||
    state.levelId !== levelId ||
    state.seed !== run.seed ||
    (input.terminalResult !== "victory" && input.terminalResult !== "defeat")
  )
    throw new RangeError(
      "Shuttergate web reward request is not terminal-bound"
    );
  const battlefield = state.battlefield;
  if (battlefield === undefined)
    throw new RangeError("Shuttergate web reward request has no battlefield");
  if (
    battlefield.startedWaveIds.length > authoredWaveIds.length ||
    battlefield.startedWaveIds.some(
      (waveId, index) => waveId !== authoredWaveIds[index]
    )
  )
    throw new RangeError(
      "Shuttergate web reward waves are not an authored prefix"
    );
  const expectedStartedWaveCount = authoredWaveStartTicks.filter(
    (tick) => tick <= state.tick
  ).length;
  if (battlefield.startedWaveIds.length !== expectedStartedWaveCount)
    throw new RangeError(
      "Shuttergate terminal waves do not match the authored schedule"
    );
  if (
    input.terminalResult === "victory" &&
    battlefield.startedWaveIds.length !== authoredWaveIds.length
  )
    throw new RangeError(
      "Shuttergate victory did not start every authored wave"
    );
  const warden = battlefield.dwarfCombatants[0];
  if (
    battlefield.dwarfCombatants.length !== 1 ||
    warden === undefined ||
    warden.schemaVersion !== 1 ||
    warden.entityId !== entityId ||
    warden.characterDefinitionId !== characterId ||
    warden.placementPointId !== run.placementPointId ||
    (warden.lifecycleState === "downed"
      ? warden.currentHealth !== 0
      : warden.currentHealth <= 0) ||
    (input.terminalResult === "victory" &&
      warden.lifecycleState !== "active") ||
    (input.terminalResult === "defeat" &&
      warden.lifecycleState !== "downed" &&
      state.tick < 6000)
  )
    throw new RangeError(
      "Shuttergate terminal result does not bind the authored Warden state"
    );
  const firedSpawnCount = battlefield.firedSpawnIds.length;
  const expectedFiredSpawnCount = authoredSpawnTicks.filter(
    (tick) => tick <= state.tick
  ).length;
  if (
    firedSpawnCount !== expectedFiredSpawnCount ||
    battlefield.firedSpawnIds.some(
      (spawnId, index) => spawnId !== authoredSpawnIds[index]
    ) ||
    battlefield.enemyAdmissions.length !== firedSpawnCount ||
    battlefield.enemyAdmissions.some(
      (admission, index) =>
        admission.schemaVersion !== 1 ||
        admission.spawnId !== authoredSpawnIds[index] ||
        admission.entityId !== authoredEnemyEntityIds[index] ||
        admission.enemyDefinitionId !== authoredEnemyDefinitions[index] ||
        admission.admittedAtTick !== authoredAdmissionTicks[index]
    ) ||
    battlefield.enemyCombatants.length !== firedSpawnCount ||
    battlefield.enemyCombatants.some(
      (enemy, index) =>
        enemy.schemaVersion !== 1 ||
        enemy.entityId !== authoredEnemyEntityIds[index] ||
        enemy.enemyDefinitionId !== authoredEnemyDefinitions[index] ||
        enemy.admittedAtTick !== authoredAdmissionTicks[index] ||
        (enemy.lifecycleState === "destroyed"
          ? enemy.currentHealth !== 0
          : enemy.currentHealth <= 0)
    )
  )
    throw new RangeError(
      "Shuttergate terminal result does not bind the authored enemy roster"
    );
  const gatebreakerDefeated = battlefield.enemyCombatants.some(
    (enemy) =>
      enemy.entityId === "entity.enemy.shuttergate_010" &&
      enemy.lifecycleState === "destroyed"
  );
  if (input.terminalResult === "victory" && !gatebreakerDefeated)
    throw new RangeError(
      "Shuttergate victory did not defeat the Gatebreaker Captain"
    );
  if (
    input.terminalResult === "victory" &&
    (firedSpawnCount !== authoredSpawnIds.length ||
      battlefield.enemyCombatants.some(
        (enemy) => enemy.lifecycleState !== "destroyed"
      ))
  )
    throw new RangeError(
      "Shuttergate victory does not bind the cleared authored enemy roster"
    );
  if (
    input.terminalResult === "defeat" &&
    warden.lifecycleState === "active" &&
    firedSpawnCount === authoredSpawnIds.length &&
    battlefield.enemyCombatants.every(
      (enemy) => enemy.lifecycleState === "destroyed"
    )
  )
    throw new RangeError(
      "Shuttergate defeat contradicts the cleared authored enemy roster"
    );

  const rewardId = `reward.${run.attemptId}` as StableId;
  if (run.profile.claimedRewardIds.includes(rewardId))
    return Object.freeze({
      schemaVersion: 1,
      attemptId: run.attemptId,
      rewardId,
      forgeOreAwarded: 0,
      profile: run.profile
    });
  const defeatedEnemies = battlefield.enemyCombatants.filter(
    (enemy) => enemy.lifecycleState === "destroyed"
  ).length;
  const forgeOreAwarded = defeatedEnemies + battlefield.startedWaveIds.length;
  const forgeOre = run.profile.forgeOre + forgeOreAwarded;
  if (
    !Number.isSafeInteger(forgeOre) ||
    run.profile.revision === Number.MAX_SAFE_INTEGER
  )
    throw new RangeError("Shuttergate web reward exceeds profile limits");
  let profile = normalizeProfileState({
    ...run.profile,
    revision: run.profile.revision + 1,
    forgeOre,
    claimedRewardIds: [...run.profile.claimedRewardIds, rewardId]
  });
  if (gatebreakerDefeated) {
    profile = resolveBossDeathRewards({
      schemaVersion: 1,
      profile,
      bossDeaths: [
        {
          schemaVersion: 1,
          eventId: `death.${run.attemptId}.gatebreaker_captain` as StableId,
          bossEntityId: "entity.enemy.shuttergate_010" as never
        }
      ],
      rewards: [
        {
          schemaVersion: 1,
          rewardId: "reward.boss.gatebreaker_captain" as StableId,
          bossEntityId: "entity.enemy.shuttergate_010" as never,
          characterUnlockId: "character.deep_ranger" as StableId,
          forgeOre: 20
        }
      ]
    }).profile;
  }
  if (input.terminalResult === "victory")
    profile = normalizeProfileState({
      ...profile,
      revision: profile.revision + 1,
      claimedRewardIds: [
        ...profile.claimedRewardIds,
        "reward.campaign.shuttergate.victory" as StableId
      ]
    });
  return Object.freeze({
    schemaVersion: 1,
    attemptId: run.attemptId,
    rewardId,
    forgeOreAwarded: profile.forgeOre - run.profile.forgeOre,
    profile
  });
}
