import { readFileSync } from "node:fs";
import { compileContent } from "@dwarven-depths/content-runtime";
import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import shuttergateInput from "../../../content/fixtures/phase-3-shuttergate.json" with {
  type: "json"
};
import campaignScenarioInput from "../../../scenarios/conformance/shuttergate-campaign.json" with {
  type: "json"
};
import {
  createShuttergateCampaignAuthority,
  runShuttergateCampaignTransition
} from "./shuttergate-campaign.js";
import {
  createShuttergateCampaignArtifact,
  restoreShuttergateCampaignArtifact,
  type ShuttergateCampaignArtifact
} from "./shuttergate-campaign-artifact.js";
import { createShuttergateCampaignCalibrationReport } from "./shuttergate-campaign-calibration.js";

const replayPath =
  "scenarios/replays/shuttergate-level-1-policy-v1/campaign.json.fixture";
const manifestPath =
  "scenarios/replays/shuttergate-level-1-policy-v1/campaign-manifest.json.fixture";
const policyReplayInput = JSON.parse(
  readFileSync(replayPath, "utf8")
) as ShuttergateCampaignArtifact;
const policyReplayManifestInput = JSON.parse(
  readFileSync(manifestPath, "utf8")
) as Record<string, unknown>;

function canonicalFixtureBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

describe("Shuttergate Level 1 reference policy replay", () => {
  it("regenerates canonical bytes and restores authoritative progression", async () => {
    const content = await compileContent(shuttergateInput);
    const compiledScenario = {
      ...campaignScenarioInput,
      content: "content.compiled.json"
    };
    const scenarioHash = await canonicalHash(compiledScenario);
    let authority = createShuttergateCampaignAuthority();
    for (
      let index = 0;
      index < campaignScenarioInput.attemptCount;
      index += 1
    ) {
      authority = (await runShuttergateCampaignTransition(content, authority))
        .authority;
    }
    const calibration = createShuttergateCampaignCalibrationReport(authority);
    const regenerated = await createShuttergateCampaignArtifact({
      schemaVersion: 1,
      content,
      authority,
      applicationBuild: campaignScenarioInput.applicationBuild,
      writtenAtEpochMs: campaignScenarioInput.writtenAtEpochMs,
      profileId: campaignScenarioInput.profileId
    });
    const regeneratedManifest = {
      schemaVersion: 2,
      complete: true,
      scenarioId: campaignScenarioInput.id,
      scenarioHash,
      contentManifestHash: content.manifestHash,
      attemptCount: campaignScenarioInput.attemptCount,
      campaignPayloadChecksum: regenerated.payloadChecksum,
      calibrationReportChecksum: await canonicalHash(calibration)
    };

    expect(regenerated).toEqual(policyReplayInput);
    expect(regeneratedManifest).toEqual(policyReplayManifestInput);
    expect(canonicalFixtureBytes(regenerated)).toBe(
      readFileSync(replayPath, "utf8")
    );
    expect(canonicalFixtureBytes(regeneratedManifest)).toBe(
      readFileSync(manifestPath, "utf8")
    );

    const restored = await restoreShuttergateCampaignArtifact(
      content,
      policyReplayInput
    );
    expect(restored.attempts).toHaveLength(4);
    expect(restored.profile).toMatchObject({
      revision: 6,
      forgeOre: 71,
      unlockedCharacterIds: ["character.deep_ranger", "character.iron_warden"],
      claimedRewardIds: [
        "reward.attempt.shuttergate.campaign_000001",
        "reward.attempt.shuttergate.campaign_000002",
        "reward.attempt.shuttergate.campaign_000003",
        "reward.attempt.shuttergate.campaign_000004",
        "reward.boss.gatebreaker_captain"
      ],
      purchasedUpgrades: [
        expect.objectContaining({
          upgradeId: "upgrade.ability.shield_slam",
          rank: 1
        })
      ]
    });
    expect(await canonicalHash(restored.rewardLedger)).toBe(
      policyReplayInput.rewardLedgerChecksum
    );
  }, 120_000);

  it("rejects identity and checksummed replay tampering", async () => {
    const content = await compileContent(shuttergateInput);
    const tamperedValues = [
      { ...policyReplayInput, campaignId: "campaign.foreign.v1" },
      {
        ...policyReplayInput,
        attemptChecksums: [
          "0".repeat(64),
          ...policyReplayInput.attemptChecksums.slice(1)
        ]
      },
      { ...policyReplayInput, stateChecksum: "0".repeat(64) },
      { ...policyReplayInput, payloadChecksum: "0".repeat(64) }
    ];

    for (const tampered of tamperedValues) {
      await expect(
        restoreShuttergateCampaignArtifact(content, tampered)
      ).rejects.toThrow();
    }
  });
});
