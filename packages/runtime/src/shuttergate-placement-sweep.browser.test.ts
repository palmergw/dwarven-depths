import { compileContent } from "@dwarven-depths/content-runtime";
import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import shuttergateInput from "../../../content/fixtures/phase-3-shuttergate.json" with {
  type: "json"
};
import { runShuttergateSeedPlacementCalibration } from "./shuttergate-reference-calibration.js";

describe("Shuttergate placement-sweep browser parity", () => {
  it("matches the Node seed and placement checksum", async () => {
    const content = await compileContent(shuttergateInput);
    const evidence = await runShuttergateSeedPlacementCalibration(
      content,
      "2",
      "placement.shuttergate_north_guard" as never
    );

    expect(await canonicalHash(evidence)).toBe(
      "bf26805308945fb816d41eb9fda570bb55c57517ed513be3d63e2b8f5e973314"
    );
  }, 30_000);
});
