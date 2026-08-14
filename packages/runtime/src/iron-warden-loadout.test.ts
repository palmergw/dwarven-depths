import {
  compileContent,
  compileScenario
} from "@dwarven-depths/content-runtime";
import type { StableId } from "@dwarven-depths/contracts";
import {
  createInitialProfile,
  ironWardenSkillTree,
  type ProfileState,
  selectCharacterSkillNode
} from "@dwarven-depths/progression";
import { describe, expect, it } from "vitest";
import contentFixture from "../../../content/fixtures/phase-3-shuttergate.json" with {
  type: "json"
};
import scenarioFixture from "../../../scenarios/conformance/shuttergate-web-truth.json" with {
  type: "json"
};
import {
  createShuttergateWebLiveScenarioHost,
  createShuttergateWebRunContent,
  createShuttergateWebScenario
} from "./index.js";

const characterId = "character.iron_warden" as StableId;
const entityId = "entity.dwarf.warden" as never;

function profileWithPath(nodeIds: readonly StableId[]): ProfileState {
  let profile = createInitialProfile(characterId);
  profile = {
    ...profile,
    characterExperienceStates: [
      {
        schemaVersion: 1,
        characterId,
        experience: 400,
        level: nodeIds.length + 1,
        pendingSkillPointLevels: nodeIds.map((_, index) => index + 2)
      }
    ]
  };
  for (const nodeId of nodeIds)
    profile = selectCharacterSkillNode({
      schemaVersion: 1,
      profile,
      tree: ironWardenSkillTree,
      nodeId
    }).profile;
  return profile;
}

const controlProfile = () =>
  profileWithPath([
    "skill.iron_warden.stone_guard",
    "skill.iron_warden.disciplined_slam",
    "skill.iron_warden.concussive_force",
    "skill.iron_warden.rolling_quake"
  ] as StableId[]);
const offenseProfile = () =>
  profileWithPath([
    "skill.iron_warden.stone_guard",
    "skill.iron_warden.long_reach",
    "skill.iron_warden.sundering_edge",
    "skill.iron_warden.linebreaker"
  ] as StableId[]);
const guardProfile = () =>
  profileWithPath([
    "skill.iron_warden.stone_guard",
    "skill.iron_warden.battle_rhythm",
    "skill.iron_warden.rallying_guard",
    "skill.iron_warden.war_cry"
  ] as StableId[]);

function configuration(profile: ProfileState) {
  return {
    schemaVersion: 1 as const,
    attemptId: "attempt.shuttergate.web_000001" as StableId,
    seed: "1",
    placementPointId: "placement.shuttergate_north_guard" as StableId,
    profile
  };
}

describe("profile-bound Iron Warden loadouts", () => {
  it("canonically unlocks only the abilities earned by each build path", async () => {
    const content = await compileContent(contentFixture);
    const cases = [
      [createInitialProfile(characterId), ["ability.iron_warden.shield_slam"]],
      [controlProfile(), ["ability.iron_warden.shield_slam"]],
      [
        offenseProfile(),
        ["ability.iron_warden.linebreaker", "ability.iron_warden.shield_slam"]
      ],
      [
        guardProfile(),
        ["ability.iron_warden.rallying_roar", "ability.iron_warden.shield_slam"]
      ]
    ] as const;
    for (const [profile, expectedIds] of cases) {
      const runContent = createShuttergateWebRunContent(
        content,
        configuration(profile)
      );
      expect(
        runContent.characters
          .get(characterId)
          ?.activeAbilities?.map((ability) => ability.id)
          .sort()
      ).toEqual(expectedIds);
      expect(Object.isFrozen(runContent.characters)).toBe(true);
      expect("set" in runContent.characters).toBe(false);
    }
    expect(content.characters.get(characterId)?.activeAbilities).toHaveLength(
      3
    );
  });

  it.each([
    [controlProfile, "ability.iron_warden.shield_slam", 24, 4, 18, 85],
    [offenseProfile, "ability.iron_warden.linebreaker", 48, 6, 4, 120],
    [guardProfile, "ability.iron_warden.rallying_roar", 8, 7, 30, 145]
  ] as const)(
    "produces an inspectably distinct tactical outcome for %s",
    async (createProfile, abilityId, damage, range, staggerTicks, cooldownTicks) => {
      const content = await compileContent(contentFixture);
      const runConfiguration = configuration(createProfile());
      const scenario = createShuttergateWebScenario(
        compileScenario(scenarioFixture, content),
        runConfiguration
      );
      const host = createShuttergateWebLiveScenarioHost(
        scenario,
        content,
        runConfiguration
      );
      host.scheduleCommand({ atTick: 0, type: "confirmPreparation" });
      host.step();
      let targetingSteps = 0;
      while (
        host.state.battlefield?.dwarfCombatants[0]?.actionState
          .currentTargetEntityId === null
      ) {
        host.step();
        targetingSteps += 1;
        if (targetingSteps > 100)
          throw new Error("Iron Warden did not acquire a bounded test target");
      }
      host.scheduleCommand({
        atTick: host.state.tick,
        type: "activateAbility",
        dwarfEntityId: entityId,
        abilityId: abilityId as StableId
      });
      const activated = host.step();
      expect(activated.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "ability.activation.accepted",
            abilityId
          })
        ])
      );
      expect(activated.state.committedAbilities?.[0]).toMatchObject({
        abilityId,
        damage,
        range,
        staggerTicks
      });
      expect(activated.state.activeCooldowns?.[0]).toMatchObject({
        completeAtTick: activated.state.tick - 1 + cooldownTicks
      });
    }
  );

  it("rejects a branch ability that the authoritative profile did not equip", async () => {
    const content = await compileContent(contentFixture);
    const runConfiguration = configuration(controlProfile());
    const scenario = createShuttergateWebScenario(
      compileScenario(scenarioFixture, content),
      runConfiguration
    );
    const host = createShuttergateWebLiveScenarioHost(
      scenario,
      content,
      runConfiguration
    );
    host.scheduleCommand({ atTick: 0, type: "confirmPreparation" });
    host.step();
    host.scheduleCommand({
      atTick: host.state.tick,
      type: "activateAbility",
      dwarfEntityId: entityId,
      abilityId: "ability.iron_warden.linebreaker" as StableId
    });
    expect(host.step().events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "ability.activation.rejected",
          reasonCode: "ability_unsupported"
        })
      ])
    );
  });
});
