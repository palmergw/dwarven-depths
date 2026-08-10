import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));

export const forbiddenHostedPatterns = Object.freeze([
  {
    label: "complete verification",
    pattern:
      /\b(?:pnpm|corepack\s+pnpm)\s+(?:run\s+)?verify(?::local(?::(?:checkpoint|release))?)?(?:\s|$)/im
  },
  {
    label: "browser tests",
    pattern:
      /(?:test:browser|test-browser|playwright\/v|mcr\.microsoft\.com\/playwright)/i
  },
  {
    label: "full unit/component suite",
    pattern: /\b(?:pnpm|corepack\s+pnpm)\s+(?:run\s+)?test(?::built)?(?:\s|$)/m
  },
  {
    label: "release-candidate reports",
    pattern: /(?:report:release-candidate|generate-release-candidate-reports)/i
  },
  {
    label: "desktop/mobile container packaging",
    pattern: /(?:build|capture):(?:desktop|mobile):docker/i
  },
  {
    label: "capture/evidence generation",
    pattern: /\b(?:pnpm|corepack\s+pnpm)\s+(?:run\s+)?capture:/i
  },
  {
    label: "campaign or sweep simulation",
    pattern: /\b(?:campaign|sweep)\b.*(?:--scenario|--content|--out)/i
  }
]);

export function inspectWorkflowText(path, text) {
  const problems = [];
  for (const rule of forbiddenHostedPatterns) {
    if (rule.pattern.test(text)) {
      problems.push(
        `${path}: hosted workflow contains long-running ${rule.label}`
      );
    }
  }

  const lines = text.split(/\r?\n/);
  const jobsIndex = lines.findIndex((line) => /^jobs:\s*(?:#.*)?$/.test(line));
  if (jobsIndex >= 0) {
    const jobStarts = [];
    for (let index = jobsIndex + 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (/^\S/.test(line)) break;
      const jobMatch = /^ {2}([a-zA-Z0-9_-]+):\s*(?:#.*)?$/.exec(line);
      if (jobMatch) jobStarts.push({ index, name: jobMatch[1] });
    }

    for (let position = 0; position < jobStarts.length; position += 1) {
      const job = jobStarts[position];
      const end = jobStarts[position + 1]?.index ?? lines.length;
      const block = lines.slice(job.index + 1, end).join("\n");
      if (!/^ {4}runs-on:\s*/m.test(block)) continue;
      const timeoutMatch = /^ {4}timeout-minutes:\s*(\d+)\s*(?:#.*)?$/m.exec(
        block
      );
      if (!timeoutMatch) {
        problems.push(
          `${path}: hosted job ${job.name} must declare timeout-minutes`
        );
        continue;
      }
      const minutes = Number(timeoutMatch[1]);
      if (minutes > 10) {
        problems.push(
          `${path}: hosted job ${job.name} timeout-minutes ${minutes} exceeds the 10-minute hosted-CI ceiling`
        );
      }
    }
  }
  return problems;
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
