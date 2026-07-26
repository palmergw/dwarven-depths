import type { ProfileSaveEnvelope } from "@dwarven-depths/save";
import {
  type IndexedDbProfileLoadResult,
  IndexedDbProfileStoreError,
  type IndexedDbProfileWriteRequest
} from "@dwarven-depths/save/indexed-db";
import { describe, expect, it, vi } from "vitest";
import {
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
    if (this.envelope !== undefined)
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
        "Local progression storage is unavailable. You can still run the conformance level."
    });
  });
});
