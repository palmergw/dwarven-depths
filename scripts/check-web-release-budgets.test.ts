import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = resolve("scripts/check-web-release-budgets.mjs");
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function fixture(files: Readonly<Record<string, string>>): string {
  const directory = mkdtempSync(join(tmpdir(), "dd-web-budget-"));
  temporaryDirectories.push(directory);
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(directory, name), contents);
  }
  return directory;
}

function validFiles(): Record<string, string> {
  return {
    "index-release.css": "body{color:white}",
    "index-release.js": "console.log('release')",
    "index-release.js.map": "ignored source map",
    "simulation.worker-release.js": "self.onmessage=()=>{}"
  };
}

describe("web release budgets", () => {
  it("measures exactly one of each production asset class", () => {
    const output = execFileSync(
      process.execPath,
      [script, fixture(validFiles())],
      {
        encoding: "utf8"
      }
    );

    expect(JSON.parse(output)).toMatchObject({
      ok: true,
      compression: "gzip-9",
      measured: {
        mainJavaScript: expect.any(Number),
        workerJavaScript: expect.any(Number),
        stylesheet: expect.any(Number),
        total: expect.any(Number)
      }
    });
  });

  it("rejects an over-budget production asset", () => {
    const files = validFiles();
    files["index-release.js"] = execFileSync(
      process.execPath,
      [
        "-e",
        "process.stdout.write(require('node:crypto').randomBytes(600000))"
      ],
      { encoding: "latin1", maxBuffer: 700_000 }
    );
    const result = spawnSync(process.execPath, [script, fixture(files)], {
      encoding: "utf8"
    });

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      error: "web_release_budget_failed"
    });
    expect(result.stderr).toContain("mainJavaScript");
  });

  it.each([
    ["missing worker", { "simulation.worker-release.js": undefined }],
    ["duplicate main", { "index-extra.js": "duplicate" }],
    ["unexpected chunk", { "vendor-release.js": "unexpected" }]
  ])("rejects malformed asset sets: %s", (_label, changes) => {
    const files: Record<string, string | undefined> = {
      ...validFiles(),
      ...changes
    };
    const result = spawnSync(
      process.execPath,
      [
        script,
        fixture(
          Object.fromEntries(
            Object.entries(files).filter(
              (entry): entry is [string, string] => entry[1] !== undefined
            )
          )
        )
      ],
      { encoding: "utf8" }
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      error: "web_release_budget_failed"
    });
  });
});
