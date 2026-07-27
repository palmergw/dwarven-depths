import { compileContent } from "@dwarven-depths/content-runtime";
import { canonicalHash } from "@dwarven-depths/contracts";
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
        }
      },
      payloadChecksum:
        "665e6c83534e7078f1a3a0ea0e5392bd3da95c2a4dbae94f330f978ca3f8555c"
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
        payloadChecksum: "0".repeat(64)
      })
    ).rejects.toThrow("checksum mismatch");
  }, 45_000);

  it("rejects rechecksummed semantic contradictions", async () => {
    const telemetry = await createTelemetry();
    for (const payload of [
      { ...telemetry.payload, targetPolicy: "not_a_policy" },
      {
        ...telemetry.payload,
        outcome: { ...telemetry.payload.outcome, terminalResult: "victory" }
      },
      {
        ...telemetry.payload,
        rewards: {
          forgeOreAwarded: 999,
          bossRewardClaimed: true,
          unlockedCharacterIds: ["character.deep_ranger"]
        }
      },
      {
        ...telemetry.payload,
        waveTransitions: telemetry.payload.waveTransitions.map(
          (transition, index) =>
            index === 0
              ? { ...transition, firedSpawns: 1, livingEnemies: 101 }
              : transition
        )
      },
      {
        ...telemetry.payload,
        waveTransitions: telemetry.payload.waveTransitions.map(
          (transition, index) =>
            index === 1 ? { ...transition, wardenHealth: 241 } : transition
        )
      },
      {
        ...telemetry.payload,
        combat: {
          ...telemetry.payload.combat,
          defeatedEnemies: 999,
          wardenLifecycle: "downed",
          wardenHealth: 7
        }
      }
    ]) {
      await expect(
        requireShuttergateAttemptTelemetry({
          ...telemetry,
          payload,
          payloadChecksum: await canonicalHash(payload)
        })
      ).rejects.toThrow(/unsupported|contradict|monotonic/);
    }
  }, 45_000);
});
