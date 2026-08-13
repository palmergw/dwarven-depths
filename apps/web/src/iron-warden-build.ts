import type { StableId } from "@dwarven-depths/contracts";
import {
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
  let maximumHealthAdd = 0;
  let attackDamageAdd = 0;
  let attackRangeAdd = 0;
  let futureCooldownReductionTicks = 0;
  const sourceIds: StableId[] = [];
  const applyEffects = (
    effects: (typeof ironWardenSkillTree.nodes)[number]["effects"]
  ) => {
    for (const effect of effects) {
      if (effect.kind === "maximum_health_add")
        maximumHealthAdd = add(
          maximumHealthAdd,
          effect.value,
          "maximum health"
        );
      else if (effect.kind === "attack_damage_add")
        attackDamageAdd = add(attackDamageAdd, effect.value, "attack damage");
      else if (effect.kind === "attack_range_add")
        attackRangeAdd = add(attackRangeAdd, effect.value, "attack range");
      else
        futureCooldownReductionTicks = add(
          futureCooldownReductionTicks,
          effect.value,
          "cooldown reduction"
        );
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
    for (const effects of definition.passiveEffectsByRank.slice(
      0,
      purchase.rank
    ))
      applyEffects(effects);
    sourceIds.push(purchase.upgradeId);
  }
  for (const selection of profile.selectedSkillNodes) {
    if (selection.characterId !== ironWardenSkillTree.characterId) continue;
    const node = ironWardenSkillTree.nodes.find(
      (candidate) => candidate.nodeId === selection.nodeId
    );
    if (node === undefined) continue;
    applyEffects(node.effects);
    sourceIds.push(selection.nodeId);
  }
  return Object.freeze({
    maximumHealthAdd,
    attackDamageAdd,
    attackRangeAdd,
    futureCooldownReductionTicks,
    sourceIds: Object.freeze(sourceIds.sort())
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
