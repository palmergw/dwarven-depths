import {
  canonicalHash,
  canonicalStringify,
  type StableId
} from "@dwarven-depths/contracts";
import type { ShuttergateCampaignAttemptEvidence } from "./shuttergate-campaign.js";

const telemetryId = "telemetry.shuttergate.attempt.v1" as const;
const shuttergateManifestHash =
  "431bf145c82caf64f6c544c7516fafef6b50319ecb8277a748123dc3da6bb60d";
const wardenCharacterId = "character.iron_warden" as StableId;
const wardenEntityId = "entity.dwarf.warden" as StableId;
const shieldSlamUpgradeId = "upgrade.ability.shield_slam" as StableId;

export interface ShuttergateAttemptTelemetryPayload {
  readonly schemaVersion: 1;
  readonly attemptId: StableId;
  readonly contentManifestHash: string;
  readonly seed: string;
  readonly levelId: StableId;
  readonly placementPointId: StableId;
  readonly targetPolicy: string;
  readonly build: {
    readonly buildId: string;
    readonly roster: readonly {
      readonly characterId: StableId;
      readonly entityId: StableId;
      readonly purchasedUpgradeIds: readonly StableId[];
    }[];
  };
  readonly outcome: {
    readonly terminalResult: "victory" | "defeat";
    readonly terminalReason: string;
    readonly durationTicks: number;
    readonly deepestStartedWaveId: StableId;
  };
  readonly waveTransitions: readonly {
    readonly tick: number;
    readonly startedWaveIds: readonly StableId[];
    readonly firedSpawns: number;
    readonly livingEnemies: number;
    readonly wardenHealth: number;
  }[];
  readonly combat: {
    readonly firedSpawns: number;
    readonly scheduledSpawns: number;
    readonly defeatedEnemies: number;
    readonly survivingEnemies: number;
    readonly wardenHealth: number;
    readonly wardenLifecycle: "active" | "downed";
  };
  readonly rewards: {
    readonly forgeOreAwarded: number;
    readonly bossRewardClaimed: boolean;
    readonly unlockedCharacterIds: readonly StableId[];
  };
}

export interface ShuttergateAttemptTelemetry {
  readonly schemaVersion: 1;
  readonly telemetryId: typeof telemetryId;
  readonly payload: ShuttergateAttemptTelemetryPayload;
  readonly payloadChecksum: string;
}

function requireRecord<const Key extends string>(
  value: unknown,
  label: string,
  keys: readonly Key[]
): Record<Key, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError(`${label} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`${label} must be a plain object`);
  const actual = Reflect.ownKeys(value);
  const expected = [...keys].sort();
  const strings = actual
    .filter((key): key is string => typeof key === "string")
    .sort();
  if (
    strings.length !== actual.length ||
    strings.length !== expected.length ||
    strings.some((key, index) => key !== expected[index])
  )
    throw new TypeError(`${label} has invalid fields`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    keys.some((key) => {
      const descriptor = descriptors[key];
      return descriptor?.enumerable !== true || !("value" in descriptor);
    })
  )
    throw new TypeError(`${label} must use enumerable plain data properties`);
  return Object.fromEntries(
    keys.map((key) => [key, descriptors[key]?.value])
  ) as Record<Key, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0)
    throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function requireId(value: unknown, label: string): StableId {
  const id = requireString(value, label);
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/.test(id))
    throw new TypeError(`${label} must be a stable identifier`);
  return id as StableId;
}

function requireInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new TypeError(`${label} must be a non-negative safe integer`);
  return value as number;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean")
    throw new TypeError(`${label} must be boolean`);
  return value;
}

function requireIdArray(value: unknown, label: string): readonly StableId[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return Object.freeze(
    value.map((entry, index) => requireId(entry, `${label}[${index}]`))
  );
}

function normalizePayload(value: unknown): ShuttergateAttemptTelemetryPayload {
  const payload = requireRecord(value, "telemetry payload", [
    "attemptId",
    "build",
    "combat",
    "contentManifestHash",
    "levelId",
    "outcome",
    "placementPointId",
    "rewards",
    "schemaVersion",
    "seed",
    "targetPolicy",
    "waveTransitions"
  ]);
  if (payload.schemaVersion !== 1)
    throw new RangeError("telemetry payload requires schema version 1");
  const manifest = requireString(
    payload.contentManifestHash,
    "content manifest hash"
  );
  if (!/^[0-9a-f]{64}$/.test(manifest))
    throw new TypeError("content manifest hash is invalid");
  const seed = requireString(payload.seed, "seed");
  if (!/^[1-9]\d{0,9}$/.test(seed) || BigInt(seed) > 0xffff_ffffn)
    throw new TypeError("seed must be a canonical uint32 string");

  const build = requireRecord(payload.build, "telemetry build", [
    "buildId",
    "roster"
  ]);
  if (!Array.isArray(build.roster) || build.roster.length === 0)
    throw new TypeError("telemetry roster must be a non-empty array");
  const roster = Object.freeze(
    build.roster.map((entry, index) => {
      const record = requireRecord(entry, `telemetry roster[${index}]`, [
        "characterId",
        "entityId",
        "purchasedUpgradeIds"
      ]);
      return Object.freeze({
        characterId: requireId(
          record.characterId,
          `telemetry roster[${index}].characterId`
        ),
        entityId: requireId(
          record.entityId,
          `telemetry roster[${index}].entityId`
        ),
        purchasedUpgradeIds: requireIdArray(
          record.purchasedUpgradeIds,
          `telemetry roster[${index}].purchasedUpgradeIds`
        )
      });
    })
  );

  const outcome = requireRecord(payload.outcome, "telemetry outcome", [
    "deepestStartedWaveId",
    "durationTicks",
    "terminalReason",
    "terminalResult"
  ]);
  if (
    outcome.terminalResult !== "victory" &&
    outcome.terminalResult !== "defeat"
  )
    throw new TypeError("telemetry terminal result is invalid");

  if (
    !Array.isArray(payload.waveTransitions) ||
    payload.waveTransitions.length === 0
  )
    throw new TypeError("telemetry wave transitions must be a non-empty array");
  const waveTransitions = Object.freeze(
    payload.waveTransitions.map((entry, index) => {
      const record = requireRecord(
        entry,
        `telemetry wave transition[${index}]`,
        [
          "firedSpawns",
          "livingEnemies",
          "startedWaveIds",
          "tick",
          "wardenHealth"
        ]
      );
      return Object.freeze({
        tick: requireInteger(
          record.tick,
          `telemetry wave transition[${index}].tick`
        ),
        startedWaveIds: requireIdArray(
          record.startedWaveIds,
          `telemetry wave transition[${index}].startedWaveIds`
        ),
        firedSpawns: requireInteger(
          record.firedSpawns,
          `telemetry wave transition[${index}].firedSpawns`
        ),
        livingEnemies: requireInteger(
          record.livingEnemies,
          `telemetry wave transition[${index}].livingEnemies`
        ),
        wardenHealth: requireInteger(
          record.wardenHealth,
          `telemetry wave transition[${index}].wardenHealth`
        )
      });
    })
  );

  const combat = requireRecord(payload.combat, "telemetry combat", [
    "defeatedEnemies",
    "firedSpawns",
    "scheduledSpawns",
    "survivingEnemies",
    "wardenHealth",
    "wardenLifecycle"
  ]);
  if (
    combat.wardenLifecycle !== "active" &&
    combat.wardenLifecycle !== "downed"
  )
    throw new TypeError("telemetry Warden lifecycle is invalid");
  const rewards = requireRecord(payload.rewards, "telemetry rewards", [
    "bossRewardClaimed",
    "forgeOreAwarded",
    "unlockedCharacterIds"
  ]);
  const normalized = Object.freeze({
    schemaVersion: 1,
    attemptId: requireId(payload.attemptId, "telemetry attempt ID"),
    contentManifestHash: manifest,
    seed,
    levelId: requireId(payload.levelId, "telemetry level ID"),
    placementPointId: requireId(
      payload.placementPointId,
      "telemetry placement point ID"
    ),
    targetPolicy: requireString(
      payload.targetPolicy,
      "telemetry target policy"
    ),
    build: Object.freeze({
      buildId: requireString(build.buildId, "telemetry build ID"),
      roster
    }),
    outcome: Object.freeze({
      terminalResult: outcome.terminalResult,
      terminalReason: requireString(
        outcome.terminalReason,
        "telemetry terminal reason"
      ),
      durationTicks: requireInteger(
        outcome.durationTicks,
        "telemetry duration"
      ),
      deepestStartedWaveId: requireId(
        outcome.deepestStartedWaveId,
        "telemetry deepest wave ID"
      )
    }),
    waveTransitions,
    combat: Object.freeze({
      firedSpawns: requireInteger(combat.firedSpawns, "telemetry fired spawns"),
      scheduledSpawns: requireInteger(
        combat.scheduledSpawns,
        "telemetry scheduled spawns"
      ),
      defeatedEnemies: requireInteger(
        combat.defeatedEnemies,
        "telemetry defeated enemies"
      ),
      survivingEnemies: requireInteger(
        combat.survivingEnemies,
        "telemetry surviving enemies"
      ),
      wardenHealth: requireInteger(
        combat.wardenHealth,
        "telemetry Warden health"
      ),
      wardenLifecycle: combat.wardenLifecycle
    }),
    rewards: Object.freeze({
      forgeOreAwarded: requireInteger(
        rewards.forgeOreAwarded,
        "telemetry forge ore awarded"
      ),
      bossRewardClaimed: requireBoolean(
        rewards.bossRewardClaimed,
        "telemetry boss reward claimed"
      ),
      unlockedCharacterIds: requireIdArray(
        rewards.unlockedCharacterIds,
        "telemetry unlocked character IDs"
      )
    })
  });
  if (normalized.contentManifestHash !== shuttergateManifestHash)
    throw new RangeError(
      "telemetry content manifest is not the pinned reference"
    );
  if (normalized.levelId !== "level.shuttergate_hall")
    throw new RangeError("telemetry level ID is unsupported");
  if (normalized.placementPointId !== "placement.shuttergate_north_guard")
    throw new RangeError("telemetry placement point ID is unsupported");
  if (normalized.targetPolicy !== "nearest")
    throw new RangeError("telemetry target policy is unsupported");
  const upgraded =
    normalized.build.buildId === "build.warden.shield_slam_rank_1.v1";
  if (!upgraded && normalized.build.buildId !== "build.profile.new_campaign.v1")
    throw new RangeError("telemetry build ID is unsupported");
  const rosterEntry = normalized.build.roster[0];
  const expectedUpgradeIds = upgraded ? [shieldSlamUpgradeId] : [];
  if (
    normalized.build.roster.length !== 1 ||
    rosterEntry?.characterId !== wardenCharacterId ||
    rosterEntry.entityId !== wardenEntityId ||
    rosterEntry.purchasedUpgradeIds.length !== expectedUpgradeIds.length ||
    rosterEntry.purchasedUpgradeIds.some(
      (upgradeId, index) => upgradeId !== expectedUpgradeIds[index]
    )
  )
    throw new RangeError("telemetry roster does not match the selected build");
  for (let index = 0; index < normalized.waveTransitions.length; index += 1) {
    const transition = normalized.waveTransitions[index];
    const previous = normalized.waveTransitions[index - 1];
    if (transition === undefined)
      throw new Error("telemetry transition is missing");
    if (
      transition.livingEnemies > transition.firedSpawns ||
      transition.startedWaveIds.some(
        (waveId, waveIndex) => waveId !== `wave.shuttergate_${waveIndex + 1}`
      ) ||
      (previous !== undefined &&
        (transition.tick <= previous.tick ||
          transition.firedSpawns < previous.firedSpawns ||
          transition.startedWaveIds.length < previous.startedWaveIds.length ||
          previous.startedWaveIds.some(
            (waveId, waveIndex) =>
              transition.startedWaveIds[waveIndex] !== waveId
          )))
    )
      throw new RangeError("telemetry wave transitions are not monotonic");
  }
  const terminalTransition = normalized.waveTransitions.at(-1);
  if (
    terminalTransition === undefined ||
    terminalTransition.tick !== normalized.outcome.durationTicks ||
    terminalTransition.startedWaveIds.at(-1) !==
      normalized.outcome.deepestStartedWaveId ||
    terminalTransition.firedSpawns !== normalized.combat.firedSpawns ||
    terminalTransition.livingEnemies !== normalized.combat.survivingEnemies ||
    terminalTransition.wardenHealth !== normalized.combat.wardenHealth
  )
    throw new RangeError(
      "telemetry terminal transition contradicts the outcome"
    );
  if (
    normalized.combat.firedSpawns > normalized.combat.scheduledSpawns ||
    normalized.combat.defeatedEnemies + normalized.combat.survivingEnemies !==
      normalized.combat.firedSpawns
  )
    throw new RangeError("telemetry combat totals are contradictory");
  if (
    (normalized.combat.wardenLifecycle === "downed") !==
    (normalized.combat.wardenHealth === 0)
  )
    throw new RangeError("telemetry Warden state is contradictory");
  if (
    normalized.outcome.terminalResult !== "defeat" ||
    normalized.outcome.terminalReason !== "all_dwarves_downed" ||
    normalized.combat.wardenLifecycle !== "downed"
  )
    throw new RangeError("telemetry terminal result is contradictory");
  if (
    normalized.rewards.forgeOreAwarded !==
      normalized.combat.defeatedEnemies +
        terminalTransition.startedWaveIds.length ||
    normalized.rewards.bossRewardClaimed ||
    normalized.rewards.unlockedCharacterIds.length !== 0
  )
    throw new RangeError(
      "telemetry rewards contradict the authoritative policy"
    );
  return normalized;
}

export async function createShuttergateAttemptTelemetry(
  attempt: ShuttergateCampaignAttemptEvidence
): Promise<ShuttergateAttemptTelemetry> {
  const calibration = attempt.encounter.calibration;
  const payload = normalizePayload({
    schemaVersion: 1,
    attemptId: attempt.attemptId,
    contentManifestHash: calibration.contentManifestHash,
    seed: attempt.seed,
    levelId: calibration.levelId,
    placementPointId: attempt.placementPointId,
    targetPolicy: attempt.targetPolicy,
    build: {
      buildId: attempt.buildId,
      roster: [
        {
          characterId: wardenCharacterId,
          entityId: wardenEntityId,
          purchasedUpgradeIds:
            attempt.buildId === "build.warden.shield_slam_rank_1.v1"
              ? [shieldSlamUpgradeId]
              : []
        }
      ]
    },
    outcome: {
      terminalResult: calibration.terminalResult,
      terminalReason: calibration.terminalReason,
      durationTicks: calibration.terminalTick,
      deepestStartedWaveId: calibration.deepestStartedWaveId
    },
    waveTransitions: calibration.milestones.map((milestone) => ({
      tick: milestone.tick,
      startedWaveIds: milestone.startedWaveIds,
      firedSpawns: milestone.firedSpawns,
      livingEnemies: milestone.livingEnemies,
      wardenHealth: milestone.wardenHealth
    })),
    combat: {
      firedSpawns: calibration.firedSpawns,
      scheduledSpawns: calibration.scheduledSpawns,
      defeatedEnemies: calibration.defeatedEnemies,
      survivingEnemies: calibration.survivingEnemies,
      wardenHealth: calibration.wardenHealth,
      wardenLifecycle: calibration.wardenLifecycle
    },
    rewards: {
      forgeOreAwarded: attempt.rewardDecision.forgeOre,
      bossRewardClaimed: calibration.bossRewardClaimed,
      unlockedCharacterIds: calibration.deepRangerUnlocked
        ? ["character.deep_ranger"]
        : []
    }
  });
  return Object.freeze({
    schemaVersion: 1,
    telemetryId,
    payload,
    payloadChecksum: await canonicalHash(payload)
  });
}

export async function requireShuttergateAttemptTelemetry(
  value: unknown
): Promise<ShuttergateAttemptTelemetry> {
  const record = requireRecord(value, "Shuttergate attempt telemetry", [
    "payload",
    "payloadChecksum",
    "schemaVersion",
    "telemetryId"
  ]);
  if (record.schemaVersion !== 1)
    throw new RangeError(
      "Shuttergate attempt telemetry requires schema version 1"
    );
  if (record.telemetryId !== telemetryId)
    throw new RangeError("Shuttergate attempt telemetry ID is unsupported");
  const payload = normalizePayload(record.payload);
  const checksum = requireString(
    record.payloadChecksum,
    "telemetry payload checksum"
  );
  if (!/^[0-9a-f]{64}$/.test(checksum))
    throw new TypeError("telemetry payload checksum is invalid");
  if ((await canonicalHash(payload)) !== checksum)
    throw new RangeError("telemetry payload checksum mismatch");
  return Object.freeze({
    schemaVersion: 1,
    telemetryId,
    payload,
    payloadChecksum: checksum
  });
}

export function serializeShuttergateAttemptTelemetry(
  telemetry: ShuttergateAttemptTelemetry
): string {
  return `${canonicalStringify(telemetry)}\n`;
}
