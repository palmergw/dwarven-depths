import { constants } from "node:fs";
import { copyFile, mkdir, open, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  normalizeProfileSaveEnvelope,
  type ProfileSaveEnvelope
} from "./profile-save.js";

export const maximumJsonProfileSaveBytes = 16 * 1024 * 1024;

export type JsonProfileStoreFaultPoint =
  | "before_validation"
  | "before_durable_replacement"
  | "during_backup_replacement"
  | "after_durable_replacement_before_acknowledgement";

export interface JsonProfileStoreOptions {
  readonly injectFault?: (
    point: JsonProfileStoreFaultPoint
  ) => void | Promise<void>;
}

export type JsonProfileLoadResult =
  | { readonly status: "empty" }
  | {
      readonly status: "loaded";
      readonly source: "primary" | "backup";
      readonly envelope: ProfileSaveEnvelope;
      readonly primaryError?: string;
      readonly backupError?: string;
    };

export interface JsonProfileWriteRequest {
  readonly expectedRevision: number | null;
  readonly envelope: unknown;
}

export class JsonProfileStoreError extends Error {
  public constructor(
    public readonly code:
      | "save_busy"
      | "save_conflict"
      | "save_corrupt"
      | "save_too_large",
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "JsonProfileStoreError";
  }
}

type Generation =
  | { readonly status: "missing" }
  | { readonly status: "valid"; readonly envelope: ProfileSaveEnvelope }
  | { readonly status: "invalid"; readonly error: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readGeneration(path: string): Promise<Generation> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await handle.stat();
    if (!info.isFile())
      return { status: "invalid", error: "save generation is not a file" };
    if (info.size > maximumJsonProfileSaveBytes)
      return {
        status: "invalid",
        error: `save generation exceeds ${maximumJsonProfileSaveBytes} bytes`
      };
    const bytes = Buffer.allocUnsafe(maximumJsonProfileSaveBytes + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await handle.read(
        bytes,
        length,
        bytes.length - length,
        length
      );
      if (result.bytesRead === 0) break;
      length += result.bytesRead;
    }
    if (length > maximumJsonProfileSaveBytes)
      return {
        status: "invalid",
        error: `save generation exceeds ${maximumJsonProfileSaveBytes} bytes`
      };
    const text = bytes.toString("utf8", 0, length);
    const parsed: unknown = JSON.parse(text);
    return {
      status: "valid",
      envelope: await normalizeProfileSaveEnvelope(parsed)
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return { status: "missing" };
    return { status: "invalid", error: errorMessage(error) };
  } finally {
    await handle?.close();
  }
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

async function flushFile(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function flushDirectory(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function existingInvalid(
  name: "primary" | "backup",
  generation: Generation
): never {
  const detail = generation.status === "invalid" ? generation.error : "unknown";
  throw new JsonProfileStoreError(
    "save_corrupt",
    `${name} save generation is invalid and will not be overwritten: ${detail}`
  );
}

export class JsonProfileStore {
  public readonly primaryPath: string;
  public readonly backupPath: string;
  public readonly lockPath: string;

  public constructor(
    path: string,
    private readonly options: JsonProfileStoreOptions = {}
  ) {
    this.primaryPath = resolve(path);
    this.backupPath = `${this.primaryPath}.bak`;
    this.lockPath = `${this.primaryPath}.lock`;
  }

  public async load(): Promise<JsonProfileLoadResult> {
    const [primary, backup] = await Promise.all([
      readGeneration(this.primaryPath),
      readGeneration(this.backupPath)
    ]);
    if (primary.status === "valid")
      return {
        status: "loaded",
        source: "primary",
        envelope: primary.envelope,
        ...(backup.status === "invalid" ? { backupError: backup.error } : {})
      };
    if (backup.status === "valid")
      return {
        status: "loaded",
        source: "backup",
        envelope: backup.envelope,
        ...(primary.status === "invalid" ? { primaryError: primary.error } : {})
      };
    if (primary.status === "missing" && backup.status === "missing")
      return { status: "empty" };
    const details = [
      primary.status === "invalid" ? `primary: ${primary.error}` : undefined,
      backup.status === "invalid" ? `backup: ${backup.error}` : undefined
    ]
      .filter((entry): entry is string => entry !== undefined)
      .join("; ");
    throw new JsonProfileStoreError(
      "save_corrupt",
      `no valid profile save generation is recoverable (${details})`
    );
  }

  public async write(
    request: JsonProfileWriteRequest
  ): Promise<ProfileSaveEnvelope> {
    await this.options.injectFault?.("before_validation");
    const expectedRevision = requireExpectedRevision(request.expectedRevision);
    const envelope = await normalizeProfileSaveEnvelope(request.envelope);
    const directory = dirname(this.primaryPath);
    await mkdir(directory, { recursive: true });

    let lock: Awaited<ReturnType<typeof open>>;
    try {
      lock = await open(this.lockPath, "wx", 0o600);
    } catch (error) {
      throw new JsonProfileStoreError(
        "save_busy",
        "profile save is locked by another writer",
        { cause: error }
      );
    }

    const nonce = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const temporaryPath = `${this.primaryPath}.tmp-${nonce}`;
    const backupTemporaryPath = `${this.backupPath}.tmp-${nonce}`;
    try {
      const [primary, backup] = await Promise.all([
        readGeneration(this.primaryPath),
        readGeneration(this.backupPath)
      ]);
      if (primary.status === "invalid") existingInvalid("primary", primary);
      if (backup.status === "invalid") existingInvalid("backup", backup);
      const current =
        primary.status === "valid"
          ? primary.envelope
          : backup.status === "valid"
            ? backup.envelope
            : undefined;
      const currentRevision = current?.profileRevision ?? null;
      if (currentRevision !== expectedRevision)
        throw new JsonProfileStoreError(
          "save_conflict",
          `profile save revision conflict: expected ${String(expectedRevision)}, found ${String(currentRevision)}`
        );
      if (
        current !== undefined &&
        (current.profileId !== envelope.profileId ||
          envelope.profileRevision <= current.profileRevision)
      )
        throw new JsonProfileStoreError(
          "save_conflict",
          "profile save update must keep profile identity and advance revision"
        );

      const serialized = `${JSON.stringify(envelope, null, 2)}\n`;
      if (Buffer.byteLength(serialized, "utf8") > maximumJsonProfileSaveBytes)
        throw new JsonProfileStoreError(
          "save_too_large",
          `profile save exceeds ${maximumJsonProfileSaveBytes} bytes`
        );
      const temporary = await open(temporaryPath, "wx", 0o600);
      try {
        await temporary.writeFile(serialized, "utf8");
        await temporary.sync();
      } finally {
        await temporary.close();
      }
      await this.options.injectFault?.("before_durable_replacement");

      if (primary.status === "valid") {
        await copyFile(
          this.primaryPath,
          backupTemporaryPath,
          constants.COPYFILE_EXCL
        );
        await flushFile(backupTemporaryPath);
        await rename(backupTemporaryPath, this.backupPath);
        await flushDirectory(directory);
        await this.options.injectFault?.("during_backup_replacement");
      }

      await rename(temporaryPath, this.primaryPath);
      await flushDirectory(directory);
      await this.options.injectFault?.(
        "after_durable_replacement_before_acknowledgement"
      );
      return envelope;
    } finally {
      await Promise.allSettled([
        rm(temporaryPath, { force: true }),
        rm(backupTemporaryPath, { force: true })
      ]);
      await lock.close();
      await rm(this.lockPath, { force: true });
    }
  }
}
