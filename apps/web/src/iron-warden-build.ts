import type { StableId } from "@dwarven-depths/contracts";
import {
  deriveCharacterSkillModifiers,
  derivePurchasedUpgradeCharacterModifiers,
  ironWardenSkillTree,
  type ProfileState,
  purchasedUpgradeCatalog
} from "@dwarven-depths/progression";

export interface IronWardenBuildSummary {
  readonly maximumHealthAdd: number;
  readonly attackDamageAdd: number;
  readonly attackRangeAdd: number;
  readonly futureCooldownReductionTicks: number;
  readonly sourceIds: readonly StableId[];
}

function add(left: number, right: number, description: string): number {
  const total = left + right;
  if (!Number.isSafeInteger(total))
    throw new RangeError(
      `Iron Warden build ${description} exceeds safe integer range`
    );
  return total;
}

/**
 * Derives player-facing build totals from the same validated catalogs consumed
 * by authoritative battlefield deployment. The profile and catalogs remain
 * unchanged, and source IDs are returned in canonical stable-ID order.
 */
export function deriveIronWardenBuildSummary(
  profile: ProfileState
): IronWardenBuildSummary {
  const authoredProfile = {
    ...profile,
    purchasedUpgrades: profile.purchasedUpgrades.filter((purchase) =>
      purchasedUpgradeCatalog.upgrades.some(
        (upgrade) => upgrade.upgradeId === purchase.upgradeId
      )
    ),
    selectedSkillNodes: profile.selectedSkillNodes.filter(
      (selection) =>
        selection.characterId !== ironWardenSkillTree.characterId ||
        ironWardenSkillTree.nodes.some(
          (node) => node.nodeId === selection.nodeId
        )
    )
  };
  const purchased = derivePurchasedUpgradeCharacterModifiers({
    schemaVersion: 1,
    profile: authoredProfile,
    catalog: purchasedUpgradeCatalog
  }).find(
    (modifier) => modifier.characterId === ironWardenSkillTree.characterId
  );
  const skills = deriveCharacterSkillModifiers({
    schemaVersion: 1,
    profile: authoredProfile,
    tree: ironWardenSkillTree
  });
  return Object.freeze({
    maximumHealthAdd: add(
      purchased?.maximumHealthAdd ?? 0,
      skills.maximumHealthAdd,
      "maximum health"
    ),
    attackDamageAdd: add(
      purchased?.attackDamageAdd ?? 0,
      skills.attackDamageAdd,
      "attack damage"
    ),
    attackRangeAdd: add(
      purchased?.attackRangeAdd ?? 0,
      skills.attackRangeAdd,
      "attack range"
    ),
    futureCooldownReductionTicks: add(
      purchased?.futureCooldownReductionTicks ?? 0,
      skills.futureCooldownReductionTicks,
      "cooldown reduction"
    ),
    sourceIds: Object.freeze(
      [...(purchased?.sourceUpgradeIds ?? []), ...skills.sourceNodeIds].sort()
    )
  });
}

export function ironWardenChoiceIdentity(nodeId: StableId): string {
  switch (nodeId) {
    case "skill.iron_warden.stone_guard":
      return "Durability foundation";
    case "skill.iron_warden.disciplined_slam":
      return "Faster Shield Slam";
    case "skill.iron_warden.long_reach":
      return "Longer melee reach";
    default:
      return "Iron Warden training";
  }
}
