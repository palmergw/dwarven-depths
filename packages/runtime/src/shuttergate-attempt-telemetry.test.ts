import { compileContent } from "@dwarven-depths/content-runtime";
import { describe, expect, it } from "vitest";
import shuttergateInput from "../../../content/fixtures/phase-3-shuttergate.json" with {
  type: "json"
};
import {
  createShuttergateAttemptTelemetry,
  requireShuttergateAttemptTelemetry,
  serializeShuttergateAttemptTelemetry
} from "./shuttergate-attempt-telemetry.js";
import {
  createShuttergateCampaignAuthority,
  runShuttergateCampaignTransition
} from "./shuttergate-campaign.js";

async function createTelemetry() {
  const content = await compileContent(shuttergateInput);
  const attempt = await runShuttergateCampaignTransition(
    content,
    createShuttergateCampaignAuthority()
  );
  return createShuttergateAttemptTelemetry(attempt.transition);
}

describe("local Shuttergate attempt telemetry", () => {
  it("serializes deterministic authoritative attempt and reward evidence", async () => {
    const first = await createTelemetry();
    const second = await createTelemetry();

    expect(serializeShuttergateAttemptTelemetry(first)).toBe(
      serializeShuttergateAttemptTelemetry(second)
    );
    expect(first).toMatchObject({
      schemaVersion: 1,
      telemetryId: "telemetry.shuttergate.attempt.v1",
      payload: {
        attemptId: "attempt.shuttergate.campaign_000001",
        seed: "1",
        levelId: "level.shuttergate_hall",
        placementPointId: "placement.shuttergate_north_guard",
        targetPolicy: "nearest",
        build: {
          buildId: "build.profile.new_campaign.v1",
          roster: [
            {
              characterId: "character.iron_warden",
              entityId: "entity.dwarf.warden",
              purchasedUpgradeIds: []
            }
          ]
        },
        outcome: {
          terminalResult: "defeat",
          terminalReason: "all_dwarves_downed"
        },
        rewards: { experienceAwarded: 0 }
      },
      payloadChecksum:
        "9fa6c4b07b5fdd77e2bc93aa5d99219dda26665ac28b98a3c3a618d52d2c86fc"
    });
    expect(first.payload.waveTransitions.length).toBeGreaterThan(1);
    expect(first.payload.rewards.forgeOreAwarded).toBeGreaterThan(0);
    expect(
      await requireShuttergateAttemptTelemetry(
        JSON.parse(serializeShuttergateAttemptTelemetry(first))
      )
    ).toEqual(first);
  }, 45_000);

  it("rejects extra fields and checksum tampering", async () => {
    const telemetry = await createTelemetry();
    await expect(
      requireShuttergateAttemptTelemetry({ ...telemetry, unexpected: true })
    ).rejects.toThrow("invalid fields");
    await expect(
      requireShuttergateAttemptTelemetry({
        ...telemetry,
        payload: {
          ...telemetry.payload,
          combat: { ...telemetry.payload.combat, defeatedEnemies: 999 }
        }
      })
    ).rejects.toThrow("checksum mismatch");
  }, 45_000);
});
