import type { StableId } from "@dwarven-depths/contracts";
import {
  createInitialProfile,
  type ProfileState
} from "@dwarven-depths/progression";
import {
  createProfileSaveEnvelope,
  type ProfileSaveEnvelope
} from "@dwarven-depths/save";
import {
  type IndexedDbProfileLoadResult,
  IndexedDbProfileStore,
  IndexedDbProfileStoreError,
  type IndexedDbProfileWriteRequest
} from "@dwarven-depths/save/indexed-db";

const databaseName = "dwarven-depths-profile-v1";
const profileId = "profile.local";
const initialCharacterId = "character.iron_warden" as StableId;

export interface CheckpointProfileStore {
  load(profileId: string): Promise<IndexedDbProfileLoadResult>;
  write(request: IndexedDbProfileWriteRequest): Promise<ProfileSaveEnvelope>;
  close(): Promise<void>;
}

export type CheckpointProfileResult =
  | { readonly status: "ready"; readonly profile: ProfileState }
  | { readonly status: "unavailable"; readonly message: string };

export function createCheckpointProfileStore(): CheckpointProfileStore {
  return new IndexedDbProfileStore(databaseName);
}

async function initialEnvelope(
  now: () => number
): Promise<ProfileSaveEnvelope> {
  return createProfileSaveEnvelope({
    contentVersion: "content.empty-level.v1",
    applicationBuild: "phase-5-web",
    writtenAtEpochMs: now(),
    profileId,
    profile: createInitialProfile(initialCharacterId)
  });
}

export async function loadCheckpointProfile(
  store: CheckpointProfileStore,
  now: () => number = Date.now
): Promise<CheckpointProfileResult> {
  try {
    const loaded = await store.load(profileId);
    if (loaded.status === "loaded")
      return { status: "ready", profile: loaded.envelope.profile };

    try {
      const envelope = await store.write({
        expectedRevision: null,
        envelope: await initialEnvelope(now)
      });
      return { status: "ready", profile: envelope.profile };
    } catch (error) {
      if (
        error instanceof IndexedDbProfileStoreError &&
        error.code === "save_conflict"
      ) {
        const concurrent = await store.load(profileId);
        if (concurrent.status === "loaded")
          return { status: "ready", profile: concurrent.envelope.profile };
      }
      throw error;
    }
  } catch (error) {
    const corrupt =
      error instanceof IndexedDbProfileStoreError &&
      error.code === "save_corrupt";
    return {
      status: "unavailable",
      message: corrupt
        ? "Progression save is corrupt and was preserved without changes."
        : "Local progression storage is unavailable. You can still run the conformance level."
    };
  } finally {
    try {
      await store.close();
    } catch {
      // Loading has already produced the user-visible storage result.
    }
  }
}
