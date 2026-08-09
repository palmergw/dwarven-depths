import { compileContent } from "@dwarven-depths/content-runtime";
import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import shuttergateInput from "../../../content/fixtures/phase-3-shuttergate.json" with {
  type: "json"
};
import {
  runShuttergateAttempt,
  runShuttergateReferenceCalibration
} from "./shuttergate-reference-calibration.js";

const expectedChecksum =
  "6ab8bd8643a045d1d8b25969107ad3275a533ca66f421d018d59205f2a143bf2";

describe("Shuttergate calibration browser parity", () => {
  it("matches the literal Node outcome checksum", async () => {
    const content = await compileContent(shuttergateInput);
    const evidence = await runShuttergateReferenceCalibration(content);

    expect(evidence).toMatchObject({
      terminalResult: "defeat",
      deepestStartedWaveId: "wave.shuttergate_3",
      bossRewardClaimed: false,
      deepRangerUnlocked: false
    });
    expect(await canonicalHash(evidence)).toBe(expectedChecksum);
  }, 90_000);

  it("matches literal authoritative attempt reward evidence", async () => {
    const content = await compileContent(shuttergateInput);
    const result = await runShuttergateAttempt(content, {
      schemaVersion: 1,
      attemptId: "attempt.shuttergate.a0001" as never,
      seed: "1",
      placementPointId: "placement.shuttergate_north_guard" as never,
      targetPolicy: "nearest",
      buildId: "build.profile.new_campaign.v1"
    });

    expect(result.rewardEvent.defeatedEnemies).toBe(
      result.calibration.defeatedEnemies
    );
    expect(await canonicalHash(result.rewardEvent)).toBe(
      "562b435c2f90110cdf3fa6b6a5bcf48676777ba6b7a1d6b132624054db50dcff"
    );

    const accessorRequest = {
      schemaVersion: 1,
      seed: "1",
      placementPointId: "placement.shuttergate_north_guard",
      targetPolicy: "nearest",
      buildId: "build.profile.new_campaign.v1"
    } as Record<string, unknown>;
    Object.defineProperty(accessorRequest, "attemptId", {
      enumerable: true,
      get: () => "attempt.shuttergate.a0001"
    });
    await expect(
      runShuttergateAttempt(content, accessorRequest as never)
    ).rejects.toThrow("plain data properties");

    const hiddenFieldRequest = {
      schemaVersion: 1,
      attemptId: "attempt.shuttergate.a0001",
      seed: "1",
      placementPointId: "placement.shuttergate_north_guard",
      targetPolicy: "nearest",
      buildId: "build.profile.new_campaign.v1",
      [Symbol("hidden")]: true
    };
    await expect(
      runShuttergateAttempt(content, hiddenFieldRequest as never)
    ).rejects.toThrow("invalid fields");
  }, 300_000);
});
