import type { ShuttergateReferenceCalibrationEvidence } from "./shuttergate-reference-calibration.js";

const shuttergateReferenceManifestHash =
  "431bf145c82caf64f6c544c7516fafef6b50319ecb8277a748123dc3da6bb60d";

interface IntegerRange {
  readonly minimum: number;
  readonly maximum: number;
}

export interface ShuttergateLevel1Baseline {
  readonly schemaVersion: 1;
  readonly baselineId: "baseline.shuttergate.level_1.reference.v1";
  readonly contentManifestHash: string;
  readonly calibrationId: "calibration.shuttergate.unupgraded_warden.v1";
  readonly seed: string;
  readonly levelId: string;
  readonly placementPointId: string;
  readonly targetPolicy: "nearest";
  readonly buildId: "build.profile.new_campaign.v1";
  readonly safetyTickLimit: number;
  readonly terminalResult: "defeat";
  readonly terminalReason: "all_dwarves_downed";
  readonly deepestStartedWaveId: string;
  readonly ranges: {
    readonly terminalTick: IntegerRange;
    readonly firedSpawns: IntegerRange;
    readonly defeatedEnemies: IntegerRange;
    readonly survivingEnemies: IntegerRange;
  };
}

function requirePlainRecord<const Key extends string>(
  value: unknown,
  label: string,
  expectedKeys: readonly Key[]
): Record<Key, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError(`${label} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`${label} must be a plain object`);
  const ownKeys = Reflect.ownKeys(value);
  const actualKeys = ownKeys
    .filter((key): key is string => typeof key === "string")
    .sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== ownKeys.length ||
    actualKeys.length !== sortedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  )
    throw new TypeError(`${label} has invalid fields`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    expectedKeys.some((key) => {
      const descriptor = descriptors[key];
      return descriptor?.enumerable !== true || !("value" in descriptor);
    })
  )
    throw new TypeError(`${label} must use enumerable plain data properties`);
  return value as Record<Key, unknown>;
}

function requireIdentifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/.test(value)
  )
    throw new TypeError(`${label} must be a stable identifier`);
  return value;
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0)
    throw new TypeError(`${label} must be a positive safe integer`);
  return value as number;
}

function requireRange(value: unknown, label: string): IntegerRange {
  const record = requirePlainRecord(value, label, ["minimum", "maximum"]);
  const minimum = requirePositiveInteger(record.minimum, `${label}.minimum`);
  const maximum = requirePositiveInteger(record.maximum, `${label}.maximum`);
  if (minimum > maximum)
    throw new RangeError(`${label} minimum exceeds maximum`);
  return Object.freeze({ minimum, maximum });
}

export function requireShuttergateLevel1Baseline(
  value: unknown
): ShuttergateLevel1Baseline {
  const expectedKeys = [
    "baselineId",
    "buildId",
    "calibrationId",
    "contentManifestHash",
    "deepestStartedWaveId",
    "levelId",
    "placementPointId",
    "ranges",
    "safetyTickLimit",
    "schemaVersion",
    "seed",
    "targetPolicy",
    "terminalReason",
    "terminalResult"
  ] as const;
  const record = requirePlainRecord(
    value,
    "Shuttergate Level 1 baseline",
    expectedKeys
  );
  if (record.schemaVersion !== 1)
    throw new RangeError(
      "Shuttergate Level 1 baseline requires schema version 1"
    );
  if (record.baselineId !== "baseline.shuttergate.level_1.reference.v1")
    throw new RangeError("Shuttergate Level 1 baseline ID is unsupported");
  if (record.calibrationId !== "calibration.shuttergate.unupgraded_warden.v1")
    throw new RangeError("Shuttergate Level 1 calibration ID is unsupported");
  if (record.buildId !== "build.profile.new_campaign.v1")
    throw new RangeError("Shuttergate Level 1 build ID is unsupported");
  if (record.targetPolicy !== "nearest")
    throw new RangeError("Shuttergate Level 1 target policy is unsupported");
  if (record.terminalResult !== "defeat")
    throw new RangeError("Shuttergate Level 1 terminal result must be defeat");
  if (record.terminalReason !== "all_dwarves_downed")
    throw new RangeError(
      "Shuttergate Level 1 terminal reason must be all_dwarves_downed"
    );
  if (
    typeof record.seed !== "string" ||
    !/^[1-9]\d{0,9}$/.test(record.seed) ||
    BigInt(record.seed) > 0xffff_ffffn
  )
    throw new TypeError("Shuttergate Level 1 seed must be canonical");
  if (
    typeof record.contentManifestHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(record.contentManifestHash)
  )
    throw new TypeError("Shuttergate Level 1 content manifest hash is invalid");
  if (record.contentManifestHash !== shuttergateReferenceManifestHash)
    throw new RangeError(
      "Shuttergate Level 1 content manifest hash is not the pinned reference"
    );
  const rangesRecord = requirePlainRecord(
    record.ranges,
    "Shuttergate Level 1 ranges",
    ["defeatedEnemies", "firedSpawns", "survivingEnemies", "terminalTick"]
  );
  const safetyTickLimit = requirePositiveInteger(
    record.safetyTickLimit,
    "Shuttergate Level 1 safety tick limit"
  );
  const ranges = Object.freeze({
    terminalTick: requireRange(
      rangesRecord.terminalTick,
      "Shuttergate Level 1 terminal tick range"
    ),
    firedSpawns: requireRange(
      rangesRecord.firedSpawns,
      "Shuttergate Level 1 fired spawns range"
    ),
    defeatedEnemies: requireRange(
      rangesRecord.defeatedEnemies,
      "Shuttergate Level 1 defeated enemies range"
    ),
    survivingEnemies: requireRange(
      rangesRecord.survivingEnemies,
      "Shuttergate Level 1 surviving enemies range"
    )
  });
  if (ranges.terminalTick.maximum > safetyTickLimit)
    throw new RangeError(
      "Shuttergate Level 1 terminal tick range exceeds the safety tick limit"
    );
  return Object.freeze({
    schemaVersion: 1,
    baselineId: record.baselineId,
    contentManifestHash: record.contentManifestHash,
    calibrationId: record.calibrationId,
    seed: record.seed,
    levelId: requireIdentifier(record.levelId, "Shuttergate Level 1 level ID"),
    placementPointId: requireIdentifier(
      record.placementPointId,
      "Shuttergate Level 1 placement point ID"
    ),
    targetPolicy: record.targetPolicy,
    buildId: record.buildId,
    safetyTickLimit,
    terminalResult: record.terminalResult,
    terminalReason: record.terminalReason,
    deepestStartedWaveId: requireIdentifier(
      record.deepestStartedWaveId,
      "Shuttergate Level 1 deepest wave ID"
    ),
    ranges
  });
}

function requireInRange(
  value: number,
  range: IntegerRange,
  label: string
): void {
  if (!Number.isSafeInteger(value))
    throw new TypeError(`${label} must be a safe integer`);
  if (value < range.minimum || value > range.maximum)
    throw new RangeError(
      `${label} ${value} is outside ${range.minimum}..${range.maximum}`
    );
}

export function assertShuttergateCalibrationMatchesBaseline(
  evidence: ShuttergateReferenceCalibrationEvidence,
  baseline: ShuttergateLevel1Baseline
): void {
  for (const [label, actual, expected] of [
    [
      "content manifest",
      evidence.contentManifestHash,
      baseline.contentManifestHash
    ],
    ["calibration", evidence.calibrationId, baseline.calibrationId],
    ["seed", evidence.seed, baseline.seed],
    ["level", evidence.levelId, baseline.levelId],
    ["placement point", evidence.placementPointId, baseline.placementPointId],
    ["target policy", evidence.targetPolicy, baseline.targetPolicy],
    ["safety tick limit", evidence.safetyTickLimit, baseline.safetyTickLimit],
    ["terminal result", evidence.terminalResult, baseline.terminalResult],
    ["terminal reason", evidence.terminalReason, baseline.terminalReason],
    [
      "deepest wave",
      evidence.deepestStartedWaveId,
      baseline.deepestStartedWaveId
    ]
  ] as const) {
    if (actual !== expected)
      throw new RangeError(
        `Shuttergate Level 1 ${label} mismatch: ${String(actual)} != ${String(expected)}`
      );
  }
  requireInRange(
    evidence.terminalTick,
    baseline.ranges.terminalTick,
    "terminalTick"
  );
  requireInRange(
    evidence.firedSpawns,
    baseline.ranges.firedSpawns,
    "firedSpawns"
  );
  requireInRange(
    evidence.defeatedEnemies,
    baseline.ranges.defeatedEnemies,
    "defeatedEnemies"
  );
  requireInRange(
    evidence.survivingEnemies,
    baseline.ranges.survivingEnemies,
    "survivingEnemies"
  );
}
