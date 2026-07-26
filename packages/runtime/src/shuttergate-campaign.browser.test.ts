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

describe("authoritative Shuttergate campaign browser parity", () => {
  it("matches three literal campaign transitions", async () => {
    const content = await compileContent(shuttergateInput);
    const first = await runShuttergateCampaignTransition(
      content,
      createShuttergateCampaignAuthority()
    );
    const second = await runShuttergateCampaignTransition(
      content,
      first.authority
    );
    const third = await runShuttergateCampaignTransition(
      content,
      second.authority
    );

    expect(
      await canonicalHash({
        first: first.transition,
        second: second.transition,
        third: third.transition
      })
    ).toBe("59e18f5342df481a4c64db3f98ef7e764fe878f903afb7dafea180995832d14e");
    expect(
      await canonicalHash(
        createShuttergateCampaignCalibrationReport(third.authority)
      )
    ).toBe("f797acbc3a071e569a9ddbc3ee8e88808ef5889db13afa807e94e199deb27ced");
  }, 120_000);
});
