import { compileContent } from "@dwarven-depths/content-runtime";
import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import shuttergateInput from "../../../content/fixtures/phase-3-shuttergate.json" with {
  type: "json"
};
import {
  createShuttergateCampaignAuthority,
  runShuttergateCampaignTransition
} from "./shuttergate-campaign.js";
import {
  createShuttergateCampaignCalibrationReport,
  renderShuttergateCampaignReleaseCandidateMarkdown,
  type ShuttergateCampaignCalibrationReport
} from "./shuttergate-campaign-calibration.js";

async function threeAttemptReport() {
  const content = await compileContent(shuttergateInput);
  let authority = createShuttergateCampaignAuthority();
  for (let index = 0; index < 3; index += 1) {
    authority = (await runShuttergateCampaignTransition(content, authority))
      .authority;
  }
  return createShuttergateCampaignCalibrationReport(authority);
}

describe("Shuttergate campaign calibration report", () => {
  it("records ordered attempts and an observed purchased-build delta", async () => {
    const report = await threeAttemptReport();

    expect(report).toMatchObject({
      schemaVersion: 1,
      campaignId: "campaign.shuttergate.v1",
      attemptCount: 3,
      comparison: {
        baselineAttemptNumber: 1,
        upgradedAttemptNumber: 3,
        terminalTickDelta: 2667,
        defeatedEnemyDelta: 13,
        observation: "terminal_result_changed"
      }
    });
    expect(report.attempts).toEqual([
      expect.objectContaining({
        attemptNumber: 1,
        buildId: "build.profile.new_campaign.v1",
        terminalTick: 1833,
        forgeOreAwarded: 8,
        purchasedUpgradeId: null
      }),
      expect.objectContaining({
        attemptNumber: 2,
        buildId: "build.profile.new_campaign.v1",
        purchasedUpgradeId: "upgrade.ability.shield_slam",
        purchasedUpgradeRank: 1
      }),
      expect.objectContaining({
        attemptNumber: 3,
        buildId: "build.warden.shield_slam_rank_1.v1",
        terminalTick: 4500,
        terminalResult: "victory"
      })
    ]);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.attempts)).toBe(true);
    expect(Object.isFrozen(report.attempts[0])).toBe(true);
    expect(await canonicalHash(report)).toBe(
      "596e800356cb70b746e66cb468e00ac0016dc4ebbf9c3cd8a7b3394ca1bb693c"
    );
  }, 45_000);

  it("does not invent a comparison before a purchased build is attempted", async () => {
    const content = await compileContent(shuttergateInput);
    const first = await runShuttergateCampaignTransition(
      content,
      createShuttergateCampaignAuthority()
    );
    const report = createShuttergateCampaignCalibrationReport(first.authority);

    expect(report.attemptCount).toBe(1);
    expect(report.comparison).toBeNull();
  }, 15_000);
});

describe("Shuttergate release-candidate Markdown", () => {
  it("renders byte-identical identified attempt and comparison evidence", async () => {
    const report = await threeAttemptReport();
    const identity = {
      scenarioId: "campaign_scenario.shuttergate.v1",
      scenarioHash: "a".repeat(64),
      contentManifestHash: "b".repeat(64),
      campaignPayloadChecksum: "c".repeat(64),
      calibrationReportChecksum: await canonicalHash(report)
    };

    const first = await renderShuttergateCampaignReleaseCandidateMarkdown(
      report,
      identity
    );
    const second = await renderShuttergateCampaignReleaseCandidateMarkdown(
      report,
      identity
    );

    expect(second).toBe(first);
    expect(first).toContain("| 3 | 3 | `build.warden.shield_slam_rank_1.v1`");
    expect(first).toContain("Recorded observation: `terminal_result_changed`");
    expect(first.endsWith("\n")).toBe(true);
  }, 45_000);

  it("rejects malformed or inconsistent source evidence", async () => {
    const report = await threeAttemptReport();
    const identity = {
      scenarioId: "campaign_scenario.shuttergate.v1",
      scenarioHash: "a".repeat(64),
      contentManifestHash: "b".repeat(64),
      campaignPayloadChecksum: "c".repeat(64),
      calibrationReportChecksum: await canonicalHash(report)
    };
    const incomplete = {
      ...report,
      attemptCount: report.attemptCount + 1
    } as ShuttergateCampaignCalibrationReport;

    await expect(
      renderShuttergateCampaignReleaseCandidateMarkdown(incomplete, identity)
    ).rejects.toThrow("incomplete Shuttergate release-candidate report");
    await expect(
      renderShuttergateCampaignReleaseCandidateMarkdown(
        { ...report, unexpected: true } as ShuttergateCampaignCalibrationReport,
        identity
      )
    ).rejects.toThrow("incomplete Shuttergate release-candidate report");
    await expect(
      renderShuttergateCampaignReleaseCandidateMarkdown(report, {
        ...identity,
        unexpected: true
      } as typeof identity)
    ).rejects.toThrow("incomplete Shuttergate release-candidate report");

    const missingSeed: unknown = structuredClone(report);
    const firstAttempt = (missingSeed as { attempts: Array<{ seed?: string }> })
      .attempts[0];
    if (firstAttempt === undefined) throw new Error("missing test attempt");
    delete firstAttempt.seed;
    await expect(
      renderShuttergateCampaignReleaseCandidateMarkdown(
        missingSeed as ShuttergateCampaignCalibrationReport,
        {
          ...identity,
          calibrationReportChecksum: await canonicalHash(missingSeed)
        }
      )
    ).rejects.toThrow("incomplete Shuttergate release-candidate report");

    const inconsistent = structuredClone(report);
    if (inconsistent.comparison === null)
      throw new Error("missing test comparison");
    const inconsistentComparison = inconsistent.comparison as {
      terminalTickDelta: number;
    };
    inconsistentComparison.terminalTickDelta += 1;
    await expect(
      renderShuttergateCampaignReleaseCandidateMarkdown(inconsistent, {
        ...identity,
        calibrationReportChecksum: await canonicalHash(inconsistent)
      })
    ).rejects.toThrow("inconsistent Shuttergate release-candidate comparison");

    const falseObservation = structuredClone(report);
    if (falseObservation.comparison === null)
      throw new Error("missing test comparison");
    const falseComparison = falseObservation.comparison as {
      observation: string;
    };
    falseComparison.observation = "survived_longer";
    await expect(
      renderShuttergateCampaignReleaseCandidateMarkdown(falseObservation, {
        ...identity,
        calibrationReportChecksum: await canonicalHash(falseObservation)
      })
    ).rejects.toThrow("inconsistent Shuttergate release-candidate comparison");
    await expect(
      renderShuttergateCampaignReleaseCandidateMarkdown(report, {
        ...identity,
        calibrationReportChecksum: "wrong"
      })
    ).rejects.toThrow("Shuttergate release-candidate identity mismatch");
  }, 45_000);
});
