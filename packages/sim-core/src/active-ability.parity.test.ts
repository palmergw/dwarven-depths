import { describe, expect, it } from "vitest";
import { shieldSlamCanonicalEvidence } from "./active-ability.fixture.js";

const SHIELD_SLAM_CHECKSUM =
  "ce639fbd13904e1eb307eb9214de7f7a7e54210c39d5ba30c8f50a6cbc0bab78";

describe("Shield Slam canonical Node parity", () => {
  it("matches the literal cross-engine checksum", async () => {
    expect((await shieldSlamCanonicalEvidence()).checksum).toBe(
      SHIELD_SLAM_CHECKSUM
    );
  });
});
