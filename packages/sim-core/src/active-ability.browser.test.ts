import { describe, expect, it } from "vitest";
import { shieldSlamCanonicalEvidence } from "./active-ability.fixture.js";

const SHIELD_SLAM_CHECKSUM =
  "728e6ae46173ea362bfb18bd567cecadda09adeae8d92a6b3b02fdfb1aebabbd";

describe("Shield Slam canonical evidence", () => {
  it("pins the scripted command, impact, status, and battlefield checksum", async () => {
    const result = await shieldSlamCanonicalEvidence();
    expect(result.checksum).toBe(SHIELD_SLAM_CHECKSUM);
    expect(result.evidence.activation[0]?.reason).toBe("ability_committed");
    expect(result.evidence.impact[0]?.interruptedAttackIds).toEqual([
      "attack.instance.canonical_interrupted"
    ]);
  });
});
