import type { StableId } from "@dwarven-depths/contracts";
import { canonicalStringify } from "@dwarven-depths/contracts";
import {
  compareText,
  maximumProfileRecords,
  normalizeProfileState,
  type ProfileState,
  requireProfileArray,
  requireProfileId,
  requireProfileRecord,
  requireProfileUnsigned
} from "./profile-state.js";

const attemptIdPattern = /^attempt\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const attemptRewardIdPattern =
  /^reward\.attempt\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const policyIdPattern =
  /^policy\.attempt_reward\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const levelIdPattern = /^level\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const waveIdPattern = /^wave\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

export interface AttemptWaveMilestoneReward {
  readonly schemaVersion: 1;
  readonly waveId: StableId;
  readonly forgeOre: number;
}

export interface AttemptProgressRewardPolicy {
  readonly schemaVersion: 1;
  readonly policyId: StableId;
  readonly levelId: StableId;
  readonly waveIds: readonly StableId[];
  readonly forgeOrePerDefeatedEnemy: number;
  readonly waveMilestoneRewards: readonly AttemptWaveMilestoneReward[];
}

export interface CompletedAttemptRewardEvent {
  readonly schemaVersion: 1;
  readonly rewardId: StableId;
  readonly attemptId: StableId;
  readonly levelId: StableId;
  readonly terminalResult: "victory" | "defeat";
  readonly defeatedEnemies: number;
  readonly startedWaveIds: readonly StableId[];
}

export interface AttemptProgressRewardClaim
  extends CompletedAttemptRewardEvent {
  readonly policy: AttemptProgressRewardPolicy;
  readonly forgeOreAwarded: number;
}

export interface AttemptProgressRewardLedger {
  readonly schemaVersion: 1;
  readonly claims: readonly AttemptProgressRewardClaim[];
}

export interface AttemptProgressRewardDecision {
  readonly schemaVersion: 1;
  readonly rewardId: StableId;
  readonly attemptId: StableId;
  readonly forgeOre: number;
  readonly status: "claimed" | "already_claimed";
  readonly reason:
    | "attempt_progress_reward_committed"
    | "attempt_progress_reward_previously_claimed";
}

export interface AttemptProgressRewardRequest {
  readonly schemaVersion: 1;
  readonly profile: ProfileState;
  readonly ledger: AttemptProgressRewardLedger;
  readonly policy: AttemptProgressRewardPolicy;
  readonly events: readonly CompletedAttemptRewardEvent[];
}

export interface AttemptProgressRewardResolution {
  readonly schemaVersion: 1;
  readonly profile: ProfileState;
  readonly ledger: AttemptProgressRewardLedger;
  readonly decisions: readonly AttemptProgressRewardDecision[];
}

function normalizeWaveReward(
  value: unknown,
  description: string
): AttemptWaveMilestoneReward {
  const source = requireProfileRecord(
    value,
    ["schemaVersion", "waveId", "forgeOre"],
    description
  );
  if (source.schemaVersion !== 1)
    throw new RangeError(`${description} has unsupported schemaVersion`);
  return Object.freeze({
    schemaVersion: 1,
    waveId: requireProfileId(
      source.waveId,
      waveIdPattern,
      `${description} waveId`
    ),
    forgeOre: requireProfileUnsigned(source.forgeOre, `${description} forgeOre`)
  });
}

function normalizePolicy(value: unknown): AttemptProgressRewardPolicy {
  const source = requireProfileRecord(
    value,
    [
      "schemaVersion",
      "policyId",
      "levelId",
      "waveIds",
      "forgeOrePerDefeatedEnemy",
      "waveMilestoneRewards"
    ],
    "attempt reward policy"
  );
  if (source.schemaVersion !== 1)
    throw new RangeError("attempt reward policy has unsupported schemaVersion");
  const waveIds = requireProfileArray(
    source.waveIds,
    "attempt reward policy waveIds"
  ).map((entry, index) =>
    requireProfileId(
      entry,
      waveIdPattern,
      `attempt reward policy waveIds[${index}]`
    )
  );
  if (waveIds.length === 0)
    throw new RangeError("attempt reward policy waveIds must not be empty");
  if (new Set(waveIds).size !== waveIds.length)
    throw new RangeError("attempt reward policy contains duplicate wave IDs");
  const waveMilestoneRewards = requireProfileArray(
    source.waveMilestoneRewards,
    "attempt reward policy waveMilestoneRewards"
  ).map((entry, index) =>
    normalizeWaveReward(
      entry,
      `attempt reward policy waveMilestoneRewards[${index}]`
    )
  );
  if (
    waveMilestoneRewards.length !== waveIds.length ||
    waveMilestoneRewards.some(
      (reward, index) => reward.waveId !== waveIds[index]
    )
  )
    throw new RangeError(
      "attempt reward policy wave milestone rewards must match authored wave order"
    );
  return Object.freeze({
    schemaVersion: 1,
    policyId: requireProfileId(
      source.policyId,
      policyIdPattern,
      "attempt reward policy policyId"
    ),
    levelId: requireProfileId(
      source.levelId,
      levelIdPattern,
      "attempt reward policy levelId"
    ),
    waveIds: Object.freeze(waveIds),
    forgeOrePerDefeatedEnemy: requireProfileUnsigned(
      source.forgeOrePerDefeatedEnemy,
      "attempt reward policy forgeOrePerDefeatedEnemy"
    ),
    waveMilestoneRewards: Object.freeze(waveMilestoneRewards)
  });
}

function normalizeEvent(
  value: unknown,
  description: string
): CompletedAttemptRewardEvent {
  const source = requireProfileRecord(
    value,
    [
      "schemaVersion",
      "rewardId",
      "attemptId",
      "levelId",
      "terminalResult",
      "defeatedEnemies",
      "startedWaveIds"
    ],
    description
  );
  if (source.schemaVersion !== 1)
    throw new RangeError(`${description} has unsupported schemaVersion`);
  if (source.terminalResult !== "victory" && source.terminalResult !== "defeat")
    throw new RangeError(`${description} terminalResult is invalid`);
  const startedWaveIds = requireProfileArray(
    source.startedWaveIds,
    `${description} startedWaveIds`
  ).map((entry, index) =>
    requireProfileId(
      entry,
      waveIdPattern,
      `${description} startedWaveIds[${index}]`
    )
  );
  return Object.freeze({
    schemaVersion: 1,
    rewardId: requireProfileId(
      source.rewardId,
      attemptRewardIdPattern,
      `${description} rewardId`
    ),
    attemptId: requireProfileId(
      source.attemptId,
      attemptIdPattern,
      `${description} attemptId`
    ),
    levelId: requireProfileId(
      source.levelId,
      levelIdPattern,
      `${description} levelId`
    ),
    terminalResult: source.terminalResult,
    defeatedEnemies: requireProfileUnsigned(
      source.defeatedEnemies,
      `${description} defeatedEnemies`
    ),
    startedWaveIds: Object.freeze(startedWaveIds)
  });
}

function normalizeClaim(
  value: unknown,
  index: number
): AttemptProgressRewardClaim {
  const description = `attempt reward ledger claim ${index}`;
  const source = requireProfileRecord(
    value,
    [
      "schemaVersion",
      "rewardId",
      "attemptId",
      "levelId",
      "terminalResult",
      "defeatedEnemies",
      "startedWaveIds",
      "policy",
      "forgeOreAwarded"
    ],
    description
  );
  const event = normalizeEvent(
    {
      schemaVersion: source.schemaVersion,
      rewardId: source.rewardId,
      attemptId: source.attemptId,
      levelId: source.levelId,
      terminalResult: source.terminalResult,
      defeatedEnemies: source.defeatedEnemies,
      startedWaveIds: source.startedWaveIds
    },
    description
  );
  const expectedClaim = createClaim(event, normalizePolicy(source.policy));
  const forgeOreAwarded = requireProfileUnsigned(
    source.forgeOreAwarded,
    `${description} forgeOreAwarded`
  );
  if (forgeOreAwarded !== expectedClaim.forgeOreAwarded)
    throw new RangeError(
      `${description} Forge Ore does not match reward evidence`
    );
  return Object.freeze({
    ...expectedClaim,
    forgeOreAwarded
  });
}

function normalizeLedger(value: unknown): AttemptProgressRewardLedger {
  const source = requireProfileRecord(
    value,
    ["schemaVersion", "claims"],
    "attempt reward ledger"
  );
  if (source.schemaVersion !== 1)
    throw new RangeError("attempt reward ledger has unsupported schemaVersion");
  const claims = requireProfileArray(
    source.claims,
    "attempt reward ledger claims"
  )
    .map(normalizeClaim)
    .sort((left, right) => compareText(left.rewardId, right.rewardId));
  const rewardIds = claims.map((claim) => claim.rewardId);
  const attemptIds = claims.map((claim) => claim.attemptId);
  if (new Set(rewardIds).size !== rewardIds.length)
    throw new RangeError("attempt reward ledger contains duplicate reward IDs");
  if (new Set(attemptIds).size !== attemptIds.length)
    throw new RangeError(
      "attempt reward ledger contains duplicate attempt IDs"
    );
  return Object.freeze({ schemaVersion: 1, claims: Object.freeze(claims) });
}

function createClaim(
  event: CompletedAttemptRewardEvent,
  policy: AttemptProgressRewardPolicy
): AttemptProgressRewardClaim {
  if (event.levelId !== policy.levelId)
    throw new RangeError(
      `attempt reward event does not match reward policy level (${event.levelId})`
    );
  if (
    event.startedWaveIds.length > policy.waveIds.length ||
    event.startedWaveIds.some(
      (waveId, index) => policy.waveIds[index] !== waveId
    )
  )
    throw new RangeError(
      "attempt reward event startedWaveIds must be an authored wave prefix"
    );
  if (
    event.terminalResult === "victory" &&
    event.startedWaveIds.length !== policy.waveIds.length
  )
    throw new RangeError(
      "victorious attempt reward must include every authored wave"
    );
  let forgeOreAwarded = event.defeatedEnemies * policy.forgeOrePerDefeatedEnemy;
  if (!Number.isSafeInteger(forgeOreAwarded))
    throw new RangeError(
      "attempt progress Forge Ore reward exceeds safe integer range"
    );
  const startedWaveRewards = policy.waveMilestoneRewards.slice(
    0,
    event.startedWaveIds.length
  );
  for (const reward of startedWaveRewards) {
    forgeOreAwarded += reward.forgeOre;
    if (!Number.isSafeInteger(forgeOreAwarded))
      throw new RangeError(
        "attempt progress Forge Ore reward exceeds safe integer range"
      );
  }
  return Object.freeze({
    ...event,
    policy,
    forgeOreAwarded
  });
}

export function createInitialAttemptRewardLedger(): AttemptProgressRewardLedger {
  return Object.freeze({ schemaVersion: 1, claims: Object.freeze([]) });
}

/** Commits deterministic completed-attempt Forge Ore ownership atomically. */
export function resolveAttemptProgressRewards(
  request: AttemptProgressRewardRequest
): AttemptProgressRewardResolution {
  const source = requireProfileRecord(
    request,
    ["schemaVersion", "profile", "ledger", "policy", "events"],
    "attempt progress reward request"
  );
  if (source.schemaVersion !== 1)
    throw new RangeError(
      "attempt progress reward request has unsupported schemaVersion"
    );
  const profile = normalizeProfileState(source.profile);
  const ledger = normalizeLedger(source.ledger);
  const policy = normalizePolicy(source.policy);

  const claimsByReward = new Map(
    ledger.claims.map((claim) => [claim.rewardId, claim])
  );
  const profileAttemptRewardIds = profile.claimedRewardIds.filter((id) =>
    attemptRewardIdPattern.test(id)
  );
  for (const rewardId of profileAttemptRewardIds) {
    if (!claimsByReward.has(rewardId))
      throw new RangeError(
        `profile attempt reward has no ledger evidence (${rewardId})`
      );
  }
  const profileClaims = new Set(profile.claimedRewardIds);
  for (const claim of ledger.claims) {
    if (!profileClaims.has(claim.rewardId))
      throw new RangeError(
        `attempt reward ledger claim is not owned by the profile (${claim.rewardId})`
      );
  }

  const eventRewardIds = new Set<StableId>();
  const eventAttemptIds = new Set<StableId>();
  const events = requireProfileArray(
    source.events,
    "attempt progress reward events"
  )
    .map((entry, index) =>
      normalizeEvent(entry, `attempt progress reward event ${index}`)
    )
    .sort((left, right) => compareText(left.rewardId, right.rewardId));
  if (events.length > maximumProfileRecords)
    throw new RangeError(
      `attempt progress reward events cannot exceed ${maximumProfileRecords} items`
    );
  for (const event of events) {
    if (eventRewardIds.has(event.rewardId))
      throw new RangeError(`duplicate attempt reward ID (${event.rewardId})`);
    if (eventAttemptIds.has(event.attemptId))
      throw new RangeError(`duplicate attempt ID (${event.attemptId})`);
    eventRewardIds.add(event.rewardId);
    eventAttemptIds.add(event.attemptId);
  }

  const claims = [...ledger.claims];
  const claimedRewardIds = new Set(profile.claimedRewardIds);
  const decisions: AttemptProgressRewardDecision[] = [];
  let forgeOre = profile.forgeOre;
  let changed = false;
  for (const event of events) {
    const expectedClaim = createClaim(event, policy);
    const existing = claimsByReward.get(event.rewardId);
    if (existing !== undefined) {
      if (canonicalStringify(existing) !== canonicalStringify(expectedClaim))
        throw new RangeError(
          `attempt reward event conflicts with claimed attempt evidence (${event.rewardId})`
        );
      decisions.push(
        Object.freeze({
          schemaVersion: 1,
          rewardId: event.rewardId,
          attemptId: event.attemptId,
          forgeOre: 0,
          status: "already_claimed" as const,
          reason: "attempt_progress_reward_previously_claimed" as const
        })
      );
      continue;
    }
    if (claimedRewardIds.has(event.rewardId))
      throw new RangeError(
        `attempt reward event has claimed ownership without ledger evidence (${event.rewardId})`
      );
    if (claims.some((claim) => claim.attemptId === event.attemptId))
      throw new RangeError(
        `attempt ID already has reward ownership (${event.attemptId})`
      );
    forgeOre += expectedClaim.forgeOreAwarded;
    if (!Number.isSafeInteger(forgeOre))
      throw new RangeError(
        "attempt progress Forge Ore reward exceeds safe integer range"
      );
    claims.push(expectedClaim);
    claimsByReward.set(event.rewardId, expectedClaim);
    claimedRewardIds.add(event.rewardId);
    changed = true;
    decisions.push(
      Object.freeze({
        schemaVersion: 1,
        rewardId: event.rewardId,
        attemptId: event.attemptId,
        forgeOre: expectedClaim.forgeOreAwarded,
        status: "claimed" as const,
        reason: "attempt_progress_reward_committed" as const
      })
    );
  }

  if (changed && profile.revision === Number.MAX_SAFE_INTEGER)
    throw new RangeError("profile revision exceeds safe integer range");
  const nextProfile = changed
    ? normalizeProfileState({
        ...profile,
        revision: profile.revision + 1,
        forgeOre,
        claimedRewardIds: [...claimedRewardIds]
      })
    : profile;
  const nextLedger = changed
    ? Object.freeze({
        schemaVersion: 1 as const,
        claims: Object.freeze(
          claims.sort((left, right) =>
            compareText(left.rewardId, right.rewardId)
          )
        )
      })
    : ledger;
  return Object.freeze({
    schemaVersion: 1,
    profile: nextProfile,
    ledger: nextLedger,
    decisions: Object.freeze(decisions)
  });
}
