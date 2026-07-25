import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import {
  attemptProgressRewardParityEvidence,
  shuttergateAttemptRewardEvents,
  shuttergateAttemptRewardPolicy
} from "./attempt-progress-rewards.fixture.js";
import {
  createInitialAttemptRewardLedger,
  createInitialProfile,
  resolveAttemptProgressRewards
} from "./index.js";

const checksum =
  "ed32af16d6ac5e39fc57c2ca58e2ed8970d1d2b8d959d212e82ef3c985d4fe95";

describe("attempt progress rewards", () => {
  it("commits canonical kill and wave progress rewards exactly once", async () => {
    const evidence = attemptProgressRewardParityEvidence();

    expect(evidence.committed.profile).toMatchObject({
      revision: 1,
      forgeOre: 13,
      claimedRewardIds: [
        "reward.attempt.shuttergate.a0001",
        "reward.attempt.shuttergate.a0002"
      ]
    });
    expect(evidence.committed.ledger.claims).toHaveLength(2);
    expect(evidence.committed.decisions).toEqual([
      {
        schemaVersion: 1,
        rewardId: "reward.attempt.shuttergate.a0001",
        attemptId: "attempt.shuttergate.a0001",
        forgeOre: 6,
        status: "claimed",
        reason: "attempt_progress_reward_committed"
      },
      {
        schemaVersion: 1,
        rewardId: "reward.attempt.shuttergate.a0002",
        attemptId: "attempt.shuttergate.a0002",
        forgeOre: 7,
        status: "claimed",
        reason: "attempt_progress_reward_committed"
      }
    ]);
    expect(evidence.replayed.profile).toEqual(evidence.committed.profile);
    expect(evidence.replayed.ledger).toEqual(evidence.committed.ledger);
    expect(evidence.replayed.decisions[0]).toMatchObject({
      status: "already_claimed",
      reason: "attempt_progress_reward_previously_claimed",
      forgeOre: 0
    });
    expect(evidence.conflictingReplayError).toContain(
      "conflicts with claimed attempt evidence"
    );
    expect(await canonicalHash(evidence)).toBe(checksum);
  });

  it("is input-order independent, immutable, detached, and increments once", () => {
    const profile = createInitialProfile("character.iron_warden" as never);
    const ledger = createInitialAttemptRewardLedger();
    const request = {
      schemaVersion: 1 as const,
      profile,
      ledger,
      policy: shuttergateAttemptRewardPolicy,
      events: [...shuttergateAttemptRewardEvents].reverse()
    };
    const before = structuredClone(request);
    const reverse = resolveAttemptProgressRewards(request);
    const forward = resolveAttemptProgressRewards({
      ...request,
      events: shuttergateAttemptRewardEvents
    });

    expect(reverse).toEqual(forward);
    expect(reverse.profile.revision).toBe(1);
    expect(request).toEqual(before);
    expect(Object.isFrozen(reverse)).toBe(true);
    expect(Object.isFrozen(reverse.profile)).toBe(true);
    expect(Object.isFrozen(reverse.ledger)).toBe(true);
    expect(Object.isFrozen(reverse.ledger.claims)).toBe(true);
    expect(Object.isFrozen(reverse.ledger.claims[0])).toBe(true);
    expect(Object.isFrozen(reverse.decisions)).toBe(true);
  });

  it("rejects malformed progress, duplicate identities, substitution, and overflow atomically", () => {
    const profile = createInitialProfile("character.iron_warden" as never);
    const ledger = createInitialAttemptRewardLedger();
    const before = structuredClone({ profile, ledger });
    const resolve = (events: readonly unknown[], overrides = {}) =>
      resolveAttemptProgressRewards({
        schemaVersion: 1,
        profile,
        ledger,
        policy: shuttergateAttemptRewardPolicy,
        events,
        ...overrides
      } as never);

    expect(() =>
      resolve([
        shuttergateAttemptRewardEvents[0],
        shuttergateAttemptRewardEvents[0]
      ])
    ).toThrow("duplicate attempt reward ID");
    expect(() =>
      resolve([
        {
          ...shuttergateAttemptRewardEvents[0],
          levelId: "level.foreign" as never
        }
      ])
    ).toThrow("does not match reward policy level");
    expect(() =>
      resolve([
        {
          ...shuttergateAttemptRewardEvents[0],
          startedWaveIds: ["wave.shuttergate_2"]
        }
      ])
    ).toThrow("must be an authored wave prefix");
    expect(() =>
      resolve([
        {
          ...shuttergateAttemptRewardEvents[0],
          startedWaveIds: ["wave.shuttergate_1", "wave.shuttergate_1"]
        }
      ])
    ).toThrow("must be an authored wave prefix");
    expect(() =>
      resolve([
        {
          ...shuttergateAttemptRewardEvents[0],
          terminalResult: "victory"
        }
      ])
    ).toThrow("victorious attempt reward must include every authored wave");
    expect(() =>
      resolve(shuttergateAttemptRewardEvents, {
        profile: { ...profile, forgeOre: Number.MAX_SAFE_INTEGER }
      })
    ).toThrow("Forge Ore reward exceeds safe integer range");
    expect({ profile, ledger }).toEqual(before);
  });

  it("requires ledger and profile attempt ownership to agree", () => {
    const profile = createInitialProfile("character.iron_warden" as never);
    const ledger = createInitialAttemptRewardLedger();

    expect(() =>
      resolveAttemptProgressRewards({
        schemaVersion: 1,
        profile: {
          ...profile,
          claimedRewardIds: ["reward.attempt.shuttergate.a0001" as never]
        },
        ledger,
        policy: shuttergateAttemptRewardPolicy,
        events: []
      })
    ).toThrow("has no ledger evidence");

    const committed = resolveAttemptProgressRewards({
      schemaVersion: 1,
      profile,
      ledger,
      policy: shuttergateAttemptRewardPolicy,
      events: [shuttergateAttemptRewardEvents[0]]
    });
    expect(() =>
      resolveAttemptProgressRewards({
        schemaVersion: 1,
        profile,
        ledger: committed.ledger,
        policy: shuttergateAttemptRewardPolicy,
        events: []
      })
    ).toThrow("is not owned by the profile");
    const firstClaim = committed.ledger.claims[0];
    if (firstClaim === undefined)
      throw new Error("committed reward ledger must contain one claim");
    expect(() =>
      resolveAttemptProgressRewards({
        schemaVersion: 1,
        profile: committed.profile,
        ledger: {
          ...committed.ledger,
          claims: [
            {
              ...firstClaim,
              forgeOreAwarded: 999
            }
          ]
        },
        policy: shuttergateAttemptRewardPolicy,
        events: []
      })
    ).toThrow("Forge Ore does not match reward evidence");
  });
});
