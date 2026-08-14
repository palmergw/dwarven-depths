import type { DwarfTargetPolicy } from "@dwarven-depths/contracts";
import {
  type ShuttergateBuildCalibrationEvidence,
  type ShuttergateCalibrationBuildId,
  shuttergateCalibrationBuildIds
} from "./shuttergate-reference-calibration.js";

const referenceManifestHash =
  "431bf145c82caf64f6c544c7516fafef6b50319ecb8277a748123dc3da6bb60d";
const referenceSeed = "1";
const referenceSafetyTickLimit = 4_500;
const shuttergateLevel1WaveIds = Object.freeze([
  "wave.shuttergate_1",
  "wave.shuttergate_2",
  "wave.shuttergate_3",
  "wave.shuttergate_4",
  "wave.shuttergate_5"
] as const);

export const shuttergateLevel1PlacementPointIds = Object.freeze([
  "placement.shuttergate_north_guard",
  "placement.shuttergate_keep_guard"
] as const);

export const shuttergateLevel1TargetPolicies = Object.freeze([
  "nearest",
  "lowest_health",
  "highest_health",
  "highest_armor",
  "fastest",
  "boss_or_elite_first"
] as const satisfies readonly DwarfTargetPolicy[]);

interface IntegerRange {
  readonly minimum: number;
  readonly maximum: number;
}

export interface ShuttergateLevel1BalanceCase {
  readonly placementPointId: (typeof shuttergateLevel1PlacementPointIds)[number];
  readonly targetPolicy: (typeof shuttergateLevel1TargetPolicies)[number];
  readonly buildId: ShuttergateCalibrationBuildId;
  readonly terminalResult: "victory" | "defeat";
  readonly terminalReason: "victory_conditions_met" | "all_dwarves_downed";
  readonly deepestStartedWaveId: (typeof shuttergateLevel1WaveIds)[number];
  readonly ranges: {
    readonly terminalTick: IntegerRange;
    readonly firedSpawns: IntegerRange;
    readonly defeatedEnemies: IntegerRange;
    readonly survivingEnemies: IntegerRange;
  };
}

export interface ShuttergateLevel1BalanceMatrix {
  readonly schemaVersion: 1;
  readonly matrixId: "balance.shuttergate.level_1.matrix.v1";
  readonly contentManifestHash: string;
  readonly calibrationId: "calibration.shuttergate.warden_build.v1";
  readonly seed: string;
  readonly levelId: "level.shuttergate_hall";
  readonly safetyTickLimit: number;
  readonly cases: readonly ShuttergateLevel1BalanceCase[];
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
  return Object.fromEntries(
    expectedKeys.map((key) => [key, descriptors[key]?.value])
  ) as Record<Key, unknown>;
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0)
    throw new TypeError(`${label} must be a positive safe integer`);
  return value as number;
}

function requireNonnegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new TypeError(`${label} must be a nonnegative safe integer`);
  return value as number;
}

function requirePlainArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    throw new TypeError(`${label} must be an array`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const expectedKeys = [
    ...Array.from({ length: value.length }, (_, index) => String(index)),
    "length"
  ];
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== expectedKeys.length ||
    ownKeys.some((key, index) => key !== expectedKeys[index]) ||
    expectedKeys.slice(0, -1).some((key) => {
      const descriptor = descriptors[key];
      return descriptor?.enumerable !== true || !("value" in descriptor);
    })
  )
    throw new TypeError(`${label} must contain dense plain data elements`);
  return Object.freeze(
    expectedKeys.slice(0, -1).map((key) => descriptors[key]?.value)
  );
}

function requireRange(value: unknown, label: string): IntegerRange {
  const record = requirePlainRecord(value, label, ["minimum", "maximum"]);
  const minimum = requireNonnegativeInteger(record.minimum, `${label}.minimum`);
  const maximum = requireNonnegativeInteger(record.maximum, `${label}.maximum`);
  if (minimum > maximum)
    throw new RangeError(`${label} minimum exceeds maximum`);
  return Object.freeze({ minimum, maximum });
}

function requireMember<const Value extends string>(
  value: unknown,
  supported: readonly Value[],
  label: string
): Value {
  if (typeof value !== "string" || !supported.includes(value as Value))
    throw new RangeError(`${label} is unsupported`);
  return value as Value;
}

function requireCase(
  value: unknown,
  index: number,
  safetyTickLimit: number
): ShuttergateLevel1BalanceCase {
  const label = `Shuttergate Level 1 balance case ${index}`;
  const record = requirePlainRecord(value, label, [
    "buildId",
    "deepestStartedWaveId",
    "placementPointId",
    "ranges",
    "targetPolicy",
    "terminalReason",
    "terminalResult"
  ]);
  const terminalResult = requireMember(
    record.terminalResult,
    ["defeat", "victory"],
    `${label} terminal result`
  );
  const terminalReason = requireMember(
    record.terminalReason,
    ["all_dwarves_downed", "victory_conditions_met"],
    `${label} terminal reason`
  );
  if (
    (terminalResult === "defeat" && terminalReason !== "all_dwarves_downed") ||
    (terminalResult === "victory" &&
      terminalReason !== "victory_conditions_met")
  )
    throw new RangeError(`${label} terminal result and reason contradict`);
  const deepestStartedWaveId = requireMember(
    record.deepestStartedWaveId,
    shuttergateLevel1WaveIds,
    `${label} deepest wave ID`
  );
  const rangesRecord = requirePlainRecord(record.ranges, `${label} ranges`, [
    "defeatedEnemies",
    "firedSpawns",
    "survivingEnemies",
    "terminalTick"
  ]);
  const ranges = Object.freeze({
    terminalTick: requireRange(
      rangesRecord.terminalTick,
      `${label} terminal tick range`
    ),
    firedSpawns: requireRange(
      rangesRecord.firedSpawns,
      `${label} fired spawns range`
    ),
    defeatedEnemies: requireRange(
      rangesRecord.defeatedEnemies,
      `${label} defeated enemies range`
    ),
    survivingEnemies: requireRange(
      rangesRecord.survivingEnemies,
      `${label} surviving enemies range`
    )
  });
  if (ranges.terminalTick.maximum > safetyTickLimit)
    throw new RangeError(
      `${label} terminal tick range exceeds the safety tick limit`
    );
  const buildId = requireMember(
    record.buildId,
    shuttergateCalibrationBuildIds,
    `${label} build`
  );
  if (
    buildId === "build.profile.new_campaign.v1" &&
    terminalResult !== "defeat"
  )
    throw new RangeError(`${label} baseline build must end in defeat`);
  if (
    terminalResult === "victory" &&
    (deepestStartedWaveId !== "wave.shuttergate_5" ||
      ranges.survivingEnemies.minimum !== 0 ||
      ranges.survivingEnemies.maximum !== 0)
  )
    throw new RangeError(`${label} victory evidence is incomplete`);
  return Object.freeze({
    placementPointId: requireMember(
      record.placementPointId,
      shuttergateLevel1PlacementPointIds,
      `${label} placement point`
    ),
    targetPolicy: requireMember(
      record.targetPolicy,
      shuttergateLevel1TargetPolicies,
      `${label} target policy`
    ),
    buildId,
    terminalResult,
    terminalReason,
    deepestStartedWaveId,
    ranges
  });
}

function caseKey(value: {
  readonly placementPointId: string;
  readonly targetPolicy: string;
  readonly buildId: string;
}): string {
  return `${value.placementPointId}\u0000${value.targetPolicy}\u0000${value.buildId}`;
}

export function requireShuttergateLevel1BalanceMatrix(
  value: unknown
): ShuttergateLevel1BalanceMatrix {
  const record = requirePlainRecord(
    value,
    "Shuttergate Level 1 balance matrix",
    [
      "calibrationId",
      "cases",
      "contentManifestHash",
      "levelId",
      "matrixId",
      "safetyTickLimit",
      "schemaVersion",
      "seed"
    ]
  );
  if (record.schemaVersion !== 1)
    throw new RangeError(
      "Shuttergate Level 1 balance matrix requires schema version 1"
    );
  if (record.matrixId !== "balance.shuttergate.level_1.matrix.v1")
    throw new RangeError(
      "Shuttergate Level 1 balance matrix ID is unsupported"
    );
  if (record.calibrationId !== "calibration.shuttergate.warden_build.v1")
    throw new RangeError(
      "Shuttergate Level 1 balance calibration ID is unsupported"
    );
  if (record.contentManifestHash !== referenceManifestHash)
    throw new RangeError(
      "Shuttergate Level 1 balance content manifest is not pinned"
    );
  if (record.levelId !== "level.shuttergate_hall")
    throw new RangeError("Shuttergate Level 1 balance level ID is unsupported");
  if (record.seed !== referenceSeed)
    throw new RangeError("Shuttergate Level 1 balance seed is not pinned");
  const safetyTickLimit = requirePositiveInteger(
    record.safetyTickLimit,
    "Shuttergate Level 1 balance safety tick limit"
  );
  if (safetyTickLimit !== referenceSafetyTickLimit)
    throw new RangeError(
      "Shuttergate Level 1 balance safety tick limit is not pinned"
    );
  const caseInputs = requirePlainArray(
    record.cases,
    "Shuttergate Level 1 balance cases"
  );
  const cases = Object.freeze(
    caseInputs.map((entry, index) => requireCase(entry, index, safetyTickLimit))
  );
  const actualKeys = new Set(cases.map(caseKey));
  if (actualKeys.size !== cases.length)
    throw new RangeError(
      "Shuttergate Level 1 balance matrix has duplicate cases"
    );
  const expectedKeys = shuttergateLevel1PlacementPointIds.flatMap(
    (placementPointId) =>
      shuttergateLevel1TargetPolicies.flatMap((targetPolicy) =>
        shuttergateCalibrationBuildIds.map((buildId) =>
          caseKey({ placementPointId, targetPolicy, buildId })
        )
      )
  );
  if (
    cases.length !== expectedKeys.length ||
    expectedKeys.some((key) => !actualKeys.has(key))
  )
    throw new RangeError("Shuttergate Level 1 balance matrix is incomplete");
  if (cases.some((entry, index) => caseKey(entry) !== expectedKeys[index]))
    throw new RangeError(
      "Shuttergate Level 1 balance matrix cases are not in canonical order"
    );
  return Object.freeze({
    schemaVersion: 1,
    matrixId: record.matrixId,
    contentManifestHash: record.contentManifestHash,
    calibrationId: record.calibrationId,
    seed: record.seed,
    levelId: record.levelId,
    safetyTickLimit,
    cases
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

export function assertShuttergateCalibrationMatchesBalanceCase(
  evidence: ShuttergateBuildCalibrationEvidence,
  matrix: ShuttergateLevel1BalanceMatrix,
  balanceCase: ShuttergateLevel1BalanceCase
): void {
  for (const [label, actual, expected] of [
    [
      "content manifest",
      evidence.contentManifestHash,
      matrix.contentManifestHash
    ],
    ["calibration", evidence.calibrationId, matrix.calibrationId],
    ["seed", evidence.seed, matrix.seed],
    ["level", evidence.levelId, matrix.levelId],
    ["safety tick limit", evidence.safetyTickLimit, matrix.safetyTickLimit],
    [
      "placement point",
      evidence.placementPointId,
      balanceCase.placementPointId
    ],
    ["target policy", evidence.targetPolicy, balanceCase.targetPolicy],
    ["build", evidence.buildId, balanceCase.buildId],
    ["terminal result", evidence.terminalResult, balanceCase.terminalResult],
    ["terminal reason", evidence.terminalReason, balanceCase.terminalReason],
    [
      "deepest wave",
      evidence.deepestStartedWaveId,
      balanceCase.deepestStartedWaveId
    ]
  ] as const) {
    if (actual !== expected)
      throw new RangeError(
        `Shuttergate Level 1 balance ${label} mismatch: ${String(actual)} != ${String(expected)}`
      );
  }
  requireInRange(
    evidence.terminalTick,
    balanceCase.ranges.terminalTick,
    "terminalTick"
  );
  requireInRange(
    evidence.firedSpawns,
    balanceCase.ranges.firedSpawns,
    "firedSpawns"
  );
  requireInRange(
    evidence.defeatedEnemies,
    balanceCase.ranges.defeatedEnemies,
    "defeatedEnemies"
  );
  requireInRange(
    evidence.survivingEnemies,
    balanceCase.ranges.survivingEnemies,
    "survivingEnemies"
  );
}
