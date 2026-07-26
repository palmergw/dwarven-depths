import { describe, expect, it } from "vitest";
import { shieldSlamCanonicalEvidence } from "./active-ability.fixture.js";

const SHIELD_SLAM_CHECKSUM =
  "bcb07abf1be4f191561bc5ca0c7aecb721cec4479b0c4b6e2c566d54c6932aa0";

describe("Shield Slam canonical Node parity", () => {
  it("matches the literal cross-engine checksum", async () => {
    expect((await shieldSlamCanonicalEvidence()).checksum).toBe(
      SHIELD_SLAM_CHECKSUM
    );
  });
});
