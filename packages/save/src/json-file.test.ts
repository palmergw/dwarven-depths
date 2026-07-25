import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInitialProfile } from "@dwarven-depths/progression";
import { afterEach, describe, expect, it } from "vitest";
import {
  JsonProfileStore,
  type JsonProfileStoreFaultPoint,
  maximumJsonProfileSaveBytes
} from "./json-file.js";
import { createProfileSaveEnvelope } from "./profile-save.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true }))
  );
});

async function testPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "dwarven-depths-save-"));
  directories.push(directory);
  return join(directory, "profile.json");
}

async function envelope(revision: number, forgeOre: number) {
  return createProfileSaveEnvelope({
    contentVersion: "content.shuttergate.v1",
    applicationBuild: "test-build-1",
    writtenAtEpochMs: 1_725_000_000_000 + revision,
    profileId: "profile.local",
    profile: {
      ...createInitialProfile("character.iron_warden" as never),
      revision,
      forgeOre
    }
  });
}

function faultAt(point: JsonProfileStoreFaultPoint) {
  return async (candidate: JsonProfileStoreFaultPoint) => {
    if (candidate === point) throw new Error(`injected fault: ${point}`);
  };
}

async function expectCleanArtifacts(path: string): Promise<void> {
  const names = await readdir(join(path, ".."));
  expect(
    names.filter((name) => name.includes(".tmp-") || name.includes(".lock"))
  ).toEqual([]);
}

describe("JSON profile store", () => {
  it("writes, flushes, loads, and compare-and-swap updates with a previous backup", async () => {
    const path = await testPath();
    const store = new JsonProfileStore(path);
    const first = await envelope(0, 0);
    const second = await envelope(1, 10);

    expect(await store.load()).toEqual({ status: "empty" });
    await expect(
      store.write({ expectedRevision: null, envelope: first })
    ).resolves.toEqual(first);
    await expect(
      store.write({ expectedRevision: 0, envelope: second })
    ).resolves.toEqual(second);

    expect(await store.load()).toMatchObject({
      status: "loaded",
      source: "primary",
      envelope: second
    });
    const backup = new JsonProfileStore(`${path}.bak`);
    expect(await backup.load()).toMatchObject({
      status: "loaded",
      source: "primary",
      envelope: first
    });
    await expect(
      store.write({ expectedRevision: 0, envelope: await envelope(2, 20) })
    ).rejects.toMatchObject({ code: "save_conflict" });
    await expectCleanArtifacts(path);
  });

  it.each([
    "before_validation",
    "before_durable_replacement",
    "during_backup_replacement"
  ] as const)(
    "keeps the previous generation recoverable at %s",
    async (point) => {
      const path = await testPath();
      const first = await envelope(0, 0);
      await new JsonProfileStore(path).write({
        expectedRevision: null,
        envelope: first
      });
      const faulted = new JsonProfileStore(path, {
        injectFault: faultAt(point)
      });

      await expect(
        faulted.write({ expectedRevision: 0, envelope: await envelope(1, 10) })
      ).rejects.toThrow(`injected fault: ${point}`);
      expect(await new JsonProfileStore(path).load()).toMatchObject({
        status: "loaded",
        source: "primary",
        envelope: first
      });
      await expectCleanArtifacts(path);
    }
  );

  it("exposes a durably replaced generation after acknowledgement is interrupted", async () => {
    const path = await testPath();
    const first = await envelope(0, 0);
    const second = await envelope(1, 10);
    await new JsonProfileStore(path).write({
      expectedRevision: null,
      envelope: first
    });
    const faulted = new JsonProfileStore(path, {
      injectFault: faultAt("after_durable_replacement_before_acknowledgement")
    });

    await expect(
      faulted.write({ expectedRevision: 0, envelope: second })
    ).rejects.toThrow("after_durable_replacement_before_acknowledgement");
    expect(await new JsonProfileStore(path).load()).toMatchObject({
      status: "loaded",
      source: "primary",
      envelope: second
    });
    await expect(
      new JsonProfileStore(path).write({
        expectedRevision: 0,
        envelope: second
      })
    ).rejects.toMatchObject({ code: "save_conflict" });
    await expectCleanArtifacts(path);
  });

  it("reads a valid backup without rewriting a corrupt primary and fails closed on write", async () => {
    const path = await testPath();
    const first = await envelope(0, 0);
    await new JsonProfileStore(path).write({
      expectedRevision: null,
      envelope: first
    });
    await new JsonProfileStore(path).write({
      expectedRevision: 0,
      envelope: await envelope(1, 10)
    });
    await writeFile(path, "{truncated", "utf8");
    const corruptBefore = await readFile(path, "utf8");

    const recovered = await new JsonProfileStore(path).load();
    expect(recovered).toMatchObject({
      status: "loaded",
      source: "backup",
      envelope: first
    });
    expect(recovered).toHaveProperty("primaryError");
    await expect(
      new JsonProfileStore(path).write({
        expectedRevision: 0,
        envelope: await envelope(1, 20)
      })
    ).rejects.toMatchObject({ code: "save_corrupt" });
    expect(await readFile(path, "utf8")).toBe(corruptBefore);
    await expectCleanArtifacts(path);
  });

  it("rejects unsupported and oversized generations without overwriting them", async () => {
    const path = await testPath();
    const newer = { ...(await envelope(0, 0)), schemaVersion: 2 };
    const newerText = `${JSON.stringify(newer)}\n`;
    await writeFile(path, newerText, "utf8");
    await expect(new JsonProfileStore(path).load()).rejects.toMatchObject({
      code: "save_corrupt"
    });
    expect(await readFile(path, "utf8")).toBe(newerText);

    const oversizedPath = await testPath();
    await writeFile(
      oversizedPath,
      " ".repeat(maximumJsonProfileSaveBytes + 1),
      "utf8"
    );
    await expect(
      new JsonProfileStore(oversizedPath).load()
    ).rejects.toMatchObject({
      code: "save_corrupt"
    });
  });

  it("rejects duplicate JSON object keys without rewriting the generation", async () => {
    const path = await testPath();
    const valid = `${JSON.stringify(await envelope(0, 0), null, 2)}\n`;
    const ambiguous = valid.replace("{", '{\n  "schemaVersion": 999,');
    await writeFile(path, ambiguous, "utf8");
    await expect(new JsonProfileStore(path).load()).rejects.toThrow(
      "duplicate JSON object key schemaVersion"
    );
    expect(await readFile(path, "utf8")).toBe(ambiguous);
  });

  it("does not overwrite an invalid backup even when the primary is valid", async () => {
    const path = await testPath();
    await new JsonProfileStore(path).write({
      expectedRevision: null,
      envelope: await envelope(0, 0)
    });
    await writeFile(`${path}.bak`, "corrupt backup", "utf8");
    await expect(
      new JsonProfileStore(path).write({
        expectedRevision: 0,
        envelope: await envelope(1, 10)
      })
    ).rejects.toMatchObject({ code: "save_corrupt" });
    expect(await readFile(`${path}.bak`, "utf8")).toBe("corrupt backup");
  });

  it("validates an envelope before creating durable artifacts", async () => {
    const path = await testPath();
    await expect(
      new JsonProfileStore(path).write({
        expectedRevision: null,
        envelope: { schemaVersion: 1 }
      })
    ).rejects.toThrow("must contain exactly");
    expect(await readdir(join(path, ".."))).toEqual([]);
  });

  it("reports an exclusive writer lock as busy", async () => {
    const path = await testPath();
    let releaseWriter: (() => void) | undefined;
    let markWriterEntered: (() => void) | undefined;
    const writerEntered = new Promise<void>((resolve) => {
      markWriterEntered = resolve;
    });
    const writerRelease = new Promise<void>((resolve) => {
      releaseWriter = resolve;
    });
    const blocker = new JsonProfileStore(path, {
      injectFault: async (point) => {
        if (point === "before_durable_replacement") {
          markWriterEntered?.();
          await writerRelease;
        }
      }
    });
    const firstWrite = blocker.write({
      expectedRevision: null,
      envelope: await envelope(0, 0)
    });
    await writerEntered;
    await expect(
      new JsonProfileStore(path).write({
        expectedRevision: null,
        envelope: await envelope(0, 0)
      })
    ).rejects.toMatchObject({ code: "save_busy" });
    releaseWriter?.();
    await firstWrite;
  });

  it("elects exactly one winner from simultaneous compare-and-swap writers", async () => {
    const path = await testPath();
    const writes = await Promise.allSettled(
      Array.from({ length: 16 }, async (_, index) =>
        new JsonProfileStore(path).write({
          expectedRevision: null,
          envelope: await envelope(0, index)
        })
      )
    );
    expect(
      writes.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    expect(await new JsonProfileStore(path).load()).toMatchObject({
      status: "loaded",
      source: "primary"
    });
    await expectCleanArtifacts(path);
  });

  it("recovers an ownership-verified stale lock and orphaned temporary generation", async () => {
    const path = await testPath();
    await new JsonProfileStore(path).write({
      expectedRevision: null,
      envelope: await envelope(0, 0)
    });
    const fixture = fileURLToPath(
      new URL("../dist/json-file-crash.fixture.js", import.meta.url)
    );
    const child = spawn(process.execPath, [fixture, path], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8");
        if (output.includes("READY\n")) resolve();
      });
    });
    child.kill("SIGKILL");
    await once(child, "exit");
    const abandoned = await readdir(join(path, ".."));
    expect(abandoned.some((name) => name.includes(".lock"))).toBe(true);
    expect(abandoned.some((name) => name.includes(".tmp-"))).toBe(true);

    const recovered = await envelope(1, 20);
    await expect(
      new JsonProfileStore(path).write({
        expectedRevision: 0,
        envelope: recovered
      })
    ).resolves.toEqual(recovered);
    expect(await new JsonProfileStore(path).load()).toMatchObject({
      status: "loaded",
      source: "primary",
      envelope: recovered
    });
    await expectCleanArtifacts(path);
  });

  it("reclaims a unique stale entry when its PID has been reused", async () => {
    const path = await testPath();
    const store = new JsonProfileStore(path);
    const nonce = `${process.pid}-999999-00000000-0000-4000-8000-000000000000`;
    const entry = join(store.lockPath, nonce);
    await mkdir(entry, { recursive: true });
    await writeFile(
      join(entry, "owner.pending"),
      `${JSON.stringify({
        schemaVersion: 1,
        pid: process.pid,
        processStartToken: "999999",
        nonce,
        ticket: 1
      })}\n`,
      "utf8"
    );
    await writeFile(`${path}.tmp-${nonce}`, "orphan", "utf8");

    await expect(
      store.write({
        expectedRevision: null,
        envelope: await envelope(0, 0)
      })
    ).resolves.toMatchObject({ profileRevision: 0 });
    await expectCleanArtifacts(path);
  });
});
