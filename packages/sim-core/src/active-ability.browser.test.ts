import { describe, expect, it } from "vitest";
import { shieldSlamCanonicalEvidence } from "./active-ability.fixture.js";

const SHIELD_SLAM_CHECKSUM =
  "2b1fcf0e06b467c9aff7f6b8d10a315eac9c0e3bfa97bb5ba3347fcee353f78a";

describe("Shield Slam canonical evidence", () => {
  it("pins the scripted command, impact, status, and battlefield checksum", async () => {
    const result = await shieldSlamCanonicalEvidence();
    expect(result.checksum).toBe(SHIELD_SLAM_CHECKSUM);
    expect(result.evidence.events[0]).toMatchObject({
      type: "ability.activation.accepted",
      reasonCode: "ability_committed"
    });
    expect(
      result.evidence.events.find(({ type }) => type === "ability.impact")
    ).toMatchObject({
      interruptedAttackIds: ["attack.instance.canonical_interrupted"]
    });
  });
});
