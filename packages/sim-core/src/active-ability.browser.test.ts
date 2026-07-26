import { describe, expect, it } from "vitest";
import { shieldSlamCanonicalEvidence } from "./active-ability.fixture.js";

const SHIELD_SLAM_CHECKSUM =
  "bcb07abf1be4f191561bc5ca0c7aecb721cec4479b0c4b6e2c566d54c6932aa0";

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
