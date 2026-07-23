#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const tracked = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8"
})
  .split("\0")
  .filter(Boolean);

const forbidden = tracked.filter((path) =>
  /(^|\/)(?:node_modules|dist|coverage|reports|\.ddh|\.pnpm-store)(?:\/|$)|\.tsbuildinfo$/.test(
    path
  )
);

if (forbidden.length > 0) {
  process.stderr.write(
    `${JSON.stringify({ ok: false, error: "generated_artifacts_tracked", paths: forbidden })}\n`
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${JSON.stringify({ ok: true, trackedGeneratedArtifacts: 0 })}\n`
  );
}
