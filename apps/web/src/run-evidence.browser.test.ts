import {
  compileContent,
  compileScenario
} from "@dwarven-depths/content-runtime";
import {
  createInitialProfile,
  purchasedUpgradeCatalog,
  purchaseUpgradeRank
} from "@dwarven-depths/progression";
import {
  createShuttergateWebLiveScenarioHost,
  createShuttergateWebScenario,
  verifyReplay
} from "@dwarven-depths/runtime";
import { describe, expect, it } from "vitest";
import contentFixture from "../../../content/fixtures/phase-3-shuttergate.json";
import scenarioFixture from "../../../scenarios/conformance/shuttergate-web-truth.json";
import { createRunEvidenceReplay, type RunResult } from "./run-evidence.js";

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

describe("configured Shuttergate run evidence", () => {
  it("replays a legitimate purchased-build victory past the authored defeat window", async () => {
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
    const replay = await createRunEvidenceReplay(
      {
        protocolVersion: 4,
        type: "result",
        terminalResult: result.terminalResult,
        terminalTick: result.terminalTick,
        finalStateChecksum: result.finalStateChecksum,
        eventStreamChecksum: result.eventStreamChecksum,
        commands: result.commands
      } as RunResult,
      configuration
    );

    expect(result).toMatchObject({
      terminalResult: "victory",
      terminalTick: 4501
    });
    const replayScenario = compileScenario(
      {
        ...scenario,
        commands: replay.commands.map(({ command }) => command)
      },
      content
    );
    await expect(
      verifyReplay(replay, replayScenario, content, undefined, configuration)
    ).resolves.toMatchObject({
      terminalResult: "victory",
      terminalTick: 4501,
      finalStateChecksum: result.finalStateChecksum,
      eventStreamChecksum: result.eventStreamChecksum
    });
  }, 300_000);
});
