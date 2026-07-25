import type { CompiledContent } from "@dwarven-depths/content-runtime";
import type { StableId } from "@dwarven-depths/contracts";
import {
  type AttemptProgressRewardDecision,
  type AttemptProgressRewardLedger,
  createInitialAttemptRewardLedger,
  createInitialProfile,
  type ForgeOrePurchaseDecision,
  type ProfileState,
  purchaseUpgradeRank
} from "@dwarven-depths/progression";
// This is an intentionally package-private workspace integration. The raw
// event resolver is not exposed by the progression package's export map.
import { resolveAttemptProgressRewards } from "../../progression/dist/attempt-progress-rewards.js";
import {
  runShuttergateAttempt,
  type ShuttergateAttemptResult,
  type ShuttergateCalibrationBuildId,
  shuttergateReferenceBuildCatalog
} from "./shuttergate-reference-calibration.js";

const campaignId = "campaign.shuttergate.v1" as StableId;
const wardenCharacterId = "character.iron_warden" as StableId;
const shieldSlamUpgradeId = "upgrade.ability.shield_slam" as StableId;
const northGuardPlacementId = "placement.shuttergate_north_guard" as never;
const maximumCampaignAttempts = 100_000;

const rewardPolicy = Object.freeze({
  schemaVersion: 1 as const,
  policyId: "policy.attempt_reward.shuttergate.v1" as StableId,
  levelId: "level.shuttergate_hall" as StableId,
  waveIds: Object.freeze(
    [1, 2, 3, 4, 5].map((wave) => `wave.shuttergate_${wave}` as StableId)
  ),
  forgeOrePerDefeatedEnemy: 1,
  waveMilestoneRewards: Object.freeze(
    [1, 2, 3, 4, 5].map((wave) =>
      Object.freeze({
        schemaVersion: 1 as const,
        waveId: `wave.shuttergate_${wave}` as StableId,
        forgeOre: 1
      })
    )
  )
});

export interface ShuttergateCampaignAttemptEvidence {
  readonly schemaVersion: 1;
  readonly attemptNumber: number;
  readonly attemptId: StableId;
  readonly seed: string;
  readonly placementPointId: StableId;
  readonly targetPolicy: "nearest";
  readonly buildId: ShuttergateCalibrationBuildId;
  readonly encounter: ShuttergateAttemptResult;
  readonly rewardDecision: AttemptProgressRewardDecision;
  readonly purchaseDecision: ForgeOrePurchaseDecision | null;
}

export interface ShuttergateCampaignAuthority {
  readonly schemaVersion: 1;
  readonly campaignId: StableId;
  readonly profile: ProfileState;
  readonly rewardLedger: AttemptProgressRewardLedger;
  readonly attempts: readonly ShuttergateCampaignAttemptEvidence[];
}

export interface ShuttergateCampaignTransitionResult {
  readonly schemaVersion: 1;
  readonly authority: ShuttergateCampaignAuthority;
  readonly transition: ShuttergateCampaignAttemptEvidence;
}

interface CampaignAuthorityMetadata {
  status: "available" | "in_progress" | "consumed";
}

const campaignAuthorityMetadata = new WeakMap<
  ShuttergateCampaignAuthority,
  CampaignAuthorityMetadata
>();

function acceptAuthority(
  profile: ProfileState,
  rewardLedger: AttemptProgressRewardLedger,
  attempts: readonly ShuttergateCampaignAttemptEvidence[]
): ShuttergateCampaignAuthority {
  const authority = Object.freeze({
    schemaVersion: 1 as const,
    campaignId,
    profile,
    rewardLedger,
    attempts: Object.freeze([...attempts])
  });
  campaignAuthorityMetadata.set(authority, { status: "available" });
  return authority;
}

/** Creates the only accepted starting authority for the bounded campaign slice. */
export function createShuttergateCampaignAuthority(): ShuttergateCampaignAuthority {
  return acceptAuthority(
    createInitialProfile(wardenCharacterId),
    createInitialAttemptRewardLedger(),
    []
  );
}

function campaignBuild(profile: ProfileState): ShuttergateCalibrationBuildId {
  return profile.purchasedUpgrades.some(
    (upgrade) => upgrade.upgradeId === shieldSlamUpgradeId && upgrade.rank >= 1
  )
    ? "build.warden.shield_slam_rank_1.v1"
    : "build.profile.new_campaign.v1";
}

function campaignAttemptId(attemptNumber: number): StableId {
  return `attempt.shuttergate.campaign_${String(attemptNumber).padStart(6, "0")}` as StableId;
}

/**
 * Consumes one accepted authority and produces exactly one authoritative attempt.
 * Identity, controller choices, reward policy, and purchase policy are not caller
 * inputs. Failed transitions release the original authority for a safe retry.
 */
export async function runShuttergateCampaignTransition(
  content: CompiledContent,
  authority: ShuttergateCampaignAuthority
): Promise<ShuttergateCampaignTransitionResult> {
  const metadata = campaignAuthorityMetadata.get(authority);
  if (metadata === undefined)
    throw new RangeError("not accepted campaign authority");
  if (metadata.status !== "available")
    throw new RangeError(
      "campaign authority is already consumed or in progress"
    );
  if (authority.attempts.length >= maximumCampaignAttempts)
    throw new RangeError(
      `Shuttergate campaign cannot exceed ${maximumCampaignAttempts} attempts`
    );
  metadata.status = "in_progress";

  try {
    const attemptNumber = authority.attempts.length + 1;
    const attemptId = campaignAttemptId(attemptNumber);
    const seed = String(attemptNumber);
    const buildId = campaignBuild(authority.profile);
    const encounter = await runShuttergateAttempt(content, {
      schemaVersion: 1,
      attemptId,
      seed,
      placementPointId: northGuardPlacementId,
      targetPolicy: "nearest",
      buildId
    });
    const rewards = resolveAttemptProgressRewards({
      schemaVersion: 1,
      profile: authority.profile,
      ledger: authority.rewardLedger,
      policy: rewardPolicy,
      events: [encounter.rewardEvent]
    });
    const rewardDecision = rewards.decisions[0];
    if (rewardDecision === undefined || rewards.decisions.length !== 1)
      throw new Error(
        "campaign transition did not produce one reward decision"
      );

    let profile = rewards.profile;
    let purchaseDecision: ForgeOrePurchaseDecision | null = null;
    if (buildId === "build.profile.new_campaign.v1" && profile.forgeOre >= 10) {
      const purchase = purchaseUpgradeRank({
        schemaVersion: 1,
        profile,
        catalog: shuttergateReferenceBuildCatalog,
        upgradeId: shieldSlamUpgradeId
      });
      profile = purchase.profile;
      purchaseDecision = purchase.decision;
    }
    const transition = Object.freeze({
      schemaVersion: 1 as const,
      attemptNumber,
      attemptId,
      seed,
      placementPointId: encounter.calibration.placementPointId,
      targetPolicy: "nearest" as const,
      buildId,
      encounter,
      rewardDecision,
      purchaseDecision
    });
    const nextAuthority = acceptAuthority(profile, rewards.ledger, [
      ...authority.attempts,
      transition
    ]);
    metadata.status = "consumed";
    return Object.freeze({
      schemaVersion: 1,
      authority: nextAuthority,
      transition
    });
  } catch (error) {
    metadata.status = "available";
    throw error;
  }
}
