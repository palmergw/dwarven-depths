import { describe, expect, it } from "vitest";
import { shieldSlamCanonicalEvidence } from "./active-ability.fixture.js";

const SHIELD_SLAM_CHECKSUM =
  "ce639fbd13904e1eb307eb9214de7f7a7e54210c39d5ba30c8f50a6cbc0bab78";

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
