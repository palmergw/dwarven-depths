#!/usr/bin/env node
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = resolve(root, process.argv[2] ?? "apps/web/dist/assets");

const budgets = {
  mainJavaScript: 512_000,
  // The worker owns fixed-step combat plus profile-derived preparation and
  // terminal reward authority. Keep that cost isolated from the renderer and
  // bounded to 72 KiB compressed.
  workerJavaScript: 73_728,
  stylesheet: 10_240,
  total: 589_824
};
const classifications = [
  ["mainJavaScript", /^index-[\w-]+\.js$/],
  ["workerJavaScript", /^simulation\.worker-[\w-]+\.js$/],
  ["stylesheet", /^index-[\w-]+\.css$/]
];

try {
  const names = (await readdir(distDirectory))
    .filter((name) => !name.endsWith(".map"))
    .sort();
  const measured = {};

  for (const [classification, pattern] of classifications) {
    const matches = names.filter((name) => pattern.test(name));
    assert.equal(
      matches.length,
      1,
      `expected exactly one ${classification} asset, received ${JSON.stringify(matches)}`
    );
    measured[classification] = gzipSync(
      await readFile(resolve(distDirectory, matches[0])),
      { level: 9 }
    ).byteLength;
  }

  const classifiedNames = new Set(
    classifications.flatMap(([, pattern]) =>
      names.filter((name) => pattern.test(name))
    )
  );
  const unexpected = names.filter(
    (name) =>
      (name.endsWith(".js") || name.endsWith(".css")) &&
      !classifiedNames.has(name)
  );
  assert.deepEqual(
    unexpected,
    [],
    `unexpected production asset classes: ${JSON.stringify(unexpected)}`
  );

  measured.total = Object.values(measured).reduce(
    (sum, bytes) => sum + bytes,
    0
  );
  for (const [classification, budget] of Object.entries(budgets)) {
    assert.ok(
      measured[classification] <= budget,
      `${classification} is ${measured[classification]} compressed bytes; budget is ${budget}`
    );
  }

  process.stdout.write(
    `${JSON.stringify({ ok: true, compression: "gzip-9", budgets, measured })}\n`
  );
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      error: "web_release_budget_failed",
      message: error instanceof Error ? error.message : String(error)
    })}\n`
  );
  process.exitCode = 1;
}
