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
    ).toBe("50fe1e71ecb2379b977bf13505ebc77c3788e9f1f60939ded0dca2dad7e1c070");
    expect(
      await canonicalHash(
        createShuttergateCampaignCalibrationReport(third.authority)
      )
    ).toBe("f797acbc3a071e569a9ddbc3ee8e88808ef5889db13afa807e94e199deb27ced");
  }, 120_000);
});
