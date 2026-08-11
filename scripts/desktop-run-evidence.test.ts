import { describe, expect, it } from "vitest";
import { validateDesktopRunEvidence } from "./desktop-run-evidence.mjs";

const stateChecksum = "a".repeat(64);
const eventChecksum = "b".repeat(64);
const expected = {
  terminalResult: "defeat",
  terminalTick: 1834,
  finalStateChecksum: stateChecksum,
  eventStreamChecksum: eventChecksum
};

function validEvidence() {
  const startingProfile = {
    schemaVersion: 1,
    revision: 0,
    forgeOre: 0,
    unlockedCharacterIds: ["character.iron_warden"],
    unlockedItemIds: [],
    claimedRewardIds: [],
    characterExperienceStates: [],
    claimedExperienceRewardEvents: [],
    selectedSkillNodes: [],
    purchasedUpgrades: []
  };
  return {
    schemaVersion: 2,
    runConfiguration: {
      schemaVersion: 1,
      attemptId: "attempt.shuttergate.web_000001",
      seed: "1",
      placementPointId: "placement.shuttergate_north_guard",
      profile: startingProfile
    },
    campaign: {
      schemaVersion: 1,
      attemptId: "attempt.shuttergate.web_000001",
      rewardId: "reward.attempt.shuttergate.web_000001",
      forgeOreAwarded: 8,
      profile: {
        ...startingProfile,
        revision: 1,
        forgeOre: 8,
        claimedRewardIds: ["reward.attempt.shuttergate.web_000001"]
      }
    },
    replay: {
      schemaVersion: 1,
      simulationSchemaVersion: 1,
      contentVersion: "1",
      contentManifestHash: "c".repeat(64),
      scenarioId: "scenario.shuttergate_web_truth",
      scenarioHash: "d".repeat(64),
      levelId: "level.shuttergate_hall",
      seed: "1",
      rngAlgorithm: "xorshift32-v1",
      commands: [
        {
          tick: 0,
          sequence: 0,
          command: { atTick: 0, type: "confirmPreparation" }
        }
      ],
      checkpoints: [
        {
          tick: expected.terminalTick,
          stateChecksum,
          eventStreamChecksum: eventChecksum
        }
      ],
      expectedTerminalResult: expected.terminalResult,
      expectedTerminalTick: expected.terminalTick
    }
  };
}

function firstReplayCommand(value: ReturnType<typeof validEvidence>) {
  const command = value.replay.commands[0];
  if (command === undefined) throw new Error("fixture command is missing");
  return command;
}

describe("packaged desktop run evidence", () => {
  it("accepts evidence bound to the observed terminal result", () => {
    expect(() =>
      validateDesktopRunEvidence(validEvidence(), expected)
    ).not.toThrow();
  });

  const invalidCases: [
    string,
    (value: ReturnType<typeof validEvidence>) => void
  ][] = [
    [
      "extra top-level property",
      (value) => Object.assign(value, { untrusted: true })
    ],
    [
      "extra replay property",
      (value) => Object.assign(value.replay, { untrusted: true })
    ],
    [
      "extra campaign property",
      (value) => Object.assign(value.campaign, { untrusted: true })
    ],
    [
      "extra run configuration property",
      (value) => Object.assign(value.runConfiguration, { untrusted: true })
    ],
    [
      "extra starting profile property",
      (value) =>
        Object.assign(value.runConfiguration.profile, { untrusted: true })
    ],
    [
      "extra resolved profile property",
      (value) => Object.assign(value.campaign.profile, { untrusted: true })
    ],
    [
      "campaign profile mismatch",
      (value) => (value.campaign.profile.forgeOre += 1)
    ],
    [
      "malformed replay hash",
      (value) => (value.replay.contentManifestHash = "7")
    ],
    [
      "extra replay command property",
      (value) => Object.assign(firstReplayCommand(value), { untrusted: true })
    ],
    [
      "extra command payload property",
      (value) =>
        Object.assign(firstReplayCommand(value).command, { untrusted: true })
    ],
    [
      "noncanonical command sequence",
      (value) => (firstReplayCommand(value).sequence = 5)
    ],
    [
      "command after terminal",
      (value) => {
        firstReplayCommand(value).tick = expected.terminalTick + 1;
        firstReplayCommand(value).command.atTick = expected.terminalTick + 1;
      }
    ],
    [
      "attempt inconsistent with profile history",
      (value) => {
        value.runConfiguration.attemptId = "attempt.shuttergate.web_999999";
        value.runConfiguration.seed = "42";
        value.campaign.attemptId = "attempt.shuttergate.web_999999";
        value.campaign.rewardId = "reward.attempt.shuttergate.web_999999";
        value.campaign.profile.claimedRewardIds = [
          "reward.attempt.shuttergate.web_999999"
        ];
        value.replay.seed = "42";
      }
    ],
    [
      "terminal tick mismatch",
      (value) => (value.replay.expectedTerminalTick += 1)
    ],
    [
      "state checksum mismatch",
      (value) => (value.replay.checkpoints[0].stateChecksum = "e".repeat(64))
    ],
    ["missing checkpoint", (value) => (value.replay.checkpoints = [])]
  ];

  it.each(invalidCases)("rejects %s", (_label, mutate) => {
    const value = validEvidence();
    mutate(value);
    expect(() => validateDesktopRunEvidence(value, expected)).toThrow();
  });
});
