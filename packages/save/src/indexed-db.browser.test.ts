import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import {
  IndexedDbProfileStore,
  IndexedDbProfileStoreError
} from "./indexed-db.js";
import { createProfileSaveEnvelope } from "./profile-save.js";
import { migrateProfileSaveEnvelope } from "./profile-save-migration.js";
import { historicalProfileSaveV0Fixture } from "./profile-save-v0.fixture.js";

const migratedChecksum =
  "ea30204f2e5898aa0bce86fc470d3691b3e203079b2e6c30ae396cf81d049121";

function databaseName(testName: string): string {
  return `dwarven-depths-${testName}-${crypto.randomUUID()}`;
}

function openRawDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("profiles"))
        request.result.createObjectStore("profiles");
      if (!request.result.objectStoreNames.contains("profile-backups"))
        request.result.createObjectStore("profile-backups");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function rawPut(
  databaseNameValue: string,
  storeName: "profiles" | "profile-backups",
  key: string,
  value: unknown
): Promise<void> {
  const database = await openRawDatabase(databaseNameValue);
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
}

async function rawGet(
  databaseNameValue: string,
  storeName: "profiles" | "profile-backups",
  key: string
): Promise<unknown> {
  const database = await openRawDatabase(databaseNameValue);
  const transaction = database.transaction(storeName, "readonly");
  const request = transaction.objectStore(storeName).get(key);
  const value = await new Promise<unknown>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
  return value;
}

async function deleteDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database deletion blocked"));
  });
}

describe("IndexedDB profile store", () => {
  it("creates, loads, and compare-and-swap updates a current profile", async () => {
    const name = databaseName("write");
    const store = new IndexedDbProfileStore(name);
    try {
      expect(await store.load("profile.local")).toEqual({ status: "empty" });
      const migrated = await migrateProfileSaveEnvelope(
        structuredClone(historicalProfileSaveV0Fixture)
      );
      await store.write({
        expectedRevision: null,
        envelope: migrated.envelope
      });
      expect(await store.load("profile.local")).toEqual({
        status: "loaded",
        source: "primary",
        envelope: migrated.envelope,
        migratedFromSchemaVersion: null
      });

      const next = await createProfileSaveEnvelope({
        contentVersion: migrated.envelope.contentVersion,
        applicationBuild: "test-build-2",
        writtenAtEpochMs: migrated.envelope.writtenAtEpochMs + 1,
        profileId: migrated.envelope.profileId,
        profile: {
          ...migrated.envelope.profile,
          revision: 3,
          forgeOre: 36
        }
      });
      await expect(
        store.write({ expectedRevision: 1, envelope: next })
      ).rejects.toMatchObject({ code: "save_conflict" });
      await expect(
        store.write({
          expectedRevision: 2,
          envelope: migrated.envelope
        })
      ).rejects.toMatchObject({ code: "save_conflict" });
      await store.write({ expectedRevision: 2, envelope: next });
      expect(await store.load("profile.local")).toMatchObject({
        status: "loaded",
        envelope: { profileRevision: 3 }
      });

      const contenders = await Promise.all(
        [37, 38].map((forgeOre) =>
          createProfileSaveEnvelope({
            contentVersion: next.contentVersion,
            applicationBuild: `test-build-${String(forgeOre)}`,
            writtenAtEpochMs: next.writtenAtEpochMs + forgeOre,
            profileId: next.profileId,
            profile: { ...next.profile, revision: 4, forgeOre }
          })
        )
      );
      const outcomes = await Promise.allSettled(
        contenders.map((envelope) =>
          store.write({ expectedRevision: 3, envelope })
        )
      );
      expect(
        outcomes.filter((outcome) => outcome.status === "fulfilled")
      ).toHaveLength(1);
      const rejected = outcomes.find(
        (outcome) => outcome.status === "rejected"
      );
      expect(rejected).toMatchObject({
        status: "rejected",
        reason: { code: "save_conflict" }
      });
      const final = await store.load("profile.local");
      if (final.status !== "loaded") throw new Error("expected current save");
      expect(contenders).toContainEqual(final.envelope);
    } finally {
      await store.close();
      await deleteDatabase(name);
    }
  });

  it("atomically migrates schema 0 and retains the exact historical backup", async () => {
    const name = databaseName("migration");
    await rawPut(
      name,
      "profiles",
      "profile.local",
      structuredClone(historicalProfileSaveV0Fixture)
    );
    const store = new IndexedDbProfileStore(name);
    try {
      const loaded = await store.load("profile.local");
      expect(loaded).toMatchObject({
        status: "loaded",
        source: "primary",
        migratedFromSchemaVersion: 0
      });
      if (loaded.status !== "loaded") throw new Error("expected migrated save");
      expect(await canonicalHash(loaded.envelope)).toBe(migratedChecksum);
      expect(await store.loadBackup("profile.local")).toMatchObject({
        status: "loaded",
        source: "backup",
        migratedFromSchemaVersion: 0,
        envelope: { profileRevision: 2 }
      });
      expect(await rawGet(name, "profile-backups", "profile.local")).toEqual(
        historicalProfileSaveV0Fixture
      );
      expect(await store.load("profile.local")).toMatchObject({
        status: "loaded",
        migratedFromSchemaVersion: null
      });
    } finally {
      await store.close();
      await deleteDatabase(name);
    }
  });

  it("aborts an interrupted migration and retries without partial state", async () => {
    const name = databaseName("interrupted-migration");
    await rawPut(
      name,
      "profiles",
      "profile.local",
      structuredClone(historicalProfileSaveV0Fixture)
    );
    const interrupted = new IndexedDbProfileStore(name, {
      injectFault(point) {
        if (point === "during_migration_before_commit")
          throw new Error("injected migration interruption");
      }
    });
    try {
      await expect(interrupted.load("profile.local")).rejects.toThrow(
        "injected migration interruption"
      );
      expect(await rawGet(name, "profiles", "profile.local")).toEqual(
        historicalProfileSaveV0Fixture
      );
      expect(
        await rawGet(name, "profile-backups", "profile.local")
      ).toBeUndefined();
    } finally {
      await interrupted.close();
    }

    const retry = new IndexedDbProfileStore(name);
    try {
      expect(await retry.load("profile.local")).toMatchObject({
        status: "loaded",
        migratedFromSchemaVersion: 0
      });
    } finally {
      await retry.close();
      await deleteDatabase(name);
    }
  });

  it("does not overwrite corrupt or unsupported newer primary data", async () => {
    for (const [label, value] of [
      [
        "corrupt",
        {
          ...structuredClone(historicalProfileSaveV0Fixture),
          payloadChecksum: "0".repeat(64)
        }
      ],
      ["newer", { schemaVersion: 2, opaqueFutureData: true }]
    ] as const) {
      const name = databaseName(label);
      await rawPut(name, "profiles", "profile.local", value);
      const store = new IndexedDbProfileStore(name);
      try {
        await expect(store.load("profile.local")).rejects.toBeInstanceOf(
          IndexedDbProfileStoreError
        );
        expect(await rawGet(name, "profiles", "profile.local")).toEqual(value);
        expect(
          await rawGet(name, "profile-backups", "profile.local")
        ).toBeUndefined();
      } finally {
        await store.close();
        await deleteDatabase(name);
      }
    }
  });
});
