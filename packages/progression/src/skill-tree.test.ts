import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { resolveBossDeathRewards } from "./boss-rewards.js";
import {
  characterSkillTreeParityEvidence,
  createProfileWithTwoPendingSkillPoints,
  ironWardenSkillTree
} from "./skill-tree.fixture.js";
import {
  deriveCharacterSkillEligibility,
  deriveCharacterSkillModifiers,
  selectCharacterSkillNode
} from "./skill-tree.js";

const checksum =
  "fb9ab3f8b4c914715ae71401f87dcec4a1318577c977b2ceac1568bcfe12724b";

describe("authored character skill trees", () => {
  it("consumes ordered points, persists choices, and derives effects", async () => {
    const evidence = characterSkillTreeParityEvidence();
    expect(evidence.initialEligibility).toEqual({
      schemaVersion: 1,
      characterId: "character.iron_warden",
      pendingSkillPointLevel: 2,
      eligibleNodeIds: ["skill.iron_warden.stone_guard"]
    });
    expect(evidence.first.decision).toEqual({
      schemaVersion: 1,
      characterId: "character.iron_warden",
      nodeId: "skill.iron_warden.stone_guard",
      spentSkillPointLevel: 2,
      status: "selected",
      reason: "eligible_skill_node_selected"
    });
    expect(evidence.first.profile.characterExperienceStates[0]).toMatchObject({
      pendingSkillPointLevels: [3]
    });
    expect(evidence.reopenedEligibility.eligibleNodeIds).toEqual([
      "skill.iron_warden.disciplined_slam",
      "skill.iron_warden.long_reach"
    ]);
    expect(evidence.second.profile.selectedSkillNodes).toEqual([
      {
        schemaVersion: 1,
        characterId: "character.iron_warden",
        nodeId: "skill.iron_warden.stone_guard",
        spentSkillPointLevel: 2
      },
      {
        schemaVersion: 1,
        characterId: "character.iron_warden",
        nodeId: "skill.iron_warden.disciplined_slam",
        spentSkillPointLevel: 3
      }
    ]);
    expect(evidence.second.modifiers).toEqual({
      schemaVersion: 1,
      characterId: "character.iron_warden",
      maximumHealthAdd: 25,
      attackDamageAdd: 3,
      attackRangeAdd: 0,
      futureCooldownReductionTicks: 2,
      sourceNodeIds: [
        "skill.iron_warden.disciplined_slam",
        "skill.iron_warden.stone_guard"
      ]
    });
    expect(await canonicalHash(evidence)).toBe(checksum);
  });

  it("is stable across authored order and leaves input detached and immutable", () => {
    const profile = createProfileWithTwoPendingSkillPoints();
    const request = {
      schemaVersion: 1 as const,
      profile,
      tree: {
        ...ironWardenSkillTree,
        nodes: [...ironWardenSkillTree.nodes].reverse()
      }
    };
    const before = structuredClone(request);
    const eligibility = deriveCharacterSkillEligibility(request);
    expect(eligibility).toEqual(
      deriveCharacterSkillEligibility({
        schemaVersion: 1,
        profile,
        tree: ironWardenSkillTree
      })
    );
    expect(request).toEqual(before);
    expect(Object.isFrozen(eligibility)).toBe(true);
    expect(Object.isFrozen(eligibility.eligibleNodeIds)).toBe(true);
  });

  it("rejects unknown, selected, ineligible, and no-pending choices atomically", () => {
    const profile = createProfileWithTwoPendingSkillPoints();
    const before = structuredClone(profile);
    expect(() =>
      selectCharacterSkillNode({
        schemaVersion: 1,
        profile,
        tree: ironWardenSkillTree,
        nodeId: "skill.iron_warden.unknown" as never
      })
    ).toThrow("is not authored");
    expect(() =>
      selectCharacterSkillNode({
        schemaVersion: 1,
        profile,
        tree: ironWardenSkillTree,
        nodeId: "skill.iron_warden.long_reach" as never
      })
    ).toThrow("is not eligible");
    const first = characterSkillTreeParityEvidence().first;
    expect(() =>
      selectCharacterSkillNode({
        schemaVersion: 1,
        profile: first.profile,
        tree: ironWardenSkillTree,
        nodeId: "skill.iron_warden.stone_guard" as never
      })
    ).toThrow("is already selected");
    const second = characterSkillTreeParityEvidence().second;
    expect(() =>
      selectCharacterSkillNode({
        schemaVersion: 1,
        profile: second.profile,
        tree: ironWardenSkillTree,
        nodeId: "skill.iron_warden.long_reach" as never
      })
    ).toThrow("has no pending skill point");
    expect(profile).toEqual(before);
  });

  it("rejects malformed, foreign, cyclic, and incoherent authored selections", () => {
    const profile = createProfileWithTwoPendingSkillPoints();
    const disciplinedNode = ironWardenSkillTree.nodes.find(
      (node) => node.nodeId === "skill.iron_warden.disciplined_slam"
    );
    const longReachNode = ironWardenSkillTree.nodes.find(
      (node) => node.nodeId === "skill.iron_warden.long_reach"
    );
    const stoneGuardNode = ironWardenSkillTree.nodes.find(
      (node) => node.nodeId === "skill.iron_warden.stone_guard"
    );
    if (
      disciplinedNode === undefined ||
      longReachNode === undefined ||
      stoneGuardNode === undefined
    )
      throw new Error("fixture skill nodes must exist");
    expect(() =>
      deriveCharacterSkillEligibility({
        schemaVersion: 1,
        profile,
        tree: {
          ...ironWardenSkillTree,
          nodes: [disciplinedNode, disciplinedNode]
        }
      })
    ).toThrow("duplicate character skill node ID");
    expect(() =>
      deriveCharacterSkillEligibility({
        schemaVersion: 1,
        profile,
        tree: {
          ...ironWardenSkillTree,
          nodes: [
            {
              ...stoneGuardNode,
              prerequisiteNodeIds: ["skill.iron_warden.long_reach" as never]
            },
            {
              ...longReachNode,
              prerequisiteNodeIds: ["skill.iron_warden.stone_guard" as never]
            }
          ]
        }
      })
    ).toThrow("prerequisites must be acyclic");
    expect(() =>
      deriveCharacterSkillEligibility({
        schemaVersion: 1,
        profile,
        tree: {
          ...ironWardenSkillTree,
          characterId: "character.deep_ranger" as never
        }
      })
    ).toThrow("is not unlocked");
    expect(() =>
      deriveCharacterSkillModifiers({
        schemaVersion: 1,
        profile: {
          ...profile,
          characterExperienceStates: profile.characterExperienceStates.map(
            (state) => ({ ...state, pendingSkillPointLevels: [3] })
          ),
          selectedSkillNodes: [
            {
              schemaVersion: 1,
              characterId: "character.iron_warden" as never,
              nodeId: "skill.iron_warden.long_reach" as never,
              spentSkillPointLevel: 2
            }
          ]
        },
        tree: ironWardenSkillTree
      })
    ).toThrow("unselected prerequisite");
    expect(() =>
      deriveCharacterSkillEligibility({
        schemaVersion: 1,
        profile: {
          ...profile,
          characterExperienceStates: profile.characterExperienceStates.map(
            (state) => ({ ...state, pendingSkillPointLevels: [2] })
          )
        },
        tree: ironWardenSkillTree
      })
    ).toThrow("account for every earned level");
    const selected = characterSkillTreeParityEvidence().second.profile;
    expect(() =>
      deriveCharacterSkillModifiers({
        schemaVersion: 1,
        profile: {
          ...selected,
          selectedSkillNodes: selected.selectedSkillNodes.map((entry) => ({
            ...entry,
            spentSkillPointLevel: entry.spentSkillPointLevel === 2 ? 3 : 2
          }))
        },
        tree: ironWardenSkillTree
      })
    ).toThrow("prerequisite was not selected earlier");
  });

  it("validates a deep authored prerequisite chain without recursion", () => {
    const nodeCount = 12_000;
    const nodes = Array.from({ length: nodeCount }, (_, index) => ({
      schemaVersion: 1 as const,
      nodeId: `skill.deep.node_${index}` as never,
      prerequisiteNodeIds:
        index === 0 ? [] : ([`skill.deep.node_${index - 1}`] as never),
      effects: [
        {
          schemaVersion: 1 as const,
          kind: "attack_damage_add" as const,
          value: 1
        }
      ]
    }));
    expect(
      deriveCharacterSkillEligibility({
        schemaVersion: 1,
        profile: createProfileWithTwoPendingSkillPoints(),
        tree: {
          schemaVersion: 1,
          characterId: "character.iron_warden" as never,
          nodes
        }
      }).eligibleNodeIds
    ).toEqual(["skill.deep.node_0"]);
  });

  it("rejects strict-shape and modifier overflow failures", () => {
    const profile = characterSkillTreeParityEvidence().second.profile;
    expect(() =>
      deriveCharacterSkillEligibility({
        schemaVersion: 1,
        profile,
        tree: { ...ironWardenSkillTree, unexpected: true } as never
      })
    ).toThrow("must contain exactly");
    expect(() =>
      deriveCharacterSkillModifiers({
        schemaVersion: 1,
        profile,
        tree: {
          ...ironWardenSkillTree,
          nodes: ironWardenSkillTree.nodes.map((node) =>
            node.nodeId === "skill.iron_warden.disciplined_slam"
              ? {
                  ...node,
                  effects: [
                    {
                      schemaVersion: 1,
                      kind: "maximum_health_add" as const,
                      value: Number.MAX_SAFE_INTEGER
                    }
                  ]
                }
              : node
          )
        }
      })
    ).toThrow("maximum-health skill modifier exceeds safe integer range");
  });

  it("preserves selected nodes through existing reward transitions", () => {
    const selected = characterSkillTreeParityEvidence().first.profile;
    const boss = resolveBossDeathRewards({
      schemaVersion: 1,
      profile: selected,
      bossDeaths: [
        {
          schemaVersion: 1,
          eventId: "death.gatebreaker_captain" as never,
          bossEntityId: "entity.enemy.boss.gatebreaker_captain" as never
        }
      ],
      rewards: [
        {
          schemaVersion: 1,
          rewardId: "reward.boss.gatebreaker_captain" as never,
          bossEntityId: "entity.enemy.boss.gatebreaker_captain" as never,
          characterUnlockId: "character.deep_ranger" as never,
          forgeOre: 20
        }
      ]
    });
    expect(boss.profile.selectedSkillNodes).toEqual(
      selected.selectedSkillNodes
    );
  });
});
