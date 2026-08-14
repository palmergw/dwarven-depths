import type {
  CharacterSkillEffect,
  CharacterSkillTreeDefinition
} from "./skill-tree.js";

const effect = (kind: CharacterSkillEffect["kind"], value: number) =>
  Object.freeze({ schemaVersion: 1 as const, kind, value });

const node = (
  nodeId: string,
  prerequisites: readonly string[],
  effects: readonly CharacterSkillEffect[],
  exclusions: readonly string[] = []
) =>
  Object.freeze({
    schemaVersion: 1 as const,
    nodeId: nodeId as never,
    prerequisiteNodeIds: Object.freeze(prerequisites as never[]),
    exclusiveNodeIds: Object.freeze(exclusions as never[]),
    effects: Object.freeze(effects)
  });

const capstones = [
  "skill.iron_warden.bastion_oath",
  "skill.iron_warden.executioners_mark",
  "skill.iron_warden.unyielding_command"
] as const;

/** Three legible Iron Warden paths: control, offense, and guard/tempo. */
export const ironWardenSkillTree: CharacterSkillTreeDefinition = Object.freeze({
  schemaVersion: 1,
  characterId: "character.iron_warden" as never,
  nodes: Object.freeze([
    node(
      "skill.iron_warden.stone_guard",
      [],
      [effect("maximum_health_add", 25), effect("attack_damage_add", 3)]
    ),
    node(
      "skill.iron_warden.disciplined_slam",
      ["skill.iron_warden.stone_guard"],
      [effect("future_cooldown_reduction_ticks", 2)]
    ),
    node(
      "skill.iron_warden.concussive_force",
      ["skill.iron_warden.disciplined_slam"],
      [effect("attack_range_add", 1)]
    ),
    node(
      "skill.iron_warden.rolling_quake",
      ["skill.iron_warden.concussive_force"],
      [effect("future_cooldown_reduction_ticks", 3)]
    ),
    node(
      "skill.iron_warden.unyielding_command",
      ["skill.iron_warden.rolling_quake"],
      [effect("attack_range_add", 2), effect("maximum_health_add", 40)],
      capstones.filter((id) => id !== "skill.iron_warden.unyielding_command")
    ),
    node(
      "skill.iron_warden.long_reach",
      ["skill.iron_warden.stone_guard"],
      [effect("attack_range_add", 1)]
    ),
    node(
      "skill.iron_warden.sundering_edge",
      ["skill.iron_warden.long_reach"],
      [effect("attack_damage_add", 5)]
    ),
    node(
      "skill.iron_warden.linebreaker",
      ["skill.iron_warden.sundering_edge"],
      [effect("attack_damage_add", 8)]
    ),
    node(
      "skill.iron_warden.executioners_mark",
      ["skill.iron_warden.linebreaker"],
      [effect("attack_damage_add", 12), effect("attack_range_add", 1)],
      capstones.filter((id) => id !== "skill.iron_warden.executioners_mark")
    ),
    node(
      "skill.iron_warden.battle_rhythm",
      ["skill.iron_warden.stone_guard"],
      [
        effect("future_cooldown_reduction_ticks", 1),
        effect("maximum_health_add", 15)
      ]
    ),
    node(
      "skill.iron_warden.rallying_guard",
      ["skill.iron_warden.battle_rhythm"],
      [effect("maximum_health_add", 35)]
    ),
    node(
      "skill.iron_warden.war_cry",
      ["skill.iron_warden.rallying_guard"],
      [effect("future_cooldown_reduction_ticks", 4)]
    ),
    node(
      "skill.iron_warden.bastion_oath",
      ["skill.iron_warden.war_cry"],
      [
        effect("maximum_health_add", 75),
        effect("future_cooldown_reduction_ticks", 2)
      ],
      capstones.filter((id) => id !== "skill.iron_warden.bastion_oath")
    )
  ])
});
