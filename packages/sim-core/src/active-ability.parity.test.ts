import { describe, expect, it } from "vitest";
import { shieldSlamCanonicalEvidence } from "./active-ability.fixture.js";

const SHIELD_SLAM_CHECKSUM =
  "728e6ae46173ea362bfb18bd567cecadda09adeae8d92a6b3b02fdfb1aebabbd";

describe("Shield Slam canonical Node parity", () => {
  it("matches the literal cross-engine checksum", async () => {
    expect((await shieldSlamCanonicalEvidence()).checksum).toBe(
      SHIELD_SLAM_CHECKSUM
    );
  });
});
