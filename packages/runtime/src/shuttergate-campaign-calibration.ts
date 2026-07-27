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

const reportKeys = [
  "schemaVersion",
  "campaignId",
  "attemptCount",
  "attempts",
  "comparison"
] as const;
const attemptKeys = [
  "schemaVersion",
  "attemptNumber",
  "seed",
  "buildId",
  "terminalResult",
  "terminalTick",
  "deepestStartedWaveId",
  "defeatedEnemies",
  "forgeOreAwarded",
  "purchasedUpgradeId",
  "purchasedUpgradeRank"
] as const;
const comparisonKeys = [
  "schemaVersion",
  "baselineAttemptNumber",
  "upgradedAttemptNumber",
  "baselineBuildId",
  "upgradedBuildId",
  "baselineTerminalResult",
  "upgradedTerminalResult",
  "terminalTickDelta",
  "baselineDeepestStartedWaveId",
  "upgradedDeepestStartedWaveId",
  "defeatedEnemyDelta",
  "observation"
] as const;
const identityKeys = [
  "scenarioId",
  "scenarioHash",
  "contentManifestHash",
  "campaignPayloadChecksum",
  "calibrationReportChecksum"
] as const;
const stableIdPattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const checksumPattern = /^[0-9a-f]{64}$/;

function requirePlainExactRecord(
  value: unknown,
  keys: readonly string[]
): asserts value is Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    throw new TypeError("incomplete Shuttergate release-candidate report");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).length !== keys.length ||
    !keys.every((key) => {
      const descriptor = descriptors[key];
      return descriptor?.enumerable === true && "value" in descriptor;
    })
  )
    throw new TypeError("incomplete Shuttergate release-candidate report");
}

function requireReleaseCandidateReport(
  report: ShuttergateCampaignCalibrationReport
): asserts report is ShuttergateCampaignCalibrationReport & {
  readonly comparison: ShuttergateCampaignCalibrationComparison;
} {
  requirePlainExactRecord(report, reportKeys);
  if (
    !Array.isArray(report.attempts) ||
    Object.getPrototypeOf(report.attempts) !== Array.prototype ||
    Object.keys(report.attempts).length !== report.attempts.length
  )
    throw new TypeError("incomplete Shuttergate release-candidate report");
  for (const attempt of report.attempts)
    requirePlainExactRecord(attempt, attemptKeys);
  requirePlainExactRecord(report.comparison, comparisonKeys);

  const isString = (value: unknown): value is string =>
    typeof value === "string" && value.length > 0;
  const isStableId = (value: unknown, domain: string): value is string =>
    isString(value) && stableIdPattern.test(value) && value.startsWith(domain);
  const isInteger = (value: unknown): value is number =>
    Number.isSafeInteger(value) && (value as number) >= 0;
  if (
    report.schemaVersion !== 1 ||
    !isStableId(report.campaignId, "campaign.") ||
    !Number.isSafeInteger(report.attemptCount) ||
    report.attemptCount < 1 ||
    report.attemptCount !== report.attempts.length ||
    report.attempts.some(
      (attempt, index) =>
        attempt.schemaVersion !== 1 ||
        attempt.attemptNumber !== index + 1 ||
        !isString(attempt.seed) ||
        !isStableId(attempt.buildId, "build.") ||
        (attempt.terminalResult !== "victory" &&
          attempt.terminalResult !== "defeat") ||
        !isInteger(attempt.terminalTick) ||
        !isStableId(attempt.deepestStartedWaveId, "wave.") ||
        !isInteger(attempt.defeatedEnemies) ||
        !isInteger(attempt.forgeOreAwarded) ||
        (attempt.purchasedUpgradeId === null
          ? attempt.purchasedUpgradeRank !== null
          : !isStableId(attempt.purchasedUpgradeId, "upgrade.") ||
            !isInteger(attempt.purchasedUpgradeRank) ||
            attempt.purchasedUpgradeRank < 1)
    ) ||
    report.comparison === null ||
    report.comparison.schemaVersion !== 1 ||
    !isInteger(report.comparison.baselineAttemptNumber) ||
    !isInteger(report.comparison.upgradedAttemptNumber) ||
    !isStableId(report.comparison.baselineBuildId, "build.") ||
    !isStableId(report.comparison.upgradedBuildId, "build.") ||
    (report.comparison.baselineTerminalResult !== "victory" &&
      report.comparison.baselineTerminalResult !== "defeat") ||
    (report.comparison.upgradedTerminalResult !== "victory" &&
      report.comparison.upgradedTerminalResult !== "defeat") ||
    !Number.isSafeInteger(report.comparison.terminalTickDelta) ||
    !isStableId(report.comparison.baselineDeepestStartedWaveId, "wave.") ||
    !isStableId(report.comparison.upgradedDeepestStartedWaveId, "wave.") ||
    !Number.isSafeInteger(report.comparison.defeatedEnemyDelta) ||
    ![
      "terminal_result_changed",
      "deeper_wave_reached",
      "more_enemies_defeated",
      "survived_longer",
      "no_measured_improvement"
    ].includes(report.comparison.observation)
  ) {
    throw new TypeError("incomplete Shuttergate release-candidate report");
  }

  const baseline = report.attempts[report.comparison.baselineAttemptNumber - 1];
  const upgraded = report.attempts[report.comparison.upgradedAttemptNumber - 1];
  if (
    baseline === undefined ||
    upgraded === undefined ||
    baseline.buildId !== report.comparison.baselineBuildId ||
    upgraded.buildId !== report.comparison.upgradedBuildId ||
    baseline.terminalResult !== report.comparison.baselineTerminalResult ||
    upgraded.terminalResult !== report.comparison.upgradedTerminalResult ||
    baseline.deepestStartedWaveId !==
      report.comparison.baselineDeepestStartedWaveId ||
    upgraded.deepestStartedWaveId !==
      report.comparison.upgradedDeepestStartedWaveId ||
    upgraded.terminalTick - baseline.terminalTick !==
      report.comparison.terminalTickDelta ||
    upgraded.defeatedEnemies - baseline.defeatedEnemies !==
      report.comparison.defeatedEnemyDelta ||
    comparisonObservation(baseline, upgraded) !== report.comparison.observation
  ) {
    throw new TypeError(
      "inconsistent Shuttergate release-candidate comparison"
    );
  }
}

/** Renders the existing authoritative campaign report without deriving gameplay evidence. */
export async function renderShuttergateCampaignReleaseCandidateMarkdown(
  report: ShuttergateCampaignCalibrationReport,
  identity: ShuttergateCampaignReleaseCandidateIdentity
): Promise<string> {
  requireReleaseCandidateReport(report);
  requirePlainExactRecord(identity, identityKeys);
  const comparison = report.comparison;
  if (
    !isReleaseCandidateIdentity(identity) ||
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

function isReleaseCandidateIdentity(
  identity: ShuttergateCampaignReleaseCandidateIdentity
): boolean {
  return (
    stableIdPattern.test(identity.scenarioId) &&
    identity.scenarioId.startsWith("campaign_scenario.") &&
    checksumPattern.test(identity.scenarioHash) &&
    checksumPattern.test(identity.contentManifestHash) &&
    checksumPattern.test(identity.campaignPayloadChecksum) &&
    checksumPattern.test(identity.calibrationReportChecksum)
  );
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
