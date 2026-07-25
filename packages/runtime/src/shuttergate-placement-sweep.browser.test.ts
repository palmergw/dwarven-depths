import { compileContent } from "@dwarven-depths/content-runtime";
import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import shuttergateInput from "../../../content/fixtures/phase-3-shuttergate.json" with {
  type: "json"
};
import { runShuttergateSeedPlacementControllerCalibration } from "./shuttergate-reference-calibration.js";

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
});
