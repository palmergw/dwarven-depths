import {
  compileContent,
  compileScenario
} from "@dwarven-depths/content-runtime";
import {
  createInitialProfile,
  purchasedUpgradeCatalog,
  purchaseUpgradeRank
} from "@dwarven-depths/progression";
import { describe, expect, it } from "vitest";
import contentFixture from "../../../content/fixtures/phase-3-shuttergate.json" with {
  type: "json"
};
import scenarioFixture from "../../../scenarios/conformance/shuttergate-web-truth.json" with {
  type: "json"
};
import {
  createReplayDefinition,
  createShuttergateWebLiveScenarioHost,
  verifyReplay
} from "./index.js";
import {
  createShuttergateWebPreparationState,
  createShuttergateWebScenario,
  resolveShuttergateWebAttemptReward
} from "./shuttergate-web-campaign.js";

function purchasedProfile() {
  const initial = createInitialProfile("character.iron_warden" as never);
  const purchased = purchaseUpgradeRank({
    schemaVersion: 1,
    profile: { ...initial, forgeOre: 16 },
    catalog: purchasedUpgradeCatalog,
    upgradeId: "upgrade.ability.shield_slam" as never
  }).profile;
  return {
    ...purchased,
    revision: 3,
    claimedRewardIds: [
      "reward.attempt.shuttergate.web_000001" as never,
      "reward.attempt.shuttergate.web_000002" as never
    ]
  };
}

describe("Shuttergate web campaign authority", () => {
  it("derives one expectation-free bounded scenario for configured evidence", async () => {
    const content = await compileContent(contentFixture);
    const authoredScenario = compileScenario(scenarioFixture, content);
    const scenario = createShuttergateWebScenario(authoredScenario, {
      schemaVersion: 1,
      attemptId: "attempt.shuttergate.web_000003" as never,
      seed: "3",
      placementPointId: "placement.shuttergate_north_guard" as never,
      profile: purchasedProfile()
    });

    expect(scenario).toMatchObject({ seed: "3", maximumTicks: 6000 });
    expect(scenario).not.toHaveProperty("expectedTerminalResult");
    expect(Object.isFrozen(scenario)).toBe(true);
  });

  it("binds a purchased profile into an immutable deployed run", async () => {
    const content = await compileContent(contentFixture);
    const scenario = compileScenario(scenarioFixture, content);
    const state = createShuttergateWebPreparationState(content, scenario, {
      schemaVersion: 1,
      attemptId: "attempt.shuttergate.web_000003" as never,
      seed: "3",
      placementPointId: "placement.shuttergate_north_guard" as never,
      profile: purchasedProfile()
    });
    expect(state.seed).toBe("3");
    expect(state.battlefield?.dwarfCombatants[0]).toMatchObject({
      maximumHealth: 840,
      basicAttack: { damage: 20, range: 6 }
    });
    expect(Object.isFrozen(state)).toBe(true);
  });

  it("rejects extra configuration fields and terminal mismatches", async () => {
    const content = await compileContent(contentFixture);
    const scenario = compileScenario(scenarioFixture, content);
    const configuration = {
      schemaVersion: 1 as const,
      attemptId: "attempt.shuttergate.web_000003" as never,
      seed: "3",
      placementPointId: "placement.shuttergate_north_guard" as never,
      profile: purchasedProfile()
    };
    expect(() =>
      createShuttergateWebPreparationState(content, scenario, {
        ...configuration,
        unexpected: true
      } as never)
    ).toThrow("invalid shape");
    expect(() =>
      createShuttergateWebPreparationState(content, scenario, {
        ...configuration,
        [Symbol("unexpected")]: true
      } as never)
    ).toThrow("invalid shape");
    expect(() =>
      createShuttergateWebPreparationState(content, scenario, {
        ...configuration,
        attemptId: "attempt.shuttergate.web_000004" as never
      })
    ).toThrow("profile history");
    expect(() =>
      createShuttergateWebPreparationState(content, scenario, {
        ...configuration,
        seed: "2"
      })
    ).toThrow("profile history");
    expect(() =>
      createShuttergateWebScenario(scenario, {
        ...configuration,
        profile: {
          ...configuration.profile,
          revision: configuration.profile.revision + 1,
          claimedRewardIds: [
            ...configuration.profile.claimedRewardIds,
            "reward.campaign.shuttergate.victory"
          ] as never
        }
      })
    ).toThrow("already ended in victory");
    const state = createShuttergateWebPreparationState(
      content,
      scenario,
      configuration
    );
    const battlefield = state.battlefield;
    if (battlefield === undefined) throw new Error("missing battlefield");
    expect(() =>
      resolveShuttergateWebAttemptReward({
        schemaVersion: 1,
        configuration,
        terminalResult: "defeat",
        finalState: state
      })
    ).toThrow("terminal-bound");
    expect(() =>
      resolveShuttergateWebAttemptReward({
        schemaVersion: 1,
        configuration,
        terminalResult: "victory",
        finalState: {
          ...state,
          phase: "TERMINAL",
          terminalResult: "defeat"
        }
      })
    ).toThrow("terminal-bound");
    expect(() =>
      resolveShuttergateWebAttemptReward({
        schemaVersion: 1,
        configuration,
        terminalResult: "victory",
        finalState: {
          ...state,
          phase: "TERMINAL",
          terminalResult: "victory",
          battlefield: {
            ...battlefield,
            startedWaveIds: [
              "wave.shuttergate_1",
              "wave.shuttergate_2",
              "wave.shuttergate_3",
              "wave.shuttergate_4",
              "wave.shuttergate_5"
            ] as never
          }
        }
      })
    ).toThrow("did not defeat the Gatebreaker Captain");
  });

  it("replays purchased campaign preparation through the same authority", async () => {
    const content = await compileContent(contentFixture);
    const configuration = {
      schemaVersion: 1 as const,
      attemptId: "attempt.shuttergate.web_000003" as never,
      seed: "3",
      placementPointId: "placement.shuttergate_north_guard" as never,
      profile: purchasedProfile()
    };
    const scenario = createShuttergateWebScenario(
      compileScenario(scenarioFixture, content),
      configuration
    );
    const host = createShuttergateWebLiveScenarioHost(
      scenario,
      content,
      configuration
    );
    host.scheduleCommand({ atTick: 0, type: "confirmPreparation" });
    while (host.state.phase !== "TERMINAL") {
      if (
        host.state.phase === "COMBAT_RUNNING" &&
        !host.state.activeCooldowns?.some(
          (cooldown) =>
            cooldown.ownerEntityId === "entity.dwarf.warden" &&
            cooldown.cooldownId.startsWith(
              "ability.iron_warden.shield_slam.cooldown."
            )
        )
      )
        host.scheduleCommand({
          atTick: host.state.tick,
          type: "activateAbility",
          dwarfEntityId: "entity.dwarf.warden" as never,
          abilityId: "ability.iron_warden.shield_slam" as never
        });
      host.step();
    }
    const result = await host.result();
    const replayScenario = host.scenario;

    expect(result.terminalResult).toBe("victory");
    expect(
      result.finalState.battlefield?.dwarfCombatants[0]?.maximumHealth
    ).toBe(840);
    const reward = resolveShuttergateWebAttemptReward({
      schemaVersion: 1,
      configuration,
      terminalResult: "victory",
      finalState: result.finalState
    });
    expect(reward).toMatchObject({
      forgeOreAwarded: 43,
      profile: {
        forgeOre: 49,
        unlockedCharacterIds: [
          "character.deep_ranger",
          "character.iron_warden"
        ],
        claimedRewardIds: expect.arrayContaining([
          "reward.boss.gatebreaker_captain"
        ])
      }
    });
    const battlefield = result.finalState.battlefield;
    if (battlefield === undefined) throw new Error("missing battlefield");
    const survivingEnemy = battlefield.enemyCombatants.find(
      (enemy) => enemy.entityId !== "entity.enemy.shuttergate_010"
    );
    if (survivingEnemy === undefined)
      throw new Error("missing non-boss enemy combatant");
    expect(() =>
      resolveShuttergateWebAttemptReward({
        schemaVersion: 1,
        configuration,
        terminalResult: "victory",
        finalState: {
          ...result.finalState,
          battlefield: {
            ...battlefield,
            enemyCombatants: battlefield.enemyCombatants.map((enemy) =>
              enemy.entityId === survivingEnemy.entityId
                ? { ...enemy, lifecycleState: "active", currentHealth: 1 }
                : enemy
            )
          }
        }
      })
    ).toThrow("surviving enemies");
    const bossDefeatReward = resolveShuttergateWebAttemptReward({
      schemaVersion: 1,
      configuration,
      terminalResult: "defeat",
      finalState: {
        ...result.finalState,
        terminalResult: "defeat"
      }
    });
    expect(bossDefeatReward.profile).toMatchObject({
      forgeOre: 49,
      unlockedCharacterIds: ["character.deep_ranger", "character.iron_warden"],
      claimedRewardIds: expect.arrayContaining([
        "reward.boss.gatebreaker_captain"
      ])
    });
    await expect(
      verifyReplay(
        createReplayDefinition(result, replayScenario, content),
        replayScenario,
        content,
        undefined,
        configuration
      )
    ).resolves.toEqual(result);
  }, 120_000);
});
