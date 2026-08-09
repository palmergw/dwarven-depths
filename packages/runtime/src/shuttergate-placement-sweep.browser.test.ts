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
      "58e799fb40ee20696d00b3f4fad973f1987a01ece38645f5127f8ea55d41bcb2"
    );
  }, 120_000);

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

    expect(evidence.deployedWardenMaximumHealth).toBe(1000);
    expect(evidence.deployedWardenAttackDamage).toBe(20);
    expect(await canonicalHash(evidence)).toBe(
      "f58bc024c5f583593bd2eb434b04bac0abf093d92b2c7870435d02f5595ee42e"
    );
  }, 300_000);
});
