import { describe, expect, it } from "vitest";
import { shieldSlamCanonicalEvidence } from "./active-ability.fixture.js";

const SHIELD_SLAM_CHECKSUM =
  "2b1fcf0e06b467c9aff7f6b8d10a315eac9c0e3bfa97bb5ba3347fcee353f78a";

describe("Shield Slam canonical Node parity", () => {
  it("matches the literal cross-engine checksum", async () => {
    expect((await shieldSlamCanonicalEvidence()).checksum).toBe(
      SHIELD_SLAM_CHECKSUM
    );
  });
});
