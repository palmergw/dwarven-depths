import type { StableId } from "@dwarven-depths/contracts";
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
