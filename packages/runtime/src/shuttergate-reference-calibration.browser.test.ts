import { compileContent } from "@dwarven-depths/content-runtime";
import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import shuttergateInput from "../../../content/fixtures/phase-3-shuttergate.json" with {
  type: "json"
};
import { runShuttergateReferenceCalibration } from "./shuttergate-reference-calibration.js";

const expectedChecksum =
  "4076169e8e506f82e5e1825ecd5a9cab210245a053edf7ebc12a0475ba4dd669";

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
  }, 60_000);
});
