import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  copyFile,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  rmdir,
  stat
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
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

interface LockOwner {
  readonly schemaVersion: 1;
  readonly pid: number;
  readonly processStartToken: string;
  readonly nonce: string;
  readonly ticket: number;
}

const lockNoncePattern =
  /^([1-9][0-9]*)-([1-9][0-9]*|unknown)-([a-f0-9-]{36})$/;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function rejectDuplicateJsonObjectKeys(text: string): void {
  let offset = 0;
  const skipWhitespace = () => {
    while (/\s/.test(text[offset] ?? "")) offset += 1;
  };
  const parseString = (): string => {
    const start = offset;
    if (text[offset] !== '"') throw new SyntaxError("expected JSON string");
    offset += 1;
    while (offset < text.length) {
      const character = text[offset];
      if (character === '"') {
        offset += 1;
        return JSON.parse(text.slice(start, offset)) as string;
      }
      if (character === "\\") offset += 1;
      offset += 1;
    }
    throw new SyntaxError("unterminated JSON string");
  };
  const parseValue = (depth: number): void => {
    if (depth > 100) throw new RangeError("JSON nesting exceeds 100 levels");
    skipWhitespace();
    const character = text[offset];
    if (character === '"') {
      parseString();
      return;
    }
    if (character === "{") {
      offset += 1;
      skipWhitespace();
      const keys = new Set<string>();
      if (text[offset] === "}") {
        offset += 1;
        return;
      }
      while (true) {
        skipWhitespace();
        const key = parseString();
        if (keys.has(key))
          throw new SyntaxError(`duplicate JSON object key ${key}`);
        keys.add(key);
        skipWhitespace();
        if (text[offset] !== ":") throw new SyntaxError("expected JSON colon");
        offset += 1;
        parseValue(depth + 1);
        skipWhitespace();
        if (text[offset] === "}") {
          offset += 1;
          return;
        }
        if (text[offset] !== ",") throw new SyntaxError("expected JSON comma");
        offset += 1;
      }
    }
    if (character === "[") {
      offset += 1;
      skipWhitespace();
      if (text[offset] === "]") {
        offset += 1;
        return;
      }
      while (true) {
        parseValue(depth + 1);
        skipWhitespace();
        if (text[offset] === "]") {
          offset += 1;
          return;
        }
        if (text[offset] !== ",") throw new SyntaxError("expected JSON comma");
        offset += 1;
      }
    }
    const scalar = text
      .slice(offset)
      .match(
        /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/
      )?.[0];
    if (scalar === undefined) throw new SyntaxError("invalid JSON value");
    offset += scalar.length;
  };
  parseValue(0);
  skipWhitespace();
  if (offset !== text.length)
    throw new SyntaxError("unexpected trailing JSON data");
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
    rejectDuplicateJsonObjectKeys(text);
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

async function processStartToken(pid: number): Promise<string | undefined> {
  try {
    const value = await readFile(`/proc/${pid}/stat`, "utf8");
    const fields = value
      .slice(value.lastIndexOf(")") + 2)
      .trim()
      .split(/\s+/);
    return fields[19];
  } catch {
    return undefined;
  }
}

function parseLockOwner(text: string): LockOwner {
  const value = JSON.parse(text) as unknown;
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError("save lock metadata must be an object");
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(",") !==
    "nonce,pid,processStartToken,schemaVersion,ticket"
  )
    throw new TypeError("save lock metadata has an invalid shape");
  if (
    record["schemaVersion"] !== 1 ||
    !Number.isSafeInteger(record["pid"]) ||
    (record["pid"] as number) <= 0 ||
    typeof record["processStartToken"] !== "string" ||
    typeof record["nonce"] !== "string" ||
    !lockNoncePattern.test(record["nonce"]) ||
    !Number.isSafeInteger(record["ticket"]) ||
    (record["ticket"] as number) < 1
  )
    throw new TypeError("save lock metadata is invalid");
  return {
    schemaVersion: 1,
    pid: record["pid"] as number,
    processStartToken: record["processStartToken"],
    nonce: record["nonce"],
    ticket: record["ticket"] as number
  };
}

async function ownerIsAlive(owner: LockOwner): Promise<boolean> {
  try {
    process.kill(owner.pid, 0);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ESRCH"
    )
      return false;
    return true;
  }
  if (owner.processStartToken === "unknown") return true;
  const currentToken = await processStartToken(owner.pid);
  return currentToken === undefined || currentToken === owner.processStartToken;
}

function ownerFromEntryName(entryName: string): LockOwner {
  const match = lockNoncePattern.exec(entryName);
  if (match === null) throw new TypeError("save lock entry name is invalid");
  return {
    schemaVersion: 1,
    pid: Number(match[1]),
    processStartToken: match[2] ?? "unknown",
    nonce: entryName,
    ticket: 1
  };
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
    this.lockPath = `${this.primaryPath}.locks`;
  }

  private temporaryPaths(owner: LockOwner): readonly [string, string] {
    return [
      `${this.primaryPath}.tmp-${owner.nonce}`,
      `${this.backupPath}.tmp-${owner.nonce}`
    ];
  }

  private async readLockOwner(
    entryName: string,
    fileName = "owner.json"
  ): Promise<LockOwner> {
    const metadataPath = join(this.lockPath, entryName, fileName);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(
        metadataPath,
        constants.O_RDONLY | constants.O_NOFOLLOW
      );
      const info = await handle.stat();
      if (!info.isFile() || info.size > 1_024)
        throw new RangeError(
          "save lock metadata is not a bounded regular file"
        );
      const bytes = Buffer.allocUnsafe(1_025);
      const result = await handle.read(bytes, 0, bytes.length, 0);
      if (result.bytesRead > 1_024)
        throw new RangeError("save lock metadata is too large");
      const owner = parseLockOwner(bytes.toString("utf8", 0, result.bytesRead));
      if (owner.nonce !== entryName)
        throw new TypeError("save lock metadata does not match its entry");
      return owner;
    } finally {
      await handle?.close();
    }
  }

  private async readContendingOwner(
    entryName: string
  ): Promise<LockOwner | undefined> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        return await this.readLockOwner(entryName);
      } catch {
        try {
          return await this.readLockOwner(entryName, "owner.pending");
        } catch {
          try {
            await stat(join(this.lockPath, entryName));
          } catch (error) {
            if (
              typeof error === "object" &&
              error !== null &&
              "code" in error &&
              error.code === "ENOENT"
            )
              return undefined;
            throw error;
          }
          const fallback = ownerFromEntryName(entryName);
          if (!(await ownerIsAlive(fallback))) return fallback;
          await delay(1);
        }
      }
    }
    throw new JsonProfileStoreError(
      "save_busy",
      "profile save has an incomplete live lock entry"
    );
  }

  private async removeLockDirectoryIfEmpty(): Promise<void> {
    try {
      await rmdir(this.lockPath);
    } catch (error) {
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        (error.code !== "ENOENT" && error.code !== "ENOTEMPTY")
      )
        throw error;
    }
  }

  private async acquireLock(owner: LockOwner): Promise<LockOwner> {
    await mkdir(this.lockPath, { recursive: true, mode: 0o700 });
    const entryPath = join(this.lockPath, owner.nonce);
    await mkdir(entryPath, { mode: 0o700 });
    try {
      let maximumTicket = 0;
      for (const entryName of await readdir(this.lockPath)) {
        if (entryName === owner.nonce) continue;
        try {
          const candidate = await this.readLockOwner(entryName);
          if (await ownerIsAlive(candidate))
            maximumTicket = Math.max(maximumTicket, candidate.ticket);
        } catch {
          // A concurrent writer may still be choosing its ticket.
        }
      }
      const assignedOwner = { ...owner, ticket: maximumTicket + 1 };
      const pendingPath = join(entryPath, "owner.pending");
      const metadata = await open(pendingPath, "wx", 0o600);
      try {
        await metadata.writeFile(`${JSON.stringify(assignedOwner)}\n`, "utf8");
        await metadata.sync();
      } finally {
        await metadata.close();
      }
      await rename(pendingPath, join(entryPath, "owner.json"));

      for (const entryName of await readdir(this.lockPath)) {
        if (entryName === assignedOwner.nonce) continue;
        if (!lockNoncePattern.test(entryName))
          throw new JsonProfileStoreError(
            "save_busy",
            "profile save has an invalid lock entry that requires manual recovery"
          );
        const previousOwner = await this.readContendingOwner(entryName);
        if (previousOwner === undefined) continue;
        if (await ownerIsAlive(previousOwner)) {
          if (
            previousOwner.ticket < assignedOwner.ticket ||
            (previousOwner.ticket === assignedOwner.ticket &&
              previousOwner.nonce < assignedOwner.nonce)
          )
            throw new JsonProfileStoreError(
              "save_busy",
              "profile save is locked by another writer"
            );
          continue;
        }
        await rm(join(this.lockPath, entryName), {
          recursive: true,
          force: true
        });
        const [orphanedPrimary, orphanedBackup] =
          this.temporaryPaths(previousOwner);
        await Promise.allSettled([
          rm(orphanedPrimary, { force: true }),
          rm(orphanedBackup, { force: true })
        ]);
      }
      return assignedOwner;
    } catch (error) {
      await rm(entryPath, { recursive: true, force: true });
      await this.removeLockDirectoryIfEmpty();
      throw error;
    }
  }

  private async releaseLock(owner: LockOwner): Promise<void> {
    const currentOwner = await this.readLockOwner(owner.nonce);
    if (currentOwner.nonce !== owner.nonce)
      throw new JsonProfileStoreError(
        "save_busy",
        "profile save lock ownership changed before release"
      );
    await rm(join(this.lockPath, owner.nonce), { recursive: true });
    await this.removeLockDirectoryIfEmpty();
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

    const startToken = (await processStartToken(process.pid)) ?? "unknown";
    let owner: LockOwner = {
      schemaVersion: 1,
      pid: process.pid,
      processStartToken: startToken,
      nonce: `${process.pid}-${startToken}-${randomUUID()}`,
      ticket: 0
    };
    owner = await this.acquireLock(owner);
    const [temporaryPath, backupTemporaryPath] = this.temporaryPaths(owner);
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
      await this.releaseLock(owner);
    }
  }
}
