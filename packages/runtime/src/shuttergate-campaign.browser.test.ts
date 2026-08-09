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
    ).toBe("bb17425bfece0b62e66411c10b600860d21c333f052a0477d7e7ef3f3bf4a788");
    expect(
      await canonicalHash(
        createShuttergateCampaignCalibrationReport(third.authority)
      )
    ).toBe("596e800356cb70b746e66cb468e00ac0016dc4ebbf9c3cd8a7b3394ca1bb693c");
  }, 360_000);
});
