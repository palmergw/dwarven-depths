import type { StableId } from "@dwarven-depths/contracts";
import {
  characterIdPattern,
  normalizeProfileState,
  type ProfileState,
  requireProfileArray,
  requireProfileId,
  requireProfileRecord,
  requireProfileUnsigned
} from "./profile-state.js";
import {
  type PurchasedUpgradeCatalog,
  validatePurchasedUpgradeProfile
} from "./purchased-upgrades.js";
import {
  type CharacterSkillTreeDefinition,
  deriveCharacterSkillModifiers
} from "./skill-tree.js";

export interface CampaignDefinition {
  readonly schemaVersion: 1;
  readonly campaignId: StableId;
  readonly levelIds: readonly StableId[];
}

export interface CampaignAccessState {
  readonly schemaVersion: 1;
  readonly campaignId: StableId;
  readonly currentLevelId: StableId;
  readonly unlockedLevelIds: readonly StableId[];
}

export interface CharacterSkillTreeRecycleScope {
  readonly schemaVersion: 1;
  readonly kind: "character_skill_tree";
  readonly characterId: StableId;
  readonly tree: CharacterSkillTreeDefinition;
}

export interface SharedPurchasedUpgradesRecycleScope {
  readonly schemaVersion: 1;
  readonly kind: "shared_purchased_upgrades";
  readonly catalog: PurchasedUpgradeCatalog;
}

export type ProgressionRecycleScope =
  | CharacterSkillTreeRecycleScope
  | SharedPurchasedUpgradesRecycleScope;

export interface ProgressionRecycleRequest {
  readonly schemaVersion: 1;
  readonly profile: ProfileState;
  readonly campaign: CampaignDefinition;
  readonly campaignAccess: CampaignAccessState;
  readonly scope: ProgressionRecycleScope;
}

export type ProgressionRecycleReason =
  | "character_skill_tree_recycled"
  | "shared_purchased_upgrades_recycled";

export interface ProgressionRecycleDecision {
  readonly schemaVersion: 1;
  readonly scope: ProgressionRecycleScope["kind"];
  readonly characterId: StableId | null;
  readonly refundedSkillPointLevels: readonly number[];
  readonly refundedForgeOre: number;
  readonly previousUnlockedLevelIds: readonly StableId[];
  readonly resetLevelId: StableId;
  readonly status: "recycled";
  readonly reason: ProgressionRecycleReason;
}

export interface ProgressionRecycleResolution {
  readonly schemaVersion: 1;
  readonly profile: ProfileState;
  readonly campaignAccess: CampaignAccessState;
  readonly decision: ProgressionRecycleDecision;
}

const campaignIdPattern = /^campaign\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const levelIdPattern = /^level\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

function normalizeCampaign(value: unknown): CampaignDefinition {
  const source = requireProfileRecord(
    value,
    ["schemaVersion", "campaignId", "levelIds"],
    "campaign definition"
  );
  if (source.schemaVersion !== 1)
    throw new RangeError("campaign definition has unsupported schemaVersion");
  const campaignId = requireProfileId(
    source.campaignId,
    campaignIdPattern,
    "campaign definition campaignId"
  );
  const levelIds = requireProfileArray(
    source.levelIds,
    "campaign definition levelIds"
  ).map((levelId, index) =>
    requireProfileId(
      levelId,
      levelIdPattern,
      `campaign definition levelIds[${index}]`
    )
  );
  if (levelIds.length === 0)
    throw new RangeError("campaign definition must contain at least one level");
  if (new Set(levelIds).size !== levelIds.length)
    throw new RangeError("campaign definition contains duplicate level IDs");
  return Object.freeze({
    schemaVersion: 1,
    campaignId,
    levelIds: Object.freeze(levelIds)
  });
}

function normalizeCampaignAccess(
  value: unknown,
  campaign: CampaignDefinition
): CampaignAccessState {
  const source = requireProfileRecord(
    value,
    ["schemaVersion", "campaignId", "currentLevelId", "unlockedLevelIds"],
    "campaign access"
  );
  if (source.schemaVersion !== 1)
    throw new RangeError("campaign access has unsupported schemaVersion");
  const campaignId = requireProfileId(
    source.campaignId,
    campaignIdPattern,
    "campaign access campaignId"
  );
  if (campaignId !== campaign.campaignId)
    throw new RangeError(
      "campaign access does not belong to campaign definition"
    );
  const currentLevelId = requireProfileId(
    source.currentLevelId,
    levelIdPattern,
    "campaign access currentLevelId"
  );
  const authoredIndexes = new Map(
    campaign.levelIds.map((levelId, index) => [levelId, index])
  );
  const unlockedLevelIds = requireProfileArray(
    source.unlockedLevelIds,
    "campaign access unlockedLevelIds"
  )
    .map((levelId, index) =>
      requireProfileId(
        levelId,
        levelIdPattern,
        `campaign access unlockedLevelIds[${index}]`
      )
    )
    .sort(
      (left, right) =>
        (authoredIndexes.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (authoredIndexes.get(right) ?? Number.MAX_SAFE_INTEGER)
    );
  if (unlockedLevelIds.length === 0)
    throw new RangeError("campaign access must unlock the first level");
  if (new Set(unlockedLevelIds).size !== unlockedLevelIds.length)
    throw new RangeError(
      "campaign access contains duplicate unlocked level IDs"
    );
  if (unlockedLevelIds.some((levelId) => !authoredIndexes.has(levelId)))
    throw new RangeError(
      "campaign access contains a level outside the campaign"
    );
  for (let index = 0; index < unlockedLevelIds.length; index += 1) {
    if (unlockedLevelIds[index] !== campaign.levelIds[index])
      throw new RangeError(
        "campaign access unlocked levels must be an authored prefix"
      );
  }
  if (!unlockedLevelIds.includes(currentLevelId))
    throw new RangeError("campaign access current level must be unlocked");
  return Object.freeze({
    schemaVersion: 1,
    campaignId,
    currentLevelId,
    unlockedLevelIds: Object.freeze(unlockedLevelIds)
  });
}

function scopeKind(value: unknown): ProgressionRecycleScope["kind"] {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError("progression recycle scope must be a plain object");
  const descriptor = Object.getOwnPropertyDescriptor(value, "kind");
  if (
    descriptor === undefined ||
    !descriptor.enumerable ||
    !("value" in descriptor)
  )
    throw new TypeError(
      "progression recycle scope.kind must be an enumerable data property"
    );
  if (
    descriptor.value !== "character_skill_tree" &&
    descriptor.value !== "shared_purchased_upgrades"
  )
    throw new RangeError("progression recycle scope has unknown kind");
  return descriptor.value;
}

function incrementRevision(profile: ProfileState): number {
  if (profile.revision === Number.MAX_SAFE_INTEGER)
    throw new RangeError("profile revision exceeds safe integer range");
  return profile.revision + 1;
}

function resetCampaignAccess(
  campaign: CampaignDefinition
): CampaignAccessState {
  const firstLevelId = campaign.levelIds[0];
  if (firstLevelId === undefined)
    throw new Error("normalized campaign must contain a first level");
  return Object.freeze({
    schemaVersion: 1,
    campaignId: campaign.campaignId,
    currentLevelId: firstLevelId,
    unlockedLevelIds: Object.freeze([firstLevelId])
  });
}

/** Fully recycles exactly one supported progression scope and resets access. */
export function recycleProgression(
  request: ProgressionRecycleRequest
): ProgressionRecycleResolution {
  const source = requireProfileRecord(
    request,
    ["schemaVersion", "profile", "campaign", "campaignAccess", "scope"],
    "progression recycle request"
  );
  if (source.schemaVersion !== 1)
    throw new RangeError(
      "progression recycle request has unsupported schemaVersion"
    );
  const campaign = normalizeCampaign(source.campaign);
  const campaignAccess = normalizeCampaignAccess(
    source.campaignAccess,
    campaign
  );
  const kind = scopeKind(source.scope);
  let profile = normalizeProfileState(source.profile);
  let characterId: StableId | null = null;
  let refundedSkillPointLevels: readonly number[] = Object.freeze([]);
  let refundedForgeOre = 0;
  let reason: ProgressionRecycleReason;

  if (kind === "character_skill_tree") {
    const scope = requireProfileRecord(
      source.scope,
      ["schemaVersion", "kind", "characterId", "tree"],
      "character skill-tree recycle scope"
    );
    if (scope.schemaVersion !== 1)
      throw new RangeError(
        "character skill-tree recycle scope has unsupported schemaVersion"
      );
    characterId = requireProfileId(
      scope.characterId,
      characterIdPattern,
      "character skill-tree recycle scope characterId"
    );
    const tree = scope.tree as CharacterSkillTreeDefinition;
    const modifiers = deriveCharacterSkillModifiers({
      schemaVersion: 1,
      profile,
      tree
    });
    if (modifiers.characterId !== characterId)
      throw new RangeError(
        "character skill-tree recycle scope owner does not match tree"
      );
    const recycled = profile.selectedSkillNodes.filter(
      (selection) => selection.characterId === characterId
    );
    if (recycled.length === 0)
      throw new RangeError(
        "character skill-tree recycle scope has no selections"
      );
    refundedSkillPointLevels = Object.freeze(
      recycled
        .map((selection) => selection.spentSkillPointLevel)
        .sort((left, right) => left - right)
    );
    const characterExperienceStates = profile.characterExperienceStates.map(
      (state) =>
        state.characterId === characterId
          ? Object.freeze({
              ...state,
              pendingSkillPointLevels: Object.freeze(
                [
                  ...state.pendingSkillPointLevels,
                  ...refundedSkillPointLevels
                ].sort((left, right) => left - right)
              )
            })
          : state
    );
    profile = normalizeProfileState({
      ...profile,
      revision: incrementRevision(profile),
      characterExperienceStates,
      selectedSkillNodes: profile.selectedSkillNodes.filter(
        (selection) => selection.characterId !== characterId
      )
    });
    reason = "character_skill_tree_recycled";
  } else {
    const scope = requireProfileRecord(
      source.scope,
      ["schemaVersion", "kind", "catalog"],
      "shared purchased-upgrades recycle scope"
    );
    if (scope.schemaVersion !== 1)
      throw new RangeError(
        "shared purchased-upgrades recycle scope has unsupported schemaVersion"
      );
    profile = validatePurchasedUpgradeProfile({
      schemaVersion: 1,
      profile,
      catalog: scope.catalog as PurchasedUpgradeCatalog
    });
    if (profile.purchasedUpgrades.length === 0)
      throw new RangeError(
        "shared purchased-upgrades recycle scope has no purchases"
      );
    for (const purchase of profile.purchasedUpgrades) {
      refundedForgeOre += purchase.forgeOreSpent;
      if (!Number.isSafeInteger(refundedForgeOre))
        throw new RangeError(
          "recycled Forge Ore refund exceeds safe integer range"
        );
    }
    const forgeOre = profile.forgeOre + refundedForgeOre;
    if (!Number.isSafeInteger(forgeOre))
      throw new RangeError(
        "recycled Forge Ore balance exceeds safe integer range"
      );
    profile = normalizeProfileState({
      ...profile,
      revision: incrementRevision(profile),
      forgeOre,
      purchasedUpgrades: []
    });
    reason = "shared_purchased_upgrades_recycled";
  }

  const resolvedCampaignAccess = resetCampaignAccess(campaign);
  return Object.freeze({
    schemaVersion: 1,
    profile,
    campaignAccess: resolvedCampaignAccess,
    decision: Object.freeze({
      schemaVersion: 1,
      scope: kind,
      characterId,
      refundedSkillPointLevels,
      refundedForgeOre: requireProfileUnsigned(
        refundedForgeOre,
        "progression recycle refundedForgeOre"
      ),
      previousUnlockedLevelIds: Object.freeze([
        ...campaignAccess.unlockedLevelIds
      ]),
      resetLevelId: resolvedCampaignAccess.currentLevelId,
      status: "recycled",
      reason
    })
  });
}
