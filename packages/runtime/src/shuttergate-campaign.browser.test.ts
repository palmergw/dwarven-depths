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
    ).toBe("85ddd4788500f5e84b84b555275d308b4d6e9b6376359079bb1ee5a553ed023b");
    expect(
      await canonicalHash(
        createShuttergateCampaignCalibrationReport(third.authority)
      )
    ).toBe("0b467f42ab6f9e13a84b8dc7c41249f892e3d7a8f48ffc5ea87222efa4971375");
  }, 360_000);
});
