import {
  createInitialProfile,
  normalizeProfileState
} from "@dwarven-depths/progression";
import type { ProfileSaveEnvelope } from "@dwarven-depths/save";
import {
  type IndexedDbProfileLoadResult,
  IndexedDbProfileStoreError,
  type IndexedDbProfileWriteRequest
} from "@dwarven-depths/save/indexed-db";
import { describe, expect, it, vi } from "vitest";
import {
  applyCheckpointAttemptResult,
  type CheckpointProfileStore,
  loadCheckpointProfile
} from "./checkpoint-profile.js";

class MemoryProfileStore implements CheckpointProfileStore {
  envelope: ProfileSaveEnvelope | undefined;
  writes = 0;
  closed = false;

  async load(): Promise<IndexedDbProfileLoadResult> {
    return this.envelope === undefined
      ? { status: "empty" }
      : {
          status: "loaded",
          source: "primary",
          envelope: this.envelope,
          migratedFromSchemaVersion: null
        };
  }

  async write(
    request: IndexedDbProfileWriteRequest
  ): Promise<ProfileSaveEnvelope> {
    const currentRevision = this.envelope?.profile.revision ?? null;
    if (request.expectedRevision !== currentRevision)
      throw new IndexedDbProfileStoreError("save_conflict", "already exists");
    this.writes += 1;
    this.envelope = request.envelope as ProfileSaveEnvelope;
    return this.envelope;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

describe("checkpoint profile loading", () => {
  it("creates the canonical profile once and reloads the persisted summary", async () => {
    const store = new MemoryProfileStore();
    const created = await loadCheckpointProfile(store, () => 1_725_000_000_000);

    expect(created).toMatchObject({
      status: "ready",
      profile: {
        revision: 0,
        forgeOre: 0,
        unlockedCharacterIds: ["character.iron_warden"]
      }
    });
    expect(store.writes).toBe(1);
    expect(store.closed).toBe(true);

    store.closed = false;
    const reloaded = await loadCheckpointProfile(store, () => {
      throw new Error("reload must not create another envelope");
    });
    expect(reloaded).toEqual(created);
    expect(store.writes).toBe(1);
    expect(store.closed).toBe(true);
  });

  it("preserves a corrupt profile without attempting a write", async () => {
    const write = vi.fn();
    const store: CheckpointProfileStore = {
      load: async () => {
        throw new IndexedDbProfileStoreError(
          "save_corrupt",
          "invalid envelope"
        );
      },
      write,
      close: async () => undefined
    };

    await expect(loadCheckpointProfile(store)).resolves.toEqual({
      status: "unavailable",
      message: "Progression save is corrupt and was preserved without changes."
    });
    expect(write).not.toHaveBeenCalled();
  });

  it("reports unavailable storage without blocking the checkpoint", async () => {
    const store: CheckpointProfileStore = {
      load: async () => {
        throw new IndexedDbProfileStoreError(
          "storage_unavailable",
          "IndexedDB unavailable"
        );
      },
      write: vi.fn(),
      close: async () => undefined
    };

    await expect(loadCheckpointProfile(store)).resolves.toEqual({
      status: "unavailable",
      message:
        "Local progression storage is unavailable. You can still enter Shuttergate."
    });
  });

  it("persists one authoritative reward idempotently after later progression", async () => {
    const store = new MemoryProfileStore();
    const initial = createInitialProfile("character.iron_warden" as never);
    await loadCheckpointProfile(store, () => 1_725_000_000_000, false);
    const rewardId = "reward.attempt.shuttergate.web_000001";
    const rewarded = normalizeProfileState({
      ...initial,
      revision: 1,
      forgeOre: 8,
      claimedRewardIds: [rewardId]
    });
    const campaign = {
      schemaVersion: 1 as const,
      attemptId: "attempt.shuttergate.web_000001",
      rewardId,
      forgeOreAwarded: 8,
      profile: rewarded
    };

    await expect(
      applyCheckpointAttemptResult(
        store,
        initial,
        campaign,
        () => 1_725_000_000_001
      )
    ).resolves.toEqual(rewarded);
    await expect(
      applyCheckpointAttemptResult(
        store,
        initial,
        campaign,
        () => 1_725_000_000_002
      )
    ).resolves.toEqual(rewarded);
    await expect(
      loadCheckpointProfile(store, Date.now, false)
    ).resolves.toEqual({
      status: "ready",
      profile: rewarded
    });
    expect(store.writes).toBe(2);

    if (store.envelope === undefined)
      throw new Error("missing rewarded profile envelope");
    const laterRewardId = "reward.attempt.shuttergate.web_000002";
    const progressed = normalizeProfileState({
      ...rewarded,
      revision: 3,
      forgeOre: 6,
      claimedRewardIds: [rewardId, laterRewardId],
      purchasedUpgrades: [
        {
          schemaVersion: 1,
          upgradeId: "upgrade.ability.shield_slam",
          rank: 1,
          forgeOreSpent: 10
        }
      ]
    });
    store.envelope = {
      ...store.envelope,
      profile: progressed
    };
    await expect(
      applyCheckpointAttemptResult(
        store,
        initial,
        campaign,
        () => 1_725_000_000_003
      )
    ).resolves.toEqual(progressed);
    expect(store.writes).toBe(2);

    await expect(
      applyCheckpointAttemptResult(store, rewarded, {
        ...campaign,
        attemptId: "attempt.shuttergate.web_000002",
        rewardId: "reward.attempt.shuttergate.web_000002",
        profile: normalizeProfileState({
          ...rewarded,
          revision: 2,
          forgeOre: 16,
          claimedRewardIds: [
            ...rewarded.claimedRewardIds,
            "reward.attempt.shuttergate.web_000002"
          ],
          unlockedItemIds: ["item.powder_cask"]
        })
      })
    ).rejects.toThrow("contradicts the profile");
    expect(store.writes).toBe(2);
  });

  it("merges an authoritative reward onto a concurrent profile revision", async () => {
    const store = new MemoryProfileStore();
    const initial = createInitialProfile("character.iron_warden" as never);
    await loadCheckpointProfile(store, () => 1_725_000_000_000, false);
    if (store.envelope === undefined)
      throw new Error("missing profile envelope");
    const concurrent = normalizeProfileState({
      ...initial,
      revision: 1,
      unlockedItemIds: ["item.powder_cask"]
    });
    store.envelope = { ...store.envelope, profile: concurrent };
    const rewardId = "reward.attempt.shuttergate.web_000001";
    const authoritative = normalizeProfileState({
      ...initial,
      revision: 1,
      forgeOre: 8,
      claimedRewardIds: [rewardId]
    });

    await expect(
      applyCheckpointAttemptResult(
        store,
        initial,
        {
          schemaVersion: 1,
          attemptId: "attempt.shuttergate.web_000001",
          rewardId,
          forgeOreAwarded: 8,
          profile: authoritative
        },
        () => 1_725_000_000_001
      )
    ).resolves.toMatchObject({
      revision: 2,
      forgeOre: 8,
      unlockedItemIds: ["item.powder_cask"],
      claimedRewardIds: [rewardId]
    });
  });

  it("does not duplicate a concurrently claimed boss reward", async () => {
    const store = new MemoryProfileStore();
    const initial = createInitialProfile("character.iron_warden" as never);
    await loadCheckpointProfile(store, () => 1_725_000_000_000, false);
    if (store.envelope === undefined)
      throw new Error("missing profile envelope");
    const bossRewardId = "reward.boss.gatebreaker_captain";
    const concurrent = normalizeProfileState({
      ...initial,
      revision: 1,
      forgeOre: 20,
      claimedRewardIds: [bossRewardId],
      unlockedCharacterIds: ["character.deep_ranger", "character.iron_warden"]
    });
    store.envelope = { ...store.envelope, profile: concurrent };
    const rewardId = "reward.attempt.shuttergate.web_000001";
    const authoritative = normalizeProfileState({
      ...initial,
      revision: 2,
      forgeOre: 48,
      claimedRewardIds: [rewardId, bossRewardId],
      unlockedCharacterIds: ["character.deep_ranger", "character.iron_warden"]
    });

    await expect(
      applyCheckpointAttemptResult(store, initial, {
        schemaVersion: 1,
        attemptId: "attempt.shuttergate.web_000001",
        rewardId,
        forgeOreAwarded: 48,
        profile: authoritative
      })
    ).resolves.toMatchObject({
      revision: 2,
      forgeOre: 48,
      claimedRewardIds: [rewardId, bossRewardId],
      unlockedCharacterIds: ["character.deep_ranger", "character.iron_warden"]
    });
  });

  it("merges boss and victory claims after the attempt reward races", async () => {
    const store = new MemoryProfileStore();
    const initial = createInitialProfile("character.iron_warden" as never);
    await loadCheckpointProfile(store, () => 1_725_000_000_000, false);
    if (store.envelope === undefined)
      throw new Error("missing profile envelope");
    const rewardId = "reward.attempt.shuttergate.web_000001";
    store.envelope = {
      ...store.envelope,
      profile: normalizeProfileState({
        ...initial,
        revision: 1,
        forgeOre: 8,
        claimedRewardIds: [rewardId]
      })
    };
    const authoritative = normalizeProfileState({
      ...initial,
      revision: 3,
      forgeOre: 28,
      claimedRewardIds: [
        rewardId,
        "reward.boss.gatebreaker_captain",
        "reward.campaign.shuttergate.victory"
      ],
      unlockedCharacterIds: ["character.deep_ranger", "character.iron_warden"]
    });

    await expect(
      applyCheckpointAttemptResult(store, initial, {
        schemaVersion: 1,
        attemptId: "attempt.shuttergate.web_000001",
        rewardId,
        forgeOreAwarded: 28,
        profile: authoritative
      })
    ).resolves.toMatchObject({
      revision: 3,
      forgeOre: 28,
      claimedRewardIds: [
        rewardId,
        "reward.boss.gatebreaker_captain",
        "reward.campaign.shuttergate.victory"
      ],
      unlockedCharacterIds: ["character.deep_ranger", "character.iron_warden"]
    });
  });
});
