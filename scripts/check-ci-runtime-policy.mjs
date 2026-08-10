import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";

const repositoryRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));

export const allowedHostedRunCommands = Object.freeze([
  "pnpm install --frozen-lockfile --ignore-scripts",
  "pnpm check:ci-runtime-policy",
  "pnpm lint",
  "pnpm check:artifacts",
  "pnpm typecheck",
  "pnpm build:ci:fast",
  "pnpm test:ci:fast",
  "pnpm check:web-budgets",
  "pnpm validate:ci:fast",
  "pnpm verify:scenario:ci:fast"
]);

const allowedActionConfigurations = Object.freeze({
  "actions/checkout@v7": {},
  "pnpm/action-setup@v6": {
    version: "11.16.0",
    run_install: false
  },
  "actions/setup-node@v7": {
    "node-version": 22,
    cache: "pnpm"
  }
});

const expectedHostedSteps = Object.freeze([
  { uses: "actions/checkout@v7" },
  {
    uses: "pnpm/action-setup@v6",
    with: { version: "11.16.0", run_install: false }
  },
  {
    uses: "actions/setup-node@v7",
    with: { "node-version": 22, cache: "pnpm" }
  },
  ...allowedHostedRunCommands.map((run) => ({ run }))
]);

export const expectedHostedPackageScripts = Object.freeze({
  "check:ci-runtime-policy": "node scripts/check-ci-runtime-policy.mjs",
  lint: "biome check .",
  "check:artifacts": "node scripts/check-generated-artifacts.mjs",
  typecheck: "tsc -b --pretty false",
  "build:ci:fast":
    "pnpm exec tsc -b --pretty false && pnpm --filter @dwarven-depths/web exec vite build && node scripts/build-web-pwa.mjs",
  "test:ci:fast":
    "vitest run scripts/check-ci-runtime-policy.test.ts packages/content-schema/src/index.test.ts packages/content-runtime/src/index.test.ts packages/sim-core/src/index.test.ts packages/runtime/src/index.test.ts packages/save/src/profile-save.test.ts packages/progression/src/index.test.ts apps/web/src/protocol.test.ts --reporter=dot",
  "check:web-budgets": "node scripts/check-web-release-budgets.mjs",
  "validate:ci:fast":
    "node apps/sim-cli/dist/cli.js validate --content content/fixtures/empty-content.json --scenario scenarios/conformance/empty-level.json",
  "verify:scenario:ci:fast":
    "node apps/sim-cli/dist/cli.js run --content content/fixtures/empty-content.json --scenario scenarios/conformance/empty-level.json --out .ddh/verification/empty --replace true && node apps/sim-cli/dist/cli.js replay --run .ddh/verification/empty --verify && node apps/sim-cli/dist/cli.js inspect --run .ddh/verification/empty --tick 0 --before 0 --after 0"
});

export const expectedFastTestScript =
  expectedHostedPackageScripts["test:ci:fast"];

const expectedLocalCheckpointScript =
  "pnpm lint && pnpm check:ci-runtime-policy && pnpm check:artifacts && pnpm check:desktop-package && pnpm check:mobile-package && pnpm typecheck && pnpm build && pnpm check:web-budgets && pnpm test:web-offline && pnpm test:built && DD_SKIP_BUILD=1 pnpm test:browser:docker && pnpm validate:built && pnpm verify:scenario:built";
const expectedLocalReleaseScript =
  "pnpm verify:local:checkpoint && pnpm report:release-candidate && pnpm build:desktop:docker";
const expectedJobCondition =
  "github.event_name == 'push' || github.event.pull_request.draft == false";
const allowedJobKeys = new Set(["if", "runs-on", "steps", "timeout-minutes"]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)])
    );
  }
  return value;
}

function sameConfiguration(actual, expected) {
  return (
    JSON.stringify(canonical(actual ?? {})) ===
    JSON.stringify(canonical(expected))
  );
}

function inspectHostedStep(path, jobName, step, index) {
  const problems = [];
  if (!step || typeof step !== "object" || Array.isArray(step)) {
    return [`${path}: hosted job ${jobName} step ${index} must be a map`];
  }
  const keys = Object.keys(step);
  if (typeof step.run === "string") {
    if (keys.some((key) => !["name", "run"].includes(key))) {
      problems.push(
        `${path}: hosted job ${jobName} step ${index} has non-allowlisted run configuration`
      );
    }
    const command = step.run.replace(/\s+/g, " ").trim();
    if (!allowedHostedRunCommands.includes(command)) {
      problems.push(
        `${path}: hosted job ${jobName} step ${index} uses non-allowlisted command: ${command}`
      );
    }
    return problems;
  }
  if (typeof step.uses === "string") {
    if (keys.some((key) => !["name", "uses", "with"].includes(key))) {
      problems.push(
        `${path}: hosted job ${jobName} step ${index} has non-allowlisted action configuration`
      );
    }
    const expected = allowedActionConfigurations[step.uses];
    if (!expected) {
      problems.push(
        `${path}: hosted job ${jobName} step ${index} uses non-allowlisted action: ${step.uses}`
      );
    } else if (!sameConfiguration(step.with, expected)) {
      problems.push(
        `${path}: hosted job ${jobName} step ${index} changes the pinned configuration for ${step.uses}`
      );
    }
    return problems;
  }
  return [
    `${path}: hosted job ${jobName} step ${index} must use an allowlisted action or command`
  ];
}

export function inspectWorkflowText(path, text) {
  const document = parseDocument(text, { uniqueKeys: true });
  if (document.errors.length > 0) {
    return document.errors.map(
      (error) => `${path}: invalid workflow YAML: ${error.message}`
    );
  }
  const workflow = document.toJS();
  const problems = [];
  const jobs = workflow?.jobs;
  if (!jobs || typeof jobs !== "object" || Array.isArray(jobs)) {
    return [`${path}: workflow must define a jobs map`];
  }

  const jobNames = Object.keys(jobs);
  if (jobNames.length !== 1 || jobNames[0] !== "fast-checks") {
    problems.push(
      `${path}: hosted workflow must contain exactly the fast-checks job`
    );
  }

  if (
    !sameConfiguration(workflow.on, {
      pull_request: {
        types: ["opened", "synchronize", "reopened", "ready_for_review"]
      },
      push: { branches: ["main"] }
    })
  ) {
    problems.push(
      `${path}: hosted triggers must remain the reviewed PR/main set`
    );
  }
  if (!sameConfiguration(workflow.permissions, { contents: "read" })) {
    problems.push(
      `${path}: hosted workflow permissions must remain contents: read`
    );
  }
  if (workflow.env !== undefined || workflow.defaults !== undefined) {
    problems.push(
      `${path}: workflow-level env/defaults are prohibited in bounded hosted CI`
    );
  }
  if (workflow?.concurrency?.["cancel-in-progress"] !== true) {
    problems.push(
      `${path}: hosted workflows must set concurrency.cancel-in-progress to true`
    );
  }

  for (const [jobName, job] of Object.entries(jobs)) {
    if (!job || typeof job !== "object" || Array.isArray(job)) {
      problems.push(`${path}: job ${jobName} must be a map`);
      continue;
    }
    if (job.uses !== undefined) {
      problems.push(
        `${path}: reusable workflow job ${jobName} is prohibited because its runtime cannot be bounded locally`
      );
      continue;
    }
    const nonAllowlistedJobKeys = Object.keys(job).filter(
      (key) => !allowedJobKeys.has(key)
    );
    if (nonAllowlistedJobKeys.length > 0) {
      problems.push(
        `${path}: hosted job ${jobName} uses non-allowlisted keys: ${nonAllowlistedJobKeys.join(", ")}`
      );
    }
    if (job.if !== expectedJobCondition) {
      problems.push(
        `${path}: hosted job ${jobName} must retain the reviewed draft-skip condition`
      );
    }
    if (job["runs-on"] !== "ubuntu-latest") {
      problems.push(
        `${path}: hosted job ${jobName} must run on ubuntu-latest without a container`
      );
    }
    const timeout = job["timeout-minutes"];
    if (!Number.isInteger(timeout)) {
      problems.push(
        `${path}: hosted job ${jobName} must declare an integer timeout-minutes`
      );
    } else if (timeout > 10) {
      problems.push(
        `${path}: hosted job ${jobName} timeout-minutes ${timeout} exceeds the 10-minute hosted-CI ceiling`
      );
    }
    if (!Array.isArray(job.steps)) {
      problems.push(`${path}: hosted job ${jobName} must define a steps array`);
      continue;
    }
    if (!sameConfiguration(job.steps, expectedHostedSteps)) {
      problems.push(
        `${path}: hosted job ${jobName} must retain the exact reviewed step sequence`
      );
    }
    job.steps.forEach((step, index) => {
      problems.push(...inspectHostedStep(path, jobName, step, index));
    });
  }
  return [...new Set(problems)];
}

async function workflowFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await workflowFiles(path)));
    else if ([".yml", ".yaml"].includes(extname(entry.name))) files.push(path);
  }
  return files.sort();
}

export async function inspectRepositoryWorkflows(root = repositoryRoot) {
  const directory = join(root, ".github", "workflows");
  const problems = [];
  for (const path of await workflowFiles(directory)) {
    const text = await readFile(path, "utf8");
    problems.push(...inspectWorkflowText(relative(root, path), text));
  }

  const packageJson = JSON.parse(
    await readFile(join(root, "package.json"), "utf8")
  );
  const scripts = packageJson.scripts ?? {};
  for (const [name, expected] of Object.entries(expectedHostedPackageScripts)) {
    if (scripts[name] !== expected) {
      problems.push(
        `package.json: ${name} must remain the reviewed bounded hosted implementation`
      );
    }
  }
  if (scripts.verify !== "pnpm verify:local:checkpoint") {
    problems.push(
      "package.json: verify must delegate to verify:local:checkpoint"
    );
  }
  if (scripts["verify:local:checkpoint"] !== expectedLocalCheckpointScript) {
    problems.push(
      "package.json: verify:local:checkpoint must remain the reviewed complete local gate"
    );
  }
  if (scripts["verify:local:release"] !== expectedLocalReleaseScript) {
    problems.push(
      "package.json: verify:local:release must remain the reviewed release-only gate"
    );
  }
  return problems;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const problems = await inspectRepositoryWorkflows();
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("HOSTED_CI_RUNTIME_POLICY_OK");
  }
}
