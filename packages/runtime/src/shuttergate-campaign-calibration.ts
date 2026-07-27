import { canonicalHash, type StableId } from "@dwarven-depths/contracts";
import type {
  ShuttergateCampaignAttemptEvidence,
  ShuttergateCampaignAuthority
} from "./shuttergate-campaign.js";
import type { ShuttergateCalibrationBuildId } from "./shuttergate-reference-calibration.js";

const unupgradedBuildId = "build.profile.new_campaign.v1";

export interface ShuttergateCampaignCalibrationAttempt {
  readonly schemaVersion: 1;
  readonly attemptNumber: number;
  readonly seed: string;
  readonly buildId: ShuttergateCalibrationBuildId;
  readonly terminalResult: "victory" | "defeat";
  readonly terminalTick: number;
  readonly deepestStartedWaveId: StableId;
  readonly defeatedEnemies: number;
  readonly forgeOreAwarded: number;
  readonly purchasedUpgradeId: StableId | null;
  readonly purchasedUpgradeRank: number | null;
}

export interface ShuttergateCampaignCalibrationComparison {
  readonly schemaVersion: 1;
  readonly baselineAttemptNumber: number;
  readonly upgradedAttemptNumber: number;
  readonly baselineBuildId: ShuttergateCalibrationBuildId;
  readonly upgradedBuildId: ShuttergateCalibrationBuildId;
  readonly baselineTerminalResult: "victory" | "defeat";
  readonly upgradedTerminalResult: "victory" | "defeat";
  readonly terminalTickDelta: number;
  readonly baselineDeepestStartedWaveId: StableId;
  readonly upgradedDeepestStartedWaveId: StableId;
  readonly defeatedEnemyDelta: number;
  readonly observation:
    | "terminal_result_changed"
    | "deeper_wave_reached"
    | "more_enemies_defeated"
    | "survived_longer"
    | "no_measured_improvement";
}

export interface ShuttergateCampaignCalibrationReport {
  readonly schemaVersion: 1;
  readonly campaignId: StableId;
  readonly attemptCount: number;
  readonly attempts: readonly ShuttergateCampaignCalibrationAttempt[];
  readonly comparison: ShuttergateCampaignCalibrationComparison | null;
}

export interface ShuttergateCampaignReleaseCandidateIdentity {
  readonly scenarioId: string;
  readonly scenarioHash: string;
  readonly contentManifestHash: string;
  readonly campaignPayloadChecksum: string;
  readonly calibrationReportChecksum: string;
}

function requireReleaseCandidateReport(
  report: ShuttergateCampaignCalibrationReport
): asserts report is ShuttergateCampaignCalibrationReport & {
  readonly comparison: ShuttergateCampaignCalibrationComparison;
} {
  if (
    report.schemaVersion !== 1 ||
    !Number.isSafeInteger(report.attemptCount) ||
    report.attemptCount < 1 ||
    report.attemptCount !== report.attempts.length ||
    report.attempts.some(
      (attempt, index) =>
        attempt.schemaVersion !== 1 || attempt.attemptNumber !== index + 1
    ) ||
    report.comparison === null ||
    report.comparison.schemaVersion !== 1
  ) {
    throw new TypeError("incomplete Shuttergate release-candidate report");
  }
}

/** Renders the existing authoritative campaign report without deriving gameplay evidence. */
export async function renderShuttergateCampaignReleaseCandidateMarkdown(
  report: ShuttergateCampaignCalibrationReport,
  identity: ShuttergateCampaignReleaseCandidateIdentity
): Promise<string> {
  requireReleaseCandidateReport(report);
  const comparison = report.comparison;
  if (
    Object.values(identity).some(
      (value) => typeof value !== "string" || value.length === 0
    ) ||
    (await canonicalHash(report)) !== identity.calibrationReportChecksum
  ) {
    throw new TypeError("Shuttergate release-candidate identity mismatch");
  }

  const lines = [
    "# Phase 6 Shuttergate release-candidate report",
    "",
    "## Evidence identity",
    "",
    `- Scenario: \`${identity.scenarioId}\``,
    `- Scenario checksum: \`${identity.scenarioHash}\``,
    `- Content manifest: \`${identity.contentManifestHash}\``,
    `- Campaign payload: \`${identity.campaignPayloadChecksum}\``,
    `- Calibration report: \`${identity.calibrationReportChecksum}\``,
    "",
    "## Attempt reports",
    "",
    "| Attempt | Seed | Build | Result | Terminal tick | Deepest wave | Defeated | Forge Ore | Purchase |",
    "| ---: | --- | --- | --- | ---: | --- | ---: | ---: | --- |",
    ...report.attempts.map(
      (attempt) =>
        `| ${attempt.attemptNumber} | ${attempt.seed} | \`${attempt.buildId}\` | ${attempt.terminalResult} | ${attempt.terminalTick} | \`${attempt.deepestStartedWaveId}\` | ${attempt.defeatedEnemies} | ${attempt.forgeOreAwarded} | ${attempt.purchasedUpgradeId === null ? "none" : `\`${attempt.purchasedUpgradeId}\` rank ${attempt.purchasedUpgradeRank}`} |`
    ),
    "",
    "## Baseline versus upgraded comparison",
    "",
    `- Attempts: ${comparison.baselineAttemptNumber} → ${comparison.upgradedAttemptNumber}`,
    `- Builds: \`${comparison.baselineBuildId}\` → \`${comparison.upgradedBuildId}\``,
    `- Results: ${comparison.baselineTerminalResult} → ${comparison.upgradedTerminalResult}`,
    `- Terminal tick delta: ${comparison.terminalTickDelta}`,
    `- Deepest wave: \`${comparison.baselineDeepestStartedWaveId}\` → \`${comparison.upgradedDeepestStartedWaveId}\``,
    `- Defeated-enemy delta: ${comparison.defeatedEnemyDelta}`,
    `- Recorded observation: \`${comparison.observation}\``,
    "",
    "## Interpretation boundary",
    "",
    "The values above are a human-readable rendering of the attached schema-1 campaign calibration report. They are observations from the authoritative campaign artifact, not recommendations or additional gameplay claims.",
    ""
  ];
  return lines.join("\n");
}

function attemptSummary(
  attempt: ShuttergateCampaignAttemptEvidence
): ShuttergateCampaignCalibrationAttempt {
  const purchase = attempt.purchaseDecision;
  return Object.freeze({
    schemaVersion: 1,
    attemptNumber: attempt.attemptNumber,
    seed: attempt.seed,
    buildId: attempt.buildId,
    terminalResult: attempt.encounter.calibration.terminalResult,
    terminalTick: attempt.encounter.calibration.terminalTick,
    deepestStartedWaveId: attempt.encounter.calibration.deepestStartedWaveId,
    defeatedEnemies: attempt.encounter.calibration.defeatedEnemies,
    forgeOreAwarded: attempt.rewardDecision.forgeOre,
    purchasedUpgradeId: purchase?.upgradeId ?? null,
    purchasedUpgradeRank: purchase?.purchasedRank ?? null
  });
}

function waveNumber(waveId: StableId): number {
  const match = /^wave\.shuttergate_([1-5])$/.exec(waveId);
  if (match === null) throw new RangeError("unsupported Shuttergate wave ID");
  return Number(match[1]);
}

function comparisonObservation(
  baseline: ShuttergateCampaignCalibrationAttempt,
  upgraded: ShuttergateCampaignCalibrationAttempt
): ShuttergateCampaignCalibrationComparison["observation"] {
  if (baseline.terminalResult !== upgraded.terminalResult)
    return "terminal_result_changed";
  if (
    waveNumber(upgraded.deepestStartedWaveId) >
    waveNumber(baseline.deepestStartedWaveId)
  )
    return "deeper_wave_reached";
  if (upgraded.defeatedEnemies > baseline.defeatedEnemies)
    return "more_enemies_defeated";
  if (
    baseline.terminalResult === "defeat" &&
    upgraded.terminalTick > baseline.terminalTick
  )
    return "survived_longer";
  return "no_measured_improvement";
}

/** Derives compact calibration evidence from already-authoritative campaign attempts. */
export function createShuttergateCampaignCalibrationReport(
  authority: ShuttergateCampaignAuthority
): ShuttergateCampaignCalibrationReport {
  const attempts = Object.freeze(authority.attempts.map(attemptSummary));
  const baseline = attempts.find(
    (attempt) => attempt.buildId === unupgradedBuildId
  );
  const upgraded = attempts.find(
    (attempt) => attempt.buildId !== unupgradedBuildId
  );
  const comparison =
    baseline === undefined || upgraded === undefined
      ? null
      : Object.freeze({
          schemaVersion: 1 as const,
          baselineAttemptNumber: baseline.attemptNumber,
          upgradedAttemptNumber: upgraded.attemptNumber,
          baselineBuildId: baseline.buildId,
          upgradedBuildId: upgraded.buildId,
          baselineTerminalResult: baseline.terminalResult,
          upgradedTerminalResult: upgraded.terminalResult,
          terminalTickDelta: upgraded.terminalTick - baseline.terminalTick,
          baselineDeepestStartedWaveId: baseline.deepestStartedWaveId,
          upgradedDeepestStartedWaveId: upgraded.deepestStartedWaveId,
          defeatedEnemyDelta:
            upgraded.defeatedEnemies - baseline.defeatedEnemies,
          observation: comparisonObservation(baseline, upgraded)
        });
  return Object.freeze({
    schemaVersion: 1,
    campaignId: authority.campaignId,
    attemptCount: attempts.length,
    attempts,
    comparison
  });
}
