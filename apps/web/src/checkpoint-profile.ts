import { canonicalStringify, type StableId } from "@dwarven-depths/contracts";
import {
  createInitialProfile,
  ironWardenSkillTree,
  normalizeProfileState,
  type ProfileState,
  purchasedUpgradeCatalog,
  purchaseUpgradeRank,
  recycleProgression,
  resolveBossDeathRewards,
  selectCharacterSkillNode
} from "@dwarven-depths/progression";
import {
  createProfileSaveEnvelope,
  type ProfileSaveEnvelope
} from "@dwarven-depths/save";
import {
  type IndexedDbProfileLoadResult,
  IndexedDbProfileStore,
  IndexedDbProfileStoreError,
  type IndexedDbProfileWriteRequest
} from "@dwarven-depths/save/indexed-db";

const databaseName = "dwarven-depths-profile-v1";
const profileId = "profile.local";
const initialCharacterId = "character.iron_warden" as StableId;

export interface CheckpointProfileStore {
  load(profileId: string): Promise<IndexedDbProfileLoadResult>;
  write(request: IndexedDbProfileWriteRequest): Promise<ProfileSaveEnvelope>;
  close(): Promise<void>;
}

export type CheckpointProfileResult =
  | { readonly status: "ready"; readonly profile: ProfileState }
  | { readonly status: "unavailable"; readonly message: string };

export interface CheckpointAttemptResult {
  readonly schemaVersion: 1;
  readonly attemptId: string;
  readonly rewardId: string;
  readonly forgeOreAwarded: number;
  readonly profile: ProfileState;
}

function applyAuthoritativeTerminalRewards(
  startingProfile: ProfileState,
  campaignClaimsBossReward: boolean,
  campaignClaimsVictory: boolean
): ProfileState {
  const bossRewardId = "reward.boss.gatebreaker_captain" as StableId;
  const victoryRewardId = "reward.campaign.shuttergate.victory" as StableId;
  let profile = startingProfile;
  if (
    campaignClaimsBossReward &&
    !profile.claimedRewardIds.includes(bossRewardId)
  )
    profile = resolveBossDeathRewards({
      schemaVersion: 1,
      profile,
      bossDeaths: [
        {
          schemaVersion: 1,
          eventId: "death.shuttergate.web.gatebreaker_captain" as StableId,
          bossEntityId: "entity.enemy.shuttergate_010" as never
        }
      ],
      rewards: [
        {
          schemaVersion: 1,
          rewardId: bossRewardId,
          bossEntityId: "entity.enemy.shuttergate_010" as never,
          characterUnlockId: "character.deep_ranger" as StableId,
          forgeOre: 20
        }
      ]
    }).profile;
  if (
    campaignClaimsVictory &&
    !profile.claimedRewardIds.includes(victoryRewardId)
  )
    profile = normalizeProfileState({
      ...profile,
      revision: profile.revision + 1,
      claimedRewardIds: [...profile.claimedRewardIds, victoryRewardId]
    });
  return profile;
}

function applyAuthoritativeAttemptProfileDelta(
  startingProfile: ProfileState,
  campaign: Pick<
    CheckpointAttemptResult,
    "forgeOreAwarded" | "rewardId" | "profile"
  >,
  campaignClaimsBossReward = false,
  campaignClaimsVictory = false
): ProfileState {
  const attemptForgeOre =
    campaign.forgeOreAwarded - (campaignClaimsBossReward ? 20 : 0);
  if (!Number.isSafeInteger(attemptForgeOre) || attemptForgeOre < 0)
    throw new RangeError(
      "authoritative attempt result has invalid reward totals"
    );
  const profile = normalizeProfileState({
    ...startingProfile,
    revision: startingProfile.revision + 1,
    forgeOre: startingProfile.forgeOre + attemptForgeOre,
    claimedRewardIds: [
      ...startingProfile.claimedRewardIds,
      campaign.rewardId as StableId
    ]
  });
  return applyAuthoritativeTerminalRewards(
    profile,
    campaignClaimsBossReward,
    campaignClaimsVictory
  );
}

export function createCheckpointProfileStore(): CheckpointProfileStore {
  return new IndexedDbProfileStore(databaseName);
}

async function initialEnvelope(
  now: () => number
): Promise<ProfileSaveEnvelope> {
  return createProfileSaveEnvelope({
    contentVersion: "content.empty-level.v1",
    applicationBuild: "phase-5-web",
    writtenAtEpochMs: now(),
    profileId,
    profile: createInitialProfile(initialCharacterId)
  });
}

export async function loadCheckpointProfile(
  store: CheckpointProfileStore,
  now: () => number = Date.now,
  closeAfterLoad = true
): Promise<CheckpointProfileResult> {
  try {
    const loaded = await store.load(profileId);
    if (loaded.status === "loaded")
      return { status: "ready", profile: loaded.envelope.profile };

    try {
      const envelope = await store.write({
        expectedRevision: null,
        envelope: await initialEnvelope(now)
      });
      return { status: "ready", profile: envelope.profile };
    } catch (error) {
      if (
        error instanceof IndexedDbProfileStoreError &&
        error.code === "save_conflict"
      ) {
        const concurrent = await store.load(profileId);
        if (concurrent.status === "loaded")
          return { status: "ready", profile: concurrent.envelope.profile };
      }
      throw error;
    }
  } catch (error) {
    const corrupt =
      error instanceof IndexedDbProfileStoreError &&
      error.code === "save_corrupt";
    return {
      status: "unavailable",
      message: corrupt
        ? "Progression save is corrupt and was preserved without changes."
        : "Local progression storage is unavailable. You can still enter Shuttergate."
    };
  } finally {
    if (closeAfterLoad) {
      try {
        await store.close();
      } catch {
        // Loading has already produced the user-visible storage result.
      }
    }
  }
}

export async function purchaseCheckpointUpgrade(
  store: CheckpointProfileStore,
  profile: ProfileState,
  upgradeId: StableId,
  now: () => number = Date.now
): Promise<ProfileState> {
  const resolution = purchaseUpgradeRank({
    schemaVersion: 1,
    profile,
    catalog: purchasedUpgradeCatalog,
    upgradeId
  });
  const envelope = await createProfileSaveEnvelope({
    contentVersion: "content.empty-level.v1",
    applicationBuild: "phase-5-web",
    writtenAtEpochMs: now(),
    profileId,
    profile: resolution.profile
  });
  const written = await store.write({
    expectedRevision: profile.revision,
    envelope
  });
  return written.profile;
}

export async function recycleCheckpointUpgrades(
  store: CheckpointProfileStore,
  profile: ProfileState,
  now: () => number = Date.now
): Promise<ProfileState> {
  const resolution = recycleProgression({
    schemaVersion: 1,
    profile,
    campaign: {
      schemaVersion: 1,
      campaignId: "campaign.conformance" as StableId,
      levelIds: ["level.empty" as StableId]
    },
    campaignAccess: {
      schemaVersion: 1,
      campaignId: "campaign.conformance" as StableId,
      currentLevelId: "level.empty" as StableId,
      unlockedLevelIds: ["level.empty" as StableId]
    },
    scope: {
      schemaVersion: 1,
      kind: "shared_purchased_upgrades",
      catalog: purchasedUpgradeCatalog
    }
  });
  const envelope = await createProfileSaveEnvelope({
    contentVersion: "content.empty-level.v1",
    applicationBuild: "phase-5-web",
    writtenAtEpochMs: now(),
    profileId,
    profile: resolution.profile
  });
  const written = await store.write({
    expectedRevision: profile.revision,
    envelope
  });
  return written.profile;
}

export async function recycleCheckpointIronWardenSkills(
  store: CheckpointProfileStore,
  profile: ProfileState,
  now: () => number = Date.now
): Promise<ProfileState> {
  const resolution = recycleProgression({
    schemaVersion: 1,
    profile,
    campaign: {
      schemaVersion: 1,
      campaignId: "campaign.conformance" as StableId,
      levelIds: ["level.empty" as StableId]
    },
    campaignAccess: {
      schemaVersion: 1,
      campaignId: "campaign.conformance" as StableId,
      currentLevelId: "level.empty" as StableId,
      unlockedLevelIds: ["level.empty" as StableId]
    },
    scope: {
      schemaVersion: 1,
      kind: "character_skill_tree",
      characterId: initialCharacterId,
      tree: ironWardenSkillTree
    }
  });
  const envelope = await createProfileSaveEnvelope({
    contentVersion: "content.empty-level.v1",
    applicationBuild: "phase-5-web",
    writtenAtEpochMs: now(),
    profileId,
    profile: resolution.profile
  });
  const written = await store.write({
    expectedRevision: profile.revision,
    envelope
  });
  return written.profile;
}

export async function selectCheckpointIronWardenSkill(
  store: CheckpointProfileStore,
  profile: ProfileState,
  nodeId: StableId,
  now: () => number = Date.now
): Promise<ProfileState> {
  const resolution = selectCharacterSkillNode({
    schemaVersion: 1,
    profile,
    tree: ironWardenSkillTree,
    nodeId
  });
  const envelope = await createProfileSaveEnvelope({
    contentVersion: "content.empty-level.v1",
    applicationBuild: "phase-5-web",
    writtenAtEpochMs: now(),
    profileId,
    profile: resolution.profile
  });
  const written = await store.write({
    expectedRevision: profile.revision,
    envelope
  });
  return written.profile;
}

export function validateCheckpointAttemptResult(
  startingProfile: ProfileState,
  campaign: CheckpointAttemptResult
): ProfileState {
  const profile = normalizeProfileState(campaign.profile);
  const bossRewardId = "reward.boss.gatebreaker_captain" as StableId;
  const campaignClaimsBossReward =
    !startingProfile.claimedRewardIds.includes(bossRewardId) &&
    profile.claimedRewardIds.includes(bossRewardId);
  const victoryRewardId = "reward.campaign.shuttergate.victory" as StableId;
  const campaignClaimsVictory =
    !startingProfile.claimedRewardIds.includes(victoryRewardId) &&
    profile.claimedRewardIds.includes(victoryRewardId);
  const expectedProfile = applyAuthoritativeAttemptProfileDelta(
    startingProfile,
    campaign,
    campaignClaimsBossReward,
    campaignClaimsVictory
  );
  if (
    campaign.schemaVersion !== 1 ||
    !/^attempt\.shuttergate\.web_[0-9]{6}$/.test(campaign.attemptId) ||
    campaign.rewardId !== `reward.${campaign.attemptId}` ||
    !Number.isSafeInteger(campaign.forgeOreAwarded) ||
    campaign.forgeOreAwarded < 0 ||
    startingProfile.claimedRewardIds.includes(campaign.rewardId as never) ||
    canonicalStringify(profile) !== canonicalStringify(expectedProfile)
  )
    throw new RangeError(
      "authoritative attempt result contradicts the profile"
    );
  return profile;
}

export async function applyCheckpointAttemptResult(
  store: CheckpointProfileStore,
  startingProfile: ProfileState,
  campaign: CheckpointAttemptResult,
  now: () => number = Date.now
): Promise<ProfileState> {
  const profile = validateCheckpointAttemptResult(startingProfile, campaign);
  const bossRewardId = "reward.boss.gatebreaker_captain" as StableId;
  const campaignClaimsBossReward =
    !startingProfile.claimedRewardIds.includes(bossRewardId) &&
    profile.claimedRewardIds.includes(bossRewardId);
  const victoryRewardId = "reward.campaign.shuttergate.victory" as StableId;
  const campaignClaimsVictory =
    !startingProfile.claimedRewardIds.includes(victoryRewardId) &&
    profile.claimedRewardIds.includes(victoryRewardId);
  let candidate = profile;
  let expectedRevision = startingProfile.revision;
  let lastConflict: unknown;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const envelope = await createProfileSaveEnvelope({
      contentVersion: "content.shuttergate.level_1.v1",
      applicationBuild: "phase-6-web",
      writtenAtEpochMs: now(),
      profileId,
      profile: candidate
    });
    try {
      const written = await store.write({ expectedRevision, envelope });
      return written.profile;
    } catch (error) {
      if (!isCheckpointProfileSaveConflict(error)) throw error;
      lastConflict = error;
      const concurrent = await store.load(profileId);
      if (concurrent.status !== "loaded") throw error;
      const concurrentProfile = normalizeProfileState(
        concurrent.envelope.profile
      );
      if (
        concurrentProfile.claimedRewardIds.includes(campaign.rewardId as never)
      ) {
        const supplementalProfile = applyAuthoritativeTerminalRewards(
          concurrentProfile,
          campaignClaimsBossReward,
          campaignClaimsVictory
        );
        if (supplementalProfile === concurrentProfile) return concurrentProfile;
        candidate = supplementalProfile;
      } else
        candidate = applyAuthoritativeAttemptProfileDelta(
          concurrentProfile,
          campaign,
          campaignClaimsBossReward,
          campaignClaimsVictory
        );
      expectedRevision = concurrentProfile.revision;
    }
  }
  throw lastConflict;
}

export function isCheckpointProfileSaveConflict(error: unknown): boolean {
  return (
    error instanceof IndexedDbProfileStoreError &&
    error.code === "save_conflict"
  );
}
