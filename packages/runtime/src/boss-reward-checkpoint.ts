import {
  type BossRewardResolution,
  type BossRewardResolutionRequest,
  resolveBossDeathRewards
} from "@dwarven-depths/progression";

export interface BossRewardCheckpointRequest {
  readonly schemaVersion: 1;
  readonly bossRewards: BossRewardResolutionRequest;
  readonly livingDwarves: number;
}

export interface BossRewardCheckpointResult {
  readonly schemaVersion: 1;
  readonly bossRewards: BossRewardResolution;
  readonly livingDwarves: number;
  readonly terminalResult?: "defeat";
  readonly reason: "all_dwarves_downed" | "living_dwarves_remain";
}

/**
 * Composes fixed-step phases 12 and 13 for the all-dwarves-down boundary.
 * Rewards resolve first so a simultaneous boss/final-dwarf death cannot lose
 * an owned boss claim even though terminal evaluation returns defeat.
 */
export function resolveBossRewardCheckpoint(
  request: BossRewardCheckpointRequest
): BossRewardCheckpointResult {
  if (
    typeof request !== "object" ||
    request === null ||
    Array.isArray(request) ||
    (Object.getPrototypeOf(request) !== Object.prototype &&
      Object.getPrototypeOf(request) !== null)
  )
    throw new TypeError(
      "boss reward checkpoint request must be a plain object"
    );
  const descriptors = Object.getOwnPropertyDescriptors(request);
  const expectedKeys = ["schemaVersion", "bossRewards", "livingDwarves"];
  if (
    Reflect.ownKeys(request).length !== expectedKeys.length ||
    !expectedKeys.every((key) => {
      const descriptor = descriptors[key];
      return descriptor?.enumerable === true && "value" in descriptor;
    })
  )
    throw new TypeError(
      "boss reward checkpoint request must contain exactly schemaVersion, bossRewards, livingDwarves"
    );
  if (request.schemaVersion !== 1)
    throw new RangeError(
      "boss reward checkpoint request has unsupported schemaVersion"
    );
  if (
    !Number.isSafeInteger(request.livingDwarves) ||
    Object.is(request.livingDwarves, -0) ||
    request.livingDwarves < 0
  )
    throw new RangeError(
      "boss reward checkpoint livingDwarves must be a non-negative safe integer"
    );

  const bossRewards = resolveBossDeathRewards(request.bossRewards);
  const defeated = request.livingDwarves === 0;
  return Object.freeze({
    schemaVersion: 1,
    bossRewards,
    livingDwarves: request.livingDwarves,
    ...(defeated ? { terminalResult: "defeat" as const } : {}),
    reason: defeated ? "all_dwarves_downed" : "living_dwarves_remain"
  });
}
