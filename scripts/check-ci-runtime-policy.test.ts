import { describe, expect, it } from "vitest";
import {
  inspectRepositoryWorkflows,
  inspectWorkflowText
} from "./check-ci-runtime-policy.mjs";

describe("hosted CI runtime policy", () => {
  it("accepts the checked-in fast workflows", async () => {
    await expect(inspectRepositoryWorkflows()).resolves.toEqual([]);
  });

  it.each([
    ["complete verification", "run: pnpm verify"],
    ["local checkpoint", "run: pnpm verify:local:checkpoint"],
    ["local release checkpoint", "run: pnpm run verify:local:release"],
    ["full unit suite", "run: pnpm test:built"],
    [
      "option-prefixed full suite",
      "run: pnpm --filter @dwarven-depths/runtime test"
    ],
    ["direct Vitest suite", "run: pnpm exec vitest run"],
    ["browser tests", "run: corepack pnpm test:browser"],
    ["direct Playwright suite", "run: pnpm exec playwright test"],
    ["release reports", "run: pnpm report:release-candidate"],
    ["desktop packaging", "run: pnpm build:desktop:docker"],
    ["capture", "run: pnpm capture:shuttergate-clip"],
    [
      "Playwright container",
      "container: mcr.microsoft.com/playwright:v1.61.1-noble"
    ]
  ])("rejects hosted %s", (_label, command) => {
    const workflow = `jobs:\n  test:\n    runs-on: ubuntu-latest\n    timeout-minutes: 8\n    steps:\n      - ${command}\n`;
    expect(
      inspectWorkflowText(".github/workflows/test.yml", workflow)
    ).not.toEqual([]);
  });

  it("rejects missing and excessive hosted job timeouts per job", () => {
    expect(
      inspectWorkflowText(
        "missing.yml",
        "jobs:\n  bounded:\n    runs-on: ubuntu-latest\n    timeout-minutes: 8\n  unbounded:\n    runs-on: ubuntu-latest\n"
      )
    ).toContain(
      "missing.yml: hosted job unbounded must declare timeout-minutes"
    );
    expect(
      inspectWorkflowText(
        "wide-indent.yml",
        "jobs:\n    slow:\n      runs-on: ubuntu-latest\n      steps:\n        - run: pnpm lint\n"
      )
    ).toContain(
      "wide-indent.yml: hosted job slow must declare timeout-minutes"
    );
    expect(
      inspectWorkflowText(
        "long.yml",
        "jobs:\n  test:\n    runs-on: ubuntu-latest\n    timeout-minutes: 30\n"
      )
    ).toContain(
      "long.yml: hosted job test timeout-minutes 30 exceeds the 10-minute hosted-CI ceiling"
    );
  });
});
