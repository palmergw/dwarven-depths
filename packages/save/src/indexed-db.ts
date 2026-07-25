import { canonicalStringify } from "@dwarven-depths/contracts";
import {
  currentProfileSaveSchemaVersion,
  normalizeProfileSaveEnvelope,
  type ProfileSaveEnvelope
} from "./profile-save.js";
import { migrateProfileSaveEnvelope } from "./profile-save-migration.js";

const databaseVersion = 1;
const primaryStoreName = "profiles";
const backupStoreName = "profile-backups";
const profileIdPattern = /^profile\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

export type IndexedDbProfileStoreFaultPoint = "during_migration_before_commit";

export interface IndexedDbProfileStoreOptions {
  readonly indexedDb?: IDBFactory;
  readonly injectFault?: (point: IndexedDbProfileStoreFaultPoint) => void;
}

export type IndexedDbProfileLoadResult =
  | { readonly status: "empty" }
  | {
      readonly status: "loaded";
      readonly source: "primary" | "backup";
      readonly envelope: ProfileSaveEnvelope;
      readonly migratedFromSchemaVersion: 0 | null;
    };

export interface IndexedDbProfileWriteRequest {
  readonly expectedRevision: number | null;
  readonly envelope: unknown;
}

export class IndexedDbProfileStoreError extends Error {
  public constructor(
    public readonly code:
      | "save_conflict"
      | "save_corrupt"
      | "save_migration_required"
      | "storage_unavailable",
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "IndexedDbProfileStoreError";
  }
}

function requireProfileId(value: unknown): string {
  if (typeof value !== "string" || !profileIdPattern.test(value))
    throw new RangeError("profileId must be a valid stable profile ID");
  return value;
}

function requireExpectedRevision(value: unknown): number | null {
  if (value === null) return null;
  if (
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    (value as number) < 0
  )
    throw new RangeError(
      "expected save revision must be null or a non-negative safe integer"
    );
  return value as number;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionCompletion(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => {
      // The abort event owns rejection so request errors cannot resolve a transaction.
    };
  });
}

function openDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(name, databaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(primaryStoreName))
        database.createObjectStore(primaryStoreName);
      if (!database.objectStoreNames.contains(backupStoreName))
        database.createObjectStore(backupStoreName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ?? new Error("could not open IndexedDB profile store")
      );
    request.onblocked = () =>
      reject(new Error("IndexedDB profile store upgrade is blocked"));
  });
}

function fingerprint(value: unknown): string {
  return value === undefined ? "missing" : canonicalStringify(value);
}

export class IndexedDbProfileStore {
  private readonly database: Promise<IDBDatabase>;
  private readonly injectFault:
    | ((point: IndexedDbProfileStoreFaultPoint) => void)
    | undefined;

  public constructor(
    databaseName: string,
    options: IndexedDbProfileStoreOptions = {}
  ) {
    if (databaseName.length === 0 || databaseName.length > 128)
      throw new RangeError(
        "IndexedDB profile database name must be 1-128 characters"
      );
    const factory = options.indexedDb ?? globalThis.indexedDB;
    if (factory === undefined)
      throw new IndexedDbProfileStoreError(
        "storage_unavailable",
        "IndexedDB is unavailable"
      );
    this.injectFault = options.injectFault;
    this.database = openDatabase(factory, databaseName).catch(
      (error: unknown) => {
        throw new IndexedDbProfileStoreError(
          "storage_unavailable",
          "could not open IndexedDB profile store",
          { cause: error }
        );
      }
    );
  }

  private async readRaw(
    profileId: string,
    storeName: typeof primaryStoreName | typeof backupStoreName
  ): Promise<unknown> {
    const database = await this.database;
    const transaction = database.transaction(storeName, "readonly");
    const completion = transactionCompletion(transaction);
    const value = await requestResult(
      transaction.objectStore(storeName).get(profileId)
    );
    await completion;
    return value;
  }

  private async commitMigration(
    profileId: string,
    previous: unknown,
    previousBackup: unknown,
    envelope: ProfileSaveEnvelope
  ): Promise<void> {
    const database = await this.database;
    const transaction = database.transaction(
      [primaryStoreName, backupStoreName],
      "readwrite"
    );
    let callbackError: unknown;
    const completion = transactionCompletion(transaction).catch(
      (error: unknown) => {
        throw callbackError ?? error;
      }
    );
    const primaryRequest = transaction
      .objectStore(primaryStoreName)
      .get(profileId);
    const backupRequest = transaction
      .objectStore(backupStoreName)
      .get(profileId);
    let primaryReady = false;
    let backupReady = false;
    const commitWhenReady = () => {
      if (!primaryReady || !backupReady) return;
      try {
        if (
          fingerprint(primaryRequest.result) !== fingerprint(previous) ||
          fingerprint(backupRequest.result) !== fingerprint(previousBackup)
        )
          throw new IndexedDbProfileStoreError(
            "save_conflict",
            "profile or backup changed while migration was being committed"
          );
        transaction.objectStore(backupStoreName).put(previous, profileId);
        transaction.objectStore(primaryStoreName).put(envelope, profileId);
        this.injectFault?.("during_migration_before_commit");
      } catch (error) {
        callbackError = error;
        transaction.abort();
      }
    };
    primaryRequest.onsuccess = () => {
      primaryReady = true;
      commitWhenReady();
    };
    backupRequest.onsuccess = () => {
      backupReady = true;
      commitWhenReady();
    };
    primaryRequest.onerror = () => {
      callbackError =
        primaryRequest.error ?? new Error("could not read migration source");
    };
    backupRequest.onerror = () => {
      callbackError =
        backupRequest.error ?? new Error("could not read migration backup");
    };
    await completion;
  }

  public async load(
    profileIdValue: string
  ): Promise<IndexedDbProfileLoadResult> {
    const profileId = requireProfileId(profileIdValue);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const raw = await this.readRaw(profileId, primaryStoreName);
      if (raw === undefined) return Object.freeze({ status: "empty" });
      let migrated: Awaited<ReturnType<typeof migrateProfileSaveEnvelope>>;
      try {
        migrated = await migrateProfileSaveEnvelope(raw);
      } catch (error) {
        throw new IndexedDbProfileStoreError(
          "save_corrupt",
          "IndexedDB profile save is invalid and was not overwritten",
          { cause: error }
        );
      }
      if (migrated.envelope.profileId !== profileId)
        throw new IndexedDbProfileStoreError(
          "save_corrupt",
          "IndexedDB profile key does not match its envelope profileId"
        );
      if (migrated.migratedFromSchemaVersion === null)
        return Object.freeze({
          status: "loaded",
          source: "primary",
          envelope: migrated.envelope,
          migratedFromSchemaVersion: null
        });
      const previousBackup = await this.readRaw(profileId, backupStoreName);
      if (previousBackup !== undefined) {
        try {
          const backup = await migrateProfileSaveEnvelope(previousBackup);
          if (backup.envelope.profileId !== profileId)
            throw new RangeError(
              "backup profileId does not match its storage key"
            );
        } catch (error) {
          throw new IndexedDbProfileStoreError(
            "save_corrupt",
            "existing IndexedDB profile backup is invalid and was not overwritten",
            { cause: error }
          );
        }
      }
      try {
        await this.commitMigration(
          profileId,
          raw,
          previousBackup,
          migrated.envelope
        );
        return Object.freeze({
          status: "loaded",
          source: "primary",
          envelope: migrated.envelope,
          migratedFromSchemaVersion: migrated.migratedFromSchemaVersion
        });
      } catch (error) {
        if (
          error instanceof IndexedDbProfileStoreError &&
          error.code === "save_conflict"
        )
          continue;
        throw error;
      }
    }
    throw new IndexedDbProfileStoreError(
      "save_conflict",
      "profile changed repeatedly while migration was being committed"
    );
  }

  public async loadBackup(
    profileIdValue: string
  ): Promise<IndexedDbProfileLoadResult> {
    const profileId = requireProfileId(profileIdValue);
    const raw = await this.readRaw(profileId, backupStoreName);
    if (raw === undefined) return Object.freeze({ status: "empty" });
    try {
      const migrated = await migrateProfileSaveEnvelope(raw);
      if (migrated.envelope.profileId !== profileId)
        throw new RangeError("backup profileId does not match its storage key");
      return Object.freeze({
        status: "loaded",
        source: "backup",
        envelope: migrated.envelope,
        migratedFromSchemaVersion: migrated.migratedFromSchemaVersion
      });
    } catch (error) {
      throw new IndexedDbProfileStoreError(
        "save_corrupt",
        "IndexedDB profile backup is invalid and was not overwritten",
        { cause: error }
      );
    }
  }

  public async write(
    request: IndexedDbProfileWriteRequest
  ): Promise<ProfileSaveEnvelope> {
    const expectedRevision = requireExpectedRevision(request.expectedRevision);
    const envelope = await normalizeProfileSaveEnvelope(request.envelope);
    if (envelope.schemaVersion !== currentProfileSaveSchemaVersion)
      throw new RangeError("profile save must use the current schemaVersion");

    const previous = await this.readRaw(envelope.profileId, primaryStoreName);
    let previousRevision: number | null = null;
    if (previous !== undefined) {
      let migrated: Awaited<ReturnType<typeof migrateProfileSaveEnvelope>>;
      try {
        migrated = await migrateProfileSaveEnvelope(previous);
      } catch (error) {
        throw new IndexedDbProfileStoreError(
          "save_corrupt",
          "existing IndexedDB profile save is invalid and was not overwritten",
          { cause: error }
        );
      }
      if (migrated.migratedFromSchemaVersion !== null)
        throw new IndexedDbProfileStoreError(
          "save_migration_required",
          "existing IndexedDB profile must be loaded and migrated before writing"
        );
      if (migrated.envelope.profileId !== envelope.profileId)
        throw new IndexedDbProfileStoreError(
          "save_corrupt",
          "existing IndexedDB profile key does not match its envelope profileId"
        );
      previousRevision = migrated.envelope.profileRevision;
    }
    if (previousRevision !== expectedRevision)
      throw new IndexedDbProfileStoreError(
        "save_conflict",
        `expected profile revision ${String(expectedRevision)} but found ${String(previousRevision)}`
      );
    if (
      previousRevision !== null &&
      envelope.profileRevision <= previousRevision
    )
      throw new IndexedDbProfileStoreError(
        "save_conflict",
        "profile save update must advance the profile revision"
      );

    const database = await this.database;
    const transaction = database.transaction(primaryStoreName, "readwrite");
    let callbackError: unknown;
    const completion = transactionCompletion(transaction).catch(
      (error: unknown) => {
        throw callbackError ?? error;
      }
    );
    const getRequest = transaction
      .objectStore(primaryStoreName)
      .get(envelope.profileId);
    getRequest.onsuccess = () => {
      try {
        if (fingerprint(getRequest.result) !== fingerprint(previous))
          throw new IndexedDbProfileStoreError(
            "save_conflict",
            "profile changed while the write was being committed"
          );
        transaction
          .objectStore(primaryStoreName)
          .put(envelope, envelope.profileId);
      } catch (error) {
        callbackError = error;
        transaction.abort();
      }
    };
    getRequest.onerror = () => {
      callbackError =
        getRequest.error ?? new Error("could not read current profile");
    };
    await completion;
    return envelope;
  }

  public async close(): Promise<void> {
    (await this.database).close();
  }
}
