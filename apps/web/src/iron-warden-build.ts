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
  const totals = {
    maximumHealthAdd: 0,
    attackDamageAdd: 0,
    attackRangeAdd: 0,
    futureCooldownReductionTicks: 0
  };
  const sourceIds: StableId[] = [];
  const applyEffects = (
    effects: (typeof ironWardenSkillTree.nodes)[number]["effects"]
  ) => {
    for (const effect of effects) {
      const field =
        effect.kind === "maximum_health_add"
          ? "maximumHealthAdd"
          : effect.kind === "attack_damage_add"
            ? "attackDamageAdd"
            : effect.kind === "attack_range_add"
              ? "attackRangeAdd"
              : "futureCooldownReductionTicks";
      totals[field] = add(totals[field], effect.value, field);
    }
  };
  for (const purchase of profile.purchasedUpgrades) {
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
    for (const effects of definition.passiveEffectsByRank.slice(
      0,
      purchase.rank
    ))
      applyEffects(effects);
    sourceIds.push(purchase.upgradeId);
  }
  const authoredSkillProfile = {
    ...profile,
    selectedSkillNodes: profile.selectedSkillNodes.filter(
      (selection) =>
        selection.characterId !== ironWardenSkillTree.characterId ||
        ironWardenSkillTree.nodes.some(
          (node) => node.nodeId === selection.nodeId
        )
    )
  };
  const skills = deriveCharacterSkillModifiers({
    schemaVersion: 1,
    profile: authoredSkillProfile,
    tree: ironWardenSkillTree
  });
  return Object.freeze({
    maximumHealthAdd: add(
      totals.maximumHealthAdd,
      skills.maximumHealthAdd,
      "maximumHealthAdd"
    ),
    attackDamageAdd: add(
      totals.attackDamageAdd,
      skills.attackDamageAdd,
      "attackDamageAdd"
    ),
    attackRangeAdd: add(
      totals.attackRangeAdd,
      skills.attackRangeAdd,
      "attackRangeAdd"
    ),
    futureCooldownReductionTicks: add(
      totals.futureCooldownReductionTicks,
      skills.futureCooldownReductionTicks,
      "futureCooldownReductionTicks"
    ),
    sourceIds: Object.freeze([...sourceIds, ...skills.sourceNodeIds].sort())
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
