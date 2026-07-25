import { compileContent } from "@dwarven-depths/content-runtime";
import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import shuttergateInput from "../../../content/fixtures/phase-3-shuttergate.json" with {
  type: "json"
};
import {
  createShuttergateCampaignAuthority,
  runShuttergateCampaignTransition
} from "./shuttergate-campaign.js";
import { createShuttergateCampaignCalibrationReport } from "./shuttergate-campaign-calibration.js";

describe("Shuttergate campaign calibration browser parity", () => {
  it("matches the literal three-attempt report", async () => {
    const content = await compileContent(shuttergateInput);
    let authority = createShuttergateCampaignAuthority();
    for (let index = 0; index < 3; index += 1) {
      authority = (await runShuttergateCampaignTransition(content, authority))
        .authority;
    }
    const report = createShuttergateCampaignCalibrationReport(authority);

    expect(report.comparison?.observation).toBe("survived_longer");
    expect(await canonicalHash(report)).toBe(
      "f797acbc3a071e569a9ddbc3ee8e88808ef5889db13afa807e94e199deb27ced"
    );
  }, 120_000);
});
