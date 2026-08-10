import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";

const repositoryRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));

export const forbiddenHostedPatterns = Object.freeze([
  {
    label: "non-pnpm package-manager execution",
    pattern: /\b(?:npm|npx|yarn|bun|bunx)\b/i
  },
  {
    label: "complete verification",
    pattern:
      /\b(?:corepack\s+)?pnpm\b[^\n#]*\bverify(?::local(?::(?:checkpoint|release))?)?(?=\s|$)/i
  },
  {
    label: "browser/offline tests",
    pattern:
      /(?:test:browser|test-browser|test-web-offline|playwright\s+test|playwright\/v|mcr\.microsoft\.com\/playwright)/i
  },
  {
    label: "full unit/component suite",
    pattern:
      /(?:\b(?:corepack\s+)?pnpm\b[^\n#]*\btest(?::built)?(?=\s|$)|\bvitest\b[^;&|\n]*(?:\brun\b|--run\b))/i
  },
  {
    label: "release-candidate reports",
    pattern: /(?:report:release-candidate|generate-release-candidate-reports)/i
  },
  {
    label: "desktop/mobile container packaging",
    pattern:
      /(?:(?:build|capture):(?:desktop|mobile):docker|(?:^|[\s/])(?:build|capture)-(?:desktop|mobile|shuttergate)[^\s]*\.(?:sh|mjs|js)\b)/i
  },
  {
    label: "capture/evidence generation",
    pattern: /\b(?:corepack\s+)?pnpm\b[^\n#]*\bcapture:/i
  },
  {
    label: "campaign or sweep simulation",
    pattern: /\b(?:campaign|sweep)\b/i
  }
]);

function commandSurfaces(job) {
  const surfaces = [];
  if (typeof job.uses === "string") surfaces.push(job.uses);
  const container = job.container;
  if (typeof container === "string") surfaces.push(container);
  else if (container && typeof container === "object") {
    if (typeof container.image === "string") surfaces.push(container.image);
  }
  if (Array.isArray(job.steps)) {
    for (const step of job.steps) {
      if (!step || typeof step !== "object") continue;
      if (typeof step.run === "string") surfaces.push(step.run);
      if (typeof step.uses === "string") surfaces.push(step.uses);
    }
  }
  return surfaces.map((surface) => surface.replace(/\s+/g, " ").trim());
}

export function inspectWorkflowText(path, text) {
  const problems = [];
  const document = parseDocument(text, { uniqueKeys: true });
  if (document.errors.length > 0) {
    return document.errors.map(
      (error) => `${path}: invalid workflow YAML: ${error.message}`
    );
  }
  const workflow = document.toJS();
  const jobs = workflow?.jobs;
  if (!jobs || typeof jobs !== "object" || Array.isArray(jobs)) return problems;

  let executionJobCount = 0;
  for (const [jobName, job] of Object.entries(jobs)) {
    if (!job || typeof job !== "object" || Array.isArray(job)) continue;
    const runsOn = job["runs-on"];
    const reusableWorkflow = job.uses;
    if (runsOn !== undefined || reusableWorkflow !== undefined) {
      executionJobCount += 1;
    }
    if (reusableWorkflow !== undefined) {
      problems.push(
        `${path}: reusable workflow job ${jobName} is prohibited because its runtime cannot be bounded locally`
      );
    }
    if (runsOn !== undefined) {
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
    }

    for (const surface of commandSurfaces(job)) {
      for (const rule of forbiddenHostedPatterns) {
        if (rule.pattern.test(surface)) {
          problems.push(
            `${path}: hosted job ${jobName} contains long-running ${rule.label}`
          );
        }
      }
    }
  }

  if (
    executionJobCount > 0 &&
    workflow?.concurrency?.["cancel-in-progress"] !== true
  ) {
    problems.push(
      `${path}: hosted workflows must set concurrency.cancel-in-progress to true`
    );
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
