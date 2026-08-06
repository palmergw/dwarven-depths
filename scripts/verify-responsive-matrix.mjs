import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const manifestPath = resolve(
  repositoryRoot,
  process.env.DD_RESPONSIVE_MANIFEST ??
    "docs/visual-evidence/responsive-matrix/wip-01/manifest.json"
);
const evidenceDirectory = dirname(manifestPath);
const fixtureId = "scenarios/conformance/shuttergate-web-truth.json";
const viewports = {
  desktop: [1440, 900],
  laptop: [1280, 800],
  tablet: [1024, 768],
  compact: [768, 768],
  mobile: [390, 844]
};
const states = [
  "checkpoint",
  "forge",
  "settings",
  "preparation",
  "result",
  "error",
  "high-contrast",
  "large-text",
  "paused-combat",
  "quiet-combat",
  "dense-combat",
  "ability-impact",
  "reduced-motion"
];
const combatStates = new Set(states.slice(8));

function fail(message) {
  throw new Error(`responsive evidence invalid: ${message}`);
}

function requireRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value;
}

function requireExactKeys(value, expected, label) {
  const record = requireRecord(value, label);
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(
      `${label} keys ${JSON.stringify(actual)} !== ${JSON.stringify(wanted)}`
    );
  }
  return record;
}

async function git(args, options = {}) {
  const result = await execFile("git", args, {
    cwd: repositoryRoot,
    ...options
  });
  return result.stdout.trim();
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
requireExactKeys(
  manifest,
  ["schemaVersion", "sourceHead", "fixtureId", "capture", "evidence"],
  "manifest"
);
if (manifest.schemaVersion !== 1) fail("schemaVersion must equal 1");
if (!/^[0-9a-f]{40}$/.test(manifest.sourceHead)) {
  fail("sourceHead must be a full lowercase Git commit ID");
}
if (manifest.fixtureId !== fixtureId) fail("fixtureId mismatch");

const capture = requireExactKeys(
  manifest.capture,
  [
    "browser",
    "browserImage",
    "deviceScaleFactor",
    "viewportOrder",
    "stateOrder"
  ],
  "capture"
);
if (
  capture.browser !== "chromium" ||
  capture.browserImage !== "mcr.microsoft.com/playwright:v1.61.1-noble" ||
  capture.deviceScaleFactor !== 1 ||
  JSON.stringify(capture.viewportOrder) !==
    JSON.stringify(Object.keys(viewports)) ||
  JSON.stringify(capture.stateOrder) !== JSON.stringify(states)
) {
  fail("capture contract mismatch");
}

if (!Array.isArray(manifest.evidence)) fail("evidence must be an array");
const expectedEntries = Object.keys(viewports).flatMap((viewportName) =>
  states.map((state) => `${viewportName}/${state}`)
);
const actualEntries = manifest.evidence.map(
  (entry) => `${entry.viewportName}/${entry.state}`
);
if (
  actualEntries.length !== expectedEntries.length ||
  new Set(actualEntries).size !== expectedEntries.length ||
  JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)
) {
  fail("evidence must contain the canonical unique 5-by-13 matrix");
}

for (const [index, value] of manifest.evidence.entries()) {
  const entry = requireExactKeys(
    value,
    ["viewportName", "state", "screenshot", "screenshotSha256", "observed"],
    `evidence[${index}]`
  );
  const expectedViewport = viewports[entry.viewportName];
  const expectedFilename = `${entry.viewportName}-${entry.state}.png`;
  if (entry.screenshot !== expectedFilename) {
    fail(`evidence[${index}] screenshot name mismatch`);
  }
  if (!/^[0-9a-f]{64}$/.test(entry.screenshotSha256)) {
    fail(`evidence[${index}] checksum shape mismatch`);
  }
  const screenshot = await readFile(
    resolve(evidenceDirectory, expectedFilename)
  );
  const checksum = createHash("sha256").update(screenshot).digest("hex");
  if (checksum !== entry.screenshotSha256) {
    fail(`evidence[${index}] screenshot checksum mismatch`);
  }

  const observed = requireExactKeys(
    entry.observed,
    [
      "sourceHead",
      "sourceClean",
      "expectedHead",
      "viewport",
      "phase",
      "shellView",
      "settings",
      "fixtureId",
      "tick",
      "entityCount",
      "expectedFixture",
      "bodyScroll",
      "visibleInspectionCount",
      "stableIdVisible",
      "targets"
    ],
    `evidence[${index}].observed`
  );
  if (
    observed.sourceHead !== manifest.sourceHead ||
    observed.expectedHead !== manifest.sourceHead ||
    observed.sourceClean !== true ||
    observed.expectedFixture !== fixtureId ||
    JSON.stringify(observed.viewport) !== JSON.stringify(expectedViewport) ||
    JSON.stringify(observed.bodyScroll) !== JSON.stringify(expectedViewport) ||
    observed.visibleInspectionCount !== 0 ||
    observed.stableIdVisible !== false
  ) {
    fail(`evidence[${index}] source, viewport, or inspection binding mismatch`);
  }

  const expectedPhase =
    entry.state === "error"
      ? "failure"
      : combatStates.has(entry.state)
        ? "running"
        : entry.state === "forge" ||
            entry.state === "settings" ||
            entry.state === "high-contrast" ||
            entry.state === "large-text"
          ? "checkpoint"
          : entry.state;
  const expectedShellView =
    entry.state === "error"
      ? "failure"
      : combatStates.has(entry.state)
        ? "running"
        : entry.state === "high-contrast" || entry.state === "large-text"
          ? "checkpoint"
          : entry.state;
  if (
    observed.phase !== expectedPhase ||
    observed.shellView !== expectedShellView
  ) {
    fail(`evidence[${index}] state binding mismatch`);
  }

  const settings = requireExactKeys(
    observed.settings,
    ["contrast", "motion", "textScale"],
    `evidence[${index}].observed.settings`
  );
  const expectedSettings = {
    contrast: entry.state === "high-contrast" ? "high" : "standard",
    motion:
      entry.state === "high-contrast" ||
      entry.state === "large-text" ||
      entry.state === "reduced-motion" ||
      !combatStates.has(entry.state)
        ? "reduce"
        : "allow",
    textScale: entry.state === "large-text" ? "extra-large" : "default"
  };
  if (JSON.stringify(settings) !== JSON.stringify(expectedSettings)) {
    fail(`evidence[${index}] settings binding mismatch`);
  }

  if (combatStates.has(entry.state)) {
    if (
      observed.fixtureId !== fixtureId ||
      !Number.isSafeInteger(observed.tick) ||
      observed.tick < 0 ||
      !Number.isSafeInteger(observed.entityCount) ||
      observed.entityCount < 1
    ) {
      fail(`evidence[${index}] combat fixture/state binding mismatch`);
    }
  }
  if (
    entry.state === "preparation" &&
    (observed.fixtureId !== fixtureId ||
      observed.tick !== 0 ||
      observed.entityCount !== 1)
  ) {
    fail(`evidence[${index}] preparation fixture/state binding mismatch`);
  }
  if (entry.state === "ability-impact" && observed.tick < 1832) {
    fail(`evidence[${index}] ability impact precedes its bound impact tick`);
  }

  if (!Array.isArray(observed.targets)) {
    fail(`evidence[${index}] targets must be an array`);
  }
  for (const [targetIndex, targetValue] of observed.targets.entries()) {
    const target = requireExactKeys(
      targetValue,
      ["name", "bounds", "contained", "scrollReachable", "touchSized"],
      `evidence[${index}].observed.targets[${targetIndex}]`
    );
    if (
      typeof target.name !== "string" ||
      target.name.length === 0 ||
      !Array.isArray(target.bounds) ||
      target.bounds.length !== 4 ||
      target.bounds.some((coordinate) => !Number.isFinite(coordinate)) ||
      (!target.contained && !target.scrollReachable) ||
      target.touchSized !== true
    ) {
      fail(
        `evidence[${index}] target ${targetIndex} is invalid or unreachable`
      );
    }
  }
}

try {
  await git(["cat-file", "-e", `${manifest.sourceHead}^{commit}`]);
  await git(["merge-base", "--is-ancestor", manifest.sourceHead, "HEAD"]);
} catch {
  fail("sourceHead must be an ancestor of the publication HEAD");
}

const changedFiles = (
  await git(["diff", "--name-only", `${manifest.sourceHead}..HEAD`])
)
  .split("\n")
  .filter(Boolean);
const allowedExact = new Set([
  "apps/web/src/App.browser.test.tsx",
  "docs/visual-recovery.md",
  "package.json",
  "scripts/capture-responsive-matrix.mjs",
  "scripts/verify-responsive-matrix.mjs"
]);
for (const path of changedFiles) {
  if (
    !allowedExact.has(path) &&
    !path.startsWith("docs/visual-evidence/responsive-matrix/wip-01/")
  ) {
    fail(`product code changed after capture source: ${path}`);
  }
}

const sourcePackage = JSON.parse(
  await git(["show", `${manifest.sourceHead}:package.json`])
);
const publicationPackage = JSON.parse(
  await readFile(resolve(repositoryRoot, "package.json"), "utf8")
);
delete publicationPackage.scripts["verify:responsive-matrix"];
publicationPackage.scripts.verify = publicationPackage.scripts.verify.replace(
  "pnpm verify:responsive-matrix && ",
  ""
);
if (JSON.stringify(publicationPackage) !== JSON.stringify(sourcePackage)) {
  fail(
    "package metadata changed after capture beyond the evidence verifier hook"
  );
}

process.stdout.write(
  `verified ${manifest.evidence.length} responsive captures from ${manifest.sourceHead} at publication ${await git(["rev-parse", "HEAD"])}\n`
);
