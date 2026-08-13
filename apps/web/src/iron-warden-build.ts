import type { StableId } from "@dwarven-depths/contracts";
import {
  deriveCharacterSkillModifiers,
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
  let purchasedMaximumHealthAdd = 0;
  let purchasedAttackDamageAdd = 0;
  let purchasedAttackRangeAdd = 0;
  let purchasedCooldownReductionTicks = 0;
  const purchasedSourceIds: StableId[] = [];
  for (const purchase of authoredProfile.purchasedUpgrades) {
    const definition = purchasedUpgradeCatalog.upgrades.find(
      (upgrade) => upgrade.upgradeId === purchase.upgradeId
    );
    if (
      definition === undefined ||
      definition.ownerId !== ironWardenSkillTree.characterId
    )
      continue;
    if (purchase.rank > definition.passiveEffectsByRank.length)
      throw new RangeError(
        `purchased upgrade rank exceeds authored maximum (${purchase.upgradeId})`
      );
    for (let rankIndex = 0; rankIndex < purchase.rank; rankIndex += 1) {
      const effects = definition.passiveEffectsByRank[rankIndex];
      if (effects === undefined)
        throw new RangeError(
          `purchased upgrade rank has no authored passive effects (${purchase.upgradeId})`
        );
      for (const effect of effects) {
        if (effect.kind === "maximum_health_add")
          purchasedMaximumHealthAdd = add(
            purchasedMaximumHealthAdd,
            effect.value,
            "purchased maximum health"
          );
        else if (effect.kind === "attack_damage_add")
          purchasedAttackDamageAdd = add(
            purchasedAttackDamageAdd,
            effect.value,
            "purchased attack damage"
          );
        else if (effect.kind === "attack_range_add")
          purchasedAttackRangeAdd = add(
            purchasedAttackRangeAdd,
            effect.value,
            "purchased attack range"
          );
        else
          purchasedCooldownReductionTicks = add(
            purchasedCooldownReductionTicks,
            effect.value,
            "purchased cooldown reduction"
          );
      }
    }
    purchasedSourceIds.push(purchase.upgradeId);
  }
  const skills = deriveCharacterSkillModifiers({
    schemaVersion: 1,
    profile: authoredProfile,
    tree: ironWardenSkillTree
  });
  return Object.freeze({
    maximumHealthAdd: add(
      purchasedMaximumHealthAdd,
      skills.maximumHealthAdd,
      "maximum health"
    ),
    attackDamageAdd: add(
      purchasedAttackDamageAdd,
      skills.attackDamageAdd,
      "attack damage"
    ),
    attackRangeAdd: add(
      purchasedAttackRangeAdd,
      skills.attackRangeAdd,
      "attack range"
    ),
    futureCooldownReductionTicks: add(
      purchasedCooldownReductionTicks,
      skills.futureCooldownReductionTicks,
      "cooldown reduction"
    ),
    sourceIds: Object.freeze(
      [...purchasedSourceIds, ...skills.sourceNodeIds].sort()
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
