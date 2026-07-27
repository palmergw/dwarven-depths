import type { CharacterSkillTreeDefinition } from "./skill-tree.js";

/** Finite authored Iron Warden skill tree for the vertical slice. */
export const ironWardenSkillTree: CharacterSkillTreeDefinition = Object.freeze({
  schemaVersion: 1,
  characterId: "character.iron_warden" as never,
  nodes: Object.freeze([
    Object.freeze({
      schemaVersion: 1,
      nodeId: "skill.iron_warden.disciplined_slam" as never,
      prerequisiteNodeIds: Object.freeze([
        "skill.iron_warden.stone_guard" as never
      ]),
      effects: Object.freeze([
        Object.freeze({
          schemaVersion: 1,
          kind: "future_cooldown_reduction_ticks",
          value: 2
        })
      ])
    }),
    Object.freeze({
      schemaVersion: 1,
      nodeId: "skill.iron_warden.long_reach" as never,
      prerequisiteNodeIds: Object.freeze([
        "skill.iron_warden.stone_guard" as never
      ]),
      effects: Object.freeze([
        Object.freeze({
          schemaVersion: 1,
          kind: "attack_range_add",
          value: 1
        })
      ])
    }),
    Object.freeze({
      schemaVersion: 1,
      nodeId: "skill.iron_warden.stone_guard" as never,
      prerequisiteNodeIds: Object.freeze([]),
      effects: Object.freeze([
        Object.freeze({
          schemaVersion: 1,
          kind: "maximum_health_add",
          value: 25
        }),
        Object.freeze({
          schemaVersion: 1,
          kind: "attack_damage_add",
          value: 3
        })
      ])
    })
  ])
});
