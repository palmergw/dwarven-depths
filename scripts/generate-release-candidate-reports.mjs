#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { renderShuttergateCampaignReleaseCandidateMarkdown } from "../packages/runtime/dist/index.js";

function requiredOutput(argv) {
  const index = argv.indexOf("--out");
  if (
    index < 0 ||
    index + 1 >= argv.length ||
    argv[index + 1].startsWith("--")
  ) {
    throw new TypeError(
      "usage: generate-release-candidate-reports.mjs --out <directory>"
    );
  }
  if (argv.length !== 2)
    throw new TypeError("unknown release-candidate report argument");
  return resolve(argv[index + 1]);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const outputDirectory = requiredOutput(process.argv.slice(2));
const parent = dirname(outputDirectory);
mkdirSync(parent, { recursive: true });
const stagingDirectory = mkdtempSync(
  join(parent, `.${basename(outputDirectory)}.staging-`)
);
const backupDirectory = `${outputDirectory}.previous`;

try {
  const campaignDirectory = join(stagingDirectory, "campaign");
  execFileSync(
    process.execPath,
    [
      "apps/sim-cli/dist/cli.js",
      "campaign",
      "--scenario",
      "scenarios/conformance/shuttergate-campaign.json",
      "--out",
      campaignDirectory
    ],
    { cwd: resolve("."), stdio: ["ignore", "pipe", "inherit"] }
  );

  const report = readJson(join(campaignDirectory, "campaign-calibration.json"));
  const manifest = readJson(join(campaignDirectory, "campaign-manifest.json"));
  const campaign = readJson(join(campaignDirectory, "campaign.json"));
  if (
    manifest.schemaVersion !== 2 ||
    manifest.complete !== true ||
    campaign.payloadChecksum !== manifest.campaignPayloadChecksum
  ) {
    throw new TypeError("incomplete Shuttergate campaign publication");
  }
  const identity = {
    scenarioId: manifest.scenarioId,
    scenarioHash: manifest.scenarioHash,
    contentManifestHash: manifest.contentManifestHash,
    campaignPayloadChecksum: manifest.campaignPayloadChecksum,
    calibrationReportChecksum: manifest.calibrationReportChecksum
  };
  writeFileSync(
    join(stagingDirectory, "release-candidate.md"),
    await renderShuttergateCampaignReleaseCandidateMarkdown(report, identity),
    { encoding: "utf8", flag: "wx" }
  );

  rmSync(backupDirectory, { recursive: true, force: true });
  let backedUp = false;
  try {
    renameSync(outputDirectory, backupDirectory);
    backedUp = true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  try {
    renameSync(stagingDirectory, outputDirectory);
    rmSync(backupDirectory, { recursive: true, force: true });
  } catch (error) {
    if (backedUp) renameSync(backupDirectory, outputDirectory);
    throw error;
  }
  process.stdout.write(
    `${JSON.stringify({ ok: true, outputDirectory, ...identity })}\n`
  );
} catch (error) {
  rmSync(stagingDirectory, { recursive: true, force: true });
  throw error;
}
