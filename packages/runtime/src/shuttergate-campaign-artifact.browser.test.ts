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
import {
  createShuttergateCampaignArtifact,
  restoreShuttergateCampaignArtifact
} from "./shuttergate-campaign-artifact.js";

describe("durable Shuttergate campaign artifact browser parity", () => {
  it("matches literal handoff and continuation evidence", async () => {
    const content = await compileContent(shuttergateInput);
    const first = await runShuttergateCampaignTransition(
      content,
      createShuttergateCampaignAuthority()
    );
    const artifact = await createShuttergateCampaignArtifact({
      schemaVersion: 1,
      content,
      authority: first.authority,
      applicationBuild: "test-build-141",
      writtenAtEpochMs: 1_721_900_000_000,
      profileId: "profile.local"
    });
    const restored = await restoreShuttergateCampaignArtifact(
      content,
      artifact
    );
    const continued = await runShuttergateCampaignTransition(content, restored);

    expect(
      await canonicalHash({
        artifact,
        continued: continued.transition
      })
    ).toBe("64e53a47c8a06d93c431218c3a5d4ca361ddf079264d25a245624df868f836a4");
  }, 120_000);
});
