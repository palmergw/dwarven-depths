import { compileContent } from "@dwarven-depths/content-runtime";
import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import shuttergateInput from "../../../content/fixtures/phase-3-shuttergate.json" with {
  type: "json"
};
import {
  runShuttergateSeedPlacementControllerBuildCalibration,
  runShuttergateSeedPlacementControllerCalibration
} from "./shuttergate-reference-calibration.js";

describe("Shuttergate placement-sweep browser parity", () => {
  it("matches the Node seed, placement, and controller checksum", async () => {
    const content = await compileContent(shuttergateInput);
    const evidence = await runShuttergateSeedPlacementControllerCalibration(
      content,
      "2",
      "placement.shuttergate_north_guard" as never,
      "lowest_health"
    );

    expect(evidence.targetPolicy).toBe("lowest_health");
    expect(await canonicalHash(evidence)).toBe(
      "fd786ee88285806c4fc9758602deceb9b5b5874ad18f672f033c9588e501bd88"
    );
  }, 60_000);

  it("matches the Node purchased-build checksum", async () => {
    const content = await compileContent(shuttergateInput);
    const evidence =
      await runShuttergateSeedPlacementControllerBuildCalibration(
        content,
        "2",
        "placement.shuttergate_north_guard" as never,
        "nearest",
        "build.warden.shield_slam_rank_1.v1"
      );

    expect(evidence.deployedWardenMaximumHealth).toBe(260);
    expect(evidence.deployedWardenAttackDamage).toBe(20);
    expect(await canonicalHash(evidence)).toBe(
      "58e6f8047ccf310e4a80d3110e1b6e761508169b0447483488f5e679c778154f"
    );
  }, 60_000);
});
