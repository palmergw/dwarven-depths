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

  it("serializes the calibrated deeper push and victory route", async () => {
    const content = await compileContent(shuttergateInput);
    let authority = createShuttergateCampaignAuthority();
    const attempts = [];
    for (let index = 0; index < 4; index += 1) {
      const result = await runShuttergateCampaignTransition(content, authority);
      authority = result.authority;
      attempts.push(await createShuttergateAttemptTelemetry(result.transition));
    }

    expect(attempts[2]?.payload).toMatchObject({
      attemptId: "attempt.shuttergate.campaign_000003",
      placementPointId: "placement.shuttergate_north_guard",
      outcome: {
        terminalResult: "defeat",
        terminalReason: "all_dwarves_downed"
      },
      rewards: {
        bossRewardClaimed: true,
        unlockedCharacterIds: ["character.deep_ranger"]
      }
    });
    expect(attempts[3]?.payload).toMatchObject({
      attemptId: "attempt.shuttergate.campaign_000004",
      placementPointId: "placement.shuttergate_keep_guard",
      outcome: {
        terminalResult: "victory",
        terminalReason: "victory_conditions_met"
      },
      rewards: {
        bossRewardClaimed: true,
        unlockedCharacterIds: ["character.deep_ranger"]
      }
    });
    await expect(
      Promise.all(
        attempts.map((attempt) => requireShuttergateAttemptTelemetry(attempt))
      )
    ).resolves.toEqual(attempts);
    const third = attempts[2];
    const fourth = attempts[3];
    if (third === undefined || fourth === undefined)
      throw new Error("missing calibrated telemetry");
    for (const [telemetry, payload] of [
      [
        third,
        {
          ...third.payload,
          rewards: {
            ...third.payload.rewards,
            bossRewardClaimed: false,
            unlockedCharacterIds: []
          }
        }
      ],
      [
        fourth,
        {
          ...fourth.payload,
          placementPointId: "placement.shuttergate_north_guard"
        }
      ]
    ] as const) {
      await expect(
        requireShuttergateAttemptTelemetry({
          ...telemetry,
          payload,
          payloadChecksum: await canonicalHash(payload)
        })
      ).rejects.toThrow("contradict");
    }
  }, 180_000);

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
        waveTransitions: [
          telemetry.payload.waveTransitions[0],
          { ...telemetry.payload.waveTransitions[0], tick: 1 },
          ...telemetry.payload.waveTransitions.slice(1)
        ]
      },
      {
        ...telemetry.payload,
        waveTransitions: [
          telemetry.payload.waveTransitions[0],
          telemetry.payload.waveTransitions.at(-1)
        ]
      },
      {
        ...telemetry.payload,
        waveTransitions: telemetry.payload.waveTransitions.map(
          (transition, index) =>
            index === 0 ? { ...transition, startedWaveIds: [] } : transition
        )
      },
      {
        ...telemetry.payload,
        outcome: { ...telemetry.payload.outcome, durationTicks: 3 },
        waveTransitions: telemetry.payload.waveTransitions.map(
          (transition, index) => ({ ...transition, tick: index })
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
