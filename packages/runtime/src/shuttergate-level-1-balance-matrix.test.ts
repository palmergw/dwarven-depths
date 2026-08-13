import { compileContent } from "@dwarven-depths/content-runtime";
import type { PlacementPointId } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import matrixInput from "../../../content/calibration/shuttergate-level-1-balance-matrix-v1.json" with {
  type: "json"
};
import shuttergateInput from "../../../content/fixtures/phase-3-shuttergate.json" with {
  type: "json"
};
import {
  assertShuttergateCalibrationMatchesBalanceCase,
  requireShuttergateLevel1BalanceMatrix
} from "./shuttergate-level-1-balance-matrix.js";
import {
  runShuttergateSeedPlacementControllerBuildCalibration,
  type ShuttergateBuildCalibrationEvidence
} from "./shuttergate-reference-calibration.js";

function combinationKey(value: {
  readonly placementPointId: string;
  readonly targetPolicy: string;
  readonly buildId: string;
}): string {
  return `${value.placementPointId}/${value.targetPolicy}/${value.buildId}`;
}

function outcomeSignature(
  evidence: ShuttergateBuildCalibrationEvidence
): string {
  return [
    evidence.terminalResult,
    evidence.deepestStartedWaveId,
    evidence.defeatedEnemies,
    evidence.survivingEnemies
  ].join("/");
}

describe("Shuttergate Level 1 balance matrix", () => {
  it("covers and accepts all authoritative placement, policy, and build cases", async () => {
    const matrix = requireShuttergateLevel1BalanceMatrix(matrixInput);
    const content = await compileContent(shuttergateInput);
    const evidenceByCase = new Map<
      string,
      ShuttergateBuildCalibrationEvidence
    >();

    for (const balanceCase of matrix.cases) {
      const evidence =
        await runShuttergateSeedPlacementControllerBuildCalibration(
          content,
          matrix.seed,
          balanceCase.placementPointId as PlacementPointId,
          balanceCase.targetPolicy,
          balanceCase.buildId
        );
      expect(() =>
        assertShuttergateCalibrationMatchesBalanceCase(
          evidence,
          matrix,
          balanceCase
        )
      ).not.toThrow();
      evidenceByCase.set(combinationKey(balanceCase), evidence);
    }

    expect(matrix.cases).toHaveLength(24);
    for (const upgraded of matrix.cases.filter(
      ({ buildId }) => buildId === "build.warden.shield_slam_rank_1.v1"
    )) {
      const unupgradedKey = combinationKey({
        ...upgraded,
        buildId: "build.profile.new_campaign.v1"
      });
      const unupgradedEvidence = evidenceByCase.get(unupgradedKey);
      const upgradedEvidence = evidenceByCase.get(combinationKey(upgraded));
      expect(unupgradedEvidence).toBeDefined();
      expect(upgradedEvidence).toBeDefined();
      expect(upgradedEvidence?.terminalTick).toBeGreaterThan(
        unupgradedEvidence?.terminalTick ?? Number.POSITIVE_INFINITY
      );
    }
    expect(Object.isFrozen(matrix)).toBe(true);
    expect(Object.isFrozen(matrix.cases)).toBe(true);
    expect(Object.isFrozen(matrix.cases[0]?.ranges)).toBe(true);
  }, 360_000);

  it("characterizes the pre-tuning upgrade cliff and policy-insensitive outcomes", async () => {
    const matrix = requireShuttergateLevel1BalanceMatrix(matrixInput);
    const content = await compileContent(shuttergateInput);
    const evidence = await Promise.all(
      matrix.cases.map((balanceCase) =>
        runShuttergateSeedPlacementControllerBuildCalibration(
          content,
          matrix.seed,
          balanceCase.placementPointId as PlacementPointId,
          balanceCase.targetPolicy,
          balanceCase.buildId
        )
      )
    );
    const unupgraded = evidence.filter(
      ({ buildId }) => buildId === "build.profile.new_campaign.v1"
    );
    const upgraded = evidence.filter(
      ({ buildId }) => buildId === "build.warden.shield_slam_rank_1.v1"
    );

    expect(unupgraded).toHaveLength(12);
    expect(upgraded).toHaveLength(12);
    expect(
      unupgraded.every(({ terminalResult }) => terminalResult === "defeat")
    ).toBe(true);
    expect(
      upgraded.every(({ terminalResult }) => terminalResult === "victory")
    ).toBe(true);
    for (const placementPointId of [
      "placement.shuttergate_north_guard",
      "placement.shuttergate_keep_guard"
    ]) {
      expect(
        new Set(
          unupgraded
            .filter((entry) => entry.placementPointId === placementPointId)
            .map(outcomeSignature)
        )
      ).toHaveProperty("size", 1);
      expect(
        new Set(
          upgraded
            .filter((entry) => entry.placementPointId === placementPointId)
            .map(outcomeSignature)
        )
      ).toHaveProperty("size", 1);
    }
  }, 360_000);

  it("rejects unknown, unsupported, duplicate, and incomplete cases", () => {
    expect(() =>
      requireShuttergateLevel1BalanceMatrix({
        ...matrixInput,
        unexpected: true
      })
    ).toThrow("invalid fields");
    expect(() =>
      requireShuttergateLevel1BalanceMatrix({
        ...matrixInput,
        contentManifestHash: "0".repeat(64)
      })
    ).toThrow("content manifest is not pinned");
    expect(() =>
      requireShuttergateLevel1BalanceMatrix({ ...matrixInput, seed: "2" })
    ).toThrow("seed is not pinned");
    expect(() =>
      requireShuttergateLevel1BalanceMatrix({
        ...matrixInput,
        safetyTickLimit: 4499
      })
    ).toThrow("safety tick limit is not pinned");
    expect(() =>
      requireShuttergateLevel1BalanceMatrix({
        ...matrixInput,
        cases: [
          {
            ...matrixInput.cases[0],
            deepestStartedWaveId: "wave.not_authored"
          },
          ...matrixInput.cases.slice(1)
        ]
      })
    ).toThrow("deepest wave ID is unsupported");
    expect(() =>
      requireShuttergateLevel1BalanceMatrix({
        ...matrixInput,
        cases: [
          { ...matrixInput.cases[0], targetPolicy: "unsupported" },
          ...matrixInput.cases.slice(1)
        ]
      })
    ).toThrow("target policy is unsupported");
    expect(() =>
      requireShuttergateLevel1BalanceMatrix({
        ...matrixInput,
        cases: [
          matrixInput.cases[0],
          {
            ...matrixInput.cases[1],
            terminalReason: "all_dwarves_downed"
          },
          ...matrixInput.cases.slice(2)
        ]
      })
    ).toThrow("terminal result and reason contradict");
    expect(() =>
      requireShuttergateLevel1BalanceMatrix({
        ...matrixInput,
        cases: [...matrixInput.cases.slice(0, -1), matrixInput.cases[0]]
      })
    ).toThrow("duplicate cases");
    expect(() =>
      requireShuttergateLevel1BalanceMatrix({
        ...matrixInput,
        cases: matrixInput.cases.slice(1)
      })
    ).toThrow("matrix is incomplete");

    const accessorCases = [...matrixInput.cases];
    Object.defineProperty(accessorCases, "0", {
      enumerable: true,
      get: () => matrixInput.cases[0]
    });
    expect(() =>
      requireShuttergateLevel1BalanceMatrix({
        ...matrixInput,
        cases: accessorCases
      })
    ).toThrow("dense plain data elements");
  });

  it("rejects invalid ranges and out-of-range evidence", async () => {
    expect(() =>
      requireShuttergateLevel1BalanceMatrix({
        ...matrixInput,
        cases: [
          {
            ...matrixInput.cases[0],
            ranges: {
              ...matrixInput.cases[0]?.ranges,
              terminalTick: { minimum: 2, maximum: 1 }
            }
          },
          ...matrixInput.cases.slice(1)
        ]
      })
    ).toThrow("minimum exceeds maximum");

    const matrix = requireShuttergateLevel1BalanceMatrix(matrixInput);
    const balanceCase = matrix.cases[0];
    if (balanceCase === undefined) throw new Error("expected a balance case");
    const content = await compileContent(shuttergateInput);
    const evidence =
      await runShuttergateSeedPlacementControllerBuildCalibration(
        content,
        matrix.seed,
        balanceCase.placementPointId as PlacementPointId,
        balanceCase.targetPolicy,
        balanceCase.buildId
      );
    expect(() =>
      assertShuttergateCalibrationMatchesBalanceCase(
        {
          ...evidence,
          terminalTick: balanceCase.ranges.terminalTick.maximum + 1
        },
        matrix,
        balanceCase
      )
    ).toThrow("terminalTick");
  }, 60_000);
});
